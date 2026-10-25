using MaritimeEdge.Data;
using System.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

public sealed class PmsWorkOrderReadService(EdgeDbContext db, IConfiguration configuration)
{
    private sealed class ReadShape
    {
        public MaintenanceTask Task { get; set; } = null!;
        public string DueState { get; set; } = "NO_DEADLINE";
    }

    private IQueryable<ReadShape> Read(IQueryable<MaintenanceTask> tasks)
    {
        var zoneId = configuration["Pms:VesselTimeZone"];
        if (string.IsNullOrWhiteSpace(zoneId)) throw new PmsRequestException(503, "Chưa cấu hình múi giờ tàu cho PMS rework.");
        TimeZoneInfo zone;
        try { zone = TimeZoneInfo.FindSystemTimeZoneById(zoneId); }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException)
        { throw new PmsRequestException(503, "Múi giờ tàu không hợp lệ."); }
        // AT TIME ZONE yields a local timestamp even when the configured zone is UTC.
        var localDay = DateTime.SpecifyKind(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, zone).Date, DateTimeKind.Unspecified);
        var databaseZone = TimeZoneInfo.TryConvertWindowsIdToIanaId(zone.Id, out var iana) ? iana : zone.Id;
        return tasks.Select(t => new { Task = t, Hours = db.EquipmentAssets.Where(a => a.Id == t.EquipmentAssetId)
                .Select(a => a.CurrentRunningHours).FirstOrDefault(),
                LocalDueDay = t.WorkOrderDueAt.HasValue
                    ? (DateTime?)TimeZoneInfo.ConvertTimeBySystemTimeZoneId(t.WorkOrderDueAt.Value, databaseZone!).Date : null })
            .Select(x => new ReadShape
            {
                Task = x.Task,
                DueState = x.Task.Status == "COMPLETED" || x.Task.Status == "CANCELLED" ? x.Task.DueState ?? "NO_DEADLINE" :
                    x.Task.Status == "DRAFT" ? "NO_DEADLINE" :
                    x.LocalDueDay < localDay || x.Task.WorkOrderDueHours < x.Hours ? "OVERDUE" :
                    x.LocalDueDay == localDay || x.Task.WorkOrderDueHours == x.Hours && x.Hours != null ? "DUE" :
                    x.LocalDueDay <= localDay.AddDays(x.Task.WorkOrderWarningDays ?? 7) ||
                    x.Task.WorkOrderDueHours - x.Hours <= (x.Task.WorkOrderWarningHours ?? 50) ? "UPCOMING" :
                    x.Task.WorkOrderDueAt != null || x.Task.WorkOrderDueHours != null && x.Hours != null ? "NOT_DUE" : "NO_DEADLINE"
            });
    }

    private IQueryable<PmsWorkOrderRow> Rows(IQueryable<ReadShape> source) => source.Select(x => new PmsWorkOrderRow(
        x.Task.Id, x.Task.TaskId, x.Task.ScheduleId, x.Task.TaskDescription, x.Task.EquipmentAssetId,
        x.Task.EquipmentAssetName, x.Task.WorkOrderDueAt, x.Task.WorkOrderDueHours, x.DueState, x.Task.Status,
        x.Task.AssignedTo, db.CrewMembers.Where(c => c.CrewId == x.Task.AssignedTo).Select(c => c.FullName).FirstOrDefault(),
        x.Task.AssignedDepartment, x.Task.Priority, x.Task.ReportRevision ?? 0, x.Task.UpdatedAt, x.Task.WorkflowVersion ?? 0));

    public async Task<PmsPage<PmsWorkOrderRow>> ListAsync(PmsWorkOrderQuery q, CancellationToken token = default)
    {
        PmsJobService.ValidatePage(q.Page, q.PageSize);
        PmsJobService.ValidateRanges(q.DueFrom, q.DueTo, q.DueHoursFrom, q.DueHoursTo);
        var tasks = db.MaintenanceTasks.AsNoTracking().Where(t => !t.IsDeleted && t.PmsProtocolVersion == 2);
        if (q.JobId.HasValue) tasks = tasks.Where(t => t.ScheduleId == q.JobId);
        if (q.EquipmentAssetId.HasValue) tasks = tasks.Where(t => t.EquipmentAssetId == q.EquipmentAssetId);
        if (q.Name != null) { var term = q.Name.Trim().ToLowerInvariant(); tasks = tasks.Where(t => t.TaskDescription.ToLower().Contains(term)); }
        if (q.Code != null) { var term = q.Code.Trim().ToLowerInvariant(); tasks = tasks.Where(t => t.TaskId.ToLower().Contains(term)); }
        if (q.Equipment != null) { var term = q.Equipment.Trim().ToLowerInvariant(); tasks = tasks.Where(t => t.EquipmentAssetName != null && t.EquipmentAssetName.ToLower().Contains(term)); }
        if (q.Status == "OPEN") tasks = tasks.Where(t => t.Status != "COMPLETED" && t.Status != "CANCELLED" && t.Status != "DRAFT");
        else if (q.Status is not (null or "ALL")) tasks = tasks.Where(t => t.Status == q.Status);
        if (q.AssignedTo != null) tasks = tasks.Where(t => t.AssignedTo == q.AssignedTo);
        if (q.Department != null) tasks = tasks.Where(t => t.AssignedDepartment == q.Department);
        if (q.Priority != null) tasks = tasks.Where(t => t.Priority == q.Priority);
        if (q.DueFrom.HasValue) tasks = tasks.Where(t => t.WorkOrderDueAt >= q.DueFrom);
        if (q.DueTo.HasValue) tasks = tasks.Where(t => t.WorkOrderDueAt <= q.DueTo);
        if (q.DueHoursFrom.HasValue) tasks = tasks.Where(t => t.WorkOrderDueHours >= q.DueHoursFrom);
        if (q.DueHoursTo.HasValue) tasks = tasks.Where(t => t.WorkOrderDueHours <= q.DueHoursTo);
        var source = Read(tasks);
        if (q.DueState != null) source = source.Where(x => x.DueState == q.DueState);
        var total = await source.CountAsync(token);
        IOrderedQueryable<ReadShape> sorted = (q.Sort, q.Descending) switch
        {
            ("due", false) => source.OrderBy(x => x.Task.WorkOrderDueAt == null).ThenBy(x => x.Task.WorkOrderDueAt),
            ("due", true) => source.OrderBy(x => x.Task.WorkOrderDueAt == null).ThenByDescending(x => x.Task.WorkOrderDueAt),
            ("dueHours", false) => source.OrderBy(x => x.Task.WorkOrderDueHours == null).ThenBy(x => x.Task.WorkOrderDueHours),
            ("dueHours", true) => source.OrderBy(x => x.Task.WorkOrderDueHours == null).ThenByDescending(x => x.Task.WorkOrderDueHours),
            ("name", false) => source.OrderBy(x => x.Task.TaskDescription), ("name", true) => source.OrderByDescending(x => x.Task.TaskDescription),
            ("code", false) => source.OrderBy(x => x.Task.TaskId), ("code", true) => source.OrderByDescending(x => x.Task.TaskId),
            ("status", false) => source.OrderBy(x => x.Task.Status), ("status", true) => source.OrderByDescending(x => x.Task.Status),
            ("priority", false) => source.OrderBy(x => x.Task.Priority), ("priority", true) => source.OrderByDescending(x => x.Task.Priority),
            _ => throw new PmsRequestException(400, "Cột sắp xếp không hợp lệ.")
        };
        return new(await Rows(sorted.ThenBy(x => x.Task.Id).Skip((q.Page - 1) * q.PageSize).Take(q.PageSize)).ToListAsync(token), total, q.Page, q.PageSize);
    }

    public async Task<object> DetailAsync(Guid id, CancellationToken token = default)
    {
        await using var snapshot = db.Database.IsRelational() && db.Database.CurrentTransaction == null
            ? await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, token) : null;
        var tasks = db.MaintenanceTasks.AsNoTracking().Where(t => t.Id == id && !t.IsDeleted && t.PmsProtocolVersion == 2);
        var task = await tasks.SingleOrDefaultAsync(token) ?? throw new PmsRequestException(404, "Không tìm thấy Work Order.");
        var row = await Rows(Read(tasks)).SingleAsync(token);
        var checklist = await db.TaskChecklistItems.AsNoTracking().Where(c => c.TaskId == task.TaskId).OrderBy(c => c.SequenceOrder).ToListAsync(token);
        var timeline = await db.TaskStatusHistories.AsNoTracking().Where(h => h.TaskId == id).OrderBy(h => h.ChangedAt).ToListAsync(token);
        var reports = await db.PmsWorkOrderReports.AsNoTracking().Where(r => r.WorkOrderId == id).OrderByDescending(r => r.Revision).Take(50)
            .Select(r => new { r.Id, r.Revision, r.ContentHash, r.SubmittedAt, r.SubmittedByCrewId, r.Decision, r.DecidedAt, r.DecidedByCrewId, r.DecisionReason }).ToListAsync(token);
        var result = new { workOrder = row, task.JobVersion, task.JobSnapshot, task.Notes, task.SparePartsUsed,
            task.ActualRunningHours, actualDurationMinutes = task.ActualDuration, task.StartedAt, task.StartedBy,
            task.SubmittedAt, task.SubmittedBy, task.VerifiedAt, task.VerifiedBy, task.RejectionReason, task.SupportingCrewIds, checklist, timeline, reports };
        if (snapshot != null) await snapshot.CommitAsync(token);
        return result;
    }
}
