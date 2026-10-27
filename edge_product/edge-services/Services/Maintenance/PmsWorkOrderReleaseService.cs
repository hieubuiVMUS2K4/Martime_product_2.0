using System.Text.Json;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Inventory;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

/// <summary>
/// Transactional protocol-2 issuer. The worker calls it only after the local cutover/readiness checks.
/// The transaction includes the Job snapshot, checklist and SaveChanges sync outbox entries.
/// </summary>
public sealed class PmsWorkOrderReleaseService(EdgeDbContext db)
{
    public async Task<MaintenanceTask?> ReleasePeriodicAsync(Guid jobId, DateTime now,
        TimeZoneInfo vesselTimeZone, bool automatic = true, string? earlyReleaseReason = null,
        CancellationToken token = default, int? expectedJobVersion = null, string? expectedCycleKey = null)
        => (await ReleasePeriodicWithResultAsync(jobId, now, vesselTimeZone, automatic, earlyReleaseReason,
            token, expectedJobVersion, expectedCycleKey)).Order;

    internal sealed record ReleaseResult(MaintenanceTask? Order, bool Created);

    internal async Task<ReleaseResult> ReleasePeriodicWithResultAsync(Guid jobId, DateTime now,
        TimeZoneInfo vesselTimeZone, bool automatic = true, string? earlyReleaseReason = null,
        CancellationToken token = default, int? expectedJobVersion = null, string? expectedCycleKey = null)
    {
        await using var transaction = await InventoryWriteScope.BeginAsync(db);
        // Always read after acquiring the shared writer lock.
        var job = await db.MaintenanceSchedules.SingleOrDefaultAsync(j => j.Id == jobId, token)
            ?? throw new KeyNotFoundException("Job not found.");
        await db.Entry(job).ReloadAsync(token);
        if (expectedJobVersion.HasValue && expectedJobVersion != job.JobVersion)
            throw new MaritimeEdge.DTOs.PmsRequestException(409, "Job đã thay đổi; tải lại trước khi phát hành.");
        if (job.PmsProtocolVersion != PmsJobRules.ProtocolVersion || job.JobState != PmsJobRules.Active ||
            !job.IsActive || job.MaintenanceCategory != "PERIODIC" || PmsJobRules.MissingInformation(job).Count != 0)
            throw new InvalidOperationException("Job is not ready for periodic Work Order release.");
        var cycleKey = PmsJobRules.CycleKey(job);
        if (expectedCycleKey != null && expectedCycleKey != cycleKey)
            throw new MaritimeEdge.DTOs.PmsRequestException(409, "Kỳ của Job đã thay đổi; không dùng lại yêu cầu phát hành kỳ cũ.");
        var existing = await db.MaintenanceTasks.SingleOrDefaultAsync(t => t.ScheduleId == jobId && t.CycleKey == cycleKey, token);
        if (existing != null)
        {
            // A cancelled/deleted order still consumes its cycle identity; never recreate it.
            if (transaction != null) await transaction.CommitAsync(token);
            return new(existing, false);
        }
        if (await db.MaintenanceTasks.AnyAsync(t => t.ScheduleId == jobId && !t.IsDeleted &&
            t.Status != "COMPLETED" && t.Status != "CANCELLED", token))
            throw new InvalidOperationException("This Job already has an open Work Order; reconcile its cycle first.");
        var asset = await db.EquipmentAssets.SingleOrDefaultAsync(a => a.Id == job.EquipmentAssetId, token)
            ?? throw new InvalidOperationException("The equipment asset no longer exists.");
        await db.Entry(asset).ReloadAsync(token);
        if (asset.Category == "SYSTEM") throw new InvalidOperationException("An equipment folder cannot receive a Work Order.");
        if (!asset.IsActive || asset.Status == "DECOMMISSIONED") throw new InvalidOperationException("The equipment asset is no longer in service.");
        var dueState = PmsJobRules.DueState(job.NextDueDate, job.NextDueRunningHours,
            asset.CurrentRunningHours, now, vesselTimeZone, job.DaysBeforeDue, job.WarningHours ?? 50);
        if (automatic && !PmsJobRules.CanAutoRelease(job, dueState))
        {
            if (transaction != null) await transaction.CommitAsync(token);
            return new(null, false);
        }
        if (!automatic && dueState is "NOT_DUE" or "NO_DEADLINE" && string.IsNullOrWhiteSpace(earlyReleaseReason))
            throw new InvalidOperationException("Manual early release requires a reason.");
        var templates = await db.ScheduleChecklistTemplates.AsNoTracking().Where(c => c.ScheduleId == jobId)
            .OrderBy(c => c.SequenceOrder).ToListAsync(token);
        // A saved rank default must not pick an arbitrary crew member. Only explicit, valid defaults apply.
        string? pic = null;
        if (job.AssignmentPolicy == "PREASSIGNED" && !string.IsNullOrWhiteSpace(job.AssignedToCrewId))
            pic = await db.CrewMembers.Where(c => c.CrewId == job.AssignedToCrewId &&
                (c.IsOnboard || c.OnboardStatus == "Approved") && c.Rank != null && c.Rank.IsActive)
                .Select(c => c.CrewId).SingleOrDefaultAsync(token);
        var id = Guid.NewGuid();
        var order = new MaintenanceTask
        {
            Id = id, TaskId = $"WO-{id:N}", ScheduleId = job.Id, EquipmentAssetId = asset.Id,
            EquipmentAssetName = asset.AssetName, EquipmentId = asset.AssetCode, EquipmentName = asset.AssetName,
            TaskType = job.MaintenanceCategory, TaskDescription = job.ScheduleName, Priority = job.Priority,
            PmsProtocolVersion = PmsJobRules.ProtocolVersion, CycleKey = cycleKey, JobVersion = job.JobVersion,
            WorkOrderDueAt = job.NextDueDate, WorkOrderDueHours = job.NextDueRunningHours, DueState = dueState,
            WorkOrderWarningDays = job.DaysBeforeDue, WorkOrderWarningHours = job.WarningHours ?? 50,
            // Compatibility-only non-null field; protocol-2 views use WorkOrderDueAt, never invent a date for RH.
            NextDueAt = job.NextDueDate ?? DateTime.SpecifyKind(DateTime.MaxValue.Date, DateTimeKind.Utc),
            AssignedTo = pic, AssignedDepartment = job.ResponsibleDepartment,
            Status = pic == null ? "UNASSIGNED" : "ASSIGNED", ReportRevision = 0, WorkflowVersion = 1,
            IntervalDays = job.IntervalDays, IntervalHours = job.IntervalHours,
            CreatedAt = now, UpdatedAt = now, OriginNode = job.OriginNode,
            JobSnapshot = JsonSerializer.Serialize(new { version = 2, job.Id, job.JobVersion, job.ScheduleCode,
                job.ScheduleName, job.Instructions, job.MaintenanceCategory, job.IntervalType,
                job.IntervalDays, job.IntervalMonths, job.IntervalYears, job.IntervalHours,
                job.ResponsibleDepartment, job.ResponsibleRankId, job.ResponsibleCrewId,
                job.NextDueDate, job.NextDueRunningHours, earlyReleaseReason,
                checklist = templates.Select(c => new { c.SequenceOrder, c.CheckpointDescription,
                    c.RequiresReading, c.NormalRangeMin, c.NormalRangeMax, c.Unit }) })
        };
        order.WorkOrderCode = await PmsWorkOrderCodes.NextAsync(db, job.OriginNode, now, token);
        db.MaintenanceTasks.Add(order);
        foreach (var template in templates)
            db.TaskChecklistItems.Add(new TaskChecklistItem
            {
                TaskId = order.TaskId, AssetId = asset.Id, AssetCode = asset.AssetCode, AssetName = asset.AssetName,
                SequenceOrder = template.SequenceOrder, CheckpointDescription = template.CheckpointDescription,
                RequiresReading = template.RequiresReading, NormalRangeMin = template.NormalRangeMin,
                NormalRangeMax = template.NormalRangeMax, Unit = template.Unit
            });
        await db.SaveChangesAsync(token);
        if (transaction != null) await transaction.CommitAsync(token);
        return new(order, true);
    }
}
