using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.DTOs;
using MaritimeEdge.Constants;
using MaritimeEdge.Services.Maintenance;
using MTaskStatus = MaritimeEdge.Constants.TaskStatus; // Alias to avoid ambiguity

namespace MaritimeEdge.Controllers.Maintenance;

[ApiController]
[Route("api/maintenance")]
public class MaintenanceController : ControllerBase
{
    private readonly EdgeDbContext _context;
    private readonly MaintenanceCompletionService _completionService;
    private readonly ILogger<MaintenanceController> _logger;

    public MaintenanceController(
        EdgeDbContext context, 
        MaintenanceCompletionService completionService,
        ILogger<MaintenanceController> logger)
    {
        _context = context;
        _completionService = completionService;
        _logger = logger;
    }

    /// <summary>
    /// Auto-correct task status based on calendar due date (PMS Workflow v3.0)
    /// Only processes CALENDAR and AD_HOC tasks.
    /// RUNNING_HOURS tasks are excluded — their status is managed by Counter (UpdateRunningHours API).
    /// Reason: NextDueAt for RUNNING_HOURS is only an estimate. Only Counter is the "source of truth".
    /// </summary>
    private async Task<int> AutoCorrectTaskStatuses(List<MaintenanceTask> tasks)
    {
        var now = DateTime.UtcNow;
        var today = now.Date;
        var tasksToUpdate = new List<MaintenanceTask>();

        // Pre-load schedules for all tasks to avoid N+1 queries
        var scheduleIds = tasks
            .Where(t => t.ScheduleId.HasValue)
            .Select(t => t.ScheduleId!.Value)
            .Distinct()
            .ToList();
        var scheduleMap = await _context.MaintenanceSchedules
            .AsNoTracking()
            .Where(s => scheduleIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id);

        foreach (var task in tasks)
        {
            // Only process status that can be auto-corrected
            var statusesToProcess = new[] { "SCHEDULED", "UPCOMING", "DUE", "PENDING", "OVERDUE" };
            
            if (!statusesToProcess.Contains(task.Status))
            {
                continue; // Don't touch IN_PROGRESS, PENDING_APPROVAL, RECTIFY, COMPLETED
            }

            // Skip RUNNING_HOURS tasks — Counter is the sole trigger for these
            if (task.ScheduleId.HasValue && scheduleMap.TryGetValue(task.ScheduleId.Value, out var schedule))
            {
                if (schedule.IntervalType == "RUNNING_HOURS")
                    continue;
            }

            // Calendar-based check (for CALENDAR, AD_HOC, HYBRID, or tasks without schedule)
            var dueDate = task.NextDueAt.Date;
            var isOverdue = dueDate < today;
            var isDue = dueDate <= today;

            // Check UPCOMING window (calendar only: within DaysBeforeDue days)
            var isUpcoming = false;
            if (!isDue && !isOverdue)
            {
                var windowDays = (task.ScheduleId.HasValue && scheduleMap.TryGetValue(task.ScheduleId.Value, out var sched) && sched.DaysBeforeDue > 0)
                    ? sched.DaysBeforeDue
                    : 7;
                var daysUntilDue = (dueDate - today).TotalDays;
                isUpcoming = daysUntilDue <= windowDays;
            }

            if (task.Status == "SCHEDULED")
            {
                if (isOverdue)
                {
                    task.Status = "OVERDUE";
                    tasksToUpdate.Add(task);
                }
                else if (isDue)
                {
                    task.Status = "DUE";
                    tasksToUpdate.Add(task);
                }
                else if (isUpcoming)
                {
                    task.Status = "UPCOMING";
                    tasksToUpdate.Add(task);
                }
            }
            else if (task.Status == "UPCOMING")
            {
                if (isOverdue)
                {
                    task.Status = "OVERDUE";
                    tasksToUpdate.Add(task);
                }
                else if (isDue)
                {
                    task.Status = "DUE";
                    tasksToUpdate.Add(task);
                }
                // Stay UPCOMING if still in window
            }
            else if (task.Status == "DUE" && isOverdue)
            {
                task.Status = "OVERDUE";
                tasksToUpdate.Add(task);
            }
            else if (task.Status == "PENDING") // Legacy: Treat as DUE
            {
                if (isOverdue)
                {
                    task.Status = "OVERDUE";
                    tasksToUpdate.Add(task);
                }
                else
                {
                    task.Status = "DUE"; // Migrate PENDING → DUE
                    tasksToUpdate.Add(task);
                }
            }
            else if (task.Status == "OVERDUE" && !isOverdue)
            {
                // Fix incorrectly marked OVERDUE tasks
                task.Status = isDue ? "DUE" : (isUpcoming ? "UPCOMING" : "SCHEDULED");
                tasksToUpdate.Add(task);
            }
        }

        if (tasksToUpdate.Any())
        {
            await _context.SaveChangesAsync();
            _logger.LogInformation("Auto-corrected {Count} task statuses (calendar-based only, RUNNING_HOURS excluded)", tasksToUpdate.Count);
        }

        return tasksToUpdate.Count;
    }

