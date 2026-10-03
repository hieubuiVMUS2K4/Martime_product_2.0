using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Repositories;
using MaritimeEdge.Constants;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

/// <summary>
/// Background service to automatically generate maintenance tasks from schedules
/// Runs daily to check schedules and create tasks X days before due date
/// </summary>
public class MaintenanceSchedulerService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<MaintenanceSchedulerService> _logger;
    private readonly TimeSpan _checkInterval = TimeSpan.FromMinutes(15); // Check every 15 minutes (daily tasks need prompt DUE transitions)

    public MaintenanceSchedulerService(
        IServiceProvider serviceProvider,
        ILogger<MaintenanceSchedulerService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    /// <summary>
    /// Get minimum lead time based on priority (ISM Code & IACS guidelines)
    /// </summary>
    private int GetMinimumLeadTime(string priority)
    {
        return priority switch
        {
            "CRITICAL" => 30,  // 30 days for critical equipment
            "HIGH" => 14,      // 14 days for high priority
            "MEDIUM" => 10,    // 10 days for medium priority
            "LOW" => 7,        // 7 days minimum
            _ => 7
        };
    }

    /// <summary>
    /// Calculate optimal lead time considering work duration and spare parts
    /// </summary>
    private int CalculateRecommendedLeadTime(MaintenanceSchedule schedule)
    {
        // Base: 3x estimated duration (safety buffer for delays)
        var workDays = (int)Math.Ceiling((schedule.EstimatedDurationHours ?? 4) / 8.0);
        var recommendedDays = workDays * 3;
        
        // Apply priority-based minimum
        var priorityMinimum = GetMinimumLeadTime(schedule.Priority);
        
        return Math.Max(recommendedDays, priorityMinimum);
    }

    /// <summary>
    /// Validate and correct lead time with CEILING RULE (PMS Workflow v2.2 - Updated 16/12/2025)
    /// SHORT INTERVALS (≤7 days): Lead time = 50% of interval
    /// LONG INTERVALS (>7 days): ISM Code minimum OR work-based, CAPPED at 70% of interval
    /// CEILING RULE prevents task overlap (next task won't appear before previous completes)
    /// </summary>
    private int ValidateAndCorrectLeadTime(int daysBeforeDue, string priority, double? estimatedHours, int? intervalDays)
    {
        var minimumLeadTime = GetMinimumLeadTime(priority);
        
        // SHORT INTERVALS (≤ 7 days): Proportional lead time
        if (intervalDays.HasValue && intervalDays.Value <= 7)
        {
            var proportionalLeadTime = Math.Max(1, intervalDays.Value / 2);
            
            if (daysBeforeDue != proportionalLeadTime)
            {
                _logger.LogWarning(
                    "DaysBeforeDue {Configured} adjusted to proportional {Proportional} " +
                    "for {Interval}-day interval. Short intervals require tight lead times.",
                    daysBeforeDue, proportionalLeadTime, intervalDays.Value);
            }
            return proportionalLeadTime;
        }
        
        // LONG INTERVALS (> 7 days): ISM Code + Work-based + CEILING RULE
        var workDays = (int)Math.Ceiling((estimatedHours ?? 4) / 8.0);
        var workBasedMinimum = workDays * 3;
        var effectiveMinimum = Math.Max(minimumLeadTime, workBasedMinimum);
        
        // 🚨 CEILING RULE: Lead time MUST NOT exceed 70% of interval
        // Prevents task overlap (e.g., 14-day interval with 30-day lead time)
        if (intervalDays.HasValue)
        {
            var maxAllowedLeadTime = (int)Math.Floor(intervalDays.Value * 0.7);
            
            if (effectiveMinimum > maxAllowedLeadTime)
            {
                _logger.LogWarning(
                    "ISM Code minimum {ISMMinimum} days for {Priority} priority " +
                    "exceeds interval ceiling {Ceiling} days (70% of {Interval}-day interval). " +
                    "Using ceiling to prevent task overlap.",
                    effectiveMinimum, priority, maxAllowedLeadTime, intervalDays.Value);
                effectiveMinimum = Math.Max(1, maxAllowedLeadTime);
            }
        }
        
        if (daysBeforeDue < effectiveMinimum)
        {
            _logger.LogWarning(
                "DaysBeforeDue {Configured} is less than minimum {Minimum} " +
                "for {Priority} priority. Auto-correcting.",
                daysBeforeDue, effectiveMinimum, priority);
            return effectiveMinimum;
        }
        
        return daysBeforeDue;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Maintenance Scheduler Service started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // 1. Fix past due dates in schedules (run once at startup, then periodically)
                await FixPastDueDatesInSchedules();
                
                // 2. Auto-correct task statuses based on due dates
                await AutoCorrectTaskStatuses();
                
                // 3. Generate new tasks from schedules
                await GenerateTasksFromSchedules();
                
                await Task.Delay(_checkInterval, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("Maintenance Scheduler Service is stopping");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Maintenance Scheduler Service");
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken).ConfigureAwait(false); // Wait 5 min on error
            }
        }
    }

    /// <summary>
    /// Fix schedules with past due dates by skipping to next future occurrence
    /// Prevents creating OVERDUE tasks immediately after system restart or downtime
    /// </summary>
    private async Task FixPastDueDatesInSchedules()
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();
        var scheduleRepo = scope.ServiceProvider.GetRequiredService<IMaintenanceScheduleRepository>();

        try
        {
            var now = DateTime.UtcNow;
            var today = now.Date;
            
            // Find all schedules with past due dates
            var pastDueSchedules = await context.MaintenanceSchedules
                .Where(s => s.AutoGenerate && 
                           s.NextDueDate.HasValue && 
                           s.NextDueDate.Value.Date < today &&
                           s.IntervalType == "CALENDAR" &&
                           (s.IntervalDays.HasValue || s.IntervalMonths.HasValue || s.IntervalYears.HasValue))
                .ToListAsync();

            if (!pastDueSchedules.Any())
            {
                _logger.LogDebug("No past due schedules found");
                return;
            }

            _logger.LogInformation(
                "Found {ScheduleCount} schedules with past due dates. Auto-correcting to future dates...",
                pastDueSchedules.Count);

            int fixedCount = 0;
            foreach (var schedule in pastDueSchedules)
            {
                if (!schedule.NextDueDate.HasValue || !MaintenanceCalendar.HasInterval(schedule))
                {
                    continue;
                }

                var oldDueDate = schedule.NextDueDate.Value;
                var intervalDays = schedule.IntervalDays;
                schedule.NextDueDate = MaintenanceCalendar.AdvanceTo(schedule, oldDueDate, today, out var intervalsToSkip);
                schedule.UpdatedAt = DateTime.UtcNow;
                
                _logger.LogInformation(
                    "Schedule {ScheduleCode}: {OldDue} -> {NewDue} (skipped {Intervals} intervals of {IntervalDays} days)",
                    schedule.ScheduleCode,
                    oldDueDate.ToString("yyyy-MM-dd"),
                    schedule.NextDueDate.Value.ToString("yyyy-MM-dd"),
                    intervalsToSkip,
                    intervalDays);
                
                fixedCount++;
            }

            await context.SaveChangesAsync();
            
            _logger.LogInformation(
                "✅ Fixed {Count} schedules with past due dates",
                fixedCount);
            
            // Also update existing SCHEDULED/DUE tasks that have past NextDueAt
            var tasksToUpdate = await context.MaintenanceTasks
                .Where(t => (t.Status == "SCHEDULED" || t.Status == "DUE" || t.Status == "OVERDUE") &&
                           t.NextDueAt < today &&
                           t.ScheduleId != null &&
                           !t.IsDeleted)
                .ToListAsync();
            
            if (tasksToUpdate.Any())
            {
                _logger.LogInformation(
                    "Found {TaskCount} existing tasks with past due dates. Updating...",
                    tasksToUpdate.Count);
                
                foreach (var task in tasksToUpdate)
                {
                    // Find corresponding schedule
                    var schedule = pastDueSchedules.FirstOrDefault(s => s.Id == task.ScheduleId);
                    if (schedule != null && schedule.NextDueDate.HasValue)
                    {
                        var oldTaskDue = task.NextDueAt;
                        task.NextDueAt = schedule.NextDueDate.Value;
                        task.UpdatedAt = DateTime.UtcNow;
                        
                        // Update status based on new date
                        var daysUntilDue = (task.NextDueAt.Date - today).Days;
                        if (daysUntilDue < 0)
                            task.Status = "OVERDUE";
                        else if (daysUntilDue == 0)
                            task.Status = "DUE";
                        else
                            task.Status = "SCHEDULED";
                        
                        _logger.LogInformation(
                            "Task {TaskId}: {OldDue} -> {NewDue} ({Status})",
                            task.TaskId,
                            oldTaskDue.ToString("yyyy-MM-dd"),
                            task.NextDueAt.ToString("yyyy-MM-dd"),
                            task.Status);
                    }
                }
                
                await context.SaveChangesAsync();
                
                _logger.LogInformation(
                    "✅ Updated {TaskCount} existing tasks to match new schedule dates",
                    tasksToUpdate.Count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fixing past due dates in schedules");
        }
    }

    /// <summary>
    /// Auto-correct task statuses based on due dates (PMS Workflow v3.0):
    /// - SCHEDULED → UPCOMING (within DaysBeforeDue window)
    /// - SCHEDULED/UPCOMING → DUE (when due date is today)
    /// - SCHEDULED/UPCOMING → OVERDUE (when past due date)  
    /// - DUE → OVERDUE (when past due date)
    /// - OVERDUE → DUE/UPCOMING/SCHEDULED (if due date was extended via deferral)
    /// Does NOT touch: IN_PROGRESS, PENDING_APPROVAL, RECTIFY, COMPLETED
    /// Does NOT touch: MISSING_* statuses (these are validation warnings, not workflow statuses)
    /// </summary>
    private async Task AutoCorrectTaskStatuses()
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();

        try
        {
            var now = DateTime.UtcNow;
            var today = now.Date;

            // Get all tasks that need status correction
            var statusesToProcess = new[] { "SCHEDULED", "UPCOMING", "DUE", "PENDING", "OVERDUE" };
            var tasks = await context.MaintenanceTasks
                .Where(t => !t.IsDeleted && statusesToProcess.Contains(t.Status))
                .ToListAsync();

            int correctedCount = 0;

            foreach (var task in tasks)
            {
                var dueDate = task.NextDueAt.Date;
                var isOverdue = dueDate < today;
                var isDue = dueDate <= today;
                string? newStatus = null;

                // Check UPCOMING window: within DaysBeforeDue days (default 7)
                var isUpcoming = false;
                if (!isDue && !isOverdue && task.ScheduleId.HasValue)
                {
                    var schedule = await context.MaintenanceSchedules
                        .AsNoTracking()
                        .FirstOrDefaultAsync(s => s.Id == task.ScheduleId.Value);
                    if (schedule != null)
                    {
                        var windowDays = schedule.DaysBeforeDue > 0 ? schedule.DaysBeforeDue : 7;
                        var daysUntilDue = (dueDate - today).TotalDays;
                        isUpcoming = daysUntilDue <= windowDays;
                    }
                }

                if (task.Status == "SCHEDULED")
                {
                    if (isOverdue) newStatus = "OVERDUE";
                    else if (isDue) newStatus = "DUE";
                    else if (isUpcoming) newStatus = "UPCOMING";
                }
                else if (task.Status == "UPCOMING")
                {
                    if (isOverdue) newStatus = "OVERDUE";
                    else if (isDue) newStatus = "DUE";
                }
                else if (task.Status == "DUE" && isOverdue)
                {
                    newStatus = "OVERDUE";
                }
                else if (task.Status == "PENDING") // Legacy: Migrate to new workflow
                {
                    newStatus = isOverdue ? "OVERDUE" : "DUE";
                }
                else if (task.Status == "OVERDUE" && !isOverdue)
                {
                    // Due date was extended (e.g., via approved deferral)
                    newStatus = isDue ? "DUE" : (isUpcoming ? "UPCOMING" : "SCHEDULED");
                }

                if (newStatus != null && newStatus != task.Status)
                {
                    _logger.LogDebug("Auto-correcting task {TaskId}: {OldStatus} → {NewStatus}", 
                        task.TaskId, task.Status, newStatus);
                    task.Status = newStatus;
                    task.UpdatedAt = DateTime.UtcNow;
                    correctedCount++;
                }
            }

            if (correctedCount > 0)
            {
                await context.SaveChangesAsync();
                _logger.LogInformation("Auto-corrected {Count} task statuses", correctedCount);
            }
            else
            {
                _logger.LogDebug("No task statuses needed correction");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error auto-correcting task statuses");
        }
    }

    private async Task GenerateTasksFromSchedules()
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();
        var scheduleRepo = scope.ServiceProvider.GetRequiredService<IMaintenanceScheduleRepository>();
        var assetRepo = scope.ServiceProvider.GetRequiredService<IEquipmentAssetRepository>();

        try
        {
            _logger.LogInformation("Checking schedules for auto task generation...");

            var now = DateTime.UtcNow;
            var schedules = await scheduleRepo.GetAutoGenerateSchedulesAsync();

            int tasksGenerated = 0;
            
            // Batch load all equipment group members ONCE to avoid N+1 queries
            var scheduleGroupIds = schedules
                .Where(s => s.EquipmentGroupId.HasValue)
                .Select(s => s.EquipmentGroupId!.Value)
                .Distinct()
                .ToList();
            
            var allGroupMembers = await context.EquipmentGroupMembers
                .Where(egm => scheduleGroupIds.Contains(egm.GroupId))
                .Include(egm => egm.Asset)
                .ToListAsync();
            
            // Create lookup dictionary for O(1) access
            var groupMembersLookup = allGroupMembers
                .GroupBy(egm => egm.GroupId)
                .ToDictionary(g => g.Key, g => g.ToList());
            
            // Batch load assets for per-equipment schedules
            var scheduleAssetIds = schedules
                .Where(s => s.EquipmentAssetId.HasValue)
                .Select(s => s.EquipmentAssetId!.Value)
                .Distinct()
                .ToList();
            
            var assetLookup = scheduleAssetIds.Any()
                ? await context.EquipmentAssets
                    .Where(a => scheduleAssetIds.Contains(a.Id))
                    .ToDictionaryAsync(a => a.Id, a => a)
                : new Dictionary<Guid, EquipmentAsset>();
            
            // Helper function to get asset from pre-loaded data
            EquipmentAsset? GetPrimaryAssetForGroup(Guid groupId)
            {
                if (!groupMembersLookup.TryGetValue(groupId, out var members))
                    return null;
                
                return members
                    .Select(gm => gm.Asset)
                    .Where(a => a != null && a.IsActive)
                    .OrderByDescending(a => a.CurrentRunningHours ?? 0)
                    .FirstOrDefault();
            }

            foreach (var schedule in schedules)
            {
                if (!schedule.NextDueDate.HasValue)
                {
                    // Calculate next due date if not set
                    EquipmentAsset? asset = null;
                    if (schedule.EquipmentAssetId.HasValue)
                    {
                        assetLookup.TryGetValue(schedule.EquipmentAssetId.Value, out asset);
                    }
                    else if (schedule.EquipmentGroupId.HasValue)
                    {
                        asset = GetPrimaryAssetForGroup(schedule.EquipmentGroupId.Value);
                    }
                    
                    if (asset != null)
                    {
                        CalculateNextDueDate(schedule, asset);
                        await scheduleRepo.UpdateAsync(schedule);
                    }
                    continue;
                }

                // Check if task should be generated (X days before due)
                var daysUntilDue = (schedule.NextDueDate.Value.Date - now.Date).Days;
                
                // 🔒 CRITICAL FIX: If NextDueDate is in the PAST, recalculate it first
                // This happens when tasks complete late and scheduler hasn't run in a while
                if (daysUntilDue < 0)
                {
                    _logger.LogWarning(
                        "Schedule {ScheduleCode} has past due date {DueDate} ({Days} days ago). " +
                        "Recalculating next occurrence to prevent immediate OVERDUE tasks.",
                        schedule.ScheduleCode, schedule.NextDueDate.Value.ToString("yyyy-MM-dd"), Math.Abs(daysUntilDue));
                    
                    // Use pre-loaded data: per-asset schedule or group-based
                    EquipmentAsset? pastDueAsset = null;
                    if (schedule.EquipmentAssetId.HasValue)
                        assetLookup.TryGetValue(schedule.EquipmentAssetId.Value, out pastDueAsset);
                    else if (schedule.EquipmentGroupId.HasValue)
                        pastDueAsset = GetPrimaryAssetForGroup(schedule.EquipmentGroupId.Value);
                    
                    if (pastDueAsset != null && MaintenanceCalendar.HasInterval(schedule))
                    {
                        // Skip forward to next future occurrence
                        var oldDueDate = schedule.NextDueDate.Value;
                        schedule.NextDueDate = MaintenanceCalendar.AdvanceTo(schedule, oldDueDate, now, out var intervalsToSkip);
                        
                        await scheduleRepo.UpdateAsync(schedule);
                        
                        _logger.LogInformation(
                            "Schedule {ScheduleCode} recalculated: {OldDue} → {NewDue} (skipped {Intervals} intervals)",
                            schedule.ScheduleCode, 
                            oldDueDate.ToString("yyyy-MM-dd"),
                            schedule.NextDueDate.Value.ToString("yyyy-MM-dd"),
                            intervalsToSkip);
                        
                        // Recalculate daysUntilDue with new date
                        daysUntilDue = (schedule.NextDueDate.Value.Date - now.Date).Days;
                    }
                }
                
                // SAFETY CHECK: Validate and ENFORCE lead time with CEILING RULE (PMS Workflow v2.2)
                // - Short intervals (≤7d): 50% proportional lead time
                // - Long intervals (>7d): ISM Code minimum, capped at 70% of interval
                var effectiveLeadTime = ValidateAndCorrectLeadTime(
                    schedule.DaysBeforeDue, 
                    schedule.Priority,
                    schedule.EstimatedDurationHours,
                    schedule.IntervalDays
                );
                
                // AUTO-CORRECTION: Update schedule if calculated lead time differs
                if (effectiveLeadTime != schedule.DaysBeforeDue)
                {
                    var oldLeadTime = schedule.DaysBeforeDue;
                    schedule.DaysBeforeDue = effectiveLeadTime;
                    await scheduleRepo.UpdateAsync(schedule);
                    
                    _logger.LogInformation(
                        "Schedule {ScheduleCode} DaysBeforeDue auto-corrected: {Old}d → {New}d " +
                        "(Interval: {Interval}d, Priority: {Priority}, ISM Code compliance with ceiling rule)",
                        schedule.ScheduleCode, oldLeadTime, effectiveLeadTime, 
                        schedule.IntervalDays, schedule.Priority);
                }
                
                // Generate task if within lead time window OR already overdue
                // This ensures tasks are created even for schedules that are past due
                if (daysUntilDue <= effectiveLeadTime || daysUntilDue < 0)
                {
                    // Check if task already exists for this schedule and due date
                    // IMPORTANT: Exclude soft-deleted tasks (IsDeleted = true) from check
                    // This allows auto-regeneration after task deletion
                    var existingTask = await context.MaintenanceTasks
                        .Where(t => t.ScheduleId == schedule.Id &&
                                   t.Status != "COMPLETED" &&
                                   t.Status != "CANCELLED" &&
                                   !t.IsDeleted)  // Only count active (non-deleted) tasks
                        .FirstOrDefaultAsync();

                    if (existingTask == null)
                    {
                        await GenerateTaskFromSchedule(context, schedule);
                        tasksGenerated++;
                    }
                }
            }

            if (tasksGenerated > 0)
            {
                _logger.LogInformation("Generated {Count} maintenance tasks from schedules", tasksGenerated);
            }
            else
            {
                _logger.LogDebug("No new tasks to generate");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating tasks from schedules");
        }
    }

    private async Task GenerateTaskFromSchedule(EdgeDbContext context, MaintenanceSchedule schedule)
    {
        try
        {
            bool isPerAsset = schedule.EquipmentAssetId.HasValue;
            
            EquipmentGroup? group = null;
            EquipmentAsset? singleAsset = null;
            List<EquipmentGroupMember> groupMembers = new();
            
            if (isPerAsset)
            {
                // Per-equipment schedule: get the single asset
                singleAsset = await context.EquipmentAssets.FindAsync(schedule.EquipmentAssetId!.Value);
                if (singleAsset == null || !singleAsset.IsActive)
                {
                    _logger.LogWarning("Equipment asset not found or inactive for schedule {ScheduleCode}", schedule.ScheduleCode);
                    return;
                }
            }
            else if (schedule.EquipmentGroupId.HasValue)
            {
                // Group-based schedule: get group and members
                group = await context.EquipmentGroups.FindAsync(schedule.EquipmentGroupId.Value);
                if (group == null)
                {
                    _logger.LogWarning("Equipment group not found for schedule {ScheduleCode}", schedule.ScheduleCode);
                    return;
                }

                groupMembers = await context.EquipmentGroupMembers
                    .Where(egm => egm.GroupId == schedule.EquipmentGroupId.Value)
                    .Include(egm => egm.Asset)
                    .ToListAsync();

                if (!groupMembers.Any())
                {
                    _logger.LogWarning("No assets found in group {GroupCode} for schedule {ScheduleCode}", 
                        group.GroupCode, schedule.ScheduleCode);
                    return;
                }
            }
            else
            {
                _logger.LogWarning("Schedule {ScheduleCode} has neither EquipmentGroupId nor EquipmentAssetId", schedule.ScheduleCode);
                return;
            }

            // Get spare parts requirements with material details
            var spareParts = await context.ScheduleSpareParts
                .Where(sp => sp.ScheduleId == schedule.Id)
                .ToListAsync();

            // ScheduleSparePart.MaterialItemId trỏ DANH MỤC (material_items catalog).
            var materialIds = spareParts.Select(sp => sp.MaterialItemId).ToList();
            var materials = await context.MaterialCatalogItems
                .Where(m => materialIds.Contains(m.Id))
                .ToDictionaryAsync(m => m.Id, m => new { m.ItemCode, m.Name });

            var sparePartsJson = spareParts.Any()
                ? System.Text.Json.JsonSerializer.Serialize(spareParts.Select(sp => new
                {
                    materialItemId = sp.MaterialItemId,
                    materialCode = materials.ContainsKey(sp.MaterialItemId) ? materials[sp.MaterialItemId].ItemCode : "",
                    materialName = materials.ContainsKey(sp.MaterialItemId) ? materials[sp.MaterialItemId].Name : "Unknown Material",
                    quantityRequired = sp.QuantityRequired,
                    isMandatory = sp.IsMandatory
                }), new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase })
                : null;

            // Create unique task ID
            var identifierCode = isPerAsset ? singleAsset!.AssetCode : group!.GroupCode;
            var taskId = MaintenanceTaskIdentity.Create(schedule.Id, schedule.ScheduleCode, identifierCode, DateTime.UtcNow);

            // Check for existing task to prevent duplicate key violations
            var existingTask = await context.MaintenanceTasks
                .FirstOrDefaultAsync(t => t.TaskId == taskId);
            
            if (existingTask != null)
            {
                _logger.LogDebug(
                    "Task {TaskId} already exists for schedule {ScheduleId} (Status: {Status}, IsDeleted: {IsDeleted}), skipping", 
                    taskId, schedule.Id, existingTask.Status, existingTask.IsDeleted);
                return;
            }

            // Determine PIC
            string? assignedTo = null;
            if (isPerAsset)
            {
                // For per-asset: use schedule defaults
                assignedTo = schedule.AssignedToCrewId;
            }
            else
            {
                assignedTo = await DetermineGroupPIC(context, schedule, group!);
            }

            var hasChecklistTemplates = await context.ScheduleChecklistTemplates
                .AnyAsync(t => t.ScheduleId == schedule.Id);

            string initialStatus = DetermineTaskStatus(assignedTo, hasChecklistTemplates, schedule.Priority);

            // Parse META flags from schedule Instructions (<!--META:{...}-->)
            bool reqRisk = false, reqInspect = false;
            if (!string.IsNullOrEmpty(schedule.Instructions))
            {
                var metaMatch = System.Text.RegularExpressions.Regex.Match(
                    schedule.Instructions, @"<!--META:(\{.*?\})-->");
                if (metaMatch.Success)
                {
                    try
                    {
                        var meta = System.Text.Json.JsonDocument.Parse(metaMatch.Groups[1].Value).RootElement;
                        reqRisk    = meta.TryGetProperty("reqRisk",       out var rv) && rv.GetBoolean();
                        reqInspect = meta.TryGetProperty("reqInspection", out var iv) && iv.GetBoolean();
                    }
                    catch { /* ignore malformed META */ }
                }
            }

            // Create maintenance task
            var task = new MaintenanceTask
            {
                TaskId = taskId,
                TaskTypeId = null,
                ScheduleId = schedule.Id,
                
                // Group-based fields
                EquipmentGroupId = isPerAsset ? null : group!.Id,
                EquipmentGroupName = isPerAsset ? null : group!.GroupName,
                
                // Per-asset fields
                EquipmentAssetId = isPerAsset ? singleAsset!.Id : (Guid?)null,
                EquipmentAssetName = isPerAsset ? singleAsset!.AssetName : null,
                
                // Legacy fields
                EquipmentId = null,
                EquipmentName = null,
                
                TaskType = (schedule.MaintenanceCategory == "AD_HOC" || schedule.MaintenanceCategory == "CORRECTIVE") ? schedule.MaintenanceCategory : schedule.IntervalType,
                TaskDescription = schedule.ScheduleName + "\n\n" + (schedule.Instructions ?? ""),
                IntervalHours = schedule.IntervalHours,
                IntervalDays = schedule.IntervalDays,
                LastDoneAt = schedule.LastExecutedAt,
                NextDueAt = schedule.NextDueDate!.Value,
                RunningHoursAtLastDone = schedule.LastExecutedRunningHours,
                Priority = schedule.Priority,
                Status = initialStatus,
                AssignedTo = assignedTo,
                RequiredSpareParts = sparePartsJson,
                SparePartsUsed = null,
                RequireRiskAssessment = reqRisk,
                RequireInspectionReport = reqInspect,
                Notes = isPerAsset
                    ? $"Auto-generated from schedule: {schedule.ScheduleCode} (Asset: {singleAsset!.AssetName})"
                    : $"Auto-generated from schedule: {schedule.ScheduleCode} (Group: {group!.GroupName})",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            context.MaintenanceTasks.Add(task);

            // Create checklist items
            var checklistTemplates = await context.ScheduleChecklistTemplates
                .Where(t => t.ScheduleId == schedule.Id)
                .OrderBy(t => t.SequenceOrder)
                .ToListAsync();

            _logger.LogInformation(
                "Generating task for schedule {ScheduleCode}: {Mode} mode, {Count} checklist templates",
                schedule.ScheduleCode, isPerAsset ? "per-asset" : "group", checklistTemplates.Count);

            // Build list of assets to create checklist items for
            var assetsForChecklist = isPerAsset
                ? new List<EquipmentAsset> { singleAsset! }
                : groupMembers
                    .Select(m => m.Asset)
                    .Where(a => a != null && a.IsActive)
                    .Cast<EquipmentAsset>()
                    .ToList();

            if (checklistTemplates.Any())
            {
                foreach (var asset in assetsForChecklist)
                {
                    foreach (var template in checklistTemplates)
                    {
                        var checklistItem = new TaskChecklistItem
                        {
                            TaskId = task.TaskId,
                            AssetId = asset.Id,
                            AssetCode = asset.AssetCode,
                            AssetName = asset.AssetName,
                            SequenceOrder = template.SequenceOrder,
                            CheckpointDescription = template.CheckpointDescription,
                            RequiresReading = template.RequiresReading,
                            NormalRangeMin = template.NormalRangeMin,
                            NormalRangeMax = template.NormalRangeMax,
                            Unit = template.Unit,
                            IsCompleted = false,
                            CreatedAt = DateTime.UtcNow
                        };

                        // Asset-specific override from TechnicalSpecs
                        if (!string.IsNullOrWhiteSpace(asset.TechnicalSpecs))
                        {
                            try
                            {
                                var specs = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, object>>(asset.TechnicalSpecs);
                                if (specs != null)
                                {
                                    var checkpointKey = template.CheckpointDescription
                                        .ToLower()
                                        .Replace(" ", "_")
                                        .Replace("check_", "")
                                        .Replace("measure_", "")
                                        .Replace("inspect_", "");

                                    if (specs.TryGetValue($"{checkpointKey}_min", out var minVal))
                                        checklistItem.NormalRangeMin = Convert.ToDouble(minVal);
                                    if (specs.TryGetValue($"{checkpointKey}_max", out var maxVal))
                                        checklistItem.NormalRangeMax = Convert.ToDouble(maxVal);
                                    if (specs.TryGetValue($"{checkpointKey}_unit", out var unitVal))
                                        checklistItem.Unit = unitVal.ToString();
                                }
                            }
                            catch (Exception ex)
                            {
                                _logger.LogWarning(ex, "Failed to parse TechnicalSpecs for asset {AssetCode}", asset.AssetCode);
                            }
                        }

                        context.TaskChecklistItems.Add(checklistItem);
                    }
                }
                
                _logger.LogInformation(
                    "Cloned {TemplateCount} checklist templates × {AssetCount} assets = {TotalItems} checklist items for task {TaskId}",
                    checklistTemplates.Count, assetsForChecklist.Count,
                    checklistTemplates.Count * assetsForChecklist.Count, taskId);
            }
            else
            {
                // No templates: Create simple checklist items
                int seq = 0;
                foreach (var asset in assetsForChecklist)
                {
                    var checklistItem = new TaskChecklistItem
                    {
                        TaskId = task.TaskId,
                        AssetId = asset.Id,
                        AssetCode = asset.AssetCode,
                        AssetName = asset.AssetName,
                        SequenceOrder = seq++,
                        IsCompleted = false,
                        CreatedAt = DateTime.UtcNow
                    };
                    context.TaskChecklistItems.Add(checklistItem);
                }
            }

            await context.SaveChangesAsync();
            
            if (isPerAsset)
            {
                _logger.LogInformation(
                    "Generated per-asset task {TaskId} for schedule {ScheduleCode} (Asset: {AssetName})",
                    taskId, schedule.ScheduleCode, singleAsset!.AssetName);
            }
            else
            {
                _logger.LogInformation(
                    "Generated group task {TaskId} for schedule {ScheduleCode} (Group: {GroupName}, {AssetCount} assets)",
                    taskId, schedule.ScheduleCode, group!.GroupName, assetsForChecklist.Count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating task from schedule {ScheduleCode}", schedule.ScheduleCode);
        }
    }

    private void CalculateNextDueDate(MaintenanceSchedule schedule, EquipmentAsset asset)
    {
        if (schedule.IntervalType == "CALENDAR" && MaintenanceCalendar.HasInterval(schedule))
        {
            // Use LastExecutedAt as base to maintain interval consistency
            // If never executed, use current NextDueDate or UtcNow as fallback
            var baseDate = schedule.LastExecutedAt 
                ?? schedule.NextDueDate 
                ?? DateTime.UtcNow;
            schedule.NextDueDate = MaintenanceCalendar.AddInterval(schedule, baseDate);
        }
        else if (schedule.IntervalType == "RUNNING_HOURS" && schedule.IntervalHours.HasValue)
        {
            var baseHours = schedule.LastExecutedRunningHours ?? asset.CurrentRunningHours ?? 0;
            schedule.NextDueRunningHours = baseHours + schedule.IntervalHours.Value;
            
            // Estimate calendar date
            var hoursRemaining = schedule.NextDueRunningHours.Value - (asset.CurrentRunningHours ?? 0);
            var daysRemaining = (int)Math.Max(hoursRemaining / MaintenanceConstants.AVERAGE_HOURS_PER_DAY, 1);
            schedule.NextDueDate = DateTime.UtcNow.AddDays(daysRemaining);
        }
        else if (schedule.IntervalType == "HYBRID")
        {
            // Use the earlier of the two due dates
            DateTime? calendarDue = null;
            DateTime? runningHoursDue = null;

            if (MaintenanceCalendar.HasInterval(schedule))
            {
                var baseDate = schedule.LastExecutedAt 
                    ?? schedule.NextDueDate 
                    ?? DateTime.UtcNow;
                calendarDue = MaintenanceCalendar.AddInterval(schedule, baseDate);
            }

            if (schedule.IntervalHours.HasValue)
            {
                var baseHours = schedule.LastExecutedRunningHours ?? asset.CurrentRunningHours ?? 0;
                schedule.NextDueRunningHours = baseHours + schedule.IntervalHours.Value;
                
                var hoursRemaining = schedule.NextDueRunningHours.Value - (asset.CurrentRunningHours ?? 0);
                var daysRemaining = (int)Math.Max(hoursRemaining / MaintenanceConstants.AVERAGE_HOURS_PER_DAY, 1);
                runningHoursDue = DateTime.UtcNow.AddDays(daysRemaining);
            }

            // Choose earlier date
            if (calendarDue.HasValue && runningHoursDue.HasValue)
            {
                schedule.NextDueDate = calendarDue < runningHoursDue ? calendarDue : runningHoursDue;
            }
            else
            {
                schedule.NextDueDate = calendarDue ?? runningHoursDue;
            }
        }
    }

    /// <summary>
    /// Determine task status based on validation rules (PMS Workflow v2.0):
    /// - MISSING_BOTH: No PIC and no checklist → Cannot proceed
    /// - MISSING_PIC: Has checklist but no PIC assigned → Needs Work Planner
    /// - MISSING_CHECKLIST: Has PIC but no checklist defined → Needs Schedule Config
    /// - SCHEDULED: Task ready but not yet due (default for valid tasks)
    /// - DUE: Task is due (determined by scheduler based on date)
    /// 
    /// Note: PENDING_APPROVAL status is ONLY set when crew SUBMITS a task after completion.
    /// New tasks always start as SCHEDULED, then move to DUE when due date arrives.
    /// </summary>
    private string DetermineTaskStatus(string? assignedTo, bool hasChecklist, string priority)
    {
        bool hasPIC = !string.IsNullOrWhiteSpace(assignedTo);

        // Validation: Check for missing requirements
        if (!hasPIC && !hasChecklist)
        {
            _logger.LogWarning("Task missing both PIC and checklist → MISSING_BOTH");
            return "MISSING_BOTH";
        }
        
        if (!hasPIC)
        {
            _logger.LogWarning("Task missing PIC assignment → MISSING_PIC");
            return "MISSING_PIC";
        }
        
        if (!hasChecklist)
        {
            _logger.LogWarning("Task missing checklist templates → MISSING_CHECKLIST");
            return "MISSING_CHECKLIST";
        }

        // PMS Workflow v2.0: All valid tasks start as SCHEDULED
        // They will automatically move to DUE when due date arrives (via status update job)
        _logger.LogDebug("Task valid with PIC and checklist → SCHEDULED (will become DUE when due date arrives)");
        return "SCHEDULED";
    }

    /// <summary>
    /// Determine PIC (Person In Charge) for entire equipment group using 4-tier waterfall logic:
    /// 1. Group.PicCrewId (highest priority - specific person override)
    /// 2. Group.PicRole (match rank to onboard crew in group's department)
    /// 3. Schedule.DefaultAssignedTo (fallback to schedule default)
    /// 4. null (unassigned - Work Planner will assign manually → TASK status)
    /// </summary>
    private async Task<string?> DetermineGroupPIC(
        EdgeDbContext context,
        MaintenanceSchedule schedule,
        EquipmentGroup group)
    {
        try
        {
            // Get crew filtered by department (strict organizational boundary)
            IQueryable<CrewMember> departmentCrewQuery = context.CrewMembers
                .Where(c => c.IsOnboard);

            // Apply department filter if group has department assigned
            if (!string.IsNullOrWhiteSpace(group.Department))
            {
                departmentCrewQuery = departmentCrewQuery.Where(c => c.Department == group.Department);
                _logger.LogDebug("Filtering crew by department: {Department}", group.Department);
            }

            // Tier 1: PIC crew override from equipment group (e.g., 2/E assigned to Main Engine Group)
            if (!string.IsNullOrWhiteSpace(group.PicCrewId))
            {
                var picCrew = await departmentCrewQuery
                    .FirstOrDefaultAsync(c => c.CrewId == group.PicCrewId);
                
                if (picCrew != null)
                {
                    _logger.LogDebug("Group task assigned to PIC crew {CrewId} via Group override", 
                        picCrew.CrewId); // , picCrew.Rank removed
                    return picCrew.CrewId;
                }
            }

            // Tier 2: PIC role from equipment group - REMOVED (Rank column deleted)
            // if (!string.IsNullOrWhiteSpace(group.PicRole))
            // {
            //     var picCrew = await departmentCrewQuery
            //         .Where(c => c.Rank == group.PicRole)
            //         .OrderBy(c => c.CrewId)
            //         .FirstOrDefaultAsync();
            //     
            //     if (picCrew != null)
            //     {
            //         _logger.LogDebug("Group task assigned to PIC role {Rank} ({CrewId}) via Group PIC", 
            //             group.PicRole, picCrew.CrewId);
            //         return picCrew.CrewId;
            //     }
            // }

            // Tier 3: Schedule default assignee (fallback)
            if (!string.IsNullOrWhiteSpace(schedule.AssignedToCrewId))
            {
                var defaultCrew = await context.CrewMembers
                    .FirstOrDefaultAsync(c => c.IsOnboard && c.CrewId == schedule.AssignedToCrewId);
                
                if (defaultCrew != null)
                {
                    _logger.LogDebug("Group task assigned to schedule default {CrewId}", schedule.AssignedToCrewId);
                    return defaultCrew.CrewId;
                }
            }

            // Tier 4: No assignment found - return null (Work Planner must assign → TASK status)
            _logger.LogDebug("No PIC found for group {GroupName} - task will be TASK status", group.GroupName);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error determining PIC for group {GroupName}", group.GroupName);
            return null;
        }
    }

    /// <summary>
    /// LEGACY METHOD - Kept for backward compatibility with old per-asset tasks
    /// Determine task assignee using department-aware 5-tier waterfall logic:
    /// 0. Filter crew by Equipment Group's Department (strict boundary)
    /// 1. Group.PicCrewId (highest priority - equipment PIC override)
    /// 2. Group.PicRole (Person In Charge rank for this equipment)
    /// 3. Schedule.AssignedToCrewId (specific crew override)
    /// 4. Schedule.AssignedToRole (match role to onboard crew)
    /// 5. Asset.DefaultExecutorRole (equipment-based default)
    /// 6. null (unassigned - Work Planner will assign manually)
    /// </summary>
    private async Task<string?> DetermineTaskAssignee(
        EdgeDbContext context,
        MaintenanceSchedule schedule,
        EquipmentAsset asset,
        EquipmentGroup group)
    {
        try
        {
            // Get crew filtered by department (strict organizational boundary)
            IQueryable<CrewMember> departmentCrewQuery = context.CrewMembers
                .Where(c => c.IsOnboard);

            // Apply department filter if group has department assigned
            if (!string.IsNullOrWhiteSpace(group.Department))
            {
                departmentCrewQuery = departmentCrewQuery.Where(c => c.Department == group.Department);
                _logger.LogDebug("Filtering crew by department: {Department}", group.Department);
            }

            // Tier 1: PIC crew override from equipment group (e.g., 2/E assigned to Main Engine)
            if (!string.IsNullOrWhiteSpace(group.PicCrewId))
            {
                var picCrew = await departmentCrewQuery
                    .FirstOrDefaultAsync(c => c.CrewId == group.PicCrewId);
                
                if (picCrew != null)
                {
                    _logger.LogDebug("Task assigned to PIC crew {CrewId} via Group override", 
                        picCrew.CrewId); // , picCrew.Rank removed
                    return picCrew.CrewId;
                }
            }

            // Tier 2: PIC role from equipment group - REMOVED (Rank column deleted)
            // if (!string.IsNullOrWhiteSpace(group.PicRole))
            // {
            //     var picCrew = await departmentCrewQuery
            //         .Where(c => c.Rank == group.PicRole)
            //         .OrderBy(c => c.CrewId)
            //         .FirstOrDefaultAsync();
            //     
            //     if (picCrew != null)
            //     {
            //         _logger.LogDebug("Task assigned to PIC role {Rank} ({CrewId}) via Group PIC", 
            //             group.PicRole, picCrew.CrewId);
            //         return picCrew.CrewId;
            //     }
            // }

            // Tier 3: Specific crew ID override from schedule
            if (!string.IsNullOrWhiteSpace(schedule.AssignedToCrewId))
            {
                var crew = await departmentCrewQuery
                    .FirstOrDefaultAsync(c => c.CrewId == schedule.AssignedToCrewId);
                
                if (crew != null)
                {
                    _logger.LogDebug("Task assigned to crew {CrewId} via Schedule override", schedule.AssignedToCrewId);
                    return crew.CrewId;
                }
            }

            // Tier 4: Role-based assignment from schedule - REMOVED (Rank column deleted)
            // if (!string.IsNullOrWhiteSpace(schedule.AssignedToRole))
            // {
            //     var crew = await departmentCrewQuery
            //         .Where(c => c.Rank == schedule.AssignedToRole)
            //         .OrderBy(c => c.CrewId)
            //         .FirstOrDefaultAsync();
            //     
            //     if (crew != null)
            //     {
            //         _logger.LogDebug("Task assigned to {Rank} ({CrewId}) via Schedule role", 
            //             schedule.AssignedToRole, crew.CrewId);
            //         return crew.CrewId;
            //     }
            // }

            // Tier 5: Default executor role from equipment asset - REMOVED (Rank column deleted)
            // if (!string.IsNullOrWhiteSpace(asset.DefaultExecutorRole))
            // {
            //     var crew = await departmentCrewQuery
            //         .Where(c => c.Rank == asset.DefaultExecutorRole)
            //         .OrderBy(c => c.CrewId)
            //         .FirstOrDefaultAsync();
            //     
            //     if (crew != null)
            //     {
            //         _logger.LogDebug("Task assigned to {Rank} ({CrewId}) via Asset default role", 
            //             asset.DefaultExecutorRole, crew.CrewId);
            //         return crew.CrewId;
            //     }
            // }

            // Tier 6: No assignment - leave for Work Planner (2/E, C/O) to assign manually
            _logger.LogDebug("Task left unassigned for manual assignment by Work Planner");
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error determining task assignee, leaving unassigned");
            return null;
        }
    }

    public override Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Maintenance Scheduler Service is stopping");
        return base.StopAsync(cancellationToken);
    }
}
