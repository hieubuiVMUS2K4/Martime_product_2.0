using MaritimeEdge.Constants;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Repositories;
using MaritimeEdge.Data;
using MaritimeEdge.Services.Maintenance;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Controllers.Maintenance;

[ApiController]
[Route("api/equipment-assets")]
public class EquipmentAssetController : ControllerBase
{
    private readonly IEquipmentAssetRepository _assetRepository;
    private readonly EdgeDbContext _context;
    private readonly ILogger<EquipmentAssetController> _logger;
    private readonly MaintenanceCompletionService _completionService;

    public EquipmentAssetController(
        IEquipmentAssetRepository assetRepository,
        EdgeDbContext context,
        ILogger<EquipmentAssetController> logger,
        MaintenanceCompletionService completionService)
    {
        _assetRepository = assetRepository;
        _context = context;
        _logger = logger;
        _completionService = completionService;
    }

    /// <summary>
    /// Get all equipment assets
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<EquipmentAssetDto>>> GetAll([FromQuery] string? category = null)
    {
        try
        {
            var assets = string.IsNullOrEmpty(category)
                ? await _assetRepository.GetAllAsync()
                : await _assetRepository.GetByCategoryAsync(category);

            await LoadGroups(assets);
            var dtos = assets.Select(MapToDto).ToList();
            return Ok(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting equipment assets");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get equipment asset by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<EquipmentAssetDto>> GetById(Guid id)
    {
        try
        {
            var asset = await _assetRepository.GetByIdAsync(id);
            if (asset == null)
                return NotFound(new { error = "Equipment asset not found" });

            await LoadGroups(new[] { asset });
            return Ok(MapToDto(asset));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting equipment asset {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get equipment assets by group ID
    /// </summary>
    [HttpGet("group/{groupId}")]
    public async Task<ActionResult<List<EquipmentAssetDto>>> GetByGroupId(Guid groupId)
    {
        try
        {
            var assets = await _assetRepository.GetByGroupIdAsync(groupId);
            await LoadGroups(assets);
            var dtos = assets.Select(MapToDto).ToList();
            return Ok(dtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting equipment assets for group {GroupId}", groupId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Create new equipment asset
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<EquipmentAssetDto>> Create([FromBody] CreateEquipmentAssetDto dto)
    {
        try
        {
            // Check if asset code already exists
            if (await _assetRepository.AssetCodeExistsAsync(dto.AssetCode))
                return BadRequest(new { error = $"Asset code '{dto.AssetCode}' already exists" });
            if (dto.ParentId.HasValue && !await _context.EquipmentAssets.AnyAsync(a => a.Id == dto.ParentId && a.IsActive))
                return BadRequest(new { error = "Nhóm / thiết bị cha không tồn tại hoặc đã ngừng hoạt động." });

            if (dto.Category == "SYSTEM")
            {
                var error = await ValidateGroupPic(dto.PicCrewId);
                if (error != null) return BadRequest(new { error });
                if (await _context.EquipmentGroups.AnyAsync(g => g.GroupCode == dto.AssetCode))
                    return BadRequest(new { error = "Mã nhóm thiết bị đã tồn tại." });
                var group = new EquipmentGroup { GroupCode = dto.AssetCode, GroupName = dto.AssetName, PicCrewId = dto.PicCrewId };
                _context.EquipmentGroups.Add(group);
                dto.EquipmentGroupId = group.Id;
            }
            else if (dto.ParentId.HasValue && !dto.EquipmentGroupId.HasValue)
            {
                dto.EquipmentGroupId = await FindParentGroup(dto.ParentId);
            }

            var asset = new EquipmentAsset
            {
                AssetCode = dto.AssetCode,
                AssetName = dto.AssetName,
                Category = dto.Category,
                Manufacturer = dto.Manufacturer,
                Model = dto.Model,
                SerialNumber = dto.SerialNumber,
                InstallationDate = dto.InstallationDate,
                EquipmentGroupId = dto.EquipmentGroupId,
                ParentId = dto.ParentId,
                Location = dto.Location,
                Criticality = dto.Criticality,
                Status = dto.Status,
                TechnicalSpecs = dto.TechnicalSpecs,
                Notes = dto.Notes,
                IsActive = true
            };

            var created = await _assetRepository.CreateAsync(asset);
            await LoadGroups(new[] { created });
            _logger.LogInformation("Created equipment asset {AssetCode}", created.AssetCode);

            return CreatedAtAction(nameof(GetById), new { id = created.Id }, MapToDto(created));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating equipment asset");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Update equipment asset
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<EquipmentAssetDto>> Update(Guid id, [FromBody] UpdateEquipmentAssetDto dto)
    {
        try
        {
            var asset = await _assetRepository.GetByIdAsync(id);
            if (asset == null)
                return NotFound(new { error = "Equipment asset not found" });

            // Update required fields
            if (asset.Category == "SYSTEM")
            {
                var error = await ValidateGroupPic(dto.PicCrewId);
                if (error != null) return BadRequest(new { error });
                var group = asset.EquipmentGroupId.HasValue
                    ? await _context.EquipmentGroups.FindAsync(asset.EquipmentGroupId.Value)
                    : await _context.EquipmentGroups.FirstOrDefaultAsync(g => g.GroupCode == asset.AssetCode);
                if (group == null)
                {
                    group = new EquipmentGroup { GroupCode = asset.AssetCode, GroupName = dto.AssetName };
                    _context.EquipmentGroups.Add(group);
                }
                group.GroupName = dto.AssetName;
                group.PicCrewId = dto.PicCrewId;
                group.IsSynced = false;
                group.UpdatedAt = DateTime.UtcNow;
                asset.EquipmentGroupId = group.Id;
                // Existing descendants inherit the group unless they already belong to another group.
                var descendants = await _context.EquipmentAssets.Where(a => a.IsActive).ToListAsync();
                var pending = new Queue<Guid>();
                var visited = new HashSet<Guid>();
                pending.Enqueue(asset.Id);
                while (pending.TryDequeue(out var parent))
                {
                    if (!visited.Add(parent)) continue;
                    foreach (var child in descendants.Where(a => a.ParentId == parent))
                    {
                        if (child.Category == "SYSTEM" && child.EquipmentGroupId.HasValue) continue;
                        if (child.Category != "SYSTEM" && !child.EquipmentGroupId.HasValue)
                            child.EquipmentGroupId = group.Id;
                        pending.Enqueue(child.Id);
                    }
                }
            }
            asset.AssetName = dto.AssetName;
            asset.Criticality = dto.Criticality;
            asset.Status = dto.Status;
            asset.IsActive = dto.IsActive;

            // Update nullable fields - only if provided
            if (dto.Manufacturer != null) asset.Manufacturer = dto.Manufacturer;
            if (dto.Model != null) asset.Model = dto.Model;
            if (dto.SerialNumber != null) asset.SerialNumber = dto.SerialNumber;
            if (asset.Category != "SYSTEM" && dto.EquipmentGroupId.HasValue) asset.EquipmentGroupId = dto.EquipmentGroupId;
            if (dto.Location != null) asset.Location = dto.Location;
            if (dto.TechnicalSpecs != null) asset.TechnicalSpecs = dto.TechnicalSpecs;
            if (dto.Notes != null) asset.Notes = dto.Notes;
            
            // Update running hours if provided
            if (dto.CurrentRunningHours.HasValue)
            {
                asset.CurrentRunningHours = dto.CurrentRunningHours.Value;
                asset.LastRunningHoursUpdate = DateTime.UtcNow;
            }

            var updated = await _assetRepository.UpdateAsync(asset);
            await LoadGroups(new[] { updated });
            _logger.LogInformation("Updated equipment asset {AssetCode}", updated.AssetCode);

            return Ok(MapToDto(updated));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating equipment asset {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Delete equipment asset (soft delete)
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try
        {
            var result = await _assetRepository.DeleteAsync(id);
            if (!result)
                return NotFound(new { error = "Equipment asset not found" });

            _logger.LogInformation("Deleted equipment asset {Id}", id);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting equipment asset {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Bulk import equipment assets from Excel
    /// </summary>
    [HttpPost("import")]
    public async Task<ActionResult<object>> BulkImport([FromBody] List<ImportEquipmentAssetDto> dtos)
    {
        try
        {
            var assets = new List<EquipmentAsset>();
            var errors = new List<string>();
            var importedByCode = new Dictionary<string, EquipmentAsset>(StringComparer.OrdinalIgnoreCase);
            var pendingParents = new List<(EquipmentAsset Asset, string ParentAssetCode)>();
            var pendingGroups = new List<(EquipmentAsset Asset, Guid GroupId)>();

            foreach (var dto in dtos)
            {
                dto.AssetCode = (dto.AssetCode ?? string.Empty).Trim();
                dto.AssetName = (dto.AssetName ?? string.Empty).Trim();
                dto.Category = (dto.Category ?? string.Empty).Trim();

                if (string.IsNullOrWhiteSpace(dto.AssetCode) ||
                    string.IsNullOrWhiteSpace(dto.AssetName) ||
                    string.IsNullOrWhiteSpace(dto.Category))
                {
                    errors.Add("AssetCode, AssetName and Category are required");
                    continue;
                }

                if (importedByCode.ContainsKey(dto.AssetCode))
                {
                    errors.Add($"Asset code '{dto.AssetCode}' is duplicated in import file");
                    continue;
                }

                // Validate asset code
                if (await _assetRepository.AssetCodeExistsAsync(dto.AssetCode))
                {
                    errors.Add($"Asset code '{dto.AssetCode}' already exists");
                    continue;
                }

                // Find group by code if provided
                Guid? groupId = null;
                if (!string.IsNullOrEmpty(dto.EquipmentGroupCode))
                {
                    var group = await _context.EquipmentGroups
                        .FirstOrDefaultAsync(g => g.GroupCode == dto.EquipmentGroupCode);
                    
                    if (group != null)
                    {
                        groupId = group.Id;
                    }
                    else
                    {
                        errors.Add($"Equipment group '{dto.EquipmentGroupCode}' not found for asset '{dto.AssetCode}'");
                    }
                }

                var asset = new EquipmentAsset
                {
                    AssetCode = dto.AssetCode,
                    AssetName = dto.AssetName,
                    Category = dto.Category,
                    Manufacturer = dto.Manufacturer,
                    Model = dto.Model,
                    SerialNumber = dto.SerialNumber,
                    Location = dto.Location,
                    Criticality = dto.Criticality,
                    Status = "ACTIVE",
                    IsActive = true
                };

                assets.Add(asset);
                importedByCode[asset.AssetCode] = asset;

                if (!string.IsNullOrWhiteSpace(dto.ParentAssetCode))
                    pendingParents.Add((asset, dto.ParentAssetCode.Trim()));

                // Add to group if found
                if (groupId.HasValue)
                {
                    pendingGroups.Add((asset, groupId.Value));
                }
            }

            if (assets.Count == 0)
                return BadRequest(new { error = "No valid assets to import", errors });

            var parentCodesFromDb = pendingParents
                .Select(p => p.ParentAssetCode)
                .Where(code => !importedByCode.ContainsKey(code))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var parentAssetsFromDb = parentCodesFromDb.Count == 0
                ? new Dictionary<string, EquipmentAsset>(StringComparer.OrdinalIgnoreCase)
                : await _context.EquipmentAssets
                    .Where(a => parentCodesFromDb.Contains(a.AssetCode))
                    .ToDictionaryAsync(a => a.AssetCode, StringComparer.OrdinalIgnoreCase);

            foreach (var pending in pendingParents)
            {
                if (importedByCode.TryGetValue(pending.ParentAssetCode, out var parent) ||
                    parentAssetsFromDb.TryGetValue(pending.ParentAssetCode, out parent))
                {
                    pending.Asset.ParentId = parent.Id;
                }
                else
                {
                    errors.Add($"Parent asset '{pending.ParentAssetCode}' not found for asset '{pending.Asset.AssetCode}'");
                    assets.Remove(pending.Asset);
                }
            }

            if (assets.Count == 0)
                return BadRequest(new { error = "No valid assets to import", errors });

            foreach (var pending in pendingGroups.Where(p => assets.Contains(p.Asset)))
            {
                _context.EquipmentGroupMembers.Add(new EquipmentGroupMember
                {
                    GroupId = pending.GroupId,
                    AssetId = pending.Asset.Id,
                    CreatedAt = DateTime.UtcNow
                });
            }

            var importedCount = assets.Count;
            await _assetRepository.BulkCreateAsync(assets);
            await _context.SaveChangesAsync(); // Save group memberships
            
            _logger.LogInformation("Imported {Count} equipment assets", importedCount);

            return Ok(new
            {
                success = errors.Count == 0,
                imported = importedCount,
                errors = errors.Count > 0 ? errors : null
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error importing equipment assets");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Update running hours for equipment
    /// </summary>
    [HttpPatch("{id}/running-hours")]
    public async Task<ActionResult> UpdateRunningHours(Guid id, [FromBody] double runningHours)
    {
        try
        {
            // Snapshot trước khi update: dùng để tính tốc độ chạy thực tế
            var asset = await _context.EquipmentAssets.FindAsync(id);
            if (asset == null) return NotFound();
            var previousRH = asset.CurrentRunningHours ?? 0;
            var lastUpdate = asset.LastRunningHoursUpdate;

            if (runningHours < previousRH)
            {
                return BadRequest(new
                {
                    code = "RUNNING_HOURS_BELOW_CURRENT",
                    error = "Running hours cannot be lower than current equipment running hours",
                    current = previousRH,
                    requested = runningHours
                });
            }

            await _assetRepository.UpdateRunningHoursAsync(id, runningHours);
            _logger.LogInformation("Updated running hours for asset {Id}: {Hours}", id, runningHours);
            
            // Check PERIODIC schedules and promote SCHEDULED → DUE if threshold reached
            var triggeredCount = await CheckAndPromoteTasksByRunningHours(id, runningHours);
            if (triggeredCount > 0)
                _logger.LogInformation("Promoted {Count} tasks to DUE for asset {Id} at {Hours}h", triggeredCount, id, runningHours);

            // Counter-centric flow: skip auto-recalculating NextDueDate for RUNNING_HOURS.
            // Status promotion remains handled by CheckAndPromoteTasksByRunningHours.
            _logger.LogDebug("Skip RecalcNextDueDateByActualRate for asset {Id} in counter-centric mode", id);
            
            return Ok(new { triggeredTasks = triggeredCount });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating running hours for asset {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Check all PERIODIC/RUNNING_HOURS schedules for this asset.
    /// This is the SOLE mechanism for promoting RUNNING_HOURS tasks.
    /// Promote tasks based on running hours:
    ///   SCHEDULED → UPCOMING (within window)
    ///   SCHEDULED/UPCOMING → DUE (threshold reached)
    ///   DUE → OVERDUE (threshold exceeded by > buffer)
    /// </summary>
    private async Task<int> CheckAndPromoteTasksByRunningHours(Guid assetId, double currentRunningHours)
    {
        // Find all active PERIODIC schedules for this asset with RUNNING_HOURS interval
        var schedules = await _context.MaintenanceSchedules
            .Where(s => s.IsActive &&
                        s.EquipmentAssetId == assetId &&
                        s.MaintenanceCategory == "PERIODIC" &&
                        s.IntervalType == "RUNNING_HOURS" &&
                        s.NextDueRunningHours.HasValue)
            .ToListAsync();

        if (!schedules.Any()) return 0;

        int promoted = 0;
        foreach (var schedule in schedules)
        {
            var nextDueRH = schedule.NextDueRunningHours!.Value;

            // Find active task for this schedule (SCHEDULED, UPCOMING, or DUE status)
            var task = await _context.MaintenanceTasks
                .FirstOrDefaultAsync(t => !t.IsDeleted &&
                                         t.ScheduleId == schedule.Id &&
                                         (t.Status == "SCHEDULED" || t.Status == "UPCOMING" || t.Status == "DUE"));

            if (task == null)
            {
                // No active task — previous recurrence likely failed (old code path).
                // Attempt recovery: recalculate NextDueRunningHours and generate a new task.
                if (schedule.AutoGenerate && schedule.MaintenanceCategory == "PERIODIC")
                    await _completionService.RecoverMissingCycleTaskAsync(schedule, currentRunningHours);
                continue;
            }

            var hoursUntilDue = nextDueRH - currentRunningHours;

            if (currentRunningHours >= nextDueRH)
            {
                // Running hours reached or exceeded threshold
                var newStatus = hoursUntilDue < -(schedule.IntervalHours ?? 500) * 0.1 ? "OVERDUE" : "DUE";
                if (task.Status != newStatus)
                {
                    var oldStatus = task.Status;
                    task.Status = newStatus;
                    task.UpdatedAt = DateTime.UtcNow;
                    promoted++;
                    _logger.LogInformation("Task {TaskId} promoted {Old} → {New}: currentRH={Current} vs nextDueRH={NextDue}",
                        task.TaskId, oldStatus, newStatus, currentRunningHours, nextDueRH);
                }
            }
            else if (task.Status == "SCHEDULED")
            {
                // DaysBeforeDue for RUNNING_HOURS stores the window directly in hours
                // (user enters hours in the config form, no conversion needed)
                var windowHours = schedule.DaysBeforeDue > 0 ? (double)schedule.DaysBeforeDue : MaintenanceConstants.MINIMUM_UPCOMING_WINDOW_HOURS;

                if (hoursUntilDue <= windowHours)
                {
                    task.Status = "UPCOMING";
                    task.UpdatedAt = DateTime.UtcNow;
                    promoted++;
                    _logger.LogInformation("Task {TaskId} promoted SCHEDULED → UPCOMING: {HoursLeft}h remaining (window={Window}h)",
                        task.TaskId, hoursUntilDue, windowHours);
                }
            }
        }

        if (promoted > 0)
            await _context.SaveChangesAsync();

        return promoted;
    }

    /// <summary>
    /// Recalc NextDueDate cho tất cả RUNNING_HOURS schedules dựa trên tốc độ chạy thực tế.
    /// avgHoursPerDay = (newRH - oldRH) / daysSinceLastUpdate
    /// NextDueDate = now + (NextDueRH - currentRH) / avgHoursPerDay
    /// Fallback: nếu không đủ dữ liệu (lần cập nhật đầu tiên) → dùng AVERAGE_HOURS_PER_DAY
    /// </summary>
    private async Task RecalcNextDueDateByActualRate(Guid assetId, double currentRH, double previousRH, DateTime? lastUpdate)
    {
        // Tính tốc độ chạy thực tế (giờ/ngày)
        double avgHoursPerDay = MaintenanceConstants.AVERAGE_HOURS_PER_DAY; // fallback
        if (lastUpdate.HasValue && currentRH > previousRH)
        {
            var daysSinceLastUpdate = (DateTime.UtcNow - lastUpdate.Value).TotalDays;
            if (daysSinceLastUpdate >= 0.04) // ít nhất ~1 giờ giữa 2 lần update
            {
                var calculatedRate = (currentRH - previousRH) / daysSinceLastUpdate;
                if (calculatedRate > 0.5) // ít nhất 0.5h/ngày để tránh chia bé quá → ngày quá xa
                    avgHoursPerDay = calculatedRate;
            }
        }

        var schedules = await _context.MaintenanceSchedules
            .Where(s => s.IsActive &&
                        s.EquipmentAssetId == assetId &&
                        s.MaintenanceCategory == "PERIODIC" &&
                        s.IntervalType == "RUNNING_HOURS" &&
                        s.NextDueRunningHours.HasValue)
            .ToListAsync();

        if (!schedules.Any()) return;

        foreach (var schedule in schedules)
        {
            var hoursRemaining = schedule.NextDueRunningHours!.Value - currentRH;
            if (hoursRemaining <= 0)
            {
                // Đã đến/quá hạn → NextDueDate = bây giờ
                schedule.NextDueDate = DateTime.UtcNow;
            }
            else
            {
                var daysRemaining = (int)Math.Max(Math.Ceiling(hoursRemaining / avgHoursPerDay), 1);
                schedule.NextDueDate = DateTime.UtcNow.AddDays(daysRemaining);
            }
        }

        await _context.SaveChangesAsync();
        _logger.LogInformation(
            "Recalculated NextDueDate for {Count} schedules on asset {AssetId} (rate={Rate:F1}h/day, prevRH={Prev}, newRH={New})",
            schedules.Count, assetId, avgHoursPerDay, previousRH, currentRH);
    }

    private async Task<string?> ValidateGroupPic(string? crewId)
    {
        if (string.IsNullOrWhiteSpace(crewId)) return "Vui lòng chọn người phụ trách nhóm thiết bị.";
        return await _context.CrewMembers.AnyAsync(c => c.CrewId == crewId && c.IsOnboard)
            ? null : "Người phụ trách phải là thuyền viên đang trên tàu.";
    }

    private async Task<Guid?> FindParentGroup(Guid? parentId)
    {
        var visited = new HashSet<Guid>();
        while (parentId.HasValue && visited.Add(parentId.Value))
        {
            var parent = await _context.EquipmentAssets.FindAsync(parentId.Value);
            if (parent == null) break;
            if (parent.EquipmentGroupId.HasValue) return parent.EquipmentGroupId;
            parentId = parent.ParentId;
        }
        return null;
    }

    private async Task LoadGroups(IEnumerable<EquipmentAsset> assets)
    {
        var ids = assets.Where(a => a.EquipmentGroupId.HasValue).Select(a => a.EquipmentGroupId!.Value).Distinct().ToList();
        await _context.EquipmentGroups.Where(g => ids.Contains(g.Id)).LoadAsync();
        var crewIds = _context.EquipmentGroups.Local.Where(g => ids.Contains(g.Id) && g.PicCrewId != null)
            .Select(g => g.PicCrewId!).Distinct().ToList();
        await _context.CrewMembers.Where(c => crewIds.Contains(c.CrewId)).LoadAsync();
    }

    private EquipmentAssetDto MapToDto(EquipmentAsset asset)
    {
        return new EquipmentAssetDto
        {
            Id = asset.Id,
            DefaultExecutorRole = asset.DefaultExecutorRole,
            ApproverRole = asset.ApproverRole,
            IsSynced = asset.IsSynced,
            CreatedAt = asset.CreatedAt,
            UpdatedAt = asset.UpdatedAt,
            OriginNode = asset.OriginNode,
            AssetCode = asset.AssetCode,
            AssetName = asset.AssetName,
            Category = asset.Category,
            Manufacturer = asset.Manufacturer,
            Model = asset.Model,
            SerialNumber = asset.SerialNumber,
            InstallationDate = asset.InstallationDate,
            CurrentRunningHours = asset.CurrentRunningHours,
            LastRunningHoursUpdate = asset.LastRunningHoursUpdate,
            EquipmentGroupId = asset.EquipmentGroupId,
            PicCrewId = _context.EquipmentGroups.Local.FirstOrDefault(g => g.Id == asset.EquipmentGroupId)?.PicCrewId,
            PicCrewName = _context.CrewMembers.Local.FirstOrDefault(c => c.CrewId ==
                _context.EquipmentGroups.Local.FirstOrDefault(g => g.Id == asset.EquipmentGroupId)?.PicCrewId)?.FullName,
            ParentId = asset.ParentId,
            Location = asset.Location,
            Criticality = asset.Criticality,
            Status = asset.Status,
            TechnicalSpecs = asset.TechnicalSpecs,
            Notes = asset.Notes,
            IsActive = asset.IsActive
        };
    }

    /// <summary>
    /// Get all equipment assets as a flat list with parentId (frontend builds the tree)
    /// </summary>
    [HttpGet("tree")]
    public async Task<ActionResult<List<EquipmentAssetDto>>> GetTree()
    {
        try
        {
            var assets = await _context.EquipmentAssets
                .Where(a => a.IsActive)
                .OrderBy(a => a.AssetCode)
                .ToListAsync();

            await LoadGroups(assets);
            return Ok(assets.Select(MapToDto).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting equipment asset tree");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }
}
