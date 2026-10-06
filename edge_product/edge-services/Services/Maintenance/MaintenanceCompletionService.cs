using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Repositories;
using MaritimeEdge.Constants;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace MaritimeEdge.Services.Maintenance;

/// <summary>
/// Service to handle maintenance task completion with automatic spare parts deduction
/// This is the "chức năng sống còn" - critical functionality
/// </summary>
public class MaintenanceCompletionService
{
    private readonly EdgeDbContext _context;
    private readonly IMaintenanceScheduleRepository _scheduleRepository;
    private readonly IEquipmentAssetRepository _assetRepository;
    private readonly ILogger<MaintenanceCompletionService> _logger;

    public MaintenanceCompletionService(
        EdgeDbContext context,
        IMaintenanceScheduleRepository scheduleRepository,
        IEquipmentAssetRepository assetRepository,
        ILogger<MaintenanceCompletionService> logger)
    {
        _context = context;
        _scheduleRepository = scheduleRepository;
        _assetRepository = assetRepository;
        _logger = logger;
    }

    /// <summary>
    /// Complete maintenance task with automatic spare parts inventory deduction
    /// </summary>
    public async Task<CompletionResult> CompleteTaskAsync(
        Guid taskId,
        string completedBy,
        List<SparePartUsage> sparePartsUsed,
        string? notes = null,
        string? conditionAfter = null)
    {
        using var transaction = await _context.Database.BeginTransactionAsync();

        try
        {
            // 1. Get maintenance task
            var task = await _context.MaintenanceTasks
                .FirstOrDefaultAsync(t => t.Id == taskId && !t.IsDeleted);

            if (task == null)
                return CompletionResult.Failure("Task not found");

            if (task.Status == "COMPLETED")
                return CompletionResult.Failure("Task already completed");

            // 2. Find related schedule (if task was auto-generated)
            // Prefer ScheduleId direct lookup over parsing TaskId string
            MaintenanceSchedule? schedule = null;
            if (task.ScheduleId.HasValue)
            {
                schedule = await _context.MaintenanceSchedules
                    .FirstOrDefaultAsync(s => s.Id == task.ScheduleId.Value);
            }
            else if (task.TaskId.StartsWith("SCHED-"))
            {
                var scheduleCode = ExtractScheduleCode(task.TaskId);
                schedule = await _context.MaintenanceSchedules
                    .FirstOrDefaultAsync(s => s.ScheduleCode == scheduleCode);
            }

            // 3. Deduct spare parts from InventoryStock (source of truth for ROB).
            //    Strategy A: deduct from the location with the largest available quantity first.
            //    After deduction, sync MaterialItem.OnHandQuantity = sum of remaining InventoryStock.
            var deductionErrors = new List<string>();
            var deductedItems = new List<SparePartDeduction>();

            foreach (var usage in sparePartsUsed)
            {
                var materialItem = await _context.MaterialItems
                    .FirstOrDefaultAsync(m => m.Id == usage.MaterialItemId);

                if (materialItem == null)
                {
                    var error = $"Material item {usage.MaterialItemId} not found";
                    await transaction.RollbackAsync();
                    return CompletionResult.Failure(error);
                }

                // Total available = sum across all InventoryStock locations
                var stocks = await _context.InventoryStocks
                    .Where(s => s.MaterialItemId == usage.MaterialItemId)
                    .OrderByDescending(s => s.Quantity)
                    .ToListAsync();

                var totalAvailable = stocks.Any()
                    ? (double)stocks.Sum(s => s.Quantity)
                    : materialItem.OnHandQuantity; // fallback for items not yet in inventory stock

                if (totalAvailable < usage.QuantityUsed)
                {
                    var error = $"Insufficient stock for {materialItem.Name} (Available: {totalAvailable}, Required: {usage.QuantityUsed})";
                    _logger.LogWarning(error);
                    await transaction.RollbackAsync();
                    return CompletionResult.Failure(error);
                }

                var previousTotal = totalAvailable;
                var remaining = (decimal)usage.QuantityUsed;

                if (stocks.Any())
                {
                    // Deduct from InventoryStock locations (largest first)
                    foreach (var stock in stocks)
                    {
                        if (remaining <= 0) break;
                        var take = Math.Min(stock.Quantity, remaining);
                        stock.Quantity -= take;
                        stock.UpdatedAt = DateTime.UtcNow;
                        remaining -= take;
                        _logger.LogInformation(
                            "Deducted {Take} of {Code} from location {Loc}",
                            take, materialItem.ItemCode, stock.StoreLocationId);
                    }

                    // Sync MaterialItem.OnHandQuantity = sum of InventoryStock
                    var newTotal = (double)stocks.Sum(s => s.Quantity);
                    materialItem.OnHandQuantity = newTotal;
                }
                else
                {
                    // No InventoryStock records yet — fall back to deducting from MaterialItem directly
                    materialItem.OnHandQuantity -= usage.QuantityUsed;
                    _logger.LogWarning(
                        "No InventoryStock records for {Code} — deducted from MaterialItem.OnHandQuantity directly",
                        materialItem.ItemCode);
                }

                materialItem.UpdatedAt = DateTime.UtcNow;

                deductedItems.Add(new SparePartDeduction
                {
                    MaterialItemId = materialItem.Id,
                    MaterialCode = materialItem.ItemCode,
                    MaterialName = materialItem.Name,
                    QuantityUsed = usage.QuantityUsed,
                    PreviousStock = previousTotal,
                    NewStock = materialItem.OnHandQuantity,
                    UnitCost = materialItem.UnitCost
                });

                // Check if below minimum stock - create alert
                if (materialItem.MinStock.HasValue && materialItem.OnHandQuantity < materialItem.MinStock.Value)
                {
                    _logger.LogWarning(
                        "Low stock alert: {ItemCode} {ItemName} - Current: {Current}, Min: {Min}",
                        materialItem.ItemCode, materialItem.Name,
                        materialItem.OnHandQuantity, materialItem.MinStock.Value);
                }
            }

            // 4. Update task status
            task.Status = "COMPLETED";
            task.CompletedAt = DateTime.UtcNow;
            task.CompletedBy = completedBy;
            task.Notes = string.IsNullOrEmpty(task.Notes) 
                ? notes 
                : task.Notes + "\n\n" + notes;
            task.UpdatedAt = DateTime.UtcNow;

            // Store spare parts used in task
            if (sparePartsUsed.Any())
            {
                task.SparePartsUsed = JsonSerializer.Serialize(deductedItems.Select(d => new
                {
                    materialItemId = d.MaterialItemId,
                    materialCode = d.MaterialCode,
                    materialName = d.MaterialName,
                    quantityUsed = d.QuantityUsed,
                    unitCost = d.UnitCost
                }));
            }

            // Entity is already tracked - no need for explicit Update()
            // _context.MaintenanceTasks.Update(task);

            // 5. Create maintenance history record
            if (schedule != null)
            {
                // Get asset for running hours tracking
                // Per-asset schedule: use the asset directly
                // Group-based schedule: use first asset from group
                EquipmentAsset? trackingAsset = null;
                if (schedule.EquipmentAssetId.HasValue)
                {
                    trackingAsset = await _context.EquipmentAssets
                        .FirstOrDefaultAsync(a => a.Id == schedule.EquipmentAssetId.Value);
                }
                else if (schedule.EquipmentGroupId.HasValue)
                {
                    trackingAsset = await _context.EquipmentGroupMembers
                        .Where(egm => egm.GroupId == schedule.EquipmentGroupId.Value)
                        .Include(egm => egm.Asset)
                        .Select(egm => egm.Asset)
                        .FirstOrDefaultAsync();
                }
                
                var history = new MaintenanceHistory
                {
                    ReportSnapshot = await PeriodicTaskCycle.SnapshotAsync(_context, task),
                    ScheduleId = schedule.Id,
                    TaskId = task.Id,
                    ExecutedAt = DateTime.UtcNow,
                    ExecutedRunningHours = trackingAsset != null ? await GetCurrentRunningHours(trackingAsset.Id) : null,
                    CompletedBy = completedBy,
                    ActualDurationHours = task.StartedAt.HasValue 
                        ? (DateTime.UtcNow - task.StartedAt.Value).TotalHours 
                        : null,
                    SparePartsUsed = JsonSerializer.Serialize(deductedItems),
                    TotalSparePartsCost = deductedItems.Sum(d => d.UnitCost * (decimal)d.QuantityUsed),
                    Notes = notes,
                    ConditionAfter = conditionAfter,
                    CreatedAt = DateTime.UtcNow
                };

                _context.MaintenanceHistories.Add(history);

                // 6. Update schedule - set last execution and calculate next due
                schedule.LastExecutedAt = DateTime.UtcNow;
                schedule.LastExecutedRunningHours = history.ExecutedRunningHours;
                
                CalculateNextDueDate(schedule, trackingAsset ?? new EquipmentAsset { CurrentRunningHours = task.ActualRunningHours });

                await _scheduleRepository.UpdateAsync(schedule);

                // 7. RECURRENCE (Gối đầu): Generate next cycle task for PERIODIC schedules
                if (schedule.MaintenanceCategory == "PERIODIC" && schedule.IsActive && schedule.AutoGenerate)
                {
                    await PrepareNextCycleTask(schedule, task, trackingAsset);
                }
            }

            // 7. Save all changes
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            _logger.LogInformation(
                "Task {TaskId} completed by {CompletedBy}. Deducted {Count} spare parts.",
                task.TaskId, completedBy, deductedItems.Count);

            return CompletionResult.Success(
                deductedItems,
                deductionErrors.Any() ? deductionErrors : null);
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            _logger.LogError(ex, "Error completing task {TaskId}", taskId);
            return CompletionResult.Failure($"Error: {ex.Message}");
        }
    }

