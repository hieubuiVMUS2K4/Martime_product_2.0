using System.Text.Json;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Inventory;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

public sealed partial class PmsWorkOrderWorkflowService
{
    public async Task<object> ResolveCancelledCycleAsync(Guid jobId, ResolvePmsCycleDto dto, long userId, CancellationToken token = default)
    {
        Enabled();
        if (dto.Action is not ("REPLACE" or "SKIP") || string.IsNullOrWhiteSpace(dto.Reason) || dto.Reason.Length > 2000)
            throw new PmsRequestException(400, "Chọn cách xử lý và nhập lý do hợp lệ (tối đa 2000 ký tự).");
        await using var tx = await InventoryWriteScope.BeginAsync(db);
        var actor = await Actor(userId, "pms.jobs.update", token);
        await Actor(userId, dto.Action == "REPLACE" ? "pms.work.create" : "pms.work.update", token);
        var job = await db.MaintenanceSchedules.SingleOrDefaultAsync(j => j.Id == jobId && j.PmsProtocolVersion == 2, token)
            ?? throw new PmsRequestException(404, "Không tìm thấy Job.");
        await db.Entry(job).ReloadAsync(token);
        if (job.JobVersion != dto.ExpectedJobVersion || PmsJobRules.CycleKey(job) != dto.ExpectedCycleKey)
            throw new PmsRequestException(409, "Kỳ của Job đã thay đổi; hãy tải lại trước khi xử lý.");
        if (job.JobState != PmsJobRules.Active || !job.IsActive || job.MaintenanceCategory != "PERIODIC" || PmsJobRules.MissingInformation(job).Count != 0)
            throw new PmsRequestException(409, "Job phải đang hoạt động và đủ thông tin để xử lý kỳ đã hủy.");
        var cancelled = await db.MaintenanceTasks.SingleOrDefaultAsync(w => w.Id == dto.CancelledWorkOrderId && w.ScheduleId == jobId &&
            w.PmsProtocolVersion == 2 && w.CycleKey == dto.ExpectedCycleKey && w.Status == "CANCELLED" && !w.IsDeleted, token)
            ?? throw new PmsRequestException(409, "Không tìm thấy WO đã hủy thuộc kỳ hiện tại.");
        if (await db.MaintenanceTasks.AnyAsync(w => w.ScheduleId == jobId && !w.IsDeleted && w.Status != "COMPLETED" && w.Status != "CANCELLED", token))
            throw new PmsRequestException(409, "Job đang có WO mở; không thể xử lý kỳ đã hủy.");
        if (dto.Action == "REPLACE" && (job.NextDueDate != cancelled.WorkOrderDueAt || job.NextDueRunningHours != cancelled.WorkOrderDueHours))
            throw new PmsRequestException(409, "Hạn của Job đã đổi sau khi phát hành WO. Hãy rà soát lại Job; WO thay thế phải giữ đúng hạn của kỳ đã hủy.");
        var before = JsonSerializer.Serialize(job);
        try
        {
            if (dto.Action == "REPLACE") job.CycleReleaseAttempt = checked((job.CycleReleaseAttempt ?? 0) + 1);
            else PmsJobRules.SkipCancelledCycle(job);
        }
        catch (Exception e) when (e is ArgumentOutOfRangeException or OverflowException or InvalidOperationException)
        { throw new PmsRequestException(400, "Không thể tính kỳ tiếp theo: " + e.Message); }
        job.JobVersion = checked((job.JobVersion ?? 0) + 1);
        job.UpdatedAt = Now; job.IsSynced = false;
        await db.SaveChangesAsync(token);
        MaintenanceTask? replacement = null;
        if (dto.Action == "REPLACE")
        {
            try { replacement = await new PmsWorkOrderReleaseService(db).ReleasePeriodicAsync(jobId, Now, Zone(), false, dto.Reason, token, job.JobVersion, PmsJobRules.CycleKey(job)); }
            catch (InvalidOperationException e) { throw new PmsRequestException(409, e.Message); }
            if (replacement == null) throw new PmsRequestException(409, "Không thể phát hành WO thay thế.");
        }
        var explanation = dto.Action == "REPLACE" ? "Phát hành WO thay thế cùng kỳ" : "Bỏ qua kỳ; không ghi nhận bảo trì";
        History(cancelled, actor, "CANCELLED", $"{explanation}: {dto.Reason.Trim()}", "WEB");
        cancelled.WorkflowVersion = checked((cancelled.WorkflowVersion ?? 0) + 1);
        cancelled.UpdatedAt = Now; cancelled.IsSynced = false;
        db.SystemLogs.Add(new SystemLog { Category = "PMS", Level = "INFO", UserId = userId, EntityType = "PmsJob", EntityId = jobId.ToString(),
            Action = dto.Action == "REPLACE" ? "PMS_CYCLE_REPLACED" : "PMS_CYCLE_SKIPPED", OldValues = before,
            NewValues = JsonSerializer.Serialize(new { job, dto.Reason, cancelledWorkOrderId = cancelled.Id, replacementWorkOrderId = replacement?.Id }) });
        await db.SaveChangesAsync(token);
        if (tx != null) await tx.CommitAsync(token);
        return new { workOrderId = replacement?.Id, nextCycleKey = PmsJobRules.CycleKey(job) };
    }
}
