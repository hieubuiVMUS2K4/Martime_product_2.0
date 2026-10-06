using System.Text.Json;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Constants;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

public static class PeriodicTaskCycle
{
    public static async Task ConsolidateLegacyAsync(EdgeDbContext db)
    {
        var tasks = await db.MaintenanceTasks.Where(t => !t.IsDeleted && t.ScheduleId.HasValue &&
            db.MaintenanceSchedules.Any(s => s.Id == t.ScheduleId && s.MaintenanceCategory == "PERIODIC"))
            .ToListAsync();
        foreach (var group in tasks.GroupBy(t => new { t.ScheduleId, t.EquipmentAssetId, t.EquipmentGroupId })
            .Where(g => g.Count() > 1))
        {
            // Never discard an in-progress cycle. Historical rows remain available via history.
            var current = group.OrderByDescending(t => t.Status is "IN_PROGRESS" or "PENDING_APPROVAL" or "RECTIFY")
                .ThenByDescending(t => t.Status != "COMPLETED" && t.Status != "CANCELLED")
                .ThenByDescending(t => t.CreatedAt).First();
            foreach (var old in group.Where(t => t.Id != current.Id && t.Status == "COMPLETED"))
            {
                var history = await db.MaintenanceHistories.FirstOrDefaultAsync(h => h.TaskId == old.Id);
                if (history == null)
                {
                    history = new() { ScheduleId = old.ScheduleId!.Value, TaskId = old.Id,
                        ExecutedAt = old.CompletedAt ?? old.UpdatedAt, CompletedBy = old.CompletedBy,
                        Notes = old.Notes, SparePartsUsed = old.SparePartsUsed, ExecutedRunningHours = old.ActualRunningHours };
                    db.MaintenanceHistories.Add(history);
                }
                history.ReportSnapshot ??= await SnapshotAsync(db, old);
                history.IsSynced = false;
                old.IsDeleted = true; old.DeletedAt = DateTime.UtcNow;
                old.DeletionReason = "Archived periodic execution; report retained in maintenance history";
                old.IsSynced = false;
            }
        }
        await db.SaveChangesAsync();
    }

    private static Dictionary<string, object?> Fields(object entity) => entity.GetType().GetProperties()
        .Where(p => p.CanRead && (p.PropertyType == typeof(string) ||
            (Nullable.GetUnderlyingType(p.PropertyType) ?? p.PropertyType).IsValueType))
        .ToDictionary(p => p.Name, p => p.GetValue(entity));

    public static async Task<string> SnapshotAsync(EdgeDbContext db, MaintenanceTask task)
    {
        var checklist = await db.TaskChecklistItems.Where(c => c.TaskId == task.TaskId).ToListAsync();
        var risk = await db.TaskRiskAssessments.FirstOrDefaultAsync(r => r.TaskId == task.TaskId);
        var inspection = await db.TaskInspectionReports.FirstOrDefaultAsync(r => r.TaskId == task.TaskId);
        var details = await db.MaintenanceTaskDetails.Where(d => d.MaintenanceTaskId == task.Id).ToListAsync();
        return JsonSerializer.Serialize(new { version = 1, task = Fields(task),
            checklist = checklist.Select(Fields), riskAssessment = risk == null ? null : Fields(risk),
            inspectionReport = inspection == null ? null : Fields(inspection), details = details.Select(Fields) },
            new JsonSerializerOptions(JsonSerializerDefaults.Web) { DictionaryKeyPolicy = JsonNamingPolicy.CamelCase });
    }

    public static bool IsDue(MaintenanceSchedule schedule, double? hours, DateTime now)
    {
        var hoursDue = hours.HasValue && schedule.NextDueRunningHours.HasValue && hours >= schedule.NextDueRunningHours;
        // Running-hour dates are estimates, never an execution trigger.
        if (schedule.IntervalType == "RUNNING_HOURS") return hoursDue;
        if (schedule.IntervalType == "HYBRID")
            return hoursDue || (MaintenanceCalendar.HasInterval(schedule) && schedule.LastExecutedAt.HasValue &&
                MaintenanceCalendar.AddInterval(schedule, schedule.LastExecutedAt.Value).Date <= now.Date);
        return schedule.NextDueDate.HasValue && schedule.NextDueDate.Value.Date <= now.Date;
    }

    public static string NextCycleStatus(MaintenanceSchedule schedule, double? hours, DateTime now, DateTime? taskDueDate = null)
    {
        var hourly = schedule.IntervalType is "RUNNING_HOURS" or "HYBRID";
        var remaining = hours.HasValue && schedule.NextDueRunningHours.HasValue
            ? schedule.NextDueRunningHours.Value - hours.Value : (double?)null;
        DateTime? calendarDue = schedule.IntervalType == "HYBRID"
            ? (schedule.LastExecutedAt.HasValue && MaintenanceCalendar.HasInterval(schedule)
                ? MaintenanceCalendar.AddInterval(schedule, schedule.LastExecutedAt.Value) : null)
            : schedule.IntervalType == "RUNNING_HOURS" ? null : taskDueDate ?? schedule.NextDueDate;
        if ((hourly && remaining < -(schedule.IntervalHours ?? 500) * 0.1) || calendarDue?.Date < now.Date)
            return "OVERDUE";
        if ((hourly && remaining <= 0) || calendarDue?.Date == now.Date) return "DUE";
        // The RH configuration stores the warning window in hours; calendar/hybrid stores days.
        var windowHours = schedule.IntervalType == "RUNNING_HOURS"
            ? (schedule.DaysBeforeDue > 0 ? schedule.DaysBeforeDue : MaintenanceConstants.MINIMUM_UPCOMING_WINDOW_HOURS)
            : (schedule.DaysBeforeDue > 0 ? schedule.DaysBeforeDue : 7) * MaintenanceConstants.AVERAGE_HOURS_PER_DAY;
        if (hourly && remaining <= windowHours) return "UPCOMING";
        if (calendarDue.HasValue && (calendarDue.Value.Date - now.Date).TotalDays <= (schedule.DaysBeforeDue > 0 ? schedule.DaysBeforeDue : 7))
            return "UPCOMING";
        return "SCHEDULED";
    }

