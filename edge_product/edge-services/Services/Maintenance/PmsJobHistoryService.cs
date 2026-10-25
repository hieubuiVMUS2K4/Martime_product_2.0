using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

public sealed class PmsHistoryRow
{
    public Guid Id { get; set; }
    public Guid WorkOrderId { get; set; }
    public string? WorkOrderCode { get; set; }
    public DateTime SourceExecutedAt { get; set; }
    public DateTime? SubmittedAt { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public string? CompletedBy { get; set; }
    public string? ApprovedBy { get; set; }
    public double? ExecutedRunningHours { get; set; }
    public bool? WasOverdue { get; set; }
    public bool IsLegacy { get; set; }
    public bool HasReport { get; set; }
}

public sealed class PmsJobHistoryService(EdgeDbContext db)
{
    public async Task<PmsPage<PmsHistoryRow>> ListAsync(Guid jobId, PmsHistoryQuery q, CancellationToken token)
    {
        PmsJobService.ValidatePage(q.Page, q.PageSize); PmsJobService.ValidateRanges(q.SourceFrom, q.SourceTo, q.HoursFrom, q.HoursTo);
        if (!await db.MaintenanceSchedules.AnyAsync(j => j.Id == jobId && j.PmsProtocolVersion == 2, token)) throw new PmsRequestException(404, "Không tìm thấy Job.");
        var legacy = db.MaintenanceHistories.AsNoTracking().Where(h => h.ScheduleId == jobId).Select(h => new PmsHistoryRow
        {
            Id = h.Id, WorkOrderId = h.TaskId, WorkOrderCode = null, SourceExecutedAt = h.ExecutedAt, SubmittedAt = null, ApprovedAt = null,
            CompletedBy = h.CompletedBy, ApprovedBy = null, ExecutedRunningHours = h.ExecutedRunningHours,
            WasOverdue = null, IsLegacy = true, HasReport = h.ReportSnapshot != null
        });
        var current = db.PmsWorkOrderReports.AsNoTracking().Where(r => r.JobId == jobId && r.Decision == "APPROVED").Select(r => new PmsHistoryRow
        {
            Id = r.Id, WorkOrderId = r.WorkOrderId, WorkOrderCode = db.MaintenanceTasks.Where(t => t.Id == r.WorkOrderId).Select(t => t.TaskId).FirstOrDefault(),
            SourceExecutedAt = r.SubmittedAt, SubmittedAt = r.SubmittedAt, ApprovedAt = r.DecidedAt,
            CompletedBy = r.SubmittedByCrewId, ApprovedBy = r.DecidedByCrewId,
            ExecutedRunningHours = r.ExecutedRunningHours, WasOverdue = r.WasOverdue, IsLegacy = false, HasReport = true
        });
        var rows = legacy.Concat(current);
        if (q.CompletedBy != null) rows = rows.Where(r => r.CompletedBy == q.CompletedBy);
        if (q.SourceFrom.HasValue) rows = rows.Where(r => r.SourceExecutedAt >= q.SourceFrom);
        if (q.SourceTo.HasValue) rows = rows.Where(r => r.SourceExecutedAt <= q.SourceTo);
        if (q.HoursFrom.HasValue) rows = rows.Where(r => r.ExecutedRunningHours >= q.HoursFrom);
        if (q.HoursTo.HasValue) rows = rows.Where(r => r.ExecutedRunningHours <= q.HoursTo);
        var total = await rows.CountAsync(token);
        var sorted = (q.Sort, q.Descending) switch
        {
            ("sourceTime", true) => rows.OrderByDescending(r => r.SourceExecutedAt), ("sourceTime", false) => rows.OrderBy(r => r.SourceExecutedAt),
            ("hours", true) => rows.OrderByDescending(r => r.ExecutedRunningHours), ("hours", false) => rows.OrderBy(r => r.ExecutedRunningHours),
            ("completedBy", true) => rows.OrderByDescending(r => r.CompletedBy), ("completedBy", false) => rows.OrderBy(r => r.CompletedBy),
            _ => throw new PmsRequestException(400, "Cột sắp xếp không hợp lệ.")
        };
        return new(await sorted.ThenBy(r => r.IsLegacy).ThenBy(r => r.Id).Skip((q.Page - 1) * q.PageSize).Take(q.PageSize).ToListAsync(token), total, q.Page, q.PageSize);
    }
}
