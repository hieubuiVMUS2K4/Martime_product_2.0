using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs.Drill;
using MaritimeEdge.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace MaritimeEdge.Controllers.Safety
{
    [ApiController]
    [Route("api/drill")]
    public class DrillController : ControllerBase
    {
        private readonly EdgeDbContext _context;
        private readonly ILogger<DrillController> _logger;

        public DrillController(EdgeDbContext context, ILogger<DrillController> logger)
        {
            _context = context;
            _logger = logger;
        }

        #region Drill Types APIs

        /// <summary>
        /// GET /api/drill/types
        /// Get all drill types for dropdown lists and drill type selection
        /// </summary>
        [HttpGet("types")]
        public async Task<ActionResult<IEnumerable<DrillTypeDto>>> GetDrillTypes(
            [FromQuery] string? category = null,
            [FromQuery] bool? isActive = null)
        {
            try
            {
                var query = _context.DrillTypes.AsQueryable();

                if (!string.IsNullOrEmpty(category))
                    query = query.Where(dt => dt.Category == category);

                if (isActive.HasValue)
                    query = query.Where(dt => dt.IsActive == isActive.Value);

                var drillTypes = await query
                    .OrderBy(dt => dt.Category)
                    .ThenBy(dt => dt.DisplayOrder)
                    .Select(dt => new DrillTypeDto
                    {
                        Id = dt.Id,
                        DrillCode = dt.DrillCode,
                        DrillName = dt.DrillName,
                        DrillNameLocal = dt.DrillNameLocal,
                        Category = dt.Category,
                        RegulationSource = dt.RegulationSource,
                        RegulationPeriod = dt.RegulationPeriod,
                        FrequencyType = dt.FrequencyType,
                        FrequencyDays = dt.FrequencyDays,
                        TriggerCondition = dt.TriggerCondition,
                        TriggerWithinDays = dt.TriggerWithinDays,
                        WarningDaysBefore = dt.WarningDaysBefore,
                        AssignedToRole = dt.AssignedToRole,
                        InstructionContent = dt.InstructionContent,
                        IsFixedInterval = dt.IsFixedInterval,
                        IsDocumentRequired = dt.IsDocumentRequired,
                        IsSecureHistory = dt.IsSecureHistory,
                        IsCrewMemberRequired = dt.IsCrewMemberRequired,
                        IsMandatorySignOnEvaluation = dt.IsMandatorySignOnEvaluation,
                        HasNoExpiry = dt.HasNoExpiry,
                        DisplayOrder = dt.DisplayOrder,
                        IsActive = dt.IsActive
                    })
                    .ToListAsync();

                return Ok(drillTypes);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching drill types");
                return StatusCode(500, new { message = "Error fetching drill types" });
            }
        }

        /// <summary>
        /// GET /api/drill/types/{id}
        /// Get single drill type by ID
        /// </summary>
        [HttpGet("types/{id}")]
        public async Task<ActionResult<DrillTypeDto>> GetDrillType(Guid id)
        {
            try
            {
                var drillType = await _context.DrillTypes
                    .Where(dt => dt.Id == id)
                    .Select(dt => new DrillTypeDto
                    {
                        Id = dt.Id,
                        DrillCode = dt.DrillCode,
                        DrillName = dt.DrillName,
                        DrillNameLocal = dt.DrillNameLocal,
                        Category = dt.Category,
                        RegulationSource = dt.RegulationSource,
                        RegulationPeriod = dt.RegulationPeriod,
                        FrequencyType = dt.FrequencyType,
                        FrequencyDays = dt.FrequencyDays,
                        TriggerCondition = dt.TriggerCondition,
                        TriggerWithinDays = dt.TriggerWithinDays,
                        WarningDaysBefore = dt.WarningDaysBefore,
                        AssignedToRole = dt.AssignedToRole,
                        InstructionContent = dt.InstructionContent,
                        IsFixedInterval = dt.IsFixedInterval,
                        IsDocumentRequired = dt.IsDocumentRequired,
                        IsSecureHistory = dt.IsSecureHistory,
                        IsCrewMemberRequired = dt.IsCrewMemberRequired,
                        IsMandatorySignOnEvaluation = dt.IsMandatorySignOnEvaluation,
                        HasNoExpiry = dt.HasNoExpiry,
                        DisplayOrder = dt.DisplayOrder,
                        IsActive = dt.IsActive
                    })
                    .FirstOrDefaultAsync();

                if (drillType == null)
                    return NotFound(new { message = "Drill type not found" });

                return Ok(drillType);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching drill type {DrillTypeId}", id);
                return StatusCode(500, new { message = "Error fetching drill type" });
            }
        }

        #endregion

        #region Timeline APIs (for Ảnh 2 - Gantt view)

        /// <summary>
        /// GET /api/drill/timeline
        /// Get drill schedules grouped by category for timeline/gantt view (Ảnh 2)
        /// Returns data structured for tree view with collapsible categories
        /// </summary>
        [HttpGet("timeline")]
        public async Task<ActionResult<IEnumerable<DrillTimelineGroupDto>>> GetTimeline(
            [FromQuery] DrillTimelineQueryDto query)
        {
            try
            {
                var dbQuery = _context.DrillSchedules
                    .Include(ds => ds.DrillType)
                    .Include(ds => ds.AssignedToCrew)
                    .Where(ds => !ds.IsDeleted) // Filter out soft-deleted schedules
                    .AsQueryable();

                // Apply filters
                if (query.Year.HasValue)
                    dbQuery = dbQuery.Where(ds => ds.ScheduledYear == query.Year.Value);

                if (query.Month.HasValue)
                    dbQuery = dbQuery.Where(ds => ds.ScheduledMonth == query.Month.Value);

                if (!string.IsNullOrEmpty(query.Category))
                    dbQuery = dbQuery.Where(ds => ds.DrillType.Category == query.Category);

                if (!string.IsNullOrEmpty(query.Status))
                    dbQuery = dbQuery.Where(ds => ds.Status == query.Status);

                if (query.AssignedToCrewId.HasValue)
                    dbQuery = dbQuery.Where(ds => ds.AssignedToCrewId == query.AssignedToCrewId.Value);

                if (query.ShowOverdueOnly.HasValue && query.ShowOverdueOnly.Value)
                    dbQuery = dbQuery.Where(ds => ds.Status == "OVERDUE");

                if (query.StartDate.HasValue)
                    dbQuery = dbQuery.Where(ds => ds.DueDate >= query.StartDate.Value);

                if (query.EndDate.HasValue)
                    dbQuery = dbQuery.Where(ds => ds.DueDate <= query.EndDate.Value);

                var schedules = await dbQuery
                    .OrderBy(ds => ds.DrillType.Category)
                    .ThenBy(ds => ds.DrillType.DisplayOrder)
                    .ThenBy(ds => ds.DueDate)
                    .ToListAsync();

                // Calculate timeline labels (e.g., "2 w", "3 m", "-2 d")
                var now = DateTime.UtcNow;
                foreach (var schedule in schedules)
                {
                    schedule.TimelineLabel = CalculateTimelineLabel(schedule.DueDate, schedule.Status, now);
                }

                // Group by category for tree view
                var grouped = schedules
                    .GroupBy(s => s.DrillType.Category)
                    .Select(g => new DrillTimelineGroupDto
                    {
                        Category = g.Key,
                        CategoryDisplayName = GetCategoryDisplayName(g.Key),
                        TotalDrills = g.Count(),
                        CompletedCount = g.Count(s => s.Status == "COMPLETED"),
                        OverdueCount = g.Count(s => s.Status == "OVERDUE"),
                        IsExpanded = true,
                        Schedules = g.Select(s => MapToScheduleDto(s)).ToList()
                    })
                    .ToList();

                return Ok(grouped);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching drill timeline");
                return StatusCode(500, new { message = "Error fetching timeline" });
            }
        }

        /// <summary>
        /// GET /api/drill/schedules
        /// Get all drill schedules (flat list, not grouped)
        /// </summary>
        [HttpGet("schedules")]
        public async Task<ActionResult<IEnumerable<DrillScheduleDto>>> GetSchedules(
            [FromQuery] DrillTimelineQueryDto query)
        {
            try
            {
                var dbQuery = _context.DrillSchedules
                    .Include(ds => ds.DrillType)
                    .Include(ds => ds.AssignedToCrew)
                    .Where(ds => !ds.IsDeleted) // Filter out soft-deleted schedules
                    .AsQueryable();

                // Apply same filters as timeline
                if (query.Year.HasValue)
                    dbQuery = dbQuery.Where(ds => ds.ScheduledYear == query.Year.Value);

                if (query.Month.HasValue)
                    dbQuery = dbQuery.Where(ds => ds.ScheduledMonth == query.Month.Value);

                if (!string.IsNullOrEmpty(query.Category))
                    dbQuery = dbQuery.Where(ds => ds.DrillType.Category == query.Category);

                if (!string.IsNullOrEmpty(query.Status))
                    dbQuery = dbQuery.Where(ds => ds.Status == query.Status);

                var schedules = await dbQuery
                    .OrderBy(ds => ds.DueDate)
                    .ToListAsync();

                var now = DateTime.UtcNow;
                foreach (var schedule in schedules)
                {
                    schedule.TimelineLabel = CalculateTimelineLabel(schedule.DueDate, schedule.Status, now);
                }

                var result = schedules.Select(s => MapToScheduleDto(s)).ToList();

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching drill schedules");
                return StatusCode(500, new { message = "Error fetching schedules" });
            }
        }

        /// <summary>
        /// GET /api/drill/schedules/{id}
        /// Get single drill schedule by ID (for Edit Modal - Ảnh 3)
        /// </summary>
        [HttpGet("schedules/{id}")]
        public async Task<ActionResult<DrillScheduleDto>> GetSchedule(Guid id)
        {
            try
            {
                var schedule = await _context.DrillSchedules
                    .Include(ds => ds.DrillType)
                    .Include(ds => ds.AssignedToCrew)
                    .FirstOrDefaultAsync(ds => ds.Id == id && !ds.IsDeleted);

                if (schedule == null)
                    return NotFound(new { message = "Schedule not found" });

                var now = DateTime.UtcNow;
                schedule.TimelineLabel = CalculateTimelineLabel(schedule.DueDate, schedule.Status, now);

                return Ok(MapToScheduleDto(schedule));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching drill schedule {ScheduleId}", id);
                return StatusCode(500, new { message = "Error fetching schedule" });
            }
        }

        #endregion

        #region Schedule Management APIs (for Edit Modal - Ảnh 3)

        /// <summary>
        /// POST /api/drill/schedules
        /// Create new drill schedule (from Edit Modal - Ảnh 3)
        /// </summary>
        [HttpPost("schedules")]
        public async Task<ActionResult<DrillScheduleDto>> CreateSchedule(CreateUpdateDrillScheduleDto dto)
        {
            try
            {
                // Validate input
                if (dto.DrillTypeId == Guid.Empty)
                    return BadRequest(new { message = "Drill type ID is required" });
                    
                if (dto.DueDate <= dto.StartDate)
                    return BadRequest(new { message = "Due date must be after start date" });
                
                // Validate drill type exists
                var drillType = await _context.DrillTypes.FindAsync(dto.DrillTypeId);
                if (drillType == null)
                    return BadRequest(new { message = "Drill type not found" });

                var schedule = new DrillSchedule
                {
                    Id = Guid.NewGuid(),
                    DrillTypeId = dto.DrillTypeId,
                    ScheduledMonth = dto.StartDate.Month,
                    ScheduledYear = dto.StartDate.Year,
                    StartDate = dto.StartDate,
                    DueDate = dto.DueDate,
                    OverdueDate = dto.DueDate, // Can add grace period if needed
                    Status = "SCHEDULED",
                    AssignedToCrewId = dto.AssignedToCrewId,
                    AssignedToRole = dto.AssignedToRole,
                    Remarks = dto.Remarks,
                    InstructionContent = dto.InstructionContent,
                    IsFixedInterval = dto.IsFixedInterval,
                    IsDocumentRequired = dto.IsDocumentRequired,
                    IsSecureHistory = dto.IsSecureHistory,
                    IsCrewMemberRequired = dto.IsCrewMemberRequired,
                    IsMandatorySignOnEvaluation = dto.IsMandatorySignOnEvaluation,
                    ParticipantsJson = dto.Participants != null && dto.Participants.Count > 0 
                        ? JsonSerializer.Serialize(dto.Participants) 
                        : null,
                    DocumentsJson = dto.Documents != null && dto.Documents.Count > 0
                        ? JsonSerializer.Serialize(dto.Documents)
                        : null,
                    IsAutoGenerated = false,
                    OriginNode = "EDGE",
                    IsSynced = false,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                // Generate schedule code
                schedule.ScheduleCode = $"DS-{schedule.ScheduledYear}{schedule.ScheduledMonth:D2}-{drillType.DrillCode}-{Guid.NewGuid().ToString().Substring(0, 8).ToUpper()}";

                _logger.LogInformation("Creating drill schedule: {ScheduleCode} for type {DrillTypeId}", schedule.ScheduleCode, dto.DrillTypeId);
                
                _context.DrillSchedules.Add(schedule);
                await _context.SaveChangesAsync();
                
                _logger.LogInformation("Drill schedule created successfully: {ScheduleId}", schedule.Id);

                // Reload with includes
                var created = await _context.DrillSchedules
                    .Include(ds => ds.DrillType)
                    .Include(ds => ds.AssignedToCrew)
                    .FirstOrDefaultAsync(ds => ds.Id == schedule.Id);
                
                if (created == null)
                {
                    _logger.LogError("Failed to reload created schedule {ScheduleId}", schedule.Id);
                    return StatusCode(500, new { message = "Schedule created but failed to reload" });
                }

                return CreatedAtAction(nameof(GetSchedule), new { id = schedule.Id }, MapToScheduleDto(created));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating drill schedule. DrillTypeId: {DrillTypeId}, StartDate: {StartDate}, DueDate: {DueDate}", 
                    dto.DrillTypeId, dto.StartDate, dto.DueDate);
                return StatusCode(500, new { message = "Error creating schedule" });
            }
        }

        /// <summary>
        /// PUT /api/drill/schedules/{id}
        /// Update existing drill schedule (from Edit Modal - Ảnh 3)
        /// </summary>
        [HttpPut("schedules/{id}")]
        public async Task<ActionResult> UpdateSchedule(Guid id, CreateUpdateDrillScheduleDto dto)
        {
            try
            {
                var schedule = await _context.DrillSchedules.FindAsync(id);
                if (schedule == null)
                    return NotFound(new { message = "Schedule not found" });

                // Update required fields from modal
                schedule.StartDate = dto.StartDate;
                schedule.DueDate = dto.DueDate;
                schedule.OverdueDate = dto.DueDate; // Or calculate grace period
                schedule.ScheduledMonth = dto.StartDate.Month;
                schedule.ScheduledYear = dto.StartDate.Year;
                schedule.IsFixedInterval = dto.IsFixedInterval;
                schedule.IsDocumentRequired = dto.IsDocumentRequired;
                schedule.IsSecureHistory = dto.IsSecureHistory;
                schedule.IsCrewMemberRequired = dto.IsCrewMemberRequired;
                schedule.IsMandatorySignOnEvaluation = dto.IsMandatorySignOnEvaluation;

                // Update nullable fields - only if provided
                if (dto.AssignedToCrewId.HasValue) schedule.AssignedToCrewId = dto.AssignedToCrewId;
                if (dto.AssignedToRole != null) schedule.AssignedToRole = dto.AssignedToRole;
                if (dto.Remarks != null) schedule.Remarks = dto.Remarks;
                if (dto.InstructionContent != null) schedule.InstructionContent = dto.InstructionContent;
                schedule.ParticipantsJson = dto.Participants != null && dto.Participants.Count > 0 
                    ? JsonSerializer.Serialize(dto.Participants) 
                    : null;
                schedule.DocumentsJson = dto.Documents != null && dto.Documents.Count > 0
                    ? JsonSerializer.Serialize(dto.Documents)
                    : null;
                schedule.UpdatedAt = DateTime.UtcNow;
                schedule.IsSynced = false;

                await _context.SaveChangesAsync();

                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating drill schedule {ScheduleId}", id);
                return StatusCode(500, new { message = "Error updating schedule" });
            }
        }

        /// <summary>
        /// DELETE /api/drill/schedules/{id}
        /// <summary>
        /// DELETE /api/drill/schedules/{id}
        /// Soft delete drill schedule (with maritime compliance audit trail)
        /// </summary>
        [HttpDelete("schedules/{id}")]
        public async Task<ActionResult> DeleteSchedule(Guid id, [FromQuery] string? reason = null)
        {
            try
            {
                var schedule = await _context.DrillSchedules
                    .Include(s => s.DrillType)
                    .FirstOrDefaultAsync(s => s.Id == id);
                    
                if (schedule == null)
                    return NotFound(new { message = "Schedule not found" });

                // SOLAS Compliance: Don't allow deletion of completed drills with secure history
                if (schedule.Status == "COMPLETED" && schedule.IsSecureHistory)
                {
                    return BadRequest(new { 
                        message = "Cannot delete completed drill with secure history enabled. This drill record is protected for maritime compliance audit trail (SOLAS, ISM Code).",
                        isProtected = true
                    });
                }

                // Additional validation: Warn if deleting drill with execution history
                if (schedule.ExecutionCount > 0 && !schedule.IsSecureHistory)
                {
                    _logger.LogWarning("Deleting drill schedule with execution history (ID: {ScheduleId}, Count: {Count})", 
                        id, schedule.ExecutionCount);
                }

                // Soft delete with audit trail
                schedule.IsDeleted = true;
                schedule.DeletedAt = DateTime.UtcNow;
                schedule.DeletedBy = User?.Identity?.Name ?? "System"; // Get from auth context
                schedule.DeleteReason = reason ?? "No reason provided";
                schedule.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                _logger.LogInformation("Drill schedule soft deleted: {ScheduleId} by {User}", id, schedule.DeletedBy);

                return Ok(new { 
                    message = "Schedule deleted successfully",
                    deletedAt = schedule.DeletedAt,
                    deletedBy = schedule.DeletedBy
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting drill schedule {ScheduleId}", id);
                return StatusCode(500, new { message = "Error deleting schedule" });
            }
        }

        /// <summary>
        /// POST /api/drill/schedules/bulk-delete
        /// Bulk soft delete drill schedules
        /// </summary>
        [HttpPost("schedules/bulk-delete")]
        public async Task<ActionResult> BulkDeleteSchedules([FromBody] BulkDeleteRequest request)
        {
            try
            {
                if (request.ScheduleIds == null || !request.ScheduleIds.Any())
                    return BadRequest(new { message = "No schedule IDs provided" });

                var schedules = await _context.DrillSchedules
                    .Include(s => s.DrillType)
                    .Where(s => request.ScheduleIds.Contains(s.Id))
                    .ToListAsync();

                if (!schedules.Any())
                    return NotFound(new { message = "No schedules found" });

                var protectedSchedules = schedules
                    .Where(s => s.Status == "COMPLETED" && s.IsSecureHistory)
                    .ToList();

                if (protectedSchedules.Any())
                {
                    return BadRequest(new { 
                        message = $"Cannot delete {protectedSchedules.Count} schedule(s) with secure history enabled.",
                        protectedIds = protectedSchedules.Select(s => s.Id).ToList(),
                        isProtected = true
                    });
                }

                var deletedCount = 0;
                var userName = User?.Identity?.Name ?? "System";
                var timestamp = DateTime.UtcNow;

                foreach (var schedule in schedules)
                {
                    schedule.IsDeleted = true;
                    schedule.DeletedAt = timestamp;
                    schedule.DeletedBy = userName;
                    schedule.DeleteReason = request.Reason ?? "Bulk delete";
                    schedule.UpdatedAt = timestamp;
                    deletedCount++;
                }

                await _context.SaveChangesAsync();

                _logger.LogInformation("Bulk deleted {Count} drill schedules by {User}", deletedCount, userName);

                return Ok(new { 
                    message = $"Successfully deleted {deletedCount} schedule(s)",
                    deletedCount,
                    deletedBy = userName,
                    deletedAt = timestamp
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error bulk deleting drill schedules");
                return StatusCode(500, new { message = "Error bulk deleting schedules" });
            }
        }

        #endregion

        #region Drill Log APIs

        /// <summary>
        /// POST /api/drill/logs
        /// Record drill execution (when user completes drill and clicks "Save")
        /// </summary>
        [HttpPost("logs")]
        public async Task<ActionResult<DrillLogDto>> CreateDrillLog(CreateDrillLogDto dto)
        {
            try
            {
                // Validate drill type
                var drillType = await _context.DrillTypes.FindAsync(dto.DrillTypeId);
                if (drillType == null)
                    return BadRequest(new { message = "Drill type not found" });

                // Serialize participants to JSON
                var participantsJson = JsonSerializer.Serialize(dto.Participants);

                var log = new DrillLog
                {
                    Id = Guid.NewGuid(),
                    DrillScheduleId = dto.DrillScheduleId,
                    DrillTypeId = dto.DrillTypeId,
                    ExecutionDate = dto.ExecutionDate,
                    ExecutionTime = dto.ExecutionTime,
                    Duration = dto.Duration,
                    Location = dto.Location,
                    WeatherCondition = dto.WeatherCondition,
                    Result = dto.Result,
                    OverallAssessment = dto.OverallAssessment,
                    Participants = participantsJson,
                    TotalParticipants = dto.Participants.Count,
                    NewCrewCount = dto.Participants.Count(p => p.IsNewCrew),
                    Findings = dto.Findings,
                    CorrectiveActions = dto.CorrectiveActions,
                    GeneralRemarks = dto.GeneralRemarks,
                    LessonsLearned = dto.LessonsLearned,
                    ConductedByCrewId = dto.ConductedByCrewId,
                    AttachmentUrls = dto.AttachmentUrls != null ? JsonSerializer.Serialize(dto.AttachmentUrls) : null,
                    IsLocked = false,
                    OriginNode = "EDGE",
                    IsSynced = false,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                // Generate log code
                log.LogCode = $"DL-{log.ExecutionDate:yyyyMMdd}-{drillType.DrillCode}-{Guid.NewGuid().ToString().Substring(0, 6).ToUpper()}";

                _context.DrillLogs.Add(log);

                // Update schedule status if linked
                if (dto.DrillScheduleId.HasValue)
                {
                    var schedule = await _context.DrillSchedules.FindAsync(dto.DrillScheduleId.Value);
                    if (schedule != null)
                    {
                        schedule.Status = "COMPLETED";
                        schedule.LastExecutedDate = dto.ExecutionDate;
                        schedule.ExecutionCount++;
                        schedule.UpdatedAt = DateTime.UtcNow;
                        schedule.IsSynced = false;
                    }
                }

                await _context.SaveChangesAsync();

                // Return created log
                var createdLog = await _context.DrillLogs
                    .Include(dl => dl.DrillType)
                    .Include(dl => dl.DrillSchedule)
                    .Include(dl => dl.ConductedBy)
                    .FirstOrDefaultAsync(dl => dl.Id == log.Id);

                return CreatedAtAction(nameof(GetDrillLog), new { id = log.Id }, MapToDrillLogDto(createdLog!));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating drill log");
                return StatusCode(500, new { message = "Error creating drill log" });
            }
        }

        /// <summary>
        /// GET /api/drill/logs/{id}
        /// Get drill log by ID
        /// </summary>
        [HttpGet("logs/{id}")]
        public async Task<ActionResult<DrillLogDto>> GetDrillLog(Guid id)
        {
            try
            {
                var log = await _context.DrillLogs
                    .Include(dl => dl.DrillType)
                    .Include(dl => dl.DrillSchedule)
                    .Include(dl => dl.ConductedBy)
                    .Include(dl => dl.VerifiedBy)
                    .FirstOrDefaultAsync(dl => dl.Id == id);

                if (log == null)
                    return NotFound(new { message = "Drill log not found" });

                return Ok(MapToDrillLogDto(log));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching drill log {LogId}", id);
                return StatusCode(500, new { message = "Error fetching drill log" });
            }
        }

        /// <summary>
        /// PUT /api/drill/logs/{id}/approve
        /// Master approval for drill log
        /// (from Ảnh 3: "EVERY DRILL REPORT NEEDS TO BE APPROVED BY THE MASTER BEFORE SIGNING OFF")
        /// </summary>
        [HttpPut("logs/{id}/approve")]
        public async Task<ActionResult> ApproveDrillLog(Guid id, ApproveDrillLogDto dto)
        {
            try
            {
                var log = await _context.DrillLogs.FindAsync(id);
                if (log == null)
                    return NotFound(new { message = "Drill log not found" });

                if (log.IsLocked)
                    return BadRequest(new { message = "Drill log is already approved and locked" });

                var actor = (MaritimeEdge.Services.Core.ApprovalActor)HttpContext.Items["ApprovalActor"]!;
                log.VerifiedByCrewId = await _context.CrewMembers.Where(c => c.CrewId == actor.CrewId).Select(c => (Guid?)c.Id).SingleAsync();
                log.VerifiedDate = DateTime.UtcNow;
                log.IsLocked = true; // Lock after approval
                log.UpdatedAt = DateTime.UtcNow;
                log.IsSynced = false;

                if (!string.IsNullOrEmpty(dto.ApprovalRemarks))
                {
                    log.GeneralRemarks = string.IsNullOrEmpty(log.GeneralRemarks)
                        ? $"[MASTER APPROVAL] {dto.ApprovalRemarks}"
                        : $"{log.GeneralRemarks}\n\n[MASTER APPROVAL] {dto.ApprovalRemarks}";
                }

                await _context.SaveChangesAsync();

                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error approving drill log {LogId}", id);
                return StatusCode(500, new { message = "Error approving drill log" });
            }
        }

        #endregion

        #region Statistics & Dashboard APIs

        /// <summary>
        /// GET /api/drill/statistics
        /// Get drill statistics for dashboard
        /// </summary>
        [HttpGet("statistics")]
        public async Task<ActionResult<DrillStatisticsDto>> GetStatistics(
            [FromQuery] int? year = null,
            [FromQuery] int? month = null)
        {
            try
            {
                var currentYear = year ?? DateTime.UtcNow.Year;
                var currentMonth = month ?? DateTime.UtcNow.Month;

                var schedules = await _context.DrillSchedules
                    .Include(ds => ds.DrillType)
                    .Where(ds => ds.ScheduledYear == currentYear &&
                                 (month == null || ds.ScheduledMonth == currentMonth))
                    .ToListAsync();

                var totalScheduled = schedules.Count;
                var totalCompleted = schedules.Count(s => s.Status == "COMPLETED");
                var totalOverdue = schedules.Count(s => s.Status == "OVERDUE");
                var totalUpcoming = schedules.Count(s => s.Status == "SCHEDULED" || s.Status == "DUE");

                var complianceRate = totalScheduled > 0
                    ? (double)totalCompleted / totalScheduled * 100
                    : 0;

                var byCategory = schedules
                    .GroupBy(s => s.DrillType.Category)
                    .ToDictionary(g => g.Key, g => g.Count());

                var byStatus = schedules
                    .GroupBy(s => s.Status)
                    .ToDictionary(g => g.Key, g => g.Count());

                // Get upcoming drills (next 30 days)
                var upcomingDrills = schedules
                    .Where(s => s.Status != "COMPLETED" && s.DueDate >= DateTime.UtcNow && s.DueDate <= DateTime.UtcNow.AddDays(30))
                    .OrderBy(s => s.DueDate)
                    .Take(10)
                    .Select(s => MapToScheduleDto(s))
                    .ToList();

                // Get overdue drills
                var overdueDrills = schedules
                    .Where(s => s.Status == "OVERDUE")
                    .OrderBy(s => s.OverdueDate)
                    .Take(10)
                    .Select(s => MapToScheduleDto(s))
                    .ToList();

                var statistics = new DrillStatisticsDto
                {
                    TotalScheduled = totalScheduled,
                    TotalCompleted = totalCompleted,
                    TotalOverdue = totalOverdue,
                    TotalUpcoming = totalUpcoming,
                    ComplianceRate = complianceRate,
                    ByCategory = byCategory,
                    ByStatus = byStatus,
                    UpcomingDrills = upcomingDrills,
                    OverdueDrills = overdueDrills
                };

                return Ok(statistics);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching drill statistics");
                return StatusCode(500, new { message = "Error fetching statistics" });
            }
        }

        #endregion

        #region Helper Methods

        /// <summary>
        /// Calculate timeline label for drill schedule (e.g., "2 w", "3 m", "-2 d", "6 d")
        /// Used in Ảnh 2 to show time until/past due date
        /// </summary>
        private string CalculateTimelineLabel(DateTime dueDate, string status, DateTime now)
        {
            var timeSpan = dueDate - now;
            var totalDays = Math.Abs(timeSpan.TotalDays);

            if (status == "COMPLETED")
                return "✓"; // Checkmark for completed

            if (status == "OVERDUE")
            {
                // Show negative days/weeks
                if (totalDays < 7)
                    return $"-{(int)totalDays} d";
                else if (totalDays < 30)
                    return $"-{(int)(totalDays / 7)} w";
                else
                    return $"-{(int)(totalDays / 30)} m";
            }

            // Upcoming drills - show positive time remaining
            if (totalDays < 7)
                return $"{(int)totalDays} d";
            else if (totalDays < 30)
                return $"{(int)(totalDays / 7)} w";
            else if (totalDays < 365)
                return $"{(int)(totalDays / 30)} m";
            else
                return $"{(int)(totalDays / 365)} y";
        }

        /// <summary>
        /// Map DrillSchedule entity to DTO
        /// </summary>
        private DrillScheduleDto MapToScheduleDto(DrillSchedule schedule)
        {
            return new DrillScheduleDto
            {
                Id = schedule.Id,
                ScheduleCode = schedule.ScheduleCode ?? "",
                DrillTypeId = schedule.DrillTypeId,
                DrillCode = schedule.DrillType.DrillCode,
                DrillName = schedule.DrillType.DrillName,
                DrillNameLocal = schedule.DrillType.DrillNameLocal,
                Category = schedule.DrillType.Category,
                ScheduledMonth = schedule.ScheduledMonth,
                ScheduledYear = schedule.ScheduledYear,
                StartDate = schedule.StartDate,
                DueDate = schedule.DueDate,
                OverdueDate = schedule.OverdueDate,
                Status = schedule.Status,
                TimelineLabel = schedule.TimelineLabel,
                AssignedToCrewId = schedule.AssignedToCrewId,
                AssignedToCrewName = schedule.AssignedToCrew != null
                    ? schedule.AssignedToCrew.FullName
                    : null,
                AssignedToRole = schedule.AssignedToRole,
                LastExecutedDate = schedule.LastExecutedDate,
                ExecutionCount = schedule.ExecutionCount,
                Remarks = schedule.Remarks,
                InstructionContent = schedule.InstructionContent,
                IsFixedInterval = schedule.IsFixedInterval,
                IsDocumentRequired = schedule.IsDocumentRequired,
                IsSecureHistory = schedule.IsSecureHistory,
                IsCrewMemberRequired = schedule.IsCrewMemberRequired,
                IsMandatorySignOnEvaluation = schedule.IsMandatorySignOnEvaluation,
                Participants = !string.IsNullOrEmpty(schedule.ParticipantsJson)
                    ? JsonSerializer.Deserialize<List<Guid>>(schedule.ParticipantsJson)
                    : new List<Guid>(),
                Documents = !string.IsNullOrEmpty(schedule.DocumentsJson)
                    ? JsonSerializer.Deserialize<List<DocumentDto>>(schedule.DocumentsJson)
                    : new List<DocumentDto>(),
                IsAutoGenerated = schedule.IsAutoGenerated,
                OriginNode = schedule.OriginNode,
                IsSynced = schedule.IsSynced,
                CreatedAt = schedule.CreatedAt,
                UpdatedAt = schedule.UpdatedAt
            };
        }

        /// <summary>
        /// Map DrillLog entity to DTO
        /// </summary>
        private DrillLogDto MapToDrillLogDto(DrillLog log)
        {
            List<DrillParticipantDto>? participants = null;
            if (!string.IsNullOrEmpty(log.Participants))
            {
                try
                {
                    participants = JsonSerializer.Deserialize<List<DrillParticipantDto>>(log.Participants);
                }
                catch (JsonException ex)
                {
                    _logger.LogWarning(ex, "Failed to parse participants JSON for log {LogId}", log.Id);
                }
            }

            List<string>? attachments = null;
            if (!string.IsNullOrEmpty(log.AttachmentUrls))
            {
                try
                {
                    attachments = JsonSerializer.Deserialize<List<string>>(log.AttachmentUrls);
                }
                catch (JsonException ex)
                {
                    _logger.LogWarning(ex, "Failed to parse attachment URLs for log {LogId}", log.Id);
                }
            }

            return new DrillLogDto
            {
                Id = log.Id,
                LogCode = log.LogCode ?? "",
                DrillScheduleId = log.DrillScheduleId,
                ScheduleCode = log.DrillSchedule?.ScheduleCode,
                DrillTypeId = log.DrillTypeId,
                DrillCode = log.DrillType.DrillCode,
                DrillName = log.DrillType.DrillName,
                ExecutionDate = log.ExecutionDate,
                ExecutionTime = log.ExecutionTime,
                Duration = log.Duration,
                Location = log.Location,
                WeatherCondition = log.WeatherCondition,
                Result = log.Result,
                OverallAssessment = log.OverallAssessment,
                Participants = participants,
                TotalParticipants = log.TotalParticipants,
                NewCrewCount = log.NewCrewCount,
                Findings = log.Findings,
                CorrectiveActions = log.CorrectiveActions,
                GeneralRemarks = log.GeneralRemarks,
                LessonsLearned = log.LessonsLearned,
                ConductedByCrewId = log.ConductedByCrewId,
                ConductedByCrewName = log.ConductedBy != null
                    ? log.ConductedBy.FullName
                    : null,
                VerifiedByCrewId = log.VerifiedByCrewId,
                VerifiedByCrewName = log.VerifiedBy != null
                    ? log.VerifiedBy.FullName
                    : null,
                VerifiedDate = log.VerifiedDate,
                IsLocked = log.IsLocked,
                AttachmentUrls = attachments,
                CreatedAt = log.CreatedAt,
                UpdatedAt = log.UpdatedAt
            };
        }
        
        /// <summary>
        /// Convert category enum to human-readable display name
        /// </summary>
        private string GetCategoryDisplayName(string category)
        {
            return category switch
            {
                "STATION_DRILLS" => "Station Drills",
                "EXERCISES" => "Exercises",
                "EDUCATION" => "Education",
                "TRAINING" => "Training",
                "CHECKS" => "Checks",
                "ISPS" => "ISPS Security",
                _ => category // Fallback to original if not mapped
            };
        }

        #endregion

        #region Document Upload

        /// <summary>
        /// POST /api/drill/upload-document
        /// Upload a document file for a drill schedule and return a persistent URL
        /// </summary>
        [HttpPost("upload-document")]
        public async Task<IActionResult> UploadDrillDocument([FromForm] IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0)
                    return BadRequest(new { error = "File is required" });

                var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf" };
                var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!allowedExtensions.Contains(extension))
                    return BadRequest(new { error = "Only PDF and image files (jpg, jpeg, png, webp, gif) are allowed" });

                if (file.Length > 10 * 1024 * 1024)
                    return BadRequest(new { error = "File size must not exceed 10MB" });

                var uploadsRoot = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "drill", "documents");
                Directory.CreateDirectory(uploadsRoot);

                var fileName = $"drill_{DateTime.UtcNow:yyyyMMddHHmmssfff}{extension}";
                var filePath = Path.Combine(uploadsRoot, fileName);

                await using var stream = new FileStream(filePath, FileMode.Create);
                await file.CopyToAsync(stream);

                return Ok(new
                {
                    name = file.FileName,
                    url = $"/uploads/drill/documents/{fileName}",
                    mimeType = file.ContentType,
                    fileSize = file.Length,
                    uploadedAt = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading drill document");
                return StatusCode(500, new { error = "Internal server error" });
            }
        }

        #endregion
    }
}