    /// <summary>
    /// Called after PENDING_APPROVAL → COMPLETED (VerifyTask APPROVE).
    /// Updates schedule stats and generates next cycle task for PERIODIC schedules.
    /// Changes are tracked in DbContext — caller must call SaveChangesAsync.
    /// </summary>
    public async Task PostApprovalScheduleUpdateAsync(MaintenanceTask task)
    {
        try
        {
            // Find related schedule
            MaintenanceSchedule? schedule = null;
            if (task.ScheduleId.HasValue)
            {
                schedule = await _context.MaintenanceSchedules
                    .FirstOrDefaultAsync(s => s.Id == task.ScheduleId.Value);
            }
            else if (task.TaskId.StartsWith("SCHED-"))
            {
                var scheduleCode = ExtractScheduleCode(task.TaskId);
                schedule = await _context.MaintenanceSchedules
                    .FirstOrDefaultAsync(s => s.ScheduleCode == scheduleCode);
            }

            if (schedule == null)
            {
                _logger.LogDebug("PostApprovalScheduleUpdate: no schedule found for task {TaskId}", task.TaskId);
                return;
            }

            // Get tracking asset (for running hours)
            EquipmentAsset? trackingAsset = null;
            if (schedule.EquipmentAssetId.HasValue)
            {
                trackingAsset = await _context.EquipmentAssets
                    .FirstOrDefaultAsync(a => a.Id == schedule.EquipmentAssetId.Value);
            }
            else if (schedule.EquipmentGroupId.HasValue)
            {
                trackingAsset = await _context.EquipmentGroupMembers
                    .Where(egm => egm.GroupId == schedule.EquipmentGroupId.Value)
                    .Include(egm => egm.Asset)
                    .Select(egm => egm.Asset)
                    .FirstOrDefaultAsync();
            }

            // Update schedule execution stats
            schedule.LastExecutedAt = task.CompletedAt ?? DateTime.UtcNow;
            schedule.LastExecutedRunningHours = task.ActualRunningHours ?? trackingAsset?.CurrentRunningHours ?? task.RunningHoursAtLastDone;

            CalculateNextDueDate(schedule, trackingAsset ?? new EquipmentAsset { CurrentRunningHours = task.ActualRunningHours });

            await _scheduleRepository.UpdateAsync(schedule);

            // Add maintenance history record
            _context.MaintenanceHistories.Add(new MaintenanceHistory
            {
                ReportSnapshot = await PeriodicTaskCycle.SnapshotAsync(_context, task),
                ScheduleId = schedule.Id,
                TaskId = task.Id,
                ExecutedAt = task.CompletedAt ?? DateTime.UtcNow,
                ExecutedRunningHours = schedule.LastExecutedRunningHours,
                CompletedBy = task.CompletedBy ?? task.VerifiedBy ?? "SYSTEM",
                ActualDurationHours = task.ActualDuration.HasValue ? task.ActualDuration.Value / 60.0 : null,
                SparePartsUsed = task.SparePartsUsed,
                Notes = task.Notes,
                CreatedAt = DateTime.UtcNow
            });

            // Prepare the next deadline on the same PERIODIC task
            if (schedule.MaintenanceCategory == "PERIODIC" && schedule.IsActive && schedule.AutoGenerate)
                await PrepareNextCycleTask(schedule, task, trackingAsset);

            _logger.LogInformation(
                "PostApprovalScheduleUpdate: schedule {Code} updated, NextDueRH={NextRH}, NextDueDate={NextDate}",
                schedule.ScheduleCode, schedule.NextDueRunningHours, schedule.NextDueDate?.ToString("yyyy-MM-dd"));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "PostApprovalScheduleUpdate failed for task {TaskId}", task.TaskId);
            // Never approve a cycle without retaining its report.
            throw;
        }
    }

    /// <summary>
    /// Recovery: called when CheckAndPromoteTasksByRunningHours finds no active task for a PERIODIC
    /// RUNNING_HOURS schedule. This happens when the previous task completed via old code that did not
    /// call PrepareNextCycleTask. Reopens the same completed task as DUE if the threshold
    /// is already reached.
    /// </summary>
    public async Task RecoverMissingCycleTaskAsync(MaintenanceSchedule schedule, double currentRunningHours)
    {
        var task = await _context.MaintenanceTasks
            .Where(t => t.ScheduleId == schedule.Id && t.Status == "COMPLETED" && !t.IsDeleted)
            .OrderByDescending(t => t.CompletedAt).FirstOrDefaultAsync();
        if (task == null) return;
        if (!schedule.NextDueRunningHours.HasValue && schedule.IntervalHours.HasValue)
            schedule.NextDueRunningHours = (schedule.LastExecutedRunningHours ?? task.ActualRunningHours ?? currentRunningHours) + schedule.IntervalHours.Value;
        await PeriodicTaskCycle.ReopenIfDueAsync(_context, task, schedule, currentRunningHours, DateTime.UtcNow);
        await _context.SaveChangesAsync();
    }

    private async Task<double?> GetCurrentRunningHours(Guid assetId)
    {
        var asset = await _assetRepository.GetByIdAsync(assetId);
        return asset?.CurrentRunningHours;
    }

    private string ExtractScheduleCode(string taskId)
    {
        // Format: SCHED-{ScheduleCode}-{Date}
        // Example: SCHED-ME-OIL-CHANGE-20251207
        var parts = taskId.Split('-');
        if (parts.Length >= 3)
        {
            // Remove "SCHED" prefix and date suffix
            return string.Join("-", parts.Skip(1).Take(parts.Length - 2));
        }
        return string.Empty;
    }

    /// <summary>
    /// RECURRENCE (Gối đầu): After a PERIODIC task is completed,
    /// preserve the report and schedule the next cycle on the same task.
    /// NextDueRH = LastCompletedRH + IntervalHours (using actual RH at completion for accuracy)
    /// </summary>
    private async Task PrepareNextCycleTask(MaintenanceSchedule schedule, MaintenanceTask completedTask, EquipmentAsset? trackingAsset)
    {
        // A recurring job retains its identity; reports belong to maintenance_history.
        if (schedule.NextDueDate.HasValue) completedTask.NextDueAt = schedule.NextDueDate.Value;
        completedTask.LastDoneAt = schedule.LastExecutedAt;
        completedTask.RunningHoursAtLastDone = schedule.LastExecutedRunningHours;
        completedTask.UpdatedAt = DateTime.UtcNow;
        completedTask.IsSynced = false;
        if (MaintenanceCalendar.HasInterval(schedule) || schedule.IntervalHours > 0)
            await PeriodicTaskCycle.ReopenIfDueAsync(_context, completedTask, schedule,
                trackingAsset?.CurrentRunningHours, DateTime.UtcNow, prepareNextCycle: true);
    }

    private void CalculateNextDueDate(MaintenanceSchedule schedule, EquipmentAsset asset)
    {
        if (schedule.IntervalType == "CALENDAR" && MaintenanceCalendar.HasInterval(schedule))
        {
            // Use LastExecutedAt (completion date) as base for next interval
            // This ensures interval consistency regardless of late completion
            var baseDate = schedule.LastExecutedAt ?? DateTime.UtcNow;
            schedule.NextDueDate = MaintenanceCalendar.AddInterval(schedule, baseDate);
            
            _logger.LogInformation(
                "Schedule {Code}: Next due calculated from {Base} + {Interval} days = {NextDue}",
                schedule.ScheduleCode, baseDate.ToString("yyyy-MM-dd"), 
                schedule.IntervalDays, schedule.NextDueDate?.ToString("yyyy-MM-dd"));
        }
        else if (schedule.IntervalType == "RUNNING_HOURS" && schedule.IntervalHours.HasValue)
        {
            // Formula: NextDueRH = LastCompletedRH + IntervalHours
            // Uses actual running hours at completion time (more accurate than theoretical)
            var completedAtRH = schedule.LastExecutedRunningHours ?? (asset.CurrentRunningHours ?? 0);
            schedule.NextDueRunningHours = completedAtRH + schedule.IntervalHours.Value;
            
            // Estimate date (10 hours per day average)
            var currentHours = asset.CurrentRunningHours ?? 0;
            var hoursRemaining = schedule.NextDueRunningHours.Value - currentHours;
            var daysRemaining = (int)Math.Max(hoursRemaining / MaintenanceConstants.AVERAGE_HOURS_PER_DAY, 1);
            schedule.NextDueDate = DateTime.UtcNow.AddDays(daysRemaining);
            
            _logger.LogInformation(
                "Schedule {Code}: Next due at {Hours} RH (completedAt={CompletedRH} + interval={Interval}), estimated {Days} days",
                schedule.ScheduleCode, schedule.NextDueRunningHours.Value, 
                completedAtRH, schedule.IntervalHours.Value, daysRemaining);
        }
        else if (schedule.IntervalType == "HYBRID")
        {
            DateTime? calendarDue = null;
            DateTime? runningHoursDue = null;

            if (MaintenanceCalendar.HasInterval(schedule))
            {
                var baseDate = schedule.LastExecutedAt ?? DateTime.UtcNow;
                calendarDue = MaintenanceCalendar.AddInterval(schedule, baseDate);
            }

            if (schedule.IntervalHours.HasValue)
            {
                var currentHours = asset.CurrentRunningHours ?? 0;
                schedule.NextDueRunningHours = currentHours + schedule.IntervalHours.Value;
                
                var hoursRemaining = schedule.NextDueRunningHours.Value - currentHours;
                var daysRemaining = (int)Math.Max(hoursRemaining / MaintenanceConstants.AVERAGE_HOURS_PER_DAY, 1);
                runningHoursDue = DateTime.UtcNow.AddDays(daysRemaining);
            }

            schedule.NextDueDate = (calendarDue.HasValue && runningHoursDue.HasValue)
                ? (calendarDue < runningHoursDue ? calendarDue : runningHoursDue)
                : (calendarDue ?? runningHoursDue);
        }
    }
}

// DTOs for completion service
public class SparePartUsage
{
    public Guid MaterialItemId { get; set; }
    public double QuantityUsed { get; set; }
}

public class SparePartDeduction
{
    public Guid MaterialItemId { get; set; }
    public string MaterialCode { get; set; } = string.Empty;
    public string MaterialName { get; set; } = string.Empty;
    public double QuantityUsed { get; set; }
    public double PreviousStock { get; set; }
    public double NewStock { get; set; }
    public decimal? UnitCost { get; set; }
}

public class CompletionResult
{
    public bool IsSuccess { get; set; }
    public string? ErrorMessage { get; set; }
    public List<SparePartDeduction>? DeductedItems { get; set; }
    public List<string>? Warnings { get; set; }

    public static CompletionResult Success(
        List<SparePartDeduction> deductedItems, 
        List<string>? warnings = null)
    {
        return new CompletionResult
        {
            IsSuccess = true,
            DeductedItems = deductedItems,
            Warnings = warnings
        };
    }

    public static CompletionResult Failure(string errorMessage)
    {
        return new CompletionResult
        {
            IsSuccess = false,
            ErrorMessage = errorMessage
        };
    }
}
