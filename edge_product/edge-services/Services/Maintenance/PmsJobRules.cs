using MaritimeEdge.Constants;
using MaritimeEdge.Models;

namespace MaritimeEdge.Services.Maintenance;

/// <summary>Protocol 2 rules. No legacy task resets, persistence, clock reads or estimated dates.</summary>
public static class PmsJobRules
{
    public const int ProtocolVersion = 2;
    public const string NeedsInformation = "NEEDS_INFORMATION";
    public const string Active = "ACTIVE";
    public const string Paused = "PAUSED";
    public const string Retired = "RETIRED";
    public const string Removed = "REMOVED";
    public static bool IsManualCategory(string? category) => category is "ON_DEMAND" or "DRY_DOCK" or "VOYAGE";

    public static IReadOnlyList<string> MissingInformation(MaintenanceSchedule job)
    {
        var errors = new List<string>();
        if (!job.EquipmentAssetId.HasValue || job.EquipmentAssetId == Guid.Empty || job.EquipmentGroupId.HasValue)
            errors.Add("A Job must target exactly one equipment asset.");
        if (string.IsNullOrWhiteSpace(job.ScheduleCode)) errors.Add("Job code is required.");
        if (string.IsNullOrWhiteSpace(job.ScheduleName)) errors.Add("Job name is required.");
        if (job.DaysBeforeDue < 0 || job.WarningHours < 0 || job.WarningHours.HasValue && !double.IsFinite(job.WarningHours.Value))
            errors.Add("Warning windows must be finite and non-negative.");
        if (job.ReleasePolicy is not (null or "ON_UPCOMING" or "ON_DUE")) errors.Add("Unsupported release policy.");
        if (IsManualCategory(job.MaintenanceCategory)) return errors;
        if (job.MaintenanceCategory != "PERIODIC") { errors.Add("Unsupported Job category."); return errors; }
        if (job.IntervalType is not ("CALENDAR" or "RUNNING_HOURS" or "HYBRID"))
            errors.Add("Unsupported interval type.");
        if (job.IntervalType is "CALENDAR" or "HYBRID")
        {
            var intervals = new[] { job.IntervalDays, job.IntervalMonths, job.IntervalYears };
            if (intervals.Count(x => x > 0) != 1 || intervals.Any(x => x <= 0))
                errors.Add("Choose exactly one positive calendar interval.");
            if (!job.BaselineAt.HasValue && !job.LastExecutedAt.HasValue) errors.Add("Calendar baseline is required.");
        }
        if (job.IntervalType is "RUNNING_HOURS" or "HYBRID")
        {
            if (!(job.IntervalHours > 0)) errors.Add("Positive running-hours interval is required.");
            var baseline = job.LastExecutedRunningHours ?? job.BaselineRunningHours;
            if (!baseline.HasValue || !double.IsFinite(baseline.Value) || baseline < 0)
                errors.Add("Finite non-negative running-hours baseline is required.");
        }
        return errors;
    }

    /// <summary>Saving a definition never records an execution and never resumes a paused Job.</summary>
    public static void PrepareForSave(MaintenanceSchedule job)
    {
        job.PmsProtocolVersion = ProtocolVersion;
        job.ReleasePolicy ??= "ON_UPCOMING";
        job.AssignmentPolicy ??= "ON_RELEASE";
        job.NextCycleNumber ??= 1;
        job.JobVersion = checked((job.JobVersion ?? 0) + 1);
        if (job.JobState is Paused or Retired or Removed) { job.IsActive = false; return; }
        job.JobState = MissingInformation(job).Count == 0 ? Active : NeedsInformation;
        job.IsActive = job.JobState == Active;
        if (!job.IsActive) { job.NextDueDate = null; job.NextDueRunningHours = null; return; }
        UpdateDeadlines(job);
    }

    public static void UpdateDeadlines(MaintenanceSchedule job)
    {
        if (job.MaintenanceCategory != "PERIODIC")
        {
            job.NextDueDate = null; job.NextDueRunningHours = null; job.AutoGenerate = false;
            return;
        }
        job.NextDueDate = job.IntervalType is "CALENDAR" or "HYBRID"
            ? MaintenanceCalendar.AddInterval(job, job.SkippedCycleAt ?? job.LastExecutedAt ?? job.BaselineAt
                ?? throw new InvalidOperationException("Missing calendar baseline.")) : null;
        job.NextDueRunningHours = job.IntervalType is "RUNNING_HOURS" or "HYBRID"
            ? (job.SkippedCycleHours ?? job.LastExecutedRunningHours ?? job.BaselineRunningHours
                ?? throw new InvalidOperationException("Missing running-hours baseline.")) + job.IntervalHours!.Value : null;
    }