    public static async Task<bool> ReopenIfDueAsync(EdgeDbContext db, MaintenanceTask task,
        MaintenanceSchedule schedule, double? hours, DateTime now, bool prepareNextCycle = false)
    {
        if (schedule.MaintenanceCategory != "PERIODIC" || !schedule.IsActive || !schedule.AutoGenerate) return false;
        if (task.Status is "SCHEDULED" or "UPCOMING" or "DUE" or "OVERDUE")
        {
            var status = NextCycleStatus(schedule, hours, now, task.NextDueAt);
            if (status == task.Status) return false;
            var previous = task.Status;
            task.Status = status;
            task.UpdatedAt = now; task.IsSynced = false;
            db.TaskStatusHistories.Add(new() { TaskId = task.Id, FromStatus = previous, ToStatus = task.Status,
                ChangedAt = now, ChangedBy = "SYSTEM", Reason = "Đến hạn bảo trì định kỳ tiếp theo", DeviceType = "SYSTEM" });
            return true;
        }
        if (task.Status != "COMPLETED" || schedule.MaintenanceCategory != "PERIODIC" ||
            !schedule.IsActive || !schedule.AutoGenerate) return false;
        if (schedule.NextDueDate.HasValue) task.NextDueAt = schedule.NextDueDate.Value;
        task.LastDoneAt = schedule.LastExecutedAt;
        task.RunningHoursAtLastDone = schedule.LastExecutedRunningHours;
        var isDue = IsDue(schedule, hours, now);
        if (!isDue && !prepareNextCycle) return false;

        // Older completed tasks need a snapshot before their report is reset.
        var executedAt = task.CompletedAt ?? task.LastDoneAt ?? now;
        var history = db.MaintenanceHistories.Local.FirstOrDefault(h => h.TaskId == task.Id && h.ExecutedAt >= executedAt)
            ?? await db.MaintenanceHistories.Where(h => h.TaskId == task.Id && h.ExecutedAt >= executedAt)
                .OrderByDescending(h => h.ExecutedAt).FirstOrDefaultAsync();
        if (history == null)
        {
            history = new MaintenanceHistory { TaskId = task.Id, ScheduleId = schedule.Id, ExecutedAt = executedAt,
                CompletedBy = task.CompletedBy, ExecutedRunningHours = task.ActualRunningHours,
                Notes = task.Notes, SparePartsUsed = task.SparePartsUsed };
            db.MaintenanceHistories.Add(history);
        }
        history.ReportSnapshot ??= await SnapshotAsync(db, task);
        history.IsSynced = false;

        task.StartedAt = task.SubmittedAt = task.VerifiedAt = task.CompletedAt = task.ApprovedAt = null;
        task.StartedBy = task.SubmittedBy = task.VerifiedBy = task.CompletedBy = task.ApprovedBy = null;
        task.VerificationResult = task.VerificationNotes = task.Notes = task.SparePartsUsed = null;
        task.CompletionPhotos = null; task.PhotosUploaded = 0;
        task.ActualRunningHours = null; task.ActualDuration = null; task.ChecklistCompleted = false;
        task.RejectionReason = task.RejectionHistory = task.LastRejectedBy = null;
        task.LastRejectedAt = null; task.RejectionCount = 0;
        task.Status = NextCycleStatus(schedule, hours, now);
        task.UpdatedAt = now; task.IsSynced = false;
        foreach (var item in await db.TaskChecklistItems.Where(c => c.TaskId == task.TaskId).ToListAsync())
        {
            item.IsCompleted = false; item.CompletedAt = null; item.CompletedBy = null;
            item.ReadingValue = null; item.Remarks = null; item.IsAbnormal = false;
        }
        foreach (var detail in await db.MaintenanceTaskDetails.Where(d => d.MaintenanceTaskId == task.Id).ToListAsync())
        {
            detail.Status = "PENDING"; detail.IsCompleted = false; detail.CompletedAt = null; detail.CompletedBy = null;
            detail.MeasuredValue = null; detail.Notes = null; detail.PhotoUrl = null; detail.SignatureUrl = null;
        }
        db.TaskRiskAssessments.RemoveRange(await db.TaskRiskAssessments.Where(r => r.TaskId == task.TaskId).ToListAsync());
        db.TaskInspectionReports.RemoveRange(await db.TaskInspectionReports.Where(r => r.TaskId == task.TaskId).ToListAsync());
        db.TaskStatusHistories.Add(new() { TaskId = task.Id, FromStatus = "COMPLETED", ToStatus = task.Status,
            ChangedAt = now, ChangedBy = "SYSTEM", Reason = isDue ? "Đến hạn bảo trì định kỳ tiếp theo" : "Lên lịch kỳ bảo trì tiếp theo", DeviceType = "SYSTEM" });
        return true;
    }
}
