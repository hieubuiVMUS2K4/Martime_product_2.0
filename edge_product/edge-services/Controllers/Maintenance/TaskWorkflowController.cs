using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.DTOs;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Maintenance;
using MaritimeEdge.Services.Inventory;
using System.Text.Json;
using MTaskStatus = MaritimeEdge.Constants.TaskStatus;

namespace MaritimeEdge.Controllers.Maintenance;

[ApiController]
[Route("api/tasks")]
public class TaskWorkflowController : ControllerBase
{
    private readonly EdgeDbContext _context;
    private readonly ILogger<TaskWorkflowController> _logger;
    private readonly MaintenanceCompletionService _completionService;

    public TaskWorkflowController(
        EdgeDbContext context, 
        ILogger<TaskWorkflowController> logger,
        MaintenanceCompletionService completionService)
    {
        _context = context;
        _logger = logger;
        _completionService = completionService;
    }

    /// <summary>
    /// Start working on a task (Crew starts execution)
    /// DUE/OVERDUE → IN_PROGRESS
    /// P1 FIX: Wrapped in transaction to ensure atomicity
    /// </summary>
    [HttpPost("{id:guid}/start")]
    public async Task<IActionResult> StartTask(Guid id, [FromBody] StartTaskDto dto)
    {
        // P1 FIX: Use transaction to ensure atomicity of task start + equipment status update
        using var transaction = await _context.Database.BeginTransactionAsync();
        
        try
        {
            var userId = HttpContext.Items["WorkflowActorId"] as string ?? HttpContext.GetUsername() ?? "SYSTEM";
            var deviceType = Request.Headers["X-Device-Type"].FirstOrDefault() ?? "MOBILE";

            var task = await _context.MaintenanceTasks
                .FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
            
            if (task == null)
            {
                return NotFound(new { error = "Task not found" });
            }

            // Validate status - can only start DUE, OVERDUE, RECTIFY or MISSING_* tasks
            // Tasks with MISSING_* status can be started if they are past due date
            var allowedStatuses = new[] { "DUE", "OVERDUE", "RECTIFY", "MISSING_PIC", "MISSING_CHECKLIST", "MISSING_BOTH" };

            // Auto-transition SCHEDULED → DUE if due date has arrived (handles background service delay)
            if (task.Status == "SCHEDULED" && task.NextDueAt.Date <= DateTime.UtcNow.Date)
            {
                _logger.LogInformation(
                    "Task {TaskId} is SCHEDULED but due date {DueDate} has arrived. Auto-transitioning to DUE.",
                    task.TaskId, task.NextDueAt.Date);
                task.Status = "DUE";
                task.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();
            }

            if (!allowedStatuses.Contains(task.Status))
            {
                return BadRequest(new { 
                    error = "Can only start tasks in DUE, OVERDUE, RECTIFY or MISSING_* status",
                    currentStatus = task.Status,
                    allowedStatuses = allowedStatuses
                });
            }

            // Check if task has pending deferral
            if (task.HasPendingDeferral)
            {
                return BadRequest(new { 
                    error = "Cannot start task with pending deferral request"
                });
            }

            var previousStatus = task.Status;

            // Update task
            task.Status = "IN_PROGRESS";
            task.StartedAt = DateTime.UtcNow;
            task.StartedBy = userId;
            task.ActualRunningHours = dto.CurrentRunningHours;
            task.UpdatedAt = DateTime.UtcNow;

            if (!string.IsNullOrEmpty(dto.Notes))
            {
                task.Notes = dto.Notes;
            }

            // Add status history
            var statusHistory = new TaskStatusHistory
            {
                Id = Guid.NewGuid(),
                TaskId = task.Id,
                FromStatus = previousStatus,
                ToStatus = "IN_PROGRESS",
                ChangedBy = userId,
                ChangedAt = DateTime.UtcNow,
                Reason = previousStatus == "RECTIFY" ? "Re-started after rectification" : "Task started by crew",
                DeviceType = deviceType
            };
            _context.TaskStatusHistories.Add(statusHistory);

            await _context.SaveChangesAsync();

            // Update equipment status to UNDER_MAINTENANCE
            await UpdateEquipmentStatusForTaskAsync(task, "IN_PROGRESS", previousStatus);

            // P1 FIX: Commit transaction after all operations succeed
            await transaction.CommitAsync();

            _logger.LogInformation("Task {TaskId} started by {UserId} from status {PreviousStatus}", 
                task.TaskId, userId, previousStatus);

            return Ok(new { 
                message = "Task started successfully",
                taskId = task.TaskId,
                status = task.Status,
                startedAt = task.StartedAt
            });
        }
        catch (Exception ex)
        {
            // P1 FIX: Rollback transaction on any error
            await transaction.RollbackAsync();
            _logger.LogError(ex, "Error starting task {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Submit task for approval (Crew completes work)
    /// IN_PROGRESS → PENDING_APPROVAL
    /// </summary>
    [HttpPost("{id:guid}/submit")]
    public async Task<IActionResult> SubmitTask(Guid id, [FromBody] SubmitTaskDto dto)
    {
        try
        {
            var userId = HttpContext.Items["WorkflowActorId"] as string ?? HttpContext.GetUsername() ?? "SYSTEM";
            var deviceType = Request.Headers["X-Device-Type"].FirstOrDefault() ?? "MOBILE";

            var task = await _context.MaintenanceTasks
                .Include(t => t.ChecklistItems)
                .FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
            
            if (task == null)
            {
                return NotFound(new { error = "Task not found" });
            }

            // Validate status
            if (task.Status != "IN_PROGRESS")
            {
                return BadRequest(new { 
                    error = "Can only submit tasks in IN_PROGRESS status",
                    currentStatus = task.Status
                });
            }

            // Check if checklist is completed (if has checklist items)
            if (task.ChecklistItems.Any())
            {
                var completedItems = task.ChecklistItems.Count(c => c.IsCompleted);
                var totalItems = task.ChecklistItems.Count;
                
                if (completedItems < totalItems)
                {
                    return BadRequest(new { 
                        error = "All checklist items must be completed before submission",
                        completedItems = completedItems,
                        totalItems = totalItems
                    });
                }
                task.ChecklistCompleted = true;
            }

            // Check required photos
            if (task.RequiredPhotos > 0 && task.PhotosUploaded < task.RequiredPhotos)
            {
                return BadRequest(new { 
                    error = "Required photos not uploaded",
                    required = task.RequiredPhotos,
                    uploaded = task.PhotosUploaded
                });
            }

            // Calculate actual duration (use submitted value if provided, else auto-calculate)
            if (dto.ActualDurationMinutes.HasValue && dto.ActualDurationMinutes.Value > 0)
            {
                task.ActualDuration = dto.ActualDurationMinutes.Value;
            }
            else if (task.StartedAt.HasValue)
            {
                task.ActualDuration = (int)(DateTime.UtcNow - task.StartedAt.Value).TotalMinutes;
            }

            // Update task
            task.Status = "PENDING_APPROVAL";
            task.SubmittedAt = DateTime.UtcNow;
            task.SubmittedBy = userId;
            task.UpdatedAt = DateTime.UtcNow;

            if (!string.IsNullOrEmpty(dto.Notes))
            {
                task.Notes = dto.Notes;
            }

            if (!string.IsNullOrEmpty(dto.SparePartsUsed))
            {
                task.SparePartsUsed = dto.SparePartsUsed;
            }

            if (dto.PhotoUrls != null && dto.PhotoUrls.Any())
            {
                task.PhotosUploaded = dto.PhotoUrls.Count;
                // Store the actual photo URLs as JSON array
                task.CompletionPhotos = System.Text.Json.JsonSerializer.Serialize(dto.PhotoUrls);
            }

            if (dto.CompletedRunningHours.HasValue)
            {
                if (task.EquipmentAssetId.HasValue)
                {
                    var equipmentAsset = await _context.EquipmentAssets
                        .AsNoTracking()
                        .FirstOrDefaultAsync(a => a.Id == task.EquipmentAssetId.Value);
                    var currentRunningHours = equipmentAsset?.CurrentRunningHours ?? 0;

                    if (dto.CompletedRunningHours.Value < currentRunningHours)
                    {
                        return BadRequest(new
                        {
                            code = "RUNNING_HOURS_BELOW_CURRENT",
                            error = "Completed running hours cannot be lower than current equipment running hours",
                            current = currentRunningHours,
                            requested = dto.CompletedRunningHours.Value
                        });
                    }
                }

                task.RunningHoursAtLastDone = dto.CompletedRunningHours;
                task.ActualRunningHours = dto.CompletedRunningHours;
            }

            // Add status history
            var statusHistory = new TaskStatusHistory
            {
                Id = Guid.NewGuid(),
                TaskId = task.Id,
                FromStatus = "IN_PROGRESS",
                ToStatus = "PENDING_APPROVAL",
                ChangedBy = userId,
                ChangedAt = DateTime.UtcNow,
                Reason = "Task submitted for approval",
                DeviceType = deviceType
            };
            _context.TaskStatusHistories.Add(statusHistory);

            await _context.SaveChangesAsync();

            _logger.LogInformation("Task {TaskId} submitted for approval by {UserId}", task.TaskId, userId);

            return Ok(new { 
                message = "Task submitted for approval",
                taskId = task.TaskId,
                status = task.Status,
                submittedAt = task.SubmittedAt,
                actualDuration = task.ActualDuration
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error submitting task {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Verify task (C/E or Master approves/rejects)
    /// PENDING_APPROVAL → COMPLETED or RECTIFY
    /// </summary>
    [HttpPost("{id:guid}/verify")]
    public async Task<IActionResult> VerifyTask(Guid id, [FromBody] VerifyTaskDto dto)
    {
        try
        {
            await using var transaction = await InventoryWriteScope.BeginAsync(_context);
            var userId = HttpContext.Items["WorkflowActorId"] as string ?? HttpContext.GetUsername() ?? "SYSTEM";
            var deviceType = Request.Headers["X-Device-Type"].FirstOrDefault() ?? "WEB";

            var task = await _context.MaintenanceTasks
                .FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
            
            if (task == null)
            {
                return NotFound(new { error = "Task not found" });
            }

            // Validate status
            if (task.Status != "PENDING_APPROVAL")
            {
                return BadRequest(new { 
                    error = "Can only verify tasks in PENDING_APPROVAL status",
                    currentStatus = task.Status
                });
            }

            var action = dto.Action.ToUpper();
            if (action != "APPROVE" && action != "REJECT")
            {
                return BadRequest(new { error = "Action must be APPROVE or REJECT" });
            }

            if (action == "APPROVE")
            {
                // === DEDUCT SPARE PARTS FROM INVENTORY STOCK (source of truth for ROB) ===
                // Strategy A: deduct from the location with the largest quantity first.
                // After deduction, sync MaterialItem.OnHandQuantity = sum of remaining InventoryStock.
                if (!string.IsNullOrEmpty(task.SparePartsUsed))
                {
                    try
                    {
                        var sparePartsData = JsonSerializer.Deserialize<List<SparePartUsageDto>>(
                            task.SparePartsUsed, 
                            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                        );
                        
                        if (sparePartsData != null && sparePartsData.Any())
                        {
                            var deductedItems = new List<object>();
                            
                            foreach (var usage in sparePartsData)
                            {
                                var quantityToDeduct = usage.QuantityUsed > 0 ? usage.QuantityUsed : usage.QuantityRequired;
                                if (quantityToDeduct <= 0) continue;
                                
                                var materialItem = await _context.MaterialItems
                                    .FirstOrDefaultAsync(m => m.Id == usage.MaterialItemId);
                                
                                if (materialItem == null)
                                {
                                    return BadRequest(new
                                    {
                                        code = "MATERIAL_NOT_FOUND",
                                        error = "Material item not found",
                                        materialItemId = usage.MaterialItemId
                                    });
                                }

                                var stocks = await _context.InventoryStocks
                                    .Where(s => s.MaterialItemId == usage.MaterialItemId)
                                    .OrderByDescending(s => s.Quantity)
                                    .ToListAsync();

                                var previousStock = stocks.Any()
                                    ? (double)stocks.Sum(s => s.Quantity)
                                    : materialItem.OnHandQuantity;

                                if (previousStock < quantityToDeduct)
                                {
                                    _logger.LogWarning(
                                        "Insufficient stock for task {TaskId}: {ItemCode} available={Available}, required={Required}",
                                        task.TaskId, materialItem.ItemCode, previousStock, quantityToDeduct);

                                    return BadRequest(new
                                    {
                                        code = "INSUFFICIENT_STOCK",
                                        error = "Insufficient stock for maintenance completion",
                                        materialCode = materialItem.ItemCode,
                                        materialName = materialItem.Name,
                                        available = previousStock,
                                        required = quantityToDeduct
                                    });
                                }

                                if (stocks.Any())
                                {
                                    var remaining = (decimal)quantityToDeduct;
                                    foreach (var stock in stocks)
                                    {
                                        if (remaining <= 0) break;
                                        var take = Math.Min(stock.Quantity, remaining);
                                        stock.Quantity -= take;
                                        stock.UpdatedAt = DateTime.UtcNow;
                                        remaining -= take;
                                        _logger.LogInformation(
                                            "Deducted {Take} of {Code} from location {Loc} for task {TaskId}",
                                            take, materialItem.ItemCode, stock.StoreLocationId, task.TaskId);
                                    }
                                    // Sync cache
                                    materialItem.OnHandQuantity = (double)stocks.Sum(s => s.Quantity);
                                }
                                else
                                {
                                    // Fallback: no InventoryStock records yet
                                    materialItem.OnHandQuantity -= quantityToDeduct;
                                    _logger.LogWarning(
                                        "No InventoryStock records for {Code} — deducted from MaterialItem directly",
                                        materialItem.ItemCode);
                                }

                                materialItem.UpdatedAt = DateTime.UtcNow;

                                _logger.LogInformation(
                                    "Deducted {Qty} of {ItemCode} for task {TaskId}. Stock: {Prev} → {New}",
                                    quantityToDeduct, materialItem.ItemCode, task.TaskId,
                                    previousStock, materialItem.OnHandQuantity);
                                    
                                deductedItems.Add(new {
                                    materialItemId = materialItem.Id,
                                    materialCode = materialItem.ItemCode,
                                    materialName = materialItem.Name,
                                    quantityUsed = quantityToDeduct,
                                    previousStock = previousStock,
                                    newStock = materialItem.OnHandQuantity
                                });
                                    
                                // Check low stock alert
                                if (materialItem.MinStock.HasValue && 
                                    materialItem.OnHandQuantity < materialItem.MinStock.Value)
                                {
                                    _logger.LogWarning(
                                        "LOW STOCK: {ItemCode} {Name} - Current: {Current}, Min: {Min}",
                                        materialItem.ItemCode, materialItem.Name,
                                        materialItem.OnHandQuantity, materialItem.MinStock.Value);
                                }
                            }
                            
                            // Update task with actual deduction records
                            if (deductedItems.Any())
                            {
                                task.SparePartsUsed = JsonSerializer.Serialize(deductedItems);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error deducting spare parts for task {TaskId}", task.TaskId);
                        return StatusCode(500, new { error = "Could not deduct spare parts from inventory" });
                    }
                }

                // Approve task
                task.Status = "COMPLETED";
                task.VerifiedAt = DateTime.UtcNow;
                task.VerifiedBy = userId;
                task.VerificationResult = "APPROVED";
                task.VerificationNotes = dto.Notes;
                task.CompletedAt = DateTime.UtcNow;
                task.CompletedBy ??= task.SubmittedBy ?? task.StartedBy;
                task.LastDoneAt = DateTime.UtcNow;
                
                // Also update legacy fields for backward compatibility
                task.ApprovedBy = userId;
                task.ApprovedAt = DateTime.UtcNow;

                // Calculate next due date based on interval
                if (task.IntervalDays.HasValue)
                {
                    task.NextDueAt = DateTime.UtcNow.AddDays(task.IntervalDays.Value);
                }

                // === UPDATE EQUIPMENT RUNNING HOURS ===
                // When crew submits running hours on mobile, sync back to equipment asset
                var reportedHours = task.ActualRunningHours ?? task.RunningHoursAtLastDone;
                if (reportedHours.HasValue && reportedHours.Value > 0 && task.EquipmentAssetId.HasValue)
                {
                    var equipmentAsset = await _context.EquipmentAssets
                        .FirstOrDefaultAsync(a => a.Id == task.EquipmentAssetId.Value);
                    
                    if (equipmentAsset != null)
                    {
                        var previousHours = equipmentAsset.CurrentRunningHours ?? 0;
                        // Only update if reported hours are higher (prevent accidental decrease)
                        if (reportedHours.Value > previousHours)
                        {
                            equipmentAsset.CurrentRunningHours = reportedHours.Value;
                            equipmentAsset.LastRunningHoursUpdate = DateTime.UtcNow;
                            equipmentAsset.UpdatedAt = DateTime.UtcNow;
                            
                            _logger.LogInformation(
                                "Updated equipment {AssetCode} running hours: {Prev} → {New} (from task {TaskId})",
                                equipmentAsset.AssetCode, previousHours, reportedHours.Value, task.TaskId);
                        }
                    }
                }

                task.UpdatedAt = DateTime.UtcNow;

                // Add status history
                var statusHistory = new TaskStatusHistory
                {
                    Id = Guid.NewGuid(),
                    TaskId = task.Id,
                    FromStatus = "PENDING_APPROVAL",
                    ToStatus = "COMPLETED",
                    ChangedBy = userId,
                    ChangedAt = DateTime.UtcNow,
                    Reason = "Task approved and completed",
                    Notes = dto.Notes,
                    DeviceType = deviceType
                };
                _context.TaskStatusHistories.Add(statusHistory);

                _logger.LogInformation("Task {TaskId} approved by {UserId}", task.TaskId, userId);
            }
            else // REJECT
            {
                // Validate rejection reason
                if (string.IsNullOrEmpty(dto.RejectionReason))
                {
                    return BadRequest(new { error = "Rejection reason is required" });
                }

                // Reject task → RECTIFY
                task.Status = "RECTIFY";
                task.VerifiedAt = DateTime.UtcNow;
                task.VerifiedBy = userId;
                task.VerificationResult = "REJECTED";
                task.VerificationNotes = dto.Notes;
                task.RejectionReason = dto.RejectionReason;
                task.RejectionCount += 1;
                task.LastRejectedAt = DateTime.UtcNow;
                task.LastRejectedBy = userId;
                task.UpdatedAt = DateTime.UtcNow;

                // Update rejection history (JSON array)
                var rejectionEntry = new
                {
                    reason = dto.RejectionReason,
                    by = userId,
                    at = DateTime.UtcNow
                };

                List<object> rejectionHistory;
                if (!string.IsNullOrEmpty(task.RejectionHistory))
                {
                    rejectionHistory = JsonSerializer.Deserialize<List<object>>(task.RejectionHistory) ?? new List<object>();
                }
                else
                {
                    rejectionHistory = new List<object>();
                }
                rejectionHistory.Add(rejectionEntry);
                task.RejectionHistory = JsonSerializer.Serialize(rejectionHistory);

                // Add status history
                var statusHistory = new TaskStatusHistory
                {
                    Id = Guid.NewGuid(),
                    TaskId = task.Id,
                    FromStatus = "PENDING_APPROVAL",
                    ToStatus = "RECTIFY",
                    ChangedBy = userId,
                    ChangedAt = DateTime.UtcNow,
                    Reason = dto.RejectionReason,
                    Notes = dto.Notes,
                    DeviceType = deviceType
                };
                _context.TaskStatusHistories.Add(statusHistory);

                _logger.LogInformation("Task {TaskId} rejected by {UserId}, reason: {Reason}", 
                    task.TaskId, userId, dto.RejectionReason);
            }

            // On APPROVE: update schedule stats and generate next cycle task for PERIODIC schedules
            if (action == "APPROVE")
                await _completionService.PostApprovalScheduleUpdateAsync(task);

            await _context.SaveChangesAsync();

            // Update equipment status (COMPLETED → ACTIVE if no other maintenance)
            if (action == "APPROVE")
            {
                await UpdateEquipmentStatusForTaskAsync(task, "COMPLETED", "PENDING_APPROVAL");
            }

            if (transaction != null) await transaction.CommitAsync();
            return Ok(new { 
                message = action == "APPROVE" ? "Task approved and completed" : "Task returned for rectification",
                taskId = task.TaskId,
                status = task.Status,
                verifiedAt = task.VerifiedAt,
                rejectionCount = task.RejectionCount
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verifying task {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get task details with full workflow info
    /// </summary>
    [HttpGet("{id:guid}/details")]
    public async Task<IActionResult> GetTaskDetails(Guid id)
    {
        try
        {
            var task = await _context.MaintenanceTasks
                .AsNoTracking()
                .Include(t => t.DeferralRequests.Where(d => d.Status == "PENDING"))
                .Include(t => t.StatusHistory.OrderByDescending(h => h.ChangedAt).Take(20))
                .FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);

            if (task == null)
            {
                return NotFound(new { error = "Task not found" });
            }

            // Get crew names
            var crewIds = new List<string?> 
            { 
                task.AssignedTo, task.StartedBy, task.SubmittedBy, 
                task.VerifiedBy, task.LastDeferredBy, task.LastRejectedBy 
            }
            .Where(id => !string.IsNullOrEmpty(id))
            .Distinct()
            .ToList();

            // Add crew IDs from status history
            crewIds.AddRange(task.StatusHistory.Select(h => h.ChangedBy).Where(id => !string.IsNullOrEmpty(id)));
            crewIds = crewIds.Distinct().ToList();

            var crewNames = await _context.CrewMembers
                .Where(c => crewIds.Contains(c.CrewId))
                .ToDictionaryAsync(c => c.CrewId, c => c.FullName);

            // Get pending deferral if any
            DeferralRequestDto? pendingDeferral = null;
            var pendingDeferralEntity = task.DeferralRequests.FirstOrDefault(d => d.Status == "PENDING");
            if (pendingDeferralEntity != null)
            {
                pendingDeferral = new DeferralRequestDto
                {
                    Id = pendingDeferralEntity.Id,
                    TaskId = pendingDeferralEntity.TaskId,
                    TaskCode = task.TaskId,
                    RequestedBy = pendingDeferralEntity.RequestedBy,
                    RequestedByName = crewNames.GetValueOrDefault(pendingDeferralEntity.RequestedBy),
                    RequestedAt = pendingDeferralEntity.RequestedAt,
                    Reason = pendingDeferralEntity.Reason,
                    CurrentDueDate = pendingDeferralEntity.CurrentDueDate,
                    ProposedDueDate = pendingDeferralEntity.ProposedDueDate,
                    DeferralDays = pendingDeferralEntity.DeferralDays,
                    Status = pendingDeferralEntity.Status,
                    Priority = pendingDeferralEntity.Priority,
                    IsCmsItem = pendingDeferralEntity.IsCmsItem
                };
            }

            var dto = new MaintenanceTaskDetailDto
            {
                Id = task.Id,
                TaskId = task.TaskId,
                TaskDescription = task.TaskDescription,
                EquipmentId = task.EquipmentId,
                EquipmentName = task.EquipmentName,
                EquipmentGroupId = task.EquipmentGroupId,
                EquipmentGroupName = task.EquipmentGroupName,
                TaskType = task.TaskType,
                Priority = task.Priority,
                Status = task.Status,
                AssignedTo = task.AssignedTo,
                AssignedToName = task.AssignedTo != null ? crewNames.GetValueOrDefault(task.AssignedTo) : null,
                AssignedDepartment = task.AssignedDepartment,
                NextDueAt = task.NextDueAt,
                LastDoneAt = task.LastDoneAt,
                HasPendingDeferral = task.HasPendingDeferral,
                DeferralCount = task.DeferralCount,
                PendingDeferral = pendingDeferral,
                StartedAt = task.StartedAt,
                StartedBy = task.StartedBy,
                EstimatedDuration = task.EstimatedDuration,
                ActualDuration = task.ActualDuration,
                ChecklistCompleted = task.ChecklistCompleted,
                PhotosUploaded = task.PhotosUploaded,
                RequiredPhotos = task.RequiredPhotos,
                CompletionPhotos = task.CompletionPhotos,
                Notes = task.Notes,
                SparePartsUsed = task.SparePartsUsed,
                SubmittedAt = task.SubmittedAt,
                SubmittedBy = task.SubmittedBy,
                VerifiedAt = task.VerifiedAt,
                VerifiedBy = task.VerifiedBy,
                VerificationResult = task.VerificationResult,
                VerificationNotes = task.VerificationNotes,
                RejectionReason = task.RejectionReason,
                RejectionCount = task.RejectionCount,
                IsCms = task.IsCms,
                StatusHistory = task.StatusHistory.Select(h => new TaskStatusHistoryDto
                {
                    Id = h.Id,
                    FromStatus = h.FromStatus,
                    ToStatus = h.ToStatus,
                    ChangedBy = h.ChangedBy,
                    ChangedByName = crewNames.GetValueOrDefault(h.ChangedBy),
                    ChangedAt = h.ChangedAt,
                    Reason = h.Reason,
                    Notes = h.Notes,
                    DeviceType = h.DeviceType
                }).ToList(),
                CompletedAt = task.CompletedAt,
                CreatedAt = task.CreatedAt,
                UpdatedAt = task.UpdatedAt
            };

            return Ok(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting task details {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get tasks pending approval (for C/E dashboard)
    /// </summary>
    [HttpGet("pending-approval")]
    public async Task<IActionResult> GetPendingApprovalTasks([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        try
        {
            var query = _context.MaintenanceTasks
                .AsNoTracking()
                .Where(t => !t.IsDeleted && t.Status == "PENDING_APPROVAL")
                .OrderBy(t => t.SubmittedAt);

            var totalCount = await query.CountAsync();

            var tasks = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            // Get crew names
            var crewIds = tasks
                .SelectMany(t => new[] { t.AssignedTo, t.SubmittedBy })
                .Where(id => !string.IsNullOrEmpty(id))
                .Distinct()
                .ToList();

            var crewNames = await _context.CrewMembers
                .Where(c => crewIds.Contains(c.CrewId))
                .ToDictionaryAsync(c => c.CrewId, c => c.FullName);

            var dtos = tasks.Select(t => new TaskSummaryDto
            {
                Id = t.Id,
                TaskId = t.TaskId,
                TaskDescription = t.TaskDescription,
                EquipmentName = t.EquipmentName ?? t.EquipmentGroupName,
                Priority = t.Priority,
                Status = t.Status,
                NextDueAt = t.NextDueAt,
                AssignedTo = t.AssignedTo,
                AssignedDepartment = t.AssignedDepartment
            }).ToList();

            return Ok(new
            {
                items = dtos,
                totalCount,
                page,
                pageSize,
                totalPages = (int)Math.Ceiling((double)totalCount / pageSize)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting pending approval tasks");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get rectify tasks (for crew to fix)
    /// </summary>
    [HttpGet("rectify")]
    public async Task<IActionResult> GetRectifyTasks([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        try
        {
            var query = _context.MaintenanceTasks
                .AsNoTracking()
                .Where(t => t.Status == "RECTIFY")
                .OrderByDescending(t => t.LastRejectedAt);

            var totalCount = await query.CountAsync();

            var tasks = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var dtos = tasks.Select(t => new
            {
                t.Id,
                t.TaskId,
                t.TaskDescription,
                EquipmentName = t.EquipmentName ?? t.EquipmentGroupName,
                t.Priority,
                t.Status,
                t.NextDueAt,
                t.AssignedTo,
                t.AssignedDepartment,
                t.RejectionReason,
                t.RejectionCount,
                t.LastRejectedAt
            }).ToList();

            return Ok(new
            {
                items = dtos,
                totalCount,
                page,
                pageSize,
                totalPages = (int)Math.Ceiling((double)totalCount / pageSize)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting rectify tasks");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get approval dashboard summary
    /// </summary>
    [HttpGet("dashboard/summary")]
    public async Task<IActionResult> GetApprovalDashboardSummary()
    {
        try
        {
            var now = DateTime.UtcNow;
            var today = now.Date;
            var endOfWeek = today.AddDays(7);

            var summary = new ApprovalDashboardSummaryDto
            {
                PendingApprovalCount = await _context.MaintenanceTasks
                    .CountAsync(t => !t.IsDeleted && t.Status == "PENDING_APPROVAL"),
                
                PendingDeferralCount = await _context.TaskDeferralRequests
                    .CountAsync(d => d.Status == "PENDING"),
                
                RectifyTaskCount = await _context.MaintenanceTasks
                    .CountAsync(t => !t.IsDeleted && t.Status == "RECTIFY"),
                
                OverdueTaskCount = await _context.MaintenanceTasks
                    .CountAsync(t => !t.IsDeleted && t.Status == "OVERDUE"),
                
                TodayDueCount = await _context.MaintenanceTasks
                    .CountAsync(t => !t.IsDeleted && (t.Status == "DUE" || t.Status == "SCHEDULED") 
                        && t.NextDueAt.Date == today),
                
                ThisWeekDueCount = await _context.MaintenanceTasks
                    .CountAsync(t => !t.IsDeleted && (t.Status == "DUE" || t.Status == "SCHEDULED") 
                        && t.NextDueAt >= today && t.NextDueAt <= endOfWeek)
            };

            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting approval dashboard summary");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get morning briefing data
    /// </summary>
    [HttpGet("morning-briefing")]
    public async Task<IActionResult> GetMorningBriefing()
    {
        try
        {
            var now = DateTime.UtcNow;
            var today = now.Date;
            var yesterday = today.AddDays(-1);

            var briefing = new MorningBriefingDto
            {
                Date = today,
                
                OverdueTasksEngine = await _context.MaintenanceTasks
                    .CountAsync(t => !t.IsDeleted && t.Status == "OVERDUE" && t.AssignedDepartment == "ENGINE"),
                
                OverdueTasksDeck = await _context.MaintenanceTasks
                    .CountAsync(t => !t.IsDeleted && t.Status == "OVERDUE" && t.AssignedDepartment == "DECK"),
                
                DueToday = await _context.MaintenanceTasks
                    .CountAsync(t => !t.IsDeleted && (t.Status == "DUE" || t.Status == "SCHEDULED") 
                        && t.NextDueAt.Date == today),
                
                PendingApproval = await _context.MaintenanceTasks
                    .CountAsync(t => !t.IsDeleted && t.Status == "PENDING_APPROVAL"),
                
                PendingDeferral = await _context.TaskDeferralRequests
                    .CountAsync(d => d.Status == "PENDING"),
                
                TasksInProgress = await _context.MaintenanceTasks
                    .CountAsync(t => !t.IsDeleted && t.Status == "IN_PROGRESS"),
                
                CompletedYesterday = await _context.MaintenanceTasks
                    .CountAsync(t => !t.IsDeleted && t.Status == "COMPLETED" 
                        && t.CompletedAt.HasValue 
                        && t.CompletedAt.Value.Date == yesterday),
                
                TopPriorityTasks = await _context.MaintenanceTasks
                    .Where(t => !t.IsDeleted && (t.Status == "OVERDUE" || 
                               (t.Status == "DUE" && t.Priority == "CRITICAL")))
                    .OrderBy(t => t.NextDueAt)
                    .Take(5)
                    .Select(t => new TaskSummaryDto
                    {
                        Id = t.Id,
                        TaskId = t.TaskId,
                        TaskDescription = t.TaskDescription,
                        EquipmentName = t.EquipmentName ?? t.EquipmentGroupName,
                        Priority = t.Priority,
                        Status = t.Status,
                        NextDueAt = t.NextDueAt,
                        AssignedDepartment = t.AssignedDepartment,
                        DaysOverdue = t.Status == "OVERDUE" 
                            ? (int)(now - t.NextDueAt).TotalDays 
                            : null
                    })
                    .ToListAsync()
            };

            return Ok(briefing);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting morning briefing");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Bulk verify tasks (approve/reject multiple tasks at once)
    /// PENDING_APPROVAL → COMPLETED or RECTIFY
    /// </summary>
    [HttpPost("bulk-verify")]
    public async Task<IActionResult> BulkVerifyTasks([FromBody] BulkVerifyTaskDto dto)
    {
        try
        {
            await using var transaction = await InventoryWriteScope.BeginAsync(_context);
            var userId = HttpContext.Items["WorkflowActorId"] as string ?? HttpContext.GetUsername() ?? "SYSTEM";
            var deviceType = Request.Headers["X-Device-Type"].FirstOrDefault() ?? "WEB";

            if (dto.TaskIds == null || !dto.TaskIds.Any())
            {
                return BadRequest(new { error = "TaskIds is required" });
            }

            var action = dto.Action.ToUpper();
            if (action != "APPROVE" && action != "REJECT")
            {
                return BadRequest(new { error = "Action must be APPROVE or REJECT" });
            }

            if (action == "REJECT" && string.IsNullOrEmpty(dto.RejectionReason))
            {
                return BadRequest(new { error = "Rejection reason is required for REJECT action" });
            }

            var tasks = await _context.MaintenanceTasks
                .Where(t => !t.IsDeleted && dto.TaskIds.Contains(t.Id) && t.Status == "PENDING_APPROVAL")
                .ToListAsync();

            if (!tasks.Any())
            {
                return NotFound(new { error = "No valid tasks found in PENDING_APPROVAL status" });
            }

            var results = new List<object>();
            var successCount = 0;
            var failCount = 0;

            foreach (var task in tasks)
            {
                try
                {
                    if (action == "APPROVE")
                    {
                        task.Status = "COMPLETED";
                        task.VerifiedAt = DateTime.UtcNow;
                        task.VerifiedBy = userId;
                        task.VerificationResult = "APPROVED";
                        task.VerificationNotes = dto.Notes;
                        task.CompletedAt = DateTime.UtcNow;
                        task.CompletedBy ??= task.SubmittedBy ?? task.StartedBy;
                        task.LastDoneAt = DateTime.UtcNow;
                        task.ApprovedBy = userId;
                        task.ApprovedAt = DateTime.UtcNow;

                        if (task.IntervalDays.HasValue)
                        {
                            task.NextDueAt = DateTime.UtcNow.AddDays(task.IntervalDays.Value);
                        }
                        await _completionService.PostApprovalScheduleUpdateAsync(task);
                    }
                    else // REJECT
                    {
                        task.Status = "RECTIFY";
                        task.VerifiedAt = DateTime.UtcNow;
                        task.VerifiedBy = userId;
                        task.VerificationResult = "REJECTED";
                        task.VerificationNotes = dto.Notes;
                        task.RejectionReason = dto.RejectionReason;
                        task.RejectionCount += 1;
                        task.LastRejectedAt = DateTime.UtcNow;
                        task.LastRejectedBy = userId;
                    }

                    task.UpdatedAt = DateTime.UtcNow;

                    // Add status history
                    var statusHistory = new TaskStatusHistory
                    {
                        Id = Guid.NewGuid(),
                        TaskId = task.Id,
                        FromStatus = "PENDING_APPROVAL",
                        ToStatus = task.Status,
                        ChangedBy = userId,
                        ChangedAt = DateTime.UtcNow,
                        Reason = action == "APPROVE" ? "Bulk approved" : dto.RejectionReason,
                        Notes = dto.Notes,
                        DeviceType = deviceType
                    };
                    _context.TaskStatusHistories.Add(statusHistory);

                    results.Add(new { 
                        taskId = task.TaskId, 
                        success = true, 
                        status = task.Status 
                    });
                    successCount++;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error processing task {TaskId} in bulk verify", task.TaskId);
                    // Roll back the batch rather than approve without preserving its report.
                    throw;
                }
            }

            await _context.SaveChangesAsync();

            if (transaction != null) await transaction.CommitAsync();

            _logger.LogInformation("Bulk verify completed: {Success} success, {Failed} failed by {UserId}", 
                successCount, failCount, userId);

            return Ok(new
            {
                message = $"Bulk {action.ToLower()} completed",
                successCount,
                failCount,
                results
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in bulk verify");
            return StatusCode(500, new { error = "Internal server error" });
        }
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
                                      (oldStatus == MTaskStatus.IN_PROGRESS || oldStatus == "PENDING_APPROVAL");

            if (!shouldSetMaintenance && !shouldRestoreActive)
                return;

            // Get equipment list (either from EquipmentGroupId or legacy EquipmentId)
            List<EquipmentAsset> equipmentList = new List<EquipmentAsset>();

            if (task.EquipmentGroupId.HasValue)
            {
                // Get all equipment in the group
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
                // LEGACY: Find equipment by AssetCode
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
                    else if (!string.IsNullOrEmpty(task.EquipmentId))
                    {
                        // LEGACY: Check if this specific equipment has other active tasks
                        hasOtherActiveMaintenance = await _context.MaintenanceTasks
                            .AnyAsync(t => !t.IsDeleted &&
                                          t.EquipmentId == task.EquipmentId &&
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
}

/// <summary>
/// DTO for spare parts usage from mobile app
/// Supports both new format (quantityUsed) and old format (quantityRequired)
/// </summary>
public class SparePartUsageDto
{
    public Guid MaterialItemId { get; set; }
    public double QuantityUsed { get; set; }
    public double QuantityRequired { get; set; }
    public bool IsMandatory { get; set; }
}
