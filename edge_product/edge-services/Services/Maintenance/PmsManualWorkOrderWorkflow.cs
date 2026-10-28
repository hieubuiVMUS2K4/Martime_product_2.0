using Maritime.Shared.Models.Sync;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Inventory;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

public sealed partial class PmsWorkOrderWorkflowService
{
    public async Task<PmsWorkflowResult> ReleaseManualAsync(ReleasePmsManualOrderDto dto, long userId,
        string device, CancellationToken token = default)
    {
        Enabled(); ValidateDevice(device);
        if (dto.CommandId == Guid.Empty || dto.ExpectedJobVersion < 1 || string.IsNullOrWhiteSpace(dto.Reason) || dto.Reason.Length > 2000)
            throw new PmsRequestException(400, "Cần phiên bản Job, mã yêu cầu và lý do phát hành (tối đa 2000 ký tự).");
        if ((!dto.DueDate.HasValue && !dto.DueHours.HasValue) || dto.DueDate is { Year: < 1900 or > 9998 } ||
            dto.DueHours.HasValue && (!double.IsFinite(dto.DueHours.Value) || dto.DueHours < 0 || dto.DueHours > 1000000000))
            throw new PmsRequestException(400, "Cần hạn ngày hoặc giờ chạy hợp lệ.");
        await using var tx = await InventoryWriteScope.BeginAsync(db);
        var actor = await Actor(userId, "pms.work.create", token);
        var job = await db.MaintenanceSchedules.SingleOrDefaultAsync(j => j.Id == dto.JobId && j.PmsProtocolVersion == 2, token)
            ?? throw new PmsRequestException(404, "Không tìm thấy Job.");
        await db.Entry(job).ReloadAsync(token);
        var commandHash = ApprovalSnapshot.Hash(ApprovalSnapshot.Canonicalize(new { userId, dto }));
        var cycleKey = $"REQUEST:{dto.CommandId:N}";
        var replay = await db.MaintenanceTasks.SingleOrDefaultAsync(w => w.ScheduleId == job.Id && w.CycleKey == cycleKey, token);
        if (replay != null)
        {
            if (replay.CreatedByUserId != userId || replay.CreationCommandHash != commandHash)
                Conflict("Yêu cầu phát hành đã dùng cho nội dung hoặc tài khoản khác.");
            if (replay.IsDeleted || replay.Status == "CANCELLED") Conflict("WO của yêu cầu này đã hủy; tạo yêu cầu mới nếu cần phát hành lại.");
            if (tx != null) await tx.CommitAsync(token);
            return Result(replay);
        }
        if (job.JobVersion != dto.ExpectedJobVersion) Conflict("Job đã thay đổi; tải lại trước khi phát hành.");
        if (!PmsJobRules.IsManualCategory(job.MaintenanceCategory) || job.JobState != PmsJobRules.Active || !job.IsActive || PmsJobRules.MissingInformation(job).Count != 0)
            Conflict("Chỉ phát hành thủ công từ Job Lên đà, Theo chuyến hoặc Theo yêu cầu đang hoạt động và đủ thông tin.");
        if (await db.MaintenanceTasks.AnyAsync(w => w.ScheduleId == job.Id && !w.IsDeleted && w.Status != "COMPLETED" && w.Status != "CANCELLED", token))
            Conflict("Job đã có WO đang mở; xử lý WO đó trước khi phát hành yêu cầu mới.");
        var asset = await db.EquipmentAssets.SingleOrDefaultAsync(a => a.Id == job.EquipmentAssetId, token)
            ?? throw new PmsRequestException(400, "Thiết bị không còn tồn tại.");
        await db.Entry(asset).ReloadAsync(token);
        if (!asset.IsActive || asset.Category == "SYSTEM" || asset.Status == "DECOMMISSIONED")
            throw new PmsRequestException(400, "Thiết bị không còn sử dụng hoặc là thư mục nhóm.");
        var templates = await db.ScheduleChecklistTemplates.AsNoTracking().Where(c => c.ScheduleId == job.Id).OrderBy(c => c.SequenceOrder).ToListAsync(token);
        string? pic = null;
        if (job.AssignmentPolicy == "PREASSIGNED" && !string.IsNullOrWhiteSpace(job.AssignedToCrewId))
            pic = await db.CrewMembers.Where(c => c.CrewId == job.AssignedToCrewId && (c.IsOnboard || c.OnboardStatus == "Approved") && c.Rank != null && c.Rank.IsActive)
                .Select(c => c.CrewId).SingleOrDefaultAsync(token);
        var now = Now;
        var dueAt = dto.DueDate.HasValue ? (DateTime?)VesselDateToUtc(dto.DueDate.Value) : null;
        var id = Guid.NewGuid();
        var order = new MaintenanceTask
        {
            Id = id, TaskId = $"WO-{id:N}", ScheduleId = job.Id, PmsProtocolVersion = 2,
            WorkOrderCode = await PmsWorkOrderCodes.NextAsync(db, job.OriginNode, now, token),
            TaskType = job.MaintenanceCategory, TaskDescription = job.ScheduleName, WorkOrderInstructions = job.Instructions,
            EquipmentAssetId = asset.Id, EquipmentAssetName = asset.AssetName, EquipmentId = asset.AssetCode, EquipmentName = asset.AssetName,
            Priority = job.Priority, AssignedDepartment = job.ResponsibleDepartment, AssignedTo = pic,
            Status = pic == null ? "UNASSIGNED" : "ASSIGNED", WorkflowVersion = 1, ReportRevision = 0,
            CycleKey = cycleKey, JobVersion = job.JobVersion, CreatedByUserId = userId, CreationCommandHash = commandHash,
            WorkOrderDueAt = dueAt, WorkOrderDueHours = dto.DueHours,
            WorkOrderWarningDays = job.DaysBeforeDue, WorkOrderWarningHours = job.WarningHours ?? 50,
            DueState = PmsJobRules.DueState(dueAt, dto.DueHours, asset.CurrentRunningHours, now, Zone(), job.DaysBeforeDue, job.WarningHours ?? 50),
            NextDueAt = dueAt ?? DateTime.SpecifyKind(DateTime.MaxValue.Date, DateTimeKind.Utc),
            OriginNode = job.OriginNode, CreatedAt = now, UpdatedAt = now,
            JobSnapshot = ApprovalSnapshot.Canonicalize(new { version = 2, job.Id, job.JobVersion, job.ScheduleCode, job.ScheduleName,
                job.Instructions, job.MaintenanceCategory, job.ResponsibleDepartment, job.ResponsibleRankId, job.ResponsibleCrewId,
                requestId = dto.CommandId, requestReason = dto.Reason.Trim(), dueAt, dueHours = dto.DueHours,
                checklist = templates.Select(c => new { c.SequenceOrder, c.CheckpointDescription, c.RequiresReading, c.NormalRangeMin, c.NormalRangeMax, c.Unit }) })
        };
        db.MaintenanceTasks.Add(order);
        foreach (var c in templates) db.TaskChecklistItems.Add(new()
        {
            TaskId = order.TaskId, AssetId = asset.Id, AssetCode = asset.AssetCode, AssetName = asset.AssetName,
            SequenceOrder = c.SequenceOrder, CheckpointDescription = c.CheckpointDescription,
            RequiresReading = c.RequiresReading, NormalRangeMin = c.NormalRangeMin, NormalRangeMax = c.NormalRangeMax, Unit = c.Unit
        });
        History(order, actor, "", "Phát hành WO thủ công: " + dto.Reason.Trim(), device);
        await db.SaveChangesAsync(token);
        if (tx != null) await tx.CommitAsync(token);
        return Result(order);
    }
}