    [HttpGet("tasks")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> GetAllTasks(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? status = null,
        [FromQuery] string? priority = null)
    {
        try
        {
            // Validate pagination
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 50;
            if (pageSize > 100) pageSize = 100;

            var query = _context.MaintenanceTasks
                .AsNoTracking()
                .Where(t => !t.IsDeleted) // Exclude soft-deleted tasks
                .AsQueryable();

            // Apply filters
            if (!string.IsNullOrWhiteSpace(status))
            {
                query = query.Where(t => t.Status == status);
            }

            if (!string.IsNullOrWhiteSpace(priority))
            {
                query = query.Where(t => t.Priority == priority);
            }

            // Get total count
            var totalCount = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

            _logger.LogDebug("GetAllTasks - Total: {Total}, Page: {Page}/{TotalPages}", 
                totalCount, page, totalPages);

            // Get paginated data with related data
            var tasks = await query
                .Include(t => t.EquipmentGroup)
                .Include(t => t.ChecklistItems)
                .Include(t => t.DeferralRequests.Where(d => d.Status == "PENDING"))
                .AsSplitQuery()
                .OrderBy(t => t.NextDueAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            // Auto-correct status based on due date (same as GetPendingTasks/GetOverdueTasks)
            await AutoCorrectTaskStatuses(tasks);

            var scheduleIds = tasks
                .Where(t => t.ScheduleId.HasValue)
                .Select(t => t.ScheduleId!.Value)
                .Distinct()
                .ToList();
            var scheduleInfo = new Dictionary<Guid, (int DaysBeforeDue, double? NextDueRunningHours)>();
            if (scheduleIds.Count > 0)
            {
                scheduleInfo = await _context.MaintenanceSchedules
                    .AsNoTracking()
                    .Where(s => scheduleIds.Contains(s.Id))
                    .Select(s => new { s.Id, s.DaysBeforeDue, s.NextDueRunningHours })
                    .ToDictionaryAsync(s => s.Id, s => (s.DaysBeforeDue, s.NextDueRunningHours));
            }

            var assetIds = tasks
                .Where(t => t.EquipmentAssetId.HasValue)
                .Select(t => t.EquipmentAssetId!.Value)
                .Distinct()
                .ToList();
            var assetRunningHours = assetIds.Count > 0
                ? await _context.EquipmentAssets
                    .AsNoTracking()
                    .Where(a => assetIds.Contains(a.Id))
                    .Select(a => new { a.Id, a.CurrentRunningHours })
                    .ToDictionaryAsync(a => a.Id, a => a.CurrentRunningHours)
                : new Dictionary<Guid, double?>();

            var mappedTasks = tasks
                .Select(task => MapTaskWithPendingDeferral(
                    task,
                    task.ScheduleId.HasValue && scheduleInfo.TryGetValue(task.ScheduleId.Value, out var info)
                        ? info.DaysBeforeDue
                        : (int?)null,
                    task.ScheduleId.HasValue && scheduleInfo.TryGetValue(task.ScheduleId.Value, out info)
                        ? info.NextDueRunningHours
                        : (double?)null,
                    task.EquipmentAssetId.HasValue && assetRunningHours.TryGetValue(task.EquipmentAssetId.Value, out var currentRunningHours)
                        ? currentRunningHours
                        : (double?)null))
                .ToList();

            return Ok(new
            {
                data = mappedTasks,
                pagination = new
                {
                    currentPage = page,
                    pageSize = pageSize,
                    totalCount = totalCount,
                    totalPages = totalPages,
                    hasNextPage = page < totalPages,
                    hasPreviousPage = page > 1
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting maintenance tasks");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("tasks/pending")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> GetPendingTasks()
    {
        try
        {
            var tasks = await _context.MaintenanceTasks
                .Where(t => !t.IsDeleted && (t.Status == MTaskStatus.PENDING || t.Status == MTaskStatus.IN_PROGRESS))
                .OrderBy(t => t.NextDueAt)
                .ToListAsync();

            // Auto-correct status
            await AutoCorrectTaskStatuses(tasks);

            return Ok(tasks);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting pending tasks");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("tasks/overdue")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> GetOverdueTasks()
    {
        try
        {
            var now = DateTime.UtcNow;
            var tasks = await _context.MaintenanceTasks
                .Where(t => !t.IsDeleted && t.Status != MTaskStatus.COMPLETED && t.NextDueAt < now)
                .OrderBy(t => t.NextDueAt)
                .ToListAsync();

            // Auto-correct status
            await AutoCorrectTaskStatuses(tasks);

            return Ok(tasks);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting overdue tasks");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Lấy danh sách task được giao cho crew member cụ thể
    /// Returns tasks for the whole vessel; crew parameters only enrich assignment metadata.
    /// OPTIMIZED: Không include ChecklistItems và CompletionPhotos để giảm response size
    /// </summary>
    [HttpGet("tasks/my-tasks")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> GetMyTasks([FromQuery] string? crewId = null, [FromQuery] string? assignedTo = null, [FromQuery] bool includeCompleted = true)
    {
        try
        {
            IQueryable<MaintenanceTask> query = _context.MaintenanceTasks
                .Where(t => !t.IsDeleted);

            // Fleet-wide vessel list. Crew parameters only enrich assignment metadata.
            CrewMember? matchedCrew = string.IsNullOrWhiteSpace(crewId) ? null : await _context.CrewMembers
                .AsNoTracking().FirstOrDefaultAsync(c => c.CrewId == crewId);

            // Filter by status based on includeCompleted flag
            if (!includeCompleted)
            {
                // Only return pending or in-progress tasks (for TaskListScreen)
                query = query.Where(t => t.Status == MTaskStatus.PENDING || t.Status == MTaskStatus.IN_PROGRESS);
            }
            // If includeCompleted = true, return all statuses (for Dashboard)

            var now = DateTime.UtcNow;
            var today = now.Date;

            // OPTIMIZED: Select only needed fields, exclude heavy data (photos, full checklist)
            // Also compute corrected status inline
            var tasks = await query
                .Include(t => t.EquipmentGroup)
                .OrderBy(t => t.NextDueAt)
                .Select(t => new {
                    t.Id,
                    t.TaskId,
                    t.TaskTypeId,
                    t.EquipmentId,
                    t.EquipmentName,
                    t.EquipmentGroupId,
                    t.EquipmentGroupName,
                    t.ScheduleId,
                    t.TaskType,
                    t.TaskDescription,
                    t.IntervalHours,
                    t.IntervalDays,
                    t.LastDoneAt,
                    t.NextDueAt,
                    t.RunningHoursAtLastDone,
                    t.EquipmentAssetId,
                    t.Priority,
                    // Compute corrected status based on due date
                    Status = (t.Status == "SCHEDULED" || t.Status == "DUE" || t.Status == "PENDING" || t.Status == "OVERDUE")
                        ? (t.NextDueAt.Date < today 
                            ? "OVERDUE" 
                            : (t.NextDueAt.Date <= today 
                                ? "DUE" 
                                : t.Status))
                        : t.Status,
                    t.AssignedTo,
                    t.AssignedDepartment,
                    t.HasPendingDeferral,
                    t.DeferralCount,
                    t.LastDeferredAt,
                    t.LastDeferredBy,
                    t.StartedAt,
                    t.StartedBy,
                    t.ActualRunningHours,
                    t.EstimatedDuration,
                    t.ActualDuration,
                    t.ChecklistCompleted,
                    t.PhotosUploaded,
                    t.RequiredPhotos,
                    // EXCLUDE: CompletionPhotos (heavy base64 data) - will be loaded on detail view
                    t.Notes,
                    t.RequiredSpareParts,
                    t.SparePartsUsed,
                    t.SubmittedAt,
                    t.SubmittedBy,
                    t.VerifiedAt,
                    t.VerifiedBy,
                    t.VerificationResult,
                    t.VerificationNotes,
                    t.RejectionReason,
                    t.RejectionCount,
                    t.LastRejectedAt,
                    t.LastRejectedBy,
                    t.RejectionHistory,
                    t.CompletedAt,
                    t.CompletedBy,
                    t.CancelledAt,
                    t.CancelledBy,
                    t.CancellationReason,
                    t.IsCms,
                    t.RequireRiskAssessment,
                    t.RequireInspectionReport,
                    t.ApprovedBy,
                    t.ApprovedAt,
                    t.IsDeleted,
                    t.DeletedAt,
                    t.DeletedBy,
                    t.DeletionReason,
                    t.IsSynced,
                    t.SyncedAt,
                    t.CreatedAt,
                    t.UpdatedAt,
                    t.OriginNode,
                    t.EquipmentGroup,
                    // OPTIMIZED: Only include checklist summary, not full items
                    ChecklistItemsCount = t.ChecklistItems.Count,
                    ChecklistCompletedCount = t.ChecklistItems.Count(ci => ci.IsCompleted),
                    // Empty arrays for compatibility - full data loaded on detail view
                    ChecklistItems = new List<object>(),
                    DeferralRequests = new List<object>(),
                    StatusHistory = new List<object>()
                })
                .ToListAsync();

            // Batch-load currentRunningHours for all equipment assets referenced by tasks
            var taskAssetIds = tasks
                .Where(t => t.EquipmentAssetId.HasValue)
                .Select(t => t.EquipmentAssetId!.Value)
                .Distinct()
                .ToList();
            var assetRunningHoursMap = taskAssetIds.Count > 0
                ? await _context.EquipmentAssets
                    .AsNoTracking()
                    .Where(a => taskAssetIds.Contains(a.Id))
                    .Select(a => new { a.Id, a.CurrentRunningHours })
                    .ToDictionaryAsync(a => a.Id, a => a.CurrentRunningHours)
                : new Dictionary<Guid, double?>();

            // Post-process: Add crewRole field for the requesting crew member
            var crewGuid = matchedCrew?.Id.ToString() ?? "";
            var crewIdStr = matchedCrew?.CrewId ?? assignedTo ?? "";
            var crewFullName = matchedCrew?.FullName ?? "";
            
            // Pre-load schedule instructions for role lookup (CREW metadata is in schedule, not task)
            var scheduleIds = tasks.Where(t => t.ScheduleId != null).Select(t => t.ScheduleId!.Value).Distinct().ToList();
            var scheduleInstructions = scheduleIds.Count > 0 
                ? await _context.MaintenanceSchedules
                    .AsNoTracking()
                    .Where(s => scheduleIds.Contains(s.Id) && s.Instructions != null)
                    .Select(s => new { s.Id, s.Instructions })
                    .ToDictionaryAsync(s => s.Id, s => s.Instructions ?? "")
                : new Dictionary<Guid, string>();
            var scheduleLeadTimes = scheduleIds.Count > 0
                ? await _context.MaintenanceSchedules
                    .AsNoTracking()
                    .Where(s => scheduleIds.Contains(s.Id))
                    .Select(s => new { s.Id, s.DaysBeforeDue })
                    .ToDictionaryAsync(s => s.Id, s => s.DaysBeforeDue)
                : new Dictionary<Guid, int>();
            
            var tasksWithRole = tasks.Select(t => {
                var role = "PIC"; // default
                if (matchedCrew != null || !string.IsNullOrWhiteSpace(crewId))
                {
                    // Check if this crew is PIC (in AssignedTo)
                    var isPic = t.AssignedTo != null && 
                        (t.AssignedTo.Contains(crewIdStr) || (!string.IsNullOrWhiteSpace(crewFullName) && t.AssignedTo.Contains(crewFullName)));
                    
                    if (isPic)
                    {
                        role = "PIC";
                    }
                    else if (!string.IsNullOrWhiteSpace(crewGuid) && t.ScheduleId != null 
                        && scheduleInstructions.TryGetValue(t.ScheduleId.Value, out var instructions))
                    {
                        // Parse role from <!--CREW:{"a":[{"crewId":"guid","role":"SUPPORT"}]}--> in schedule Instructions
                        role = ParseCrewRoleFromDescription(instructions, crewGuid);
                    }
                }
                var currentRunningHours = t.EquipmentAssetId.HasValue
                    ? assetRunningHoursMap.GetValueOrDefault(t.EquipmentAssetId.Value)
                    : (double?)null;
                return new {
                    t.Id, t.TaskId, t.TaskTypeId, t.EquipmentId, t.EquipmentName,
                    t.EquipmentGroupId, t.EquipmentGroupName, t.ScheduleId,
                    t.TaskType, t.TaskDescription, t.IntervalHours, t.IntervalDays,
                    DaysBeforeDue = t.ScheduleId.HasValue && scheduleLeadTimes.TryGetValue(t.ScheduleId.Value, out var daysBeforeDue)
                        ? daysBeforeDue
                        : (int?)null,
                    t.LastDoneAt, t.NextDueAt, t.RunningHoursAtLastDone, t.EquipmentAssetId,
                    CurrentRunningHours = currentRunningHours, t.Priority,
                    t.Status, t.AssignedTo, t.AssignedDepartment,
                    t.HasPendingDeferral, t.DeferralCount, t.LastDeferredAt, t.LastDeferredBy,
                    t.StartedAt, t.StartedBy, t.ActualRunningHours,
                    t.EstimatedDuration, t.ActualDuration,
                    t.ChecklistCompleted, t.PhotosUploaded, t.RequiredPhotos,
                    t.Notes, t.RequiredSpareParts, t.SparePartsUsed,
                    t.SubmittedAt, t.SubmittedBy, t.VerifiedAt, t.VerifiedBy,
                    t.VerificationResult, t.VerificationNotes,
                    t.RejectionReason, t.RejectionCount, t.LastRejectedAt, t.LastRejectedBy,
                    t.RejectionHistory, t.CompletedAt, t.CompletedBy,
                    t.CancelledAt, t.CancelledBy, t.CancellationReason,
                    t.IsCms, t.RequireRiskAssessment, t.RequireInspectionReport, t.ApprovedBy, t.ApprovedAt,
                    t.IsDeleted, t.DeletedAt, t.DeletedBy, t.DeletionReason,
                    t.IsSynced, t.SyncedAt, t.CreatedAt, t.UpdatedAt, t.OriginNode,
                    t.EquipmentGroup,
                    t.ChecklistItemsCount, t.ChecklistCompletedCount,
                    t.ChecklistItems, t.DeferralRequests, t.StatusHistory,
                    CrewRole = role
                };
            }).ToList();

            _logger.LogInformation("Retrieved {Count} tasks (optimized) for crew: {CrewId}/{AssignedTo}, includeCompleted: {IncludeCompleted}", 
                tasksWithRole.Count, crewId, assignedTo, includeCompleted);

            return Ok(tasksWithRole);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting my tasks");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("tasks/{id}")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> GetTaskById(Guid id)
    {
        try
        {
            var task = await _context.MaintenanceTasks
                .Include(t => t.EquipmentGroup)
                .Include(t => t.ChecklistItems.OrderBy(ci => ci.SequenceOrder))
                .Include(t => t.DeferralRequests.Where(d => d.Status == "PENDING"))
                .Include(t => t.StatusHistory.OrderByDescending(sh => sh.ChangedAt))
                .AsSplitQuery()
                .FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
            
            if (task == null)
            {
                return NotFound(new { error = "Maintenance task not found", id });
            }

            var daysBeforeDue = task.ScheduleId.HasValue
                ? await _context.MaintenanceSchedules
                    .AsNoTracking()
                    .Where(s => s.Id == task.ScheduleId.Value)
                    .Select(s => (int?)s.DaysBeforeDue)
                    .FirstOrDefaultAsync()
                : null;

            // Map to DTO with pendingDeferral
            var response = MapTaskWithPendingDeferral(task, daysBeforeDue);
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting task {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // Helper method to map task with pending deferral
    private object MapTaskWithPendingDeferral(MaintenanceTask task, int? daysBeforeDue = null, double? nextDueRunningHours = null, double? currentRunningHours = null)
    {
        var pendingDeferral = task.DeferralRequests?.FirstOrDefault(d => d.Status == "PENDING");
        
        // Map pendingDeferral to DTO to break circular reference
        object? pendingDeferralDto = null;
        if (pendingDeferral != null)
        {
            pendingDeferralDto = new
            {
                pendingDeferral.Id,
                TaskId = pendingDeferral.TaskId,
                TaskCode = task.TaskId, // From parent task
                pendingDeferral.RequestedBy,
                pendingDeferral.RequestedAt,
                pendingDeferral.Reason,
                pendingDeferral.CurrentDueDate,
                pendingDeferral.ProposedDueDate,
                pendingDeferral.DeferralDays,
                pendingDeferral.Status,
                pendingDeferral.Priority,
                pendingDeferral.IsCmsItem,
                pendingDeferral.ClassPermissionLetter,
                pendingDeferral.IsOverdueDeferral,
                pendingDeferral.RootCause,
                pendingDeferral.PreventiveMeasures,
                pendingDeferral.Attachments,
                pendingDeferral.TaskStatusAtRequest
                // NOTE: Task navigation property is NOT included to avoid circular reference
            };
        }
        
        return new
        {
            task.Id,
            task.TaskId,
            task.TaskType,
            task.TaskDescription,
            task.EquipmentId,
            task.EquipmentName,
            task.EquipmentGroupId,
            EquipmentGroupName = task.EquipmentGroup?.GroupName ?? task.EquipmentGroupName,
            task.EquipmentAssetId,
            task.EquipmentAssetName,
            task.ScheduleId,
            task.IntervalHours,
            task.IntervalDays,
            DaysBeforeDue = daysBeforeDue,
            NextDueRunningHours = nextDueRunningHours,
            CurrentRunningHours = currentRunningHours,
            task.LastDoneAt,
            task.NextDueAt,
            task.RunningHoursAtLastDone,
            task.Priority,
            task.Status,
            task.AssignedTo,
            task.AssignedDepartment,
            
            // Deferral tracking
            task.HasPendingDeferral,
            task.DeferralCount,
            task.LastDeferredAt,
            task.LastDeferredBy,
            PendingDeferral = pendingDeferralDto, // Use DTO instead of entity
            
            // Execution tracking
            task.StartedAt,
            task.StartedBy,
            task.ActualRunningHours,
            task.EstimatedDuration,
            task.ActualDuration,
            
            // Report data
            task.ChecklistCompleted,
            task.PhotosUploaded,
            task.RequiredPhotos,
            task.CompletionPhotos,
            task.Notes,
            task.RequiredSpareParts,
            task.SparePartsUsed,
            
            // Submission
            task.SubmittedAt,
            task.SubmittedBy,
            
            // Verification
            task.VerifiedAt,
            task.VerifiedBy,
            task.VerificationResult,
            task.VerificationNotes,
            
            // Rectify
            task.RejectionReason,
            task.RejectionCount,
            task.LastRejectedAt,
            task.LastRejectedBy,
            
            // Completion
            task.CompletedAt,
            task.CompletedBy,
            
            // Cancellation
            task.CancelledAt,
            task.CancelledBy,
            task.CancellationReason,
            
            // CMS
            task.IsCms,
            
            // ĐGRR / BBKT requirements
            task.RequireRiskAssessment,
            task.RequireInspectionReport,
            
            // Audit
            task.IsSynced,
            task.CreatedAt,
            task.UpdatedAt,
            task.OriginNode,
            
            // Related data
            ChecklistItems = task.ChecklistItems,
            StatusHistory = (task.StatusHistory ?? new List<TaskStatusHistory>())
                .OrderByDescending(sh => sh.ChangedAt)
                .Select(sh => new
                {
                    sh.Id,
                    sh.FromStatus,
                    sh.ToStatus,
                    sh.ChangedBy,
                    ChangedByName = sh.ChangedBy,
                    sh.ChangedAt,
                    sh.Reason,
                    sh.Notes,
                    sh.DeviceType
                })
        };
    }

    [HttpPost("tasks")]
    public IActionResult CreateTask([FromBody] CreateMaintenanceTaskRequest request)
    {
        return BadRequest(new { error = "TaskType feature removed. Please use PMS Planning v2.0 instead." });
    }

    [HttpPut("tasks/{id}")]
    public async Task<IActionResult> UpdateTask(Guid id, [FromBody] UpdateTaskDto dto)
    {
        try
        {
            var existing = await _context.MaintenanceTasks.FindAsync(id);
            if (existing == null || existing.IsDeleted)
            {
                return NotFound(new { error = "Maintenance task not found", id });
            }

            // ⚠️ IMPORTANT: Validate status transition to prevent conflicts
            if (dto.Status != existing.Status)
            {
                var validationResult = ValidateStatusTransition(existing.Status, dto.Status, existing);
                if (!validationResult.IsValid)
                {
                    return BadRequest(new { 
                        error = "Invalid status transition", 
                        message = validationResult.Message,
                        currentStatus = existing.Status,
                        attemptedStatus = dto.Status
                    });
                }
            }

            // Update properties from DTO (excludes navigation properties like ChecklistItems)
            existing.TaskId = dto.TaskId;
            existing.EquipmentId = dto.EquipmentId;
            existing.EquipmentName = dto.EquipmentName;
            existing.EquipmentGroupId = dto.EquipmentGroupId;
            existing.EquipmentGroupName = dto.EquipmentGroupName;
            existing.TaskType = dto.TaskType;
            existing.TaskDescription = dto.TaskDescription;
            existing.IntervalHours = dto.IntervalHours;
            existing.IntervalDays = dto.IntervalDays;
            existing.NextDueAt = dto.NextDueAt;
            existing.Priority = dto.Priority;
            existing.Status = dto.Status;
            existing.AssignedTo = dto.AssignedTo;
            existing.Notes = dto.Notes;
            existing.SparePartsUsed = dto.SparePartsUsed;
            existing.IsSynced = false;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Updated maintenance task: {Id} - {TaskId}, Status: {OldStatus} → {NewStatus}", 
                id, dto.TaskId, existing.Status, dto.Status);

            return Ok(existing);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating task {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// PATCH /api/maintenance/tasks/{id}
    /// Partial update for work report - only updates provided fields
    /// </summary>
    [HttpPatch("tasks/{id}")]
    public async Task<IActionResult> PatchTask(Guid id, [FromBody] System.Text.Json.JsonElement patchData)
    {
        try
        {
            var existing = await _context.MaintenanceTasks.FindAsync(id);
            if (existing == null || existing.IsDeleted)
            {
                return NotFound(new { error = "Maintenance task not found", id });
            }

            // Only update fields that are present in the request
            if (patchData.TryGetProperty("taskDescription", out var desc))
                existing.TaskDescription = desc.GetString() ?? existing.TaskDescription;
            if (patchData.TryGetProperty("notes", out var notes))
                existing.Notes = notes.GetString();
            if (patchData.TryGetProperty("sparePartsUsed", out var spareParts))
                existing.SparePartsUsed = spareParts.GetString();
            if (patchData.TryGetProperty("assignedTo", out var assigned))
                existing.AssignedTo = assigned.GetString();
            if (patchData.TryGetProperty("actualRunningHours", out var runHours) && runHours.ValueKind == System.Text.Json.JsonValueKind.Number)
                existing.ActualRunningHours = runHours.GetDouble();
            if (patchData.TryGetProperty("actualDuration", out var dur) && dur.ValueKind == System.Text.Json.JsonValueKind.Number)
                existing.ActualDuration = dur.GetInt32();
            if (patchData.TryGetProperty("checklistCompleted", out var chk) && chk.ValueKind == System.Text.Json.JsonValueKind.True || chk.ValueKind == System.Text.Json.JsonValueKind.False)
                existing.ChecklistCompleted = chk.GetBoolean();
            if (patchData.TryGetProperty("priority", out var pri))
                existing.Priority = pri.GetString() ?? existing.Priority;
            if (patchData.TryGetProperty("assignedDepartment", out var dept))
                existing.AssignedDepartment = dept.GetString();

            existing.UpdatedAt = DateTime.UtcNow;
            existing.IsSynced = false;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Patched maintenance task: {Id} - {TaskId}", id, existing.TaskId);

            return Ok(existing);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error patching task {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// PATCH /api/maintenance/tasks/{id}/status
    /// Quick status update for Kanban board drag-and-drop
    /// </summary>
    [HttpPatch("tasks/{id}/status")]
    public async Task<IActionResult> UpdateTaskStatus(Guid id, [FromBody] UpdateStatusRequest request)
    {
        try
        {
            var existing = await _context.MaintenanceTasks.FindAsync(id);
            if (existing == null || existing.IsDeleted)
            {
                return NotFound(new { error = "Maintenance task not found", id });
            }

            // Validate status transition
            if (request.Status != existing.Status)
            {
                var validationResult = ValidateStatusTransition(existing.Status, request.Status, existing);
                if (!validationResult.IsValid)
                {
                    return BadRequest(new { 
                        error = "Invalid status transition", 
                        message = validationResult.Message,
                        currentStatus = existing.Status,
                        attemptedStatus = request.Status
                    });
                }
            }

            // ✨ NEW: Validate equipment availability when starting maintenance
            if (request.Status == MTaskStatus.IN_PROGRESS && existing.Status != MTaskStatus.IN_PROGRESS)
            {
                var availabilityCheck = await ValidateEquipmentAvailabilityAsync(existing);
                if (!availabilityCheck.IsValid)
                {
                    return BadRequest(new { 
                        error = "Equipment not available", 
                        message = availabilityCheck.Message
                    });
                }
            }

            var oldStatus = existing.Status;
            existing.Status = request.Status;
            existing.UpdatedAt = DateTime.UtcNow;
            existing.IsSynced = false;

            // Auto-set timestamps based on status change
            if (request.Status == MTaskStatus.IN_PROGRESS && oldStatus != MTaskStatus.IN_PROGRESS)
            {
                existing.StartedAt ??= DateTime.UtcNow;
            }
            else if (request.Status == MTaskStatus.COMPLETED && oldStatus != MTaskStatus.COMPLETED)
            {
                existing.CompletedAt ??= DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();

            // ✨ NEW: Update equipment status after task status changes
            await UpdateEquipmentStatusForTaskAsync(existing, request.Status, oldStatus);

            _logger.LogInformation("Task {Id} status changed: {OldStatus} → {NewStatus}", 
                id, oldStatus, request.Status);

            return Ok(new { 
                id = existing.Id,
                taskId = existing.TaskId,
                status = existing.Status,
                previousStatus = oldStatus,
                message = $"Status updated from {oldStatus} to {request.Status}"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating task status {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Assign task to crew member (Quick Assign from Kanban board)
    /// POST /api/maintenance/tasks/{id}/assign
    /// </summary>
    [HttpPost("tasks/{id}/assign")]
    public async Task<IActionResult> AssignTask(Guid id, [FromBody] AssignTaskRequest request)
    {
        try
        {
            var task = await _context.MaintenanceTasks.FindAsync(id);
            if (task == null)
            {
                return NotFound(new { error = "Maintenance task not found", id });
            }

            // Validate crew member exists and is onboard (if crewId provided)
            if (!string.IsNullOrWhiteSpace(request.CrewId))
            {
                var crew = await _context.CrewMembers
                    .FirstOrDefaultAsync(c => c.CrewId == request.CrewId);
                
                if (crew == null)
                {
                    return BadRequest(new { error = "Crew member not found", crewId = request.CrewId });
                }

                if (!crew.IsOnboard)
                {
                    return BadRequest(new { 
                        error = "Cannot assign to crew member who is not onboard", 
                        crewId = request.CrewId,
                        crewName = crew.FullName 
                    });
                }

                task.AssignedTo = crew.CrewId;
                _logger.LogInformation("Task {TaskId} assigned to {CrewId} ({CrewName})", 
                    task.TaskId, crew.CrewId, crew.FullName);
            }
            else
            {
                // Unassign (set to null)
                task.AssignedTo = null;
                _logger.LogInformation("Task {TaskId} unassigned", task.TaskId);
            }

            task.UpdatedAt = DateTime.UtcNow;
            task.IsSynced = false;

            await _context.SaveChangesAsync();

            return Ok(new { 
                id = task.Id,
                taskId = task.TaskId,
                assignedTo = task.AssignedTo,
                message = task.AssignedTo != null 
                    ? $"Task assigned to {task.AssignedTo}" 
                    : "Task unassigned"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error assigning task {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// POST /api/maintenance/tasks/{id}/approve
    /// Approve or reject HIGH/CRITICAL tasks (C/E or Master only)
    /// </summary>
    [HttpPost("tasks/{id}/approve")]
    public async Task<IActionResult> ApproveTask(Guid id, [FromBody] ApproveTaskRequest request)
    {
        try
        {
            var task = await _context.MaintenanceTasks.FindAsync(id);
            if (task == null || task.IsDeleted)
            {
                return NotFound(new { error = "Maintenance task not found", id });
            }

            // Validate current status is PENDING_APPROVAL
            if (task.Status != "PENDING_APPROVAL")
            {
                return BadRequest(new { 
                    error = "Task is not in PENDING_APPROVAL status", 
                    currentStatus = task.Status 
                });
            }

            // Validate approver exists and has correct rank
            var approver = await _context.CrewMembers
                .FirstOrDefaultAsync(c => c.CrewId == request.ApprovedBy);
            
            if (approver == null)
            {
                return BadRequest(new { error = "Approver not found", crewId = request.ApprovedBy });
            }

            // The global rank permission filter validates current actor and approve/reject grants.

            if (request.IsApproved)
            {
                // Approve: Change status to PENDING (ready for execution)
                task.Status = "PENDING";
                task.ApprovedBy = request.ApprovedBy;
                task.ApprovedAt = DateTime.UtcNow;
                task.RejectionReason = null;
                
                _logger.LogInformation("Task {TaskId} approved by {ApprovedBy}", 
                    task.TaskId, request.ApprovedBy); // , approver.Rank removed
            }
            else
            {
                // Reject: Change status to REJECTED
                if (string.IsNullOrWhiteSpace(request.RejectionReason))
                {
                    return BadRequest(new { error = "RejectionReason is required when rejecting a task" });
                }

                task.Status = "REJECTED";
                task.ApprovedBy = request.ApprovedBy;
                task.ApprovedAt = DateTime.UtcNow;
                task.RejectionReason = request.RejectionReason;
                
                _logger.LogInformation("Task {TaskId} rejected by {ApprovedBy}: {Reason}", 
                    task.TaskId, request.ApprovedBy, request.RejectionReason); // , approver.Rank removed
            }

            task.UpdatedAt = DateTime.UtcNow;
            task.IsSynced = false;

            await _context.SaveChangesAsync();

            return Ok(new { 
                id = task.Id,
                taskId = task.TaskId,
                status = task.Status,
                approvedBy = task.ApprovedBy,
                approvedAt = task.ApprovedAt,
                rejectionReason = task.RejectionReason,
                message = request.IsApproved 
                    ? $"Task approved by {approver.FullName}" // approver.Rank removed
                    : $"Task rejected: {task.RejectionReason}"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error approving/rejecting task {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Validate status transition rules for Kanban board workflow
    /// Supports extended workflow: TASK → PENDING_APPROVAL → PENDING → IN_PROGRESS → COMPLETED
    /// </summary>
    private (bool IsValid, string Message) ValidateStatusTransition(string currentStatus, string newStatus, MaritimeEdge.Models.MaintenanceTask task)
    {
        // Rule 0: Same status = no transition needed
        if (currentStatus == newStatus)
        {
            return (true, "No change");
        }

        // Rule 1: COMPLETED and CANCELLED tasks cannot be moved (final states)
        if (currentStatus == MTaskStatus.COMPLETED || currentStatus == MTaskStatus.CANCELLED)
        {
            return (false, $"Cannot change status of {currentStatus.ToLower()} tasks. Create a new task if needed.");
        }

        // Define valid transitions for extended workflow
        var validTransitions = new Dictionary<string, HashSet<string>>
        {
            // SCHEDULED → UPCOMING (window), DUE (due date), OVERDUE (past due), CANCELLED
            [MTaskStatus.SCHEDULED] = new HashSet<string> {
                MTaskStatus.UPCOMING,
                MTaskStatus.DUE,
                MTaskStatus.OVERDUE,
                MTaskStatus.CANCELLED
            },

            // UPCOMING → DUE (due date reached), IN_PROGRESS (start early), CANCELLED
            [MTaskStatus.UPCOMING] = new HashSet<string> {
                MTaskStatus.DUE,
                MTaskStatus.OVERDUE,
                MTaskStatus.IN_PROGRESS,
                MTaskStatus.CANCELLED
            },

            // DUE → IN_PROGRESS (start), OVERDUE (past due), COMPLETED (direct), CANCELLED
            [MTaskStatus.DUE] = new HashSet<string> {
                MTaskStatus.IN_PROGRESS,
                MTaskStatus.OVERDUE,
                MTaskStatus.COMPLETED,
                MTaskStatus.CANCELLED
            },

            // TASK (new, unassigned) can go to: PENDING_APPROVAL (HIGH/CRITICAL), PENDING (LOW/NORMAL), REJECTED (direct reject)
            [MTaskStatus.TASK] = new HashSet<string> { 
                MTaskStatus.PENDING_APPROVAL, 
                MTaskStatus.PENDING, 
                MTaskStatus.REJECTED,
                MTaskStatus.CANCELLED 
            },
            
            // PENDING_APPROVAL can go to: PENDING (approved), REJECTED (rejected by C/E)
            [MTaskStatus.PENDING_APPROVAL] = new HashSet<string> { 
                MTaskStatus.PENDING, 
                MTaskStatus.REJECTED,
                MTaskStatus.TASK // Return for revision
            },
            
            // REJECTED can go to: TASK (revise and resubmit)
            [MTaskStatus.REJECTED] = new HashSet<string> { 
                MTaskStatus.TASK,
                MTaskStatus.CANCELLED
            },
            
            // PENDING can go to: IN_PROGRESS (start), OVERDUE (auto), COMPLETED (direct), TASK (unassign)
            [MTaskStatus.PENDING] = new HashSet<string> { 
                MTaskStatus.IN_PROGRESS, 
                MTaskStatus.OVERDUE, 
                MTaskStatus.COMPLETED,
                MTaskStatus.TASK,
                MTaskStatus.CANCELLED
            },
            
            // OVERDUE can go to: IN_PROGRESS (start late), PENDING (reschedule), COMPLETED (direct)
            [MTaskStatus.OVERDUE] = new HashSet<string> { 
                MTaskStatus.IN_PROGRESS, 
                MTaskStatus.PENDING, 
                MTaskStatus.COMPLETED,
                MTaskStatus.CANCELLED
            },
            
            // IN_PROGRESS can go to: PENDING (unassign), COMPLETED (finish)
            [MTaskStatus.IN_PROGRESS] = new HashSet<string> { 
                MTaskStatus.PENDING, 
                MTaskStatus.COMPLETED 
            }
        };

        // Check if transition is valid
        if (validTransitions.TryGetValue(currentStatus, out var allowedStatuses))
        {
            if (allowedStatuses.Contains(newStatus))
            {
                return (true, "Valid transition");
            }
            return (false, $"Cannot transition from {currentStatus} to {newStatus}. Allowed: {string.Join(", ", allowedStatuses)}");
        }

        // Unknown current status - allow transition (backward compatibility)
        return (true, "Valid transition (unknown source status)");
    }

    /// <summary>
    /// Soft delete a maintenance task (set IsDeleted = true)
    /// Retains audit trail and historical data
    /// </summary>
    [HttpDelete("tasks/{id}")]
    public async Task<IActionResult> DeleteTask(Guid id)
    {
        try
        {
            var task = await _context.MaintenanceTasks.FindAsync(id);
            if (task == null || task.IsDeleted)
            {
                return NotFound(new { error = "Maintenance task not found", id });
            }

            // Soft delete - set flags instead of removing
            task.IsDeleted = true;
            task.DeletedAt = DateTime.UtcNow;
            task.DeletedBy = "current_user"; // TODO: Get from auth context
            task.DeletionReason = "Deleted via Kanban board";
            task.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Soft deleted maintenance task: {Id} - {TaskId} - {EquipmentName}", id, task.TaskId, task.EquipmentName);

            return Ok(new { 
                message = "Maintenance task deleted successfully", 
                id,
                taskId = task.TaskId,
                equipmentName = task.EquipmentName,
                isDeleted = true
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting task {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpPost("tasks/{id}/start")]
    public async Task<IActionResult> StartTask(Guid id)
    {
        try
        {
            var task = await _context.MaintenanceTasks.FindAsync(id);
            if (task == null || task.IsDeleted)
            {
                return NotFound(new { error = "Task not found", id });
            }

            // Check if task is already in progress or completed
            if (task.Status == MTaskStatus.IN_PROGRESS)
            {
                return BadRequest(new { error = "Task is already in progress" });
            }

            if (task.Status == MTaskStatus.COMPLETED)
            {
                return BadRequest(new { error = "Task is already completed" });
            }

            // Update task status to IN_PROGRESS
            task.Status = MTaskStatus.IN_PROGRESS;
            task.StartedAt = DateTime.UtcNow;
            task.IsSynced = false;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Started task: {Id} - {TaskId} - {EquipmentName}", id, task.TaskId, task.EquipmentName);

            return Ok(task);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error starting task {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpPost("tasks/{id}/complete")]
    public async Task<IActionResult> CompleteTask(Guid id, [FromBody] CompleteTaskRequest request)
    {
        try
        {
            // Use MaintenanceCompletionService for automatic spare parts deduction
            var sparePartsUsed = request.SparePartsUsed != null
                ? System.Text.Json.JsonSerializer.Deserialize<List<SparePartUsage>>(request.SparePartsUsed) ?? new List<SparePartUsage>()
                : new List<SparePartUsage>();

            var result = await _completionService.CompleteTaskAsync(
                id,
                request.CompletedBy,
                sparePartsUsed,
                request.Notes,
                request.ConditionAfter
            );

            if (!result.IsSuccess)
            {
                return BadRequest(new { error = result.ErrorMessage });
            }

            var response = new
            {
                message = "Task completed successfully",
                deductedSpareParts = result.DeductedItems,
                warnings = result.Warnings
            };

            if (result.Warnings != null && result.Warnings.Any())
            {
                _logger.LogWarning("Task {TaskId} completed with warnings: {Warnings}", 
                    id, string.Join(", ", result.Warnings));
            }

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error completing task");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Lấy danh sách task details (checklist) của một maintenance task
    /// GET /api/maintenance/tasks/{taskId}/checklist-legacy
    /// NOTE: Use /api/maintenance/tasks/{taskId}/checklist endpoint from TaskChecklistItemsController instead
    /// </summary>
    [HttpGet("tasks/{taskId}/checklist-legacy")]
    public IActionResult GetTaskChecklistLegacy(Guid taskId)
    {
        return Ok(new List<object>()); // Legacy endpoint - TaskType feature removed
    }

    /// <summary>
    /// Complete một task detail item trong checklist
    /// POST /api/maintenance/tasks/{taskId}/details/{detailId}/complete
    /// NOTE: Use /api/maintenance/tasks/{taskId}/checklist/{itemId}/complete from TaskChecklistItemsController instead
    /// </summary>
    [HttpPost("tasks/{taskId}/details/{detailId}/complete")]
    public IActionResult CompleteChecklistItemLegacy(Guid taskId, long detailId, [FromBody] CompleteChecklistItemRequest request)
    {
        return BadRequest(new { error = "Legacy endpoint - Use /api/maintenance/tasks/{taskId}/checklist/{itemId}/complete instead" });
    }

    /// <summary>
    /// Lấy progress của task checklist
    /// GET /api/maintenance/tasks/{taskId}/progress
    /// </summary>
    [HttpGet("tasks/{taskId}/progress")]
    public Task<IActionResult> GetTaskProgress(Guid taskId)
    {
        return Task.FromResult<IActionResult>(Ok(new { total = 0, completed = 0, percentage = 100 })); // Legacy endpoint - Use PMS Planning v2.0
    }

    public class CompleteTaskRequest
    {
        public string CompletedBy { get; set; } = string.Empty;
        public string? Notes { get; set; }
        public string? SparePartsUsed { get; set; }
        public string? ConditionAfter { get; set; }
    }

    public class CreateMaintenanceTaskRequest
    {
        public int? TaskTypeId { get; set; } // Required - ID from TaskTypes table
        public string? EquipmentId { get; set; } // Optional - can be general
        public string? TaskDescription { get; set; }
        public int? IntervalDays { get; set; }
        public DateTime? NextDueAt { get; set; }
        public string? Priority { get; set; } // CRITICAL, HIGH, NORMAL, LOW (optional, will use TaskType default)
        public string? AssignedTo { get; set; }
        public string? Notes { get; set; }
    }

    public class CompleteChecklistItemRequest
    {
        public double? MeasuredValue { get; set; }
        public bool? CheckResult { get; set; }
        public string? Notes { get; set; }
        public string? PhotoUrl { get; set; }
        public string? SignatureUrl { get; set; }
        public string CompletedBy { get; set; } = string.Empty;
    }

    public class AssignTaskRequest
    {
        public string? CrewId { get; set; }
    }

    public class ApproveTaskRequest
    {
        public bool IsApproved { get; set; } // true = approve, false = reject
        public string? RejectionReason { get; set; } // Required if IsApproved = false
        public string ApprovedBy { get; set; } = string.Empty; // Crew ID of approver
    }

    // ==================== EQUIPMENT STATUS MANAGEMENT ====================
    
    /// <summary>
    /// Update equipment status when task status changes
    /// - IN_PROGRESS: Equipment → UNDER_MAINTENANCE
    /// - COMPLETED/CANCELLED: Equipment → ACTIVE (if no other maintenance)
    /// </summary>
    private async Task UpdateEquipmentStatusForTaskAsync(MaintenanceTask task, string newStatus, string oldStatus)
    {
        try
        {
            // Only update when transitioning to/from IN_PROGRESS or COMPLETED
            if (newStatus == oldStatus)
                return;

            var shouldSetMaintenance = newStatus == MTaskStatus.IN_PROGRESS && oldStatus != MTaskStatus.IN_PROGRESS;
            var shouldRestoreActive = (newStatus == MTaskStatus.COMPLETED || newStatus == MTaskStatus.CANCELLED) &&
                                      (oldStatus == MTaskStatus.IN_PROGRESS);

            if (!shouldSetMaintenance && !shouldRestoreActive)
                return;

            // Get equipment list (either from EquipmentGroupId or legacy EquipmentId)
            List<EquipmentAsset> equipmentList = new List<EquipmentAsset>();

            if (task.EquipmentGroupId.HasValue)
            {
                // NEW: Get all equipment in the group
                var members = await _context.EquipmentGroupMembers
                    .Where(m => m.GroupId == task.EquipmentGroupId.Value)
                    .ToListAsync();

                var assetIds = members.Select(m => m.AssetId).ToList();
                equipmentList = await _context.EquipmentAssets
                    .Where(a => assetIds.Contains(a.Id) && a.IsActive)
                    .ToListAsync();
            }
            else if (!string.IsNullOrEmpty(task.EquipmentId))
            {
                // LEGACY: Try to find equipment by AssetCode
                var equipment = await _context.EquipmentAssets
                    .FirstOrDefaultAsync(a => a.AssetCode == task.EquipmentId && a.IsActive);
                
                if (equipment != null)
                    equipmentList.Add(equipment);
            }

            if (!equipmentList.Any())
            {
                _logger.LogWarning("No equipment found for task {TaskId}", task.TaskId);
                return;
            }

            foreach (var equipment in equipmentList)
            {
                if (shouldSetMaintenance)
                {
                    // Set to UNDER_MAINTENANCE
                    _logger.LogInformation("Setting equipment {AssetCode} to UNDER_MAINTENANCE for task {TaskId}",
                        equipment.AssetCode, task.TaskId);
                    
                    equipment.Status = "UNDER_MAINTENANCE";
                    equipment.UpdatedAt = DateTime.UtcNow;
                    equipment.IsSynced = false;
                }
                else if (shouldRestoreActive)
                {
                    // Check if there are other IN_PROGRESS tasks for this equipment
                    bool hasOtherActiveMaintenance = false;

                    if (task.EquipmentGroupId.HasValue)
                    {
                        // Check if equipment group has other active tasks
                        hasOtherActiveMaintenance = await _context.MaintenanceTasks
                            .AnyAsync(t => !t.IsDeleted &&
                                          t.EquipmentGroupId == task.EquipmentGroupId.Value &&
                                          t.Id != task.Id &&
                                          t.Status == MTaskStatus.IN_PROGRESS);
                    }
                    else
                    {
                        // Check if this specific equipment has other active tasks
                        var groupMembership = await _context.EquipmentGroupMembers
                            .Where(m => m.AssetId == equipment.Id)
                            .Select(m => m.GroupId)
                            .ToListAsync();

                        hasOtherActiveMaintenance = await _context.MaintenanceTasks
                            .AnyAsync(t => !t.IsDeleted &&
                                          (t.EquipmentId == equipment.AssetCode ||
                                           (t.EquipmentGroupId.HasValue && groupMembership.Contains(t.EquipmentGroupId.Value))) &&
                                          t.Id != task.Id &&
                                          t.Status == MTaskStatus.IN_PROGRESS);
                    }

                    if (!hasOtherActiveMaintenance)
                    {
                        // Safe to restore to ACTIVE
                        _logger.LogInformation("Restoring equipment {AssetCode} to ACTIVE after task {TaskId} completion",
                            equipment.AssetCode, task.TaskId);
                        
                        equipment.Status = "ACTIVE";
                        equipment.UpdatedAt = DateTime.UtcNow;
                        equipment.IsSynced = false;
                    }
                    else
                    {
                        _logger.LogInformation("Equipment {AssetCode} remains UNDER_MAINTENANCE - other active tasks exist",
                            equipment.AssetCode);
                    }
                }
            }

            await _context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating equipment status for task {TaskId}", task.TaskId);
            // Don't throw - this is a secondary operation, shouldn't block task status update
        }
    }

    /// <summary>
    /// Validate if equipment can start maintenance (not already under maintenance by critical task)
    /// </summary>
    private async Task<(bool IsValid, string? Message)> ValidateEquipmentAvailabilityAsync(MaintenanceTask task)
    {
        try
        {
            // Get equipment list
            List<EquipmentAsset> equipmentList = new List<EquipmentAsset>();

            if (task.EquipmentGroupId.HasValue)
            {
                var members = await _context.EquipmentGroupMembers
                    .Where(m => m.GroupId == task.EquipmentGroupId.Value)
                    .ToListAsync();

                var assetIds = members.Select(m => m.AssetId).ToList();
                equipmentList = await _context.EquipmentAssets
                    .Where(a => assetIds.Contains(a.Id) && a.IsActive)
                    .ToListAsync();
            }
            else if (!string.IsNullOrEmpty(task.EquipmentId))
            {
                var equipment = await _context.EquipmentAssets
                    .FirstOrDefaultAsync(a => a.AssetCode == task.EquipmentId && a.IsActive);
                
                if (equipment != null)
                    equipmentList.Add(equipment);
            }

            // Check if any equipment is under critical maintenance
            foreach (var equipment in equipmentList)
            {
                if (equipment.Status == "UNDER_MAINTENANCE")
                {
                    // Find the blocking task
                    MaintenanceTask? blockingTask = null;

                    if (task.EquipmentGroupId.HasValue)
                    {
                        blockingTask = await _context.MaintenanceTasks
                            .Where(t => !t.IsDeleted &&
                                       t.EquipmentGroupId == task.EquipmentGroupId.Value &&
                                       t.Id != task.Id &&
                                       t.Status == MTaskStatus.IN_PROGRESS &&
                                       t.Priority == "CRITICAL")
                            .FirstOrDefaultAsync();
                    }
                    else
                    {
                        var groupIds = await _context.EquipmentGroupMembers
                            .Where(m => m.AssetId == equipment.Id)
                            .Select(m => m.GroupId)
                            .ToListAsync();

                        blockingTask = await _context.MaintenanceTasks
                            .Where(t => !t.IsDeleted &&
                                       (t.EquipmentId == equipment.AssetCode ||
                                        (t.EquipmentGroupId.HasValue && groupIds.Contains(t.EquipmentGroupId.Value))) &&
                                       t.Id != task.Id &&
                                       t.Status == MTaskStatus.IN_PROGRESS &&
                                       t.Priority == "CRITICAL")
                            .FirstOrDefaultAsync();
                    }

                    if (blockingTask != null)
                    {
                        return (false, $"Equipment {equipment.AssetCode} is under CRITICAL maintenance (Task: {blockingTask.TaskId}). Complete critical task first.");
                    }
                }
            }

            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating equipment availability for task {TaskId}", task.TaskId);
            return (true, null); // Allow on error to not block workflow
        }
    }

    /// <summary>
    /// Parse crew role from <!--CREW:{"a":[{"crewId":"guid","role":"SUPPORT"}]}--> in task description
    /// </summary>
    private static string ParseCrewRoleFromDescription(string? description, string crewGuid)
    {
        if (string.IsNullOrWhiteSpace(description) || string.IsNullOrWhiteSpace(crewGuid))
            return "SUPPORT";

        var match = System.Text.RegularExpressions.Regex.Match(description, @"<!--CREW:(.*?)-->");
        if (!match.Success) return "SUPPORT";

        try
        {
            var json = System.Text.Json.JsonDocument.Parse(match.Groups[1].Value);
            if (json.RootElement.TryGetProperty("a", out var arr))
            {
                foreach (var item in arr.EnumerateArray())
                {
                    if (item.TryGetProperty("crewId", out var id) && 
                        string.Equals(id.GetString(), crewGuid, StringComparison.OrdinalIgnoreCase))
                    {
                        if (item.TryGetProperty("role", out var role))
                            return role.GetString() ?? "SUPPORT";
                    }
                }
            }
        }
        catch { /* malformed JSON */ }

        return "SUPPORT";
    }
}