    public static string DueState(DateTime? date, double? threshold, double? counter,
        DateTime nowUtc, TimeZoneInfo vesselTimeZone, int warningDays, double warningHours)
    {
        var states = new List<string>();
        if (date.HasValue)
        {
            var dueDay = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(date.Value, DateTimeKind.Utc), vesselTimeZone).Date;
            var today = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(nowUtc, DateTimeKind.Utc), vesselTimeZone).Date;
            var days = (dueDay - today).TotalDays;
            states.Add(days < 0 ? "OVERDUE" : days == 0 ? "DUE" : days <= warningDays ? "UPCOMING" : "NOT_DUE");
        }
        if (threshold.HasValue && counter.HasValue && double.IsFinite(counter.Value))
        {
            var remaining = threshold.Value - counter.Value;
            states.Add(remaining < 0 ? "OVERDUE" : remaining == 0 ? "DUE" : remaining <= warningHours ? "UPCOMING" : "NOT_DUE");
        }
        return new[] { "OVERDUE", "DUE", "UPCOMING", "NOT_DUE" }.FirstOrDefault(states.Contains) ?? "NO_DEADLINE";
    }

    public static bool CanAutoRelease(MaintenanceSchedule job, string dueState) =>
        job.PmsProtocolVersion == ProtocolVersion && job.JobState == Active && job.IsActive && job.AutoGenerate &&
        job.MaintenanceCategory == "PERIODIC" && MissingInformation(job).Count == 0 &&
        (dueState is "DUE" or "OVERDUE" || dueState == "UPCOMING" && job.ReleasePolicy != "ON_DUE");

    // The identity of a cycle must not change when the Job definition is edited.
    public static string CycleKey(MaintenanceSchedule job) => $"PERIODIC:{job.NextCycleNumber ?? 1}" +
        (job.CycleReleaseAttempt > 0 ? $":R{job.CycleReleaseAttempt}" : "");

    public static void SkipCancelledCycle(MaintenanceSchedule job)
    {
        // Advance one planned interval, never pretend a skipped cycle was performed.
        if (job.IntervalType is "CALENDAR" or "HYBRID")
            job.SkippedCycleAt = job.NextDueDate ?? throw new InvalidOperationException("Thiếu hạn ngày của kỳ hiện tại.");
        if (job.IntervalType is "RUNNING_HOURS" or "HYBRID")
            job.SkippedCycleHours = job.NextDueRunningHours ?? throw new InvalidOperationException("Thiếu hạn giờ của kỳ hiện tại.");
        job.NextCycleNumber = checked((job.NextCycleNumber ?? 1) + 1);
        job.CycleReleaseAttempt = null;
        UpdateDeadlines(job);
    }

    public static void ApplyApprovedExecution(MaintenanceSchedule job, MaintenanceTask order)
    {
        if (order.PmsProtocolVersion != ProtocolVersion || order.ScheduleId != job.Id || order.Status != "COMPLETED")
            throw new InvalidOperationException("Only an approved Work Order of this Job can advance its cycle.");
        if (!order.SubmittedAt.HasValue) throw new InvalidOperationException("Approved submission time is required.");
        if (order.CycleKey != CycleKey(job)) throw new InvalidOperationException("Work Order cycle is stale or already applied.");
        if (job.IntervalType is "RUNNING_HOURS" or "HYBRID" &&
            (!order.ActualRunningHours.HasValue || !double.IsFinite(order.ActualRunningHours.Value) || order.ActualRunningHours < 0))
            throw new InvalidOperationException("Recorded execution hours are required.");
        job.LastExecutedAt = order.SubmittedAt.Value;
        job.LastExecutedRunningHours = order.ActualRunningHours;
        job.SkippedCycleAt = null; job.SkippedCycleHours = null; job.CycleReleaseAttempt = null;
        job.NextCycleNumber = checked((job.NextCycleNumber ?? 1) + 1);
        UpdateDeadlines(job);
        // No writes to the completed order or to the current equipment counter.
    }
}
