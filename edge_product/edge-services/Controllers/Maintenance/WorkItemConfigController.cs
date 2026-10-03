using MaritimeEdge.Constants;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Controllers.Maintenance;

[ApiController]
[Route("api/maintenance-schedules")]
public class WorkItemConfigController : ControllerBase
{
    private readonly IMaintenanceScheduleRepository _scheduleRepository;
    private readonly IEquipmentAssetRepository _assetRepository;
    private readonly EdgeDbContext _context;
    private readonly ILogger<WorkItemConfigController> _logger;

    public WorkItemConfigController(
        IMaintenanceScheduleRepository scheduleRepository,
        IEquipmentAssetRepository assetRepository,
        EdgeDbContext context,
        ILogger<WorkItemConfigController> logger)
    {
        _scheduleRepository = scheduleRepository;
        _assetRepository = assetRepository;
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Get minimum lead time based on priority (ISM Code & IACS guidelines)
    /// CRITICAL: 30 days, HIGH: 14 days, MEDIUM: 10 days, LOW: 7 days
    /// </summary>
    private static int GetMinimumLeadTime(string priority)
    {
        return priority?.ToUpper() switch
        {
            "CRITICAL" => 30,
            "HIGH" => 14,
            "MEDIUM" => 10,
            "LOW" => 7,
            _ => 7
        };
    }

    /// <summary>
    /// Validate and auto-correct DaysBeforeDue based on ISM Code requirements
    /// For short intervals (≤ 7 days), use proportional lead time and ignore work duration
    /// </summary>
    private int ValidateAndCorrectLeadTime(int daysBeforeDue, string priority, double? estimatedHours, int? intervalDays = null)
    {
        var minimumLeadTime = GetMinimumLeadTime(priority);
        
        // For very short intervals (daily, hourly), use proportional lead time
        // This overrides both ISM Code minimums AND work duration calculations
        if (intervalDays.HasValue && intervalDays.Value <= 7)
        {
            // For short intervals: lead time = interval * 0.5 (minimum 1 day)
            var proportionalLeadTime = Math.Max(1, intervalDays.Value / 2);
            
            // For daily/weekly tasks, proportional lead time takes absolute priority
            // ALWAYS enforce proportional lead time - don't allow larger values
            if (daysBeforeDue != proportionalLeadTime)
            {
                _logger.LogWarning(
                    "DaysBeforeDue {Configured} adjusted to proportional {Minimum} for {Interval}-day interval. Short intervals require tight lead times.",
                    daysBeforeDue, proportionalLeadTime, intervalDays.Value);
            }
            return proportionalLeadTime;
        }
        
        // For longer intervals (> 7 days), use traditional ISM Code logic
        // Consider work duration (3x safety buffer)
        var workDays = (int)Math.Ceiling((estimatedHours ?? 4) / 8.0);
        var workBasedMinimum = workDays * 3;
        
        var effectiveMinimum = Math.Max(minimumLeadTime, workBasedMinimum);
        
        // 🚨 CEILING RULE: Lead time MUST NOT exceed interval to prevent task overlap
        // If interval exists, cap lead time at 70% of interval (best practice)
        // Example: 14-day interval -> max lead time = 9 days (not 30!)
        if (intervalDays.HasValue)
        {
            // Maximum lead time = 70% of interval (allows task to complete before next one appears)
            var maxAllowedLeadTime = (int)Math.Floor(intervalDays.Value * 0.7);
            
            // If effective minimum exceeds interval ceiling, use the ceiling
            if (effectiveMinimum > maxAllowedLeadTime)
            {
                _logger.LogWarning(
                    "ISM Code minimum {ISMMinimum} days for {Priority} priority exceeds interval ceiling {Ceiling} days (70% of {Interval}-day interval). " +
                    "Using ceiling to prevent task overlap.",
                    effectiveMinimum, priority, maxAllowedLeadTime, intervalDays.Value);
                effectiveMinimum = Math.Max(1, maxAllowedLeadTime); // Minimum 1 day
            }
            
            // ENFORCE CEILING: If configured lead time exceeds ceiling, reduce it
            if (daysBeforeDue > maxAllowedLeadTime)
            {
                _logger.LogWarning(
                    "DaysBeforeDue {Configured} exceeds interval ceiling {Ceiling} days (70% of {Interval}-day interval). " +
                    "Reducing to prevent task overlap.",
                    daysBeforeDue, maxAllowedLeadTime, intervalDays.Value);
                return Math.Max(1, maxAllowedLeadTime);
            }
        }
        
        if (daysBeforeDue < effectiveMinimum)
        {
            _logger.LogWarning(
                "DaysBeforeDue {Configured} is less than minimum {Minimum} for {Priority} priority. Auto-correcting.",
                daysBeforeDue, effectiveMinimum, priority);
            return effectiveMinimum;
        }
        
        return daysBeforeDue;
    }

    /// <summary>
    /// RUNNING_HOURS schedules store DaysBeforeDue as hours, not days.
    /// </summary>
    private int ValidateAndCorrectRunningHoursLeadTime(int hoursBeforeDue, double? intervalHours)
    {
        var minimumHours = (int)Math.Ceiling(MaintenanceConstants.MINIMUM_UPCOMING_WINDOW_HOURS);
        var corrected = Math.Max(hoursBeforeDue, minimumHours);

        if (intervalHours.HasValue && intervalHours.Value > 0)
        {
            var maxAllowedHours = Math.Max(minimumHours, (int)Math.Floor(intervalHours.Value * 0.7));
            if (corrected > maxAllowedHours)
            {
                _logger.LogWarning(
                    "Running-hours warning window {Configured}h exceeds interval ceiling {Ceiling}h (70% of {Interval}h). Reducing to prevent task overlap.",
                    corrected, maxAllowedHours, intervalHours.Value);
                corrected = maxAllowedHours;
            }
        }

        return corrected;
    }

    private int ValidateScheduleLeadTime(CreateMaintenanceScheduleDto dto)
    {
        if (dto.IntervalType == "RUNNING_HOURS")
            return ValidateAndCorrectRunningHoursLeadTime(dto.DaysBeforeDue, dto.IntervalHours);

        return ValidateAndCorrectLeadTime(
            dto.DaysBeforeDue,
            dto.Priority,
            dto.EstimatedDurationHours,
            dto.IntervalDays);
    }
    /// <summary>
    /// Get all maintenance schedules (OPTIMIZED - single query with includes)
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<MaintenanceScheduleDto>>> GetAll()
    {
        try
        {
            // Load all data in batch queries to avoid N+1
            var schedules = await _context.MaintenanceSchedules
                .AsNoTracking()
                .Where(s => s.IsActive)
                .OrderBy(s => s.NextDueDate)
                .ToListAsync();
            
            if (!schedules.Any())
                return Ok(new List<MaintenanceScheduleDto>());
            
            // Batch load all related data
            var groupIds = schedules
                .Where(s => s.EquipmentGroupId.HasValue)
                .Select(s => s.EquipmentGroupId!.Value)
                .Distinct()
                .ToList();
            var assetIds = schedules
                .Where(s => s.EquipmentAssetId.HasValue)
                .Select(s => s.EquipmentAssetId!.Value)
                .Distinct()
                .ToList();
            var scheduleIds = schedules.Select(s => s.Id).ToList();
            
            var groups = groupIds.Any()
                ? await _context.EquipmentGroups
                    .AsNoTracking()
                    .Where(g => groupIds.Contains(g.Id))
                    .ToDictionaryAsync(g => g.Id)
                : new Dictionary<Guid, EquipmentGroup>();
            
            var memberCounts = groupIds.Any()
                ? await _context.EquipmentGroupMembers
                    .AsNoTracking()
                    .Where(egm => groupIds.Contains(egm.GroupId))
                    .GroupBy(egm => egm.GroupId)
                    .Select(g => new { GroupId = g.Key, Count = g.Count() })
                    .ToDictionaryAsync(x => x.GroupId, x => x.Count)
                : new Dictionary<Guid, int>();
            
            var assets = assetIds.Any()
                ? await _context.EquipmentAssets
                    .AsNoTracking()
                    .Where(a => assetIds.Contains(a.Id))
                    .ToDictionaryAsync(a => a.Id)
                : new Dictionary<Guid, EquipmentAsset>();
            
            var allSpareParts = await _context.ScheduleSpareParts
                .AsNoTracking()
                .Where(sp => scheduleIds.Contains(sp.ScheduleId))
                .ToListAsync();
            var sparePartsBySchedule = allSpareParts.GroupBy(sp => sp.ScheduleId)
                .ToDictionary(g => g.Key, g => g.ToList());
            
            var allChecklistTemplates = await _context.ScheduleChecklistTemplates
                .AsNoTracking()
                .Where(t => scheduleIds.Contains(t.ScheduleId))
                .OrderBy(t => t.SequenceOrder)
                .ToListAsync();
            var checklistsBySchedule = allChecklistTemplates.GroupBy(t => t.ScheduleId)
                .ToDictionary(g => g.Key, g => g.ToList());
            
            // Map to DTOs without additional queries
            var dtos = schedules.Select(schedule => {
                EquipmentGroup? group = null;
                int memberCount = 0;
                if (schedule.EquipmentGroupId.HasValue)
                {
                    groups.TryGetValue(schedule.EquipmentGroupId.Value, out group);
                    memberCounts.TryGetValue(schedule.EquipmentGroupId.Value, out memberCount);
                }
                EquipmentAsset? asset = null;
                if (schedule.EquipmentAssetId.HasValue)
                    assets.TryGetValue(schedule.EquipmentAssetId.Value, out asset);
                    
                sparePartsBySchedule.TryGetValue(schedule.Id, out var spareParts);
                checklistsBySchedule.TryGetValue(schedule.Id, out var checklists);
                
                return new MaintenanceScheduleDto
                {
                    Id = schedule.Id,
                    ScheduleCode = schedule.ScheduleCode,
                    EquipmentGroupId = schedule.EquipmentGroupId,
                    EquipmentAssetId = schedule.EquipmentAssetId,
                    AssetCode = asset?.AssetCode,
                    AssetName = asset?.AssetName,
                    GroupCode = group?.GroupCode,
                    GroupName = group?.GroupName,
                    AssetCount = schedule.EquipmentAssetId.HasValue ? 1 : memberCount,
                    ScheduleName = schedule.ScheduleName,
                    IntervalType = schedule.IntervalType,
                    IntervalHours = schedule.IntervalHours,
                    IntervalDays = schedule.IntervalDays,
                    DaysBeforeDue = schedule.DaysBeforeDue,
                    LastExecutedAt = schedule.LastExecutedAt,
                    LastExecutedRunningHours = schedule.LastExecutedRunningHours,
                    NextDueDate = schedule.NextDueDate,
                    NextDueRunningHours = schedule.NextDueRunningHours,
                    Priority = schedule.Priority,
                    EstimatedDurationHours = schedule.EstimatedDurationHours,
                    AutoGenerate = schedule.AutoGenerate,
                    Instructions = schedule.Instructions,
                    IsActive = schedule.IsActive,
                    RequiredSpareParts = spareParts?.Select(sp => new ScheduleSparePartDto
                    {
                        Id = sp.Id,
                        ScheduleId = sp.ScheduleId,
                        MaterialItemId = sp.MaterialItemId,
                        QuantityRequired = sp.QuantityRequired,
                        IsMandatory = sp.IsMandatory,
                        Notes = sp.Notes
                    }).ToList() ?? new List<ScheduleSparePartDto>(),
                    ChecklistItemTemplates = checklists?.Select(t => new ChecklistItemTemplateDto
                    {
                        SequenceOrder = t.SequenceOrder,
                        CheckpointDescription = t.CheckpointDescription,
                        RequiresReading = t.RequiresReading,
                        NormalRangeMin = t.NormalRangeMin,
                        NormalRangeMax = t.NormalRangeMax,
                        Unit = t.Unit
                    }).ToList() ?? new List<ChecklistItemTemplateDto>()
                };
            }).ToList();

            return Ok(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting maintenance schedules");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get maintenance schedule by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<MaintenanceScheduleDto>> GetById(Guid id)
    {
        try
        {
            var schedule = await _scheduleRepository.GetByIdAsync(id);
            if (schedule == null)
                return NotFound(new { error = "Maintenance schedule not found" });

            var dto = await MapToDtoAsync(schedule);
            return Ok(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting maintenance schedule {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get maintenance schedules by equipment group ID
    /// </summary>
    [HttpGet("group/{groupId}")]
    public async Task<ActionResult<List<MaintenanceScheduleDto>>> GetByGroupId(Guid groupId)
    {
        try
        {
            var schedules = await _scheduleRepository.GetByGroupIdAsync(groupId);
            
            if (!schedules.Any())
                return Ok(new List<MaintenanceScheduleDto>());
            
            // Batch load related data (same optimization as GetAll)
            var scheduleIds = schedules.Select(s => s.Id).ToList();
            
            var group = await _context.EquipmentGroups.AsNoTracking()
                .FirstOrDefaultAsync(g => g.Id == groupId);
            
            var memberCount = await _context.EquipmentGroupMembers
                .AsNoTracking()
                .CountAsync(egm => egm.GroupId == groupId);
            
            var allSpareParts = await _context.ScheduleSpareParts
                .AsNoTracking()
                .Where(sp => scheduleIds.Contains(sp.ScheduleId))
                .ToListAsync();
            var sparePartsBySchedule = allSpareParts.GroupBy(sp => sp.ScheduleId)
                .ToDictionary(g => g.Key, g => g.ToList());
            
            var allChecklistTemplates = await _context.ScheduleChecklistTemplates
                .AsNoTracking()
                .Where(t => scheduleIds.Contains(t.ScheduleId))
                .OrderBy(t => t.SequenceOrder)
                .ToListAsync();
            var checklistsBySchedule = allChecklistTemplates.GroupBy(t => t.ScheduleId)
                .ToDictionary(g => g.Key, g => g.ToList());
            
            var dtos = schedules.Select(schedule => {
                sparePartsBySchedule.TryGetValue(schedule.Id, out var spareParts);
                checklistsBySchedule.TryGetValue(schedule.Id, out var checklists);
                
                return new MaintenanceScheduleDto
                {
                    Id = schedule.Id,
                    ScheduleCode = schedule.ScheduleCode,
                    EquipmentGroupId = schedule.EquipmentGroupId,
                    EquipmentAssetId = schedule.EquipmentAssetId,
                    GroupCode = group?.GroupCode,
                    GroupName = group?.GroupName,
                    AssetCount = memberCount,
                    ScheduleName = schedule.ScheduleName,
                    IntervalType = schedule.IntervalType,
                    IntervalHours = schedule.IntervalHours,
                    IntervalDays = schedule.IntervalDays,
                    DaysBeforeDue = schedule.DaysBeforeDue,
                    LastExecutedAt = schedule.LastExecutedAt,
                    LastExecutedRunningHours = schedule.LastExecutedRunningHours,
                    NextDueDate = schedule.NextDueDate,
                    NextDueRunningHours = schedule.NextDueRunningHours,
                    Priority = schedule.Priority,
                    EstimatedDurationHours = schedule.EstimatedDurationHours,
                    AutoGenerate = schedule.AutoGenerate,
                    Instructions = schedule.Instructions,
                    IsActive = schedule.IsActive,
                    RequiredSpareParts = spareParts?.Select(sp => new ScheduleSparePartDto
                    {
                        Id = sp.Id,
                        ScheduleId = sp.ScheduleId,
                        MaterialItemId = sp.MaterialItemId,
                        QuantityRequired = sp.QuantityRequired,
                        IsMandatory = sp.IsMandatory,
                        Notes = sp.Notes
                    }).ToList() ?? new List<ScheduleSparePartDto>(),
                    ChecklistItemTemplates = checklists?.Select(t => new ChecklistItemTemplateDto
                    {
                        SequenceOrder = t.SequenceOrder,
                        CheckpointDescription = t.CheckpointDescription,
                        RequiresReading = t.RequiresReading,
                        NormalRangeMin = t.NormalRangeMin,
                        NormalRangeMax = t.NormalRangeMax,
                        Unit = t.Unit
                    }).ToList() ?? new List<ChecklistItemTemplateDto>()
                };
            }).ToList();

            return Ok(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting maintenance schedules for group {GroupId}", groupId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Create new maintenance schedule
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<MaintenanceScheduleDto>> Create([FromBody] CreateMaintenanceScheduleDto dto)
    {
        try
        {
            // New configurations always target a real asset; legacy group schedules remain readable.
            if (!dto.EquipmentAssetId.HasValue || dto.EquipmentGroupId.HasValue)
                return BadRequest(new { error = "Vui lòng chọn thiết bị cụ thể để cấu hình công việc, không chọn nhóm/thư mục." });
            // Validate: must provide either EquipmentGroupId or EquipmentAssetId
            if (!dto.EquipmentGroupId.HasValue && !dto.EquipmentAssetId.HasValue)
                return BadRequest(new { error = "Must provide either EquipmentGroupId or EquipmentAssetId" });
            
            if (dto.EquipmentGroupId.HasValue && dto.EquipmentAssetId.HasValue)
                return BadRequest(new { error = "Cannot provide both EquipmentGroupId and EquipmentAssetId" });

            bool isPerAsset = dto.EquipmentAssetId.HasValue;
            
            _logger.LogInformation("Creating schedule: Code={Code}, GroupId={GroupId}, AssetId={AssetId}, Name={Name}, IntervalType={IntervalType}", 
                dto.ScheduleCode, dto.EquipmentGroupId, dto.EquipmentAssetId, dto.ScheduleName, dto.IntervalType);

            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).ToList();
                _logger.LogWarning("Model validation failed: {Errors}", string.Join(", ", errors));
                return BadRequest(new { error = "Validation failed", details = errors });
            }

            EquipmentAsset? firstAsset = null;
            
            if (isPerAsset)
            {
                // Per-equipment schedule: validate asset exists
                var asset = await _context.EquipmentAssets.FindAsync(dto.EquipmentAssetId!.Value);
                if (asset == null || !asset.IsActive || asset.Category == "SYSTEM")
                    return BadRequest(new { error = "Cấu hình công việc chỉ áp dụng cho thiết bị đang hoạt động, không áp dụng cho nhóm/thư mục." });
                firstAsset = asset;
            }
            else
            {
                // Group-based schedule: validate group exists and has members
                var group = await _context.EquipmentGroups.FindAsync(dto.EquipmentGroupId!.Value);
                if (group == null)
                    return BadRequest(new { error = "Equipment group not found" });

                var groupMembers = await _context.EquipmentGroupMembers
                    .Where(egm => egm.GroupId == dto.EquipmentGroupId!.Value && egm.Asset.IsActive && egm.Asset.Category != "SYSTEM")
                    .Include(egm => egm.Asset)
                    .ToListAsync();
                
                firstAsset = groupMembers.FirstOrDefault()?.Asset;
                if (firstAsset == null)
                    return BadRequest(new { error = "Equipment group has no members" });
            }

            // Check if schedule code already exists
            if (await _scheduleRepository.ScheduleCodeExistsAsync(dto.ScheduleCode))
                return BadRequest(new { error = $"Schedule code '{dto.ScheduleCode}' already exists" });

            // Validate interval (skip for AD_HOC — one-time tasks don't need intervals)
            bool isAdHoc = dto.MaintenanceCategory == "AD_HOC";
            if (!isAdHoc && dto.IntervalType == "RUNNING_HOURS" && !dto.IntervalHours.HasValue)
                return BadRequest(new { error = "IntervalHours is required for RUNNING_HOURS interval type" });
            
            if (!isAdHoc && dto.IntervalType == "CALENDAR" && !dto.IntervalDays.HasValue)
                return BadRequest(new { error = "IntervalDays is required for CALENDAR interval type" });

            var validatedDaysBeforeDue = ValidateScheduleLeadTime(dto);

            var schedule = new MaintenanceSchedule
            {
                ScheduleCode = dto.ScheduleCode,
                EquipmentGroupId = dto.EquipmentGroupId,
                EquipmentAssetId = dto.EquipmentAssetId,
                ScheduleName = dto.ScheduleName,
                MaintenanceCategory = dto.MaintenanceCategory ?? "PERIODIC",
                IntervalType = dto.IntervalType,
                IntervalHours = dto.IntervalHours,
                IntervalDays = dto.IntervalDays,
                DaysBeforeDue = validatedDaysBeforeDue,
                Priority = dto.Priority,
                EstimatedDurationHours = dto.EstimatedDurationHours,
                AutoGenerate = dto.AutoGenerate,
                Instructions = dto.Instructions,
                IsActive = true
            };

            // Calculate next due date
            CalculateNextDueDate(schedule, firstAsset);

            var created = await _scheduleRepository.CreateAsync(schedule);

            // Add spare parts if provided
            if (dto.RequiredSpareParts != null && dto.RequiredSpareParts.Count > 0)
            {
                var spareParts = dto.RequiredSpareParts.Select(sp => new ScheduleSparePart
                {
                    ScheduleId = created.Id,
                    MaterialItemId = sp.MaterialItemId,
                    QuantityRequired = sp.QuantityRequired,
                    IsMandatory = sp.IsMandatory,
                    Notes = sp.Notes
                }).ToList();

                await _scheduleRepository.AddSparePartsAsync(created.Id, spareParts);
            }

            // Add checklist templates if provided
            if (dto.ChecklistItemTemplates != null && dto.ChecklistItemTemplates.Count > 0)
            {
                var templates = dto.ChecklistItemTemplates.Select(t => new ScheduleChecklistTemplate
                {
                    ScheduleId = created.Id,
                    SequenceOrder = t.SequenceOrder,
                    CheckpointDescription = t.CheckpointDescription,
                    RequiresReading = t.RequiresReading,
                    NormalRangeMin = t.NormalRangeMin,
                    NormalRangeMax = t.NormalRangeMax,
                    Unit = t.Unit
                }).ToList();

                foreach (var template in templates)
                {
                    _context.ScheduleChecklistTemplates.Add(template);
                }
                await _context.SaveChangesAsync();
            }

            _logger.LogInformation("Created maintenance schedule {ScheduleCode}", created.ScheduleCode);

            // Immediately generate initial task so it appears in the Bảng tab
            if (created.AutoGenerate && created.NextDueDate.HasValue)
            {
                await GenerateInitialTask(created, isPerAsset, firstAsset, dto);
            }

            var resultDto = await MapToDtoAsync(created);
            return CreatedAtAction(nameof(GetById), new { id = created.Id }, resultDto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating maintenance schedule");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Calculate next due date based on interval type if not set
    /// </summary>
    private DateTime CalculateNextDueDateFromInterval(MaintenanceSchedule schedule)
    {
        var today = DateTime.UtcNow.Date;
        var lastExecuted = schedule.LastExecutedAt?.Date ?? today;
        
        var intervalDays = schedule.IntervalType?.ToUpper() switch
        {
            "DAILY" => 1,
            "WEEKLY" => 7,
            "BI_WEEKLY" or "BIWEEKLY" => 14,
            "MONTHLY" => 30,
            "QUARTERLY" => 90,
            "SEMI_ANNUALLY" or "SEMIANNUALLY" => 180,
            "ANNUALLY" => 365,
            "CALENDAR" => schedule.IntervalDays ?? 30,
            "RUNNING_HOURS" => schedule.IntervalHours.HasValue ? (int)Math.Ceiling(schedule.IntervalHours.Value / 12.0) : 30,
            _ => 30
        };
        
        return lastExecuted.AddDays(intervalDays);
    }

    /// <summary>
    /// Preview next due dates for all schedules
    /// </summary>
    [HttpGet("preview")]
    public async Task<ActionResult<List<SchedulePreviewDto>>> PreviewDueDates()
    {
        try
        {
            var schedules = await _scheduleRepository.GetAllAsync();
            var previews = new List<SchedulePreviewDto>();

            foreach (var schedule in schedules)
            {
                if (!schedule.EquipmentAssetId.HasValue) continue;

                var asset = await _context.EquipmentAssets.FindAsync(schedule.EquipmentAssetId);
                var assetName = asset?.AssetName ?? "Unknown Asset";

                // Calculate next due date if not set
                var nextDueDate = schedule.NextDueDate ?? CalculateNextDueDateFromInterval(schedule);
                
                var daysUntilDue = (nextDueDate.Date - DateTime.UtcNow.Date).Days;

                previews.Add(new SchedulePreviewDto
                {
                    ScheduleId = schedule.Id,
                    ScheduleName = schedule.ScheduleName,
                    AssetName = assetName,
                    NextDueDate = nextDueDate,
                    NextDueRunningHours = schedule.NextDueRunningHours,
                    DaysUntilDue = daysUntilDue,
                    IsOverdue = daysUntilDue < 0,
                    Priority = schedule.Priority,
                    IntervalType = schedule.IntervalType,
                    IntervalValue = schedule.IntervalType == "RUNNING_HOURS" 
                        ? schedule.IntervalHours 
                        : schedule.IntervalDays,
                    EstimatedDurationHours = schedule.EstimatedDurationHours,
                    DaysBeforeDue = schedule.DaysBeforeDue
                });
            }

            return Ok(previews.OrderBy(p => p.DaysUntilDue).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error previewing due dates");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Update maintenance schedule
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<MaintenanceScheduleDto>> Update(Guid id, [FromBody] CreateMaintenanceScheduleDto dto)
    {
        try
        {
            var schedule = await _scheduleRepository.GetByIdAsync(id);
            if (schedule == null)
                return NotFound(new { error = "Maintenance schedule not found" });

            if (!dto.EquipmentAssetId.HasValue || dto.EquipmentGroupId.HasValue)
                return BadRequest(new { error = "Vui lòng chọn thiết bị cụ thể để cấu hình công việc, không chọn nhóm/thư mục." });
            // Validate: must provide either EquipmentGroupId or EquipmentAssetId
            if (!dto.EquipmentGroupId.HasValue && !dto.EquipmentAssetId.HasValue)
                return BadRequest(new { error = "Must provide either EquipmentGroupId or EquipmentAssetId" });
            
            if (dto.EquipmentGroupId.HasValue && dto.EquipmentAssetId.HasValue)
                return BadRequest(new { error = "Cannot provide both EquipmentGroupId and EquipmentAssetId" });

            bool isPerAsset = dto.EquipmentAssetId.HasValue;
            EquipmentAsset? firstAsset = null;
            
            if (isPerAsset)
            {
                var asset = await _context.EquipmentAssets.FindAsync(dto.EquipmentAssetId!.Value);
                if (asset == null || !asset.IsActive || asset.Category == "SYSTEM")
                    return BadRequest(new { error = "Cấu hình công việc chỉ áp dụng cho thiết bị đang hoạt động, không áp dụng cho nhóm/thư mục." });
                firstAsset = asset;
            }
            else
            {
                var group = await _context.EquipmentGroups.FindAsync(dto.EquipmentGroupId!.Value);
                if (group == null)
                    return BadRequest(new { error = "Equipment group not found" });

                var groupMembers = await _context.EquipmentGroupMembers
                    .Where(egm => egm.GroupId == dto.EquipmentGroupId!.Value && egm.Asset.IsActive && egm.Asset.Category != "SYSTEM")
                    .Include(egm => egm.Asset)
                    .ToListAsync();
                
                firstAsset = groupMembers.FirstOrDefault()?.Asset;
                if (firstAsset == null)
                    return BadRequest(new { error = "Equipment group has no members" });
            }

            // Check if schedule code is being changed and if new code already exists
            if (schedule.ScheduleCode != dto.ScheduleCode && 
                await _scheduleRepository.ScheduleCodeExistsAsync(dto.ScheduleCode))
                return BadRequest(new { error = $"Schedule code '{dto.ScheduleCode}' already exists" });

            // Validate interval (skip for AD_HOC)
            bool isAdHocUpdate = dto.MaintenanceCategory == "AD_HOC";
            if (!isAdHocUpdate && dto.IntervalType == "RUNNING_HOURS" && !dto.IntervalHours.HasValue)
                return BadRequest(new { error = "IntervalHours is required for RUNNING_HOURS interval type" });
            
            if (!isAdHocUpdate && dto.IntervalType == "CALENDAR" && !dto.IntervalDays.HasValue)
                return BadRequest(new { error = "IntervalDays is required for CALENDAR interval type" });

            var validatedDaysBeforeDue = ValidateScheduleLeadTime(dto);

            // Update schedule fields
            schedule.ScheduleCode = dto.ScheduleCode;
            schedule.EquipmentGroupId = isPerAsset ? null : dto.EquipmentGroupId;
            schedule.EquipmentAssetId = isPerAsset ? dto.EquipmentAssetId : null;
            schedule.ScheduleName = dto.ScheduleName;
            schedule.MaintenanceCategory = dto.MaintenanceCategory ?? "PERIODIC";
            schedule.IntervalType = dto.IntervalType;
            schedule.DaysBeforeDue = validatedDaysBeforeDue;
            schedule.Priority = dto.Priority;
            schedule.AutoGenerate = dto.AutoGenerate;
            schedule.Instructions = dto.Instructions;

            // Update nullable fields - only if provided
            if (dto.IntervalHours.HasValue) schedule.IntervalHours = dto.IntervalHours;
            if (dto.IntervalDays.HasValue) schedule.IntervalDays = dto.IntervalDays;
            if (dto.EstimatedDurationHours.HasValue) schedule.EstimatedDurationHours = dto.EstimatedDurationHours;
            schedule.UpdatedAt = DateTime.UtcNow;

            // Recalculate next due date
            CalculateNextDueDate(schedule, firstAsset);

            var updated = await _scheduleRepository.UpdateAsync(schedule);

            // Update spare parts - remove all and re-add
            await _scheduleRepository.RemoveSparePartsAsync(id);

            if (dto.RequiredSpareParts != null && dto.RequiredSpareParts.Count > 0)
            {
                var spareParts = dto.RequiredSpareParts.Select(sp => new ScheduleSparePart
                {
                    ScheduleId = id,
                    MaterialItemId = sp.MaterialItemId,
                    QuantityRequired = sp.QuantityRequired,
                    IsMandatory = sp.IsMandatory,
                    Notes = sp.Notes
                }).ToList();

                await _scheduleRepository.AddSparePartsAsync(id, spareParts);
            }

            // Update checklist templates - remove all and re-add
            var existingTemplates = await _context.ScheduleChecklistTemplates
                .Where(t => t.ScheduleId == id)
                .ToListAsync();
            
            _context.ScheduleChecklistTemplates.RemoveRange(existingTemplates);
            await _context.SaveChangesAsync();

            if (dto.ChecklistItemTemplates != null && dto.ChecklistItemTemplates.Count > 0)
            {
                var templates = dto.ChecklistItemTemplates.Select(t => new ScheduleChecklistTemplate
                {
                    ScheduleId = id,
                    SequenceOrder = t.SequenceOrder,
                    CheckpointDescription = t.CheckpointDescription,
                    RequiresReading = t.RequiresReading,
                    NormalRangeMin = t.NormalRangeMin,
                    NormalRangeMax = t.NormalRangeMax,
                    Unit = t.Unit,
                    CreatedAt = DateTime.UtcNow
                }).ToList();

                _context.ScheduleChecklistTemplates.AddRange(templates);
                await _context.SaveChangesAsync();
                
                _logger.LogInformation("Updated {Count} checklist templates for schedule {ScheduleCode}", 
                    templates.Count, updated.ScheduleCode);
            }

            // AUTO-UPDATE EXISTING TASKS: Sync ALL fields + checklist to active tasks
            await SyncTaskFieldsFromSchedule(updated, isPerAsset, firstAsset, dto);

            _logger.LogInformation("Updated maintenance schedule {ScheduleCode}", updated.ScheduleCode);

            var resultDto = await MapToDtoAsync(updated);
            return Ok(resultDto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating maintenance schedule {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Delete maintenance schedule and all its generated tasks
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try
        {
            var schedule = await _scheduleRepository.GetByIdAsync(id);
            if (schedule == null)
                return NotFound(new { error = "Maintenance schedule not found" });

            // ⚠️ IMPORTANT: Delete all tasks generated from this schedule FIRST
            // (to avoid orphaned tasks showing up in Kanban after schedule deletion)
            var tasksToDelete = await _context.MaintenanceTasks
                .Where(t => t.ScheduleId == schedule.Id)
                .ToListAsync();
            
            if (tasksToDelete.Any())
            {
                _logger.LogWarning(
                    "Deleting {Count} tasks generated from schedule {ScheduleCode}", 
                    tasksToDelete.Count, 
                    schedule.ScheduleCode);
                
                _context.MaintenanceTasks.RemoveRange(tasksToDelete);
                await _context.SaveChangesAsync();
            }

            // Then delete the schedule
            await _scheduleRepository.DeleteAsync(id);

            _logger.LogInformation(
                "Deleted maintenance schedule {ScheduleCode} and {TaskCount} associated tasks", 
                schedule.ScheduleCode, 
                tasksToDelete.Count);

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting maintenance schedule {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    private async Task<MaintenanceScheduleDto> MapToDtoAsync(MaintenanceSchedule schedule)
    {
        var group = schedule.EquipmentGroupId.HasValue 
            ? await _context.EquipmentGroups.FindAsync(schedule.EquipmentGroupId.Value) 
            : null;
        var groupMembersCount = schedule.EquipmentGroupId.HasValue 
            ? await _context.EquipmentGroupMembers
                .CountAsync(egm => egm.GroupId == schedule.EquipmentGroupId.Value) 
            : 0;
        
        // For per-asset schedules, load asset info
        EquipmentAsset? asset = schedule.EquipmentAssetId.HasValue
            ? await _context.EquipmentAssets.FindAsync(schedule.EquipmentAssetId.Value)
            : null;
        
        var spareParts = await _scheduleRepository.GetSparePartsByScheduleIdAsync(schedule.Id);
        var checklistTemplates = await _context.ScheduleChecklistTemplates
            .Where(t => t.ScheduleId == schedule.Id)
            .OrderBy(t => t.SequenceOrder)
            .ToListAsync();

        return new MaintenanceScheduleDto
        {
            Id = schedule.Id,
            ScheduleCode = schedule.ScheduleCode,
            EquipmentGroupId = schedule.EquipmentGroupId,
            EquipmentAssetId = schedule.EquipmentAssetId,
            AssetCode = asset?.AssetCode,
            AssetName = asset?.AssetName,
            GroupCode = group?.GroupCode,
            GroupName = group?.GroupName,
            AssetCount = schedule.EquipmentAssetId.HasValue ? 1 : groupMembersCount,
            ScheduleName = schedule.ScheduleName,
            MaintenanceCategory = schedule.MaintenanceCategory,
            IntervalType = schedule.IntervalType,
            IntervalHours = schedule.IntervalHours,
            IntervalDays = schedule.IntervalDays,
            DaysBeforeDue = schedule.DaysBeforeDue,
            LastExecutedAt = schedule.LastExecutedAt,
            LastExecutedRunningHours = schedule.LastExecutedRunningHours,
            NextDueDate = schedule.NextDueDate,
            NextDueRunningHours = schedule.NextDueRunningHours,
            Priority = schedule.Priority,
            EstimatedDurationHours = schedule.EstimatedDurationHours,
            AutoGenerate = schedule.AutoGenerate,
            Instructions = schedule.Instructions,
            IsActive = schedule.IsActive,
            RequiredSpareParts = spareParts.Select(sp => new ScheduleSparePartDto
            {
                Id = sp.Id,
                ScheduleId = sp.ScheduleId,
                MaterialItemId = sp.MaterialItemId,
                QuantityRequired = sp.QuantityRequired,
                IsMandatory = sp.IsMandatory,
                Notes = sp.Notes
            }).ToList(),
            ChecklistItemTemplates = checklistTemplates.Select(t => new ChecklistItemTemplateDto
            {
                SequenceOrder = t.SequenceOrder,
                CheckpointDescription = t.CheckpointDescription,
                RequiresReading = t.RequiresReading,
                NormalRangeMin = t.NormalRangeMin,
                NormalRangeMax = t.NormalRangeMax,
                Unit = t.Unit
            }).ToList()
        };
    }

    /// <summary>
    /// Sync checklist template changes to active tasks (not IN_PROGRESS or COMPLETED)
    /// </summary>
    private async Task SyncChecklistToActiveTasks(Guid scheduleId, string scheduleCode)
    {
        try
        {
            // Find all active tasks for this schedule (TASK, MISSING_*, PENDING_APPROVAL, PENDING)
            var activeTasks = await _context.MaintenanceTasks
                .Where(t => !t.IsDeleted && 
                           t.TaskId.StartsWith($"SCHED-{scheduleCode}") &&
                           t.Status != "IN_PROGRESS" &&
                           t.Status != "COMPLETED" &&
                           t.Status != "CANCELLED")
                .ToListAsync();

            if (!activeTasks.Any())
            {
                _logger.LogDebug("No active tasks found for schedule {ScheduleCode}", scheduleCode);
                return;
            }

            // Get updated templates
            var newTemplates = await _context.ScheduleChecklistTemplates
                .Where(t => t.ScheduleId == scheduleId)
                .OrderBy(t => t.SequenceOrder)
                .ToListAsync();

            int tasksUpdated = 0;
            int checklistItemsAdded = 0;

            foreach (var task in activeTasks)
            {
                // Get equipment group to find assets
                var groupMembers = await _context.EquipmentGroupMembers
                    .Where(egm => egm.GroupId == task.EquipmentGroupId)
                    .Include(egm => egm.Asset)
                    .Where(egm => egm.Asset != null && egm.Asset.IsActive)
                    .ToListAsync();

                if (!groupMembers.Any()) continue;

                // Remove existing checklist items for this task
                var existingItems = await _context.TaskChecklistItems
                    .Where(ci => ci.TaskId == task.TaskId)
                    .ToListAsync();
                
                _context.TaskChecklistItems.RemoveRange(existingItems);

                // Add new checklist items based on updated templates
                if (newTemplates.Any())
                {
                    foreach (var member in groupMembers)
                    {
                        var asset = member.Asset;
                        if (asset == null) continue;

                        foreach (var template in newTemplates)
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
                            _context.TaskChecklistItems.Add(checklistItem);
                            checklistItemsAdded++;
                        }
                    }
                }

                // UPDATE TASK STATUS based on new validation
                // Only change status for tasks still in configuration/setup states.
                // Tasks in operational states (DUE, OVERDUE, PENDING_APPROVAL, RECTIFY) must not be overwritten.
                var hasPIC = !string.IsNullOrWhiteSpace(task.AssignedTo);
                var hasChecklist = newTemplates.Any();
                var oldStatus = task.Status;
                var configurableStatuses = new[] { "MISSING_BOTH", "MISSING_PIC", "MISSING_CHECKLIST", "SCHEDULED" };
                if (Array.IndexOf(configurableStatuses, oldStatus) >= 0)
                {
                    var newStatus = DetermineTaskStatus(task.AssignedTo, hasChecklist, task.Priority);
                    if (oldStatus != newStatus)
                    {
                        task.Status = newStatus;
                        task.UpdatedAt = DateTime.UtcNow;
                        _logger.LogInformation(
                            "Task {TaskId} status updated: {OldStatus} → {NewStatus} (PIC: {HasPIC}, Checklist: {HasChecklist})",
                            task.TaskId, oldStatus, newStatus, hasPIC, hasChecklist);
                    }
                }

                tasksUpdated++;
            }

            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Synced checklist changes to {TaskCount} active tasks: {ItemCount} checklist items updated for schedule {ScheduleCode}",
                tasksUpdated, checklistItemsAdded, scheduleCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error syncing checklist to active tasks for schedule {ScheduleCode}", scheduleCode);
            // Don't throw - this is a background sync operation
        }
    }

    /// <summary>
    /// Determine task status based on validation rules (shared with scheduler)
    /// </summary>
    private string DetermineTaskStatus(string? assignedTo, bool hasChecklist, string priority)
    {
        bool hasPIC = !string.IsNullOrWhiteSpace(assignedTo);

        if (!hasPIC && !hasChecklist) return "MISSING_BOTH";
        if (!hasPIC) return "MISSING_PIC";
        if (!hasChecklist) return "MISSING_CHECKLIST";

        // Task is ready for scheduling — actual progression to DUE/OVERDUE is handled by counter/scheduler
        return "SCHEDULED";
    }

    /// <summary>
    /// Sync ALL task fields from updated schedule config to active tasks in Bảng tab.
    /// Updates: description, priority, equipment info, spare parts, interval, checklist.
    /// Handles both per-asset and group-based schedules.
    /// </summary>
    private async Task SyncTaskFieldsFromSchedule(MaintenanceSchedule schedule, bool isPerAsset, EquipmentAsset firstAsset, CreateMaintenanceScheduleDto dto)
    {
        try
        {
            // Find all active tasks for this schedule
            var activeTasks = await _context.MaintenanceTasks
                .Where(t => !t.IsDeleted &&
                           t.ScheduleId == schedule.Id &&
                           t.Status != "IN_PROGRESS" &&
                           t.Status != "COMPLETED" &&
                           t.Status != "CANCELLED")
                .ToListAsync();

            if (!activeTasks.Any())
            {
                _logger.LogDebug("No active tasks found for schedule {ScheduleCode}, creating initial task", schedule.ScheduleCode);
                // If no task exists yet, create one
                await GenerateInitialTask(schedule, isPerAsset, firstAsset, dto);
                return;
            }

            // Build spare parts JSON
            string? sparePartsJson = null;
            if (dto.RequiredSpareParts != null && dto.RequiredSpareParts.Count > 0)
            {
                var spareParts = await _context.ScheduleSpareParts
                    .Where(sp => sp.ScheduleId == schedule.Id)
                    .ToListAsync();
                // ScheduleSparePart.MaterialItemId trỏ DANH MỤC (material_items catalog).
                var materialIds = spareParts.Select(sp => sp.MaterialItemId).ToList();
                var materials = await _context.MaterialCatalogItems
                    .Where(m => materialIds.Contains(m.Id))
                    .ToDictionaryAsync(m => m.Id, m => new { m.ItemCode, m.Name });
                sparePartsJson = System.Text.Json.JsonSerializer.Serialize(
                    spareParts.Select(sp => new
                    {
                        materialItemId = sp.MaterialItemId,
                        materialCode = materials.ContainsKey(sp.MaterialItemId) ? materials[sp.MaterialItemId].ItemCode : "",
                        materialName = materials.ContainsKey(sp.MaterialItemId) ? materials[sp.MaterialItemId].Name : "Unknown",
                        quantityRequired = sp.QuantityRequired,
                        isMandatory = sp.IsMandatory
                    }),
                    new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase });
            }

            // Get checklist templates
            var checklistTemplates = await _context.ScheduleChecklistTemplates
                .Where(t => t.ScheduleId == schedule.Id)
                .OrderBy(t => t.SequenceOrder)
                .ToListAsync();

            // Get group info if needed
            EquipmentGroup? group = null;
            List<EquipmentAsset> assetsForChecklist;
            if (isPerAsset)
            {
                assetsForChecklist = new List<EquipmentAsset> { firstAsset };
            }
            else
            {
                group = await _context.EquipmentGroups.FindAsync(schedule.EquipmentGroupId!.Value);
                var groupMembers = await _context.EquipmentGroupMembers
                    .Where(egm => egm.GroupId == schedule.EquipmentGroupId!.Value)
                    .Include(egm => egm.Asset)
                    .ToListAsync();
                assetsForChecklist = groupMembers
                    .Select(m => m.Asset)
                    .Where(a => a != null && a.IsActive)
                    .Cast<EquipmentAsset>()
                    .ToList();
            }

            // Parse crew config for PIC assignment
            var (picName, _) = await ParseCrewFromInstructions(dto.Instructions);

            // Parse META for form requirement flags
            var (requireRisk, requireInspection) = ParseMetaFromInstructions(dto.Instructions);

            // Strip META/CREW HTML comments from instructions for clean task description
            var cleanInstructions = StripMetaTags(dto.Instructions);

            int tasksUpdated = 0;
            foreach (var task in activeTasks)
            {
                // Update task fields from schedule
                task.TaskDescription = string.IsNullOrWhiteSpace(cleanInstructions)
                    ? schedule.ScheduleName
                    : schedule.ScheduleName + "\n\n" + cleanInstructions;
                task.Priority = schedule.Priority ?? "MEDIUM";
                task.IntervalHours = schedule.IntervalHours;
                task.IntervalDays = schedule.IntervalDays;
                task.TaskType = (schedule.MaintenanceCategory == "AD_HOC" || schedule.MaintenanceCategory == "CORRECTIVE") ? schedule.MaintenanceCategory : (schedule.IntervalType ?? "RUNNING_HOURS");
                task.RequiredSpareParts = sparePartsJson;
                task.EstimatedDuration = schedule.EstimatedDurationHours.HasValue ? (int)schedule.EstimatedDurationHours.Value : task.EstimatedDuration;
                task.EquipmentGroupId = isPerAsset ? null : schedule.EquipmentGroupId;
                task.EquipmentGroupName = isPerAsset ? null : group?.GroupName;
                task.EquipmentAssetId = isPerAsset ? firstAsset.Id : (Guid?)null;
                task.EquipmentAssetName = isPerAsset ? firstAsset.AssetName : null;
                task.EquipmentId = isPerAsset ? firstAsset.AssetCode : null;
                task.EquipmentName = isPerAsset ? firstAsset.AssetName : group?.GroupName;
                task.RequireRiskAssessment = requireRisk;
                task.RequireInspectionReport = requireInspection;
                if (!string.IsNullOrWhiteSpace(picName))
                    task.AssignedTo = picName;
                if (schedule.NextDueDate.HasValue)
                    task.NextDueAt = schedule.NextDueDate.Value;

                // Remove existing checklist items
                var existingItems = await _context.TaskChecklistItems
                    .Where(ci => ci.TaskId == task.TaskId)
                    .ToListAsync();
                _context.TaskChecklistItems.RemoveRange(existingItems);

                // Add new checklist items from templates
                if (checklistTemplates.Any())
                {
                    foreach (var asset in assetsForChecklist)
                    {
                        foreach (var template in checklistTemplates)
                        {
                            _context.TaskChecklistItems.Add(new TaskChecklistItem
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
                            });
                        }
                    }
                }

                // Update task status
                // Only touch status for tasks still in configuration/setup states.
                var hasChecklist = checklistTemplates.Any();
                var configurableStatuses = new[] { "MISSING_BOTH", "MISSING_PIC", "MISSING_CHECKLIST", "SCHEDULED" };
                if (Array.IndexOf(configurableStatuses, task.Status) >= 0)
                {
                    var newStatus = DetermineTaskStatus(task.AssignedTo, hasChecklist, task.Priority);
                    task.Status = newStatus;
                }
                task.UpdatedAt = DateTime.UtcNow;
                tasksUpdated++;
            }

            await _context.SaveChangesAsync();
            _logger.LogInformation("Synced {Count} active tasks from updated schedule {ScheduleCode}", tasksUpdated, schedule.ScheduleCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error syncing task fields from schedule {ScheduleCode}", schedule.ScheduleCode);
            // Don't throw - schedule update should still succeed
        }
    }

    /// <summary>
    /// Generate initial MaintenanceTask immediately after schedule creation
    /// so it appears in the Bảng tab without waiting for the background scheduler.
    /// </summary>
    private async Task GenerateInitialTask(MaintenanceSchedule schedule, bool isPerAsset, EquipmentAsset firstAsset, CreateMaintenanceScheduleDto dto)
    {
        try
        {
            // Build spare parts JSON from DTO (already saved to DB)
            string? sparePartsJson = null;
            if (dto.RequiredSpareParts != null && dto.RequiredSpareParts.Count > 0)
            {
                var spareParts = await _context.ScheduleSpareParts
                    .Where(sp => sp.ScheduleId == schedule.Id)
                    .ToListAsync();
                // ScheduleSparePart.MaterialItemId trỏ DANH MỤC (material_items catalog).
                var materialIds = spareParts.Select(sp => sp.MaterialItemId).ToList();
                var materials = await _context.MaterialCatalogItems
                    .Where(m => materialIds.Contains(m.Id))
                    .ToDictionaryAsync(m => m.Id, m => new { m.ItemCode, m.Name });
                sparePartsJson = System.Text.Json.JsonSerializer.Serialize(
                    spareParts.Select(sp => new
                    {
                        materialItemId = sp.MaterialItemId,
                        materialCode = materials.ContainsKey(sp.MaterialItemId) ? materials[sp.MaterialItemId].ItemCode : "",
                        materialName = materials.ContainsKey(sp.MaterialItemId) ? materials[sp.MaterialItemId].Name : "Unknown",
                        quantityRequired = sp.QuantityRequired,
                        isMandatory = sp.IsMandatory
                    }),
                    new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase });
            }

            // Build task ID
            string identifierCode;
            EquipmentGroup? group = null;
            List<EquipmentAsset> assetsForChecklist;

            if (isPerAsset)
            {
                identifierCode = firstAsset.AssetCode;
                assetsForChecklist = new List<EquipmentAsset> { firstAsset };
            }
            else
            {
                group = await _context.EquipmentGroups.FindAsync(schedule.EquipmentGroupId!.Value);
                identifierCode = group?.GroupCode ?? "GRP";
                var groupMembers = await _context.EquipmentGroupMembers
                    .Where(egm => egm.GroupId == schedule.EquipmentGroupId!.Value)
                    .Include(egm => egm.Asset)
                    .ToListAsync();
                assetsForChecklist = groupMembers
                    .Select(m => m.Asset)
                    .Where(a => a != null && a.IsActive)
                    .Cast<EquipmentAsset>()
                    .ToList();
            }

            var taskId = $"SCHED-{schedule.ScheduleCode}-{identifierCode}-{DateTime.UtcNow:yyyyMMdd}";

            // Check if task already exists
            if (await _context.MaintenanceTasks.AnyAsync(t => t.TaskId == taskId))
            {
                _logger.LogDebug("Task {TaskId} already exists, skipping initial generation", taskId);
                return;
            }

            var hasChecklistTemplates = await _context.ScheduleChecklistTemplates
                .AnyAsync(t => t.ScheduleId == schedule.Id);

            // Strip META/CREW HTML comments from instructions for clean task description
            var cleanInstructions = StripMetaTags(dto.Instructions);

            var task = new MaintenanceTask
            {
                TaskId = taskId,
                TaskTypeId = null,
                ScheduleId = schedule.Id,
                EquipmentGroupId = isPerAsset ? null : schedule.EquipmentGroupId,
                EquipmentGroupName = isPerAsset ? null : group?.GroupName,
                EquipmentAssetId = isPerAsset ? firstAsset.Id : (Guid?)null,
                EquipmentAssetName = isPerAsset ? firstAsset.AssetName : null,
                EquipmentId = isPerAsset ? firstAsset.AssetCode : null,
                EquipmentName = isPerAsset ? firstAsset.AssetName : group?.GroupName,
                TaskType = (schedule.MaintenanceCategory == "AD_HOC" || schedule.MaintenanceCategory == "CORRECTIVE") ? schedule.MaintenanceCategory : (schedule.IntervalType ?? "RUNNING_HOURS"),
                TaskDescription = string.IsNullOrWhiteSpace(cleanInstructions)
                    ? schedule.ScheduleName
                    : schedule.ScheduleName + "\n\n" + cleanInstructions,
                IntervalHours = schedule.IntervalHours,
                IntervalDays = schedule.IntervalDays,
                LastDoneAt = schedule.LastExecutedAt,
                NextDueAt = schedule.NextDueDate!.Value,
                RunningHoursAtLastDone = schedule.LastExecutedRunningHours,
                Priority = schedule.Priority ?? "MEDIUM",
                Status = schedule.MaintenanceCategory == "AD_HOC" ? "DUE" : "SCHEDULED",
                EstimatedDuration = schedule.EstimatedDurationHours.HasValue ? (int)schedule.EstimatedDurationHours.Value : (int?)null,
                RequiredSpareParts = sparePartsJson,
                Notes = $"Auto-generated from schedule: {schedule.ScheduleCode}",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            // Parse crew config to set PIC
            var (picName, _) = await ParseCrewFromInstructions(dto.Instructions);
            if (!string.IsNullOrWhiteSpace(picName))
                task.AssignedTo = picName;

            // Copy form requirement flags from META
            var (requireRisk, requireInspection) = ParseMetaFromInstructions(dto.Instructions);
            task.RequireRiskAssessment = requireRisk;
            task.RequireInspectionReport = requireInspection;

            _context.MaintenanceTasks.Add(task);

            // Create checklist items from templates
            var checklistTemplates = await _context.ScheduleChecklistTemplates
                .Where(t => t.ScheduleId == schedule.Id)
                .OrderBy(t => t.SequenceOrder)
                .ToListAsync();

            if (checklistTemplates.Any())
            {
                foreach (var asset in assetsForChecklist)
                {
                    foreach (var template in checklistTemplates)
                    {
                        _context.TaskChecklistItems.Add(new TaskChecklistItem
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
                        });
                    }
                }
            }

            await _context.SaveChangesAsync();
            _logger.LogInformation("Generated initial task {TaskId} for new schedule {ScheduleCode}", taskId, schedule.ScheduleCode);
        }
        catch (Exception ex)
        {
            // Don't fail the schedule creation if task generation fails
            _logger.LogError(ex, "Error generating initial task for schedule {ScheduleCode}. Task will be created by background scheduler.", schedule.ScheduleCode);
        }
    }

    /// <summary>
    /// Strip <!--META:...-->, <!--CREW:...--> HTML comment tags from text.
    /// These are internal serialization markers, not user-visible content.
    /// </summary>
    private static string? StripMetaTags(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var cleaned = System.Text.RegularExpressions.Regex.Replace(text, @"<!--(META|CREW):.*?-->", "", System.Text.RegularExpressions.RegexOptions.Singleline).Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? null : cleaned;
    }

    /// <summary>
    /// Parse META JSON from instructions.
    /// Format: <!--META:{"cbm":true,"reqRisk":true,"reqInspection":true}-->
    /// </summary>
    private static (bool requireRisk, bool requireInspection) ParseMetaFromInstructions(string? instructions)
    {
        if (string.IsNullOrWhiteSpace(instructions)) return (false, false);
        var match = System.Text.RegularExpressions.Regex.Match(instructions, @"<!--META:(.*?)-->", System.Text.RegularExpressions.RegexOptions.Singleline);
        if (!match.Success) return (false, false);
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(match.Groups[1].Value);
            var root = doc.RootElement;
            var reqRisk = root.TryGetProperty("reqRisk", out var rr) && rr.GetBoolean();
            var reqInspection = root.TryGetProperty("reqInspection", out var ri) && ri.GetBoolean();
            return (reqRisk, reqInspection);
        }
        catch { return (false, false); }
    }

    /// <summary>
    /// Parse CREW JSON from instructions to extract PIC and RECEIVER crew member names.
    /// Format: <!--CREW:{"a":[{"crewId":"guid","role":"PIC"},{"crewId":"guid","role":"RECEIVER"},...]}-->
    /// </summary>
    private async Task<(string? picName, string? receiverName)> ParseCrewFromInstructions(string? instructions)
    {
        if (string.IsNullOrWhiteSpace(instructions)) return (null, null);
        var match = System.Text.RegularExpressions.Regex.Match(instructions, @"<!--CREW:(.*?)-->", System.Text.RegularExpressions.RegexOptions.Singleline);
        if (!match.Success) return (null, null);

        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(match.Groups[1].Value);
            var assignments = doc.RootElement.GetProperty("a");
            string? picId = null, receiverId = null;
            foreach (var a in assignments.EnumerateArray())
            {
                var role = a.GetProperty("role").GetString();
                var crewId = a.GetProperty("crewId").GetString();
                if (role == "PIC" && crewId != null) picId = crewId;
                else if (role == "RECEIVER" && crewId != null) receiverId = crewId;
            }

            var idsToLookup = new List<Guid>();
            if (Guid.TryParse(picId, out var picGuid)) idsToLookup.Add(picGuid);
            if (Guid.TryParse(receiverId, out var recGuid)) idsToLookup.Add(recGuid);
            if (!idsToLookup.Any()) return (null, null);

            var crewMembers = await _context.CrewMembers
                .Where(c => idsToLookup.Contains(c.Id))
                .Select(c => new { c.Id, c.FullName })
                .ToListAsync();

            var picName = picGuid != Guid.Empty ? crewMembers.FirstOrDefault(c => c.Id == picGuid)?.FullName : null;
            var receiverName = recGuid != Guid.Empty ? crewMembers.FirstOrDefault(c => c.Id == recGuid)?.FullName : null;
            return (picName, receiverName);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse CREW JSON from instructions");
            return (null, null);
        }
    }

    private void CalculateNextDueDate(MaintenanceSchedule schedule, EquipmentAsset asset)
    {
        // AD_HOC: due immediately
        if (schedule.MaintenanceCategory == "AD_HOC")
        {
            schedule.NextDueDate = DateTime.UtcNow;
            return;
        }
        
        if (schedule.IntervalType == "CALENDAR" && schedule.IntervalDays.HasValue)
        {
            var baseDate = schedule.LastExecutedAt ?? DateTime.UtcNow;
            schedule.NextDueDate = baseDate.AddDays(schedule.IntervalDays.Value);
        }
        else if (schedule.IntervalType == "RUNNING_HOURS" && schedule.IntervalHours.HasValue)
        {
            var baseHours = schedule.LastExecutedRunningHours ?? asset.CurrentRunningHours ?? 0;
            schedule.NextDueRunningHours = baseHours + schedule.IntervalHours.Value;
            
            // Estimate calendar date based on average hours per day
            var hoursRemaining = schedule.NextDueRunningHours.Value - (asset.CurrentRunningHours ?? 0);
            var daysRemaining = (int)(hoursRemaining / MaintenanceConstants.AVERAGE_HOURS_PER_DAY);
            schedule.NextDueDate = DateTime.UtcNow.AddDays(daysRemaining);
        }
        else if (schedule.IntervalType == "HYBRID")
        {
            // Use the earlier of the two due dates
            DateTime? calendarDue = null;
            DateTime? runningHoursDue = null;

            if (schedule.IntervalDays.HasValue)
            {
                var baseDate = schedule.LastExecutedAt ?? DateTime.UtcNow;
                calendarDue = baseDate.AddDays(schedule.IntervalDays.Value);
            }

            if (schedule.IntervalHours.HasValue)
            {
                var baseHours = schedule.LastExecutedRunningHours ?? asset.CurrentRunningHours ?? 0;
                schedule.NextDueRunningHours = baseHours + schedule.IntervalHours.Value;
                
                var hoursRemaining = schedule.NextDueRunningHours.Value - (asset.CurrentRunningHours ?? 0);
                var daysRemaining = (int)(hoursRemaining / MaintenanceConstants.AVERAGE_HOURS_PER_DAY);
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
    /// ADMIN: Force fix all past due dates in schedules and tasks
    /// Useful after system downtime or data migration
    /// </summary>
    [HttpPost("admin/fix-past-due-dates")]
    public async Task<IActionResult> FixPastDueDates()
    {
        try
        {
            var today = DateTime.UtcNow.Date;
            var fixedSchedules = 0;
            var fixedTasks = 0;
            
            // 1. Fix schedules
            var pastDueSchedules = await _context.MaintenanceSchedules
                .Where(s => s.AutoGenerate && 
                           s.NextDueDate.HasValue && 
                           s.NextDueDate.Value.Date < today &&
                           s.IntervalType == "CALENDAR" &&
                           s.IntervalDays.HasValue)
                .ToListAsync();
            
            foreach (var schedule in pastDueSchedules)
            {
                var daysPast = (today - schedule.NextDueDate!.Value.Date).Days;
                var intervalDays = schedule.IntervalDays!.Value;
                var intervalsToSkip = (int)Math.Ceiling((double)daysPast / intervalDays);
                
                schedule.NextDueDate = schedule.NextDueDate.Value.AddDays(intervalsToSkip * intervalDays);
                schedule.UpdatedAt = DateTime.UtcNow;
                fixedSchedules++;
            }
            
            await _context.SaveChangesAsync();
            
            // 2. Fix existing tasks
            var tasksToUpdate = await _context.MaintenanceTasks
                .Where(t => (t.Status == "SCHEDULED" || t.Status == "DUE" || t.Status == "OVERDUE") &&
                           t.NextDueAt < today &&
                           t.ScheduleId != null &&
                           !t.IsDeleted)
                .ToListAsync();
            
            foreach (var task in tasksToUpdate)
            {
                var schedule = pastDueSchedules.FirstOrDefault(s => s.Id == task.ScheduleId);
                if (schedule?.NextDueDate != null)
                {
                    task.NextDueAt = schedule.NextDueDate.Value;
                    task.UpdatedAt = DateTime.UtcNow;
                    
                    var daysUntilDue = (task.NextDueAt.Date - today).Days;
                    task.Status = daysUntilDue < 0 ? "OVERDUE" : daysUntilDue == 0 ? "DUE" : "SCHEDULED";
                    fixedTasks++;
                }
            }
            
            await _context.SaveChangesAsync();
            
            return Ok(new { 
                success = true,
                fixedSchedules,
                fixedTasks,
                message = $"Fixed {fixedSchedules} schedules and {fixedTasks} tasks"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fixing past due dates");
            return StatusCode(500, new { error = "An internal error occurred." });
        }
    }}
