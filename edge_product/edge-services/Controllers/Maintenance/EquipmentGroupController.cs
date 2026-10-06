using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Models;

namespace MaritimeEdge.Controllers.Maintenance;

[ApiController]
[Route("api/equipment-groups")]
public class EquipmentGroupController : ControllerBase
{
    private readonly EdgeDbContext _context;
    private readonly ILogger<EquipmentGroupController> _logger;

    public EquipmentGroupController(EdgeDbContext context, ILogger<EquipmentGroupController> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Get all equipment groups
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<EquipmentGroupDto>>> GetAll()
    {
        try
        {
            var groups = await _context.EquipmentGroups
                .Where(g => g.IsActive)
                .OrderBy(g => g.GroupCode)
                .Select(g => new EquipmentGroupDto
                {
                    Id = g.Id,
                    GroupCode = g.GroupCode,
                    GroupName = g.GroupName,
                    Category = g.Category,
                    Department = g.Department,
                    PicRole = g.PicRole,
                    PicCrewId = g.PicCrewId,
                    Description = g.Description,
                    IsActive = g.IsActive,
                    MemberCount = _context.EquipmentGroupMembers.Count(egm => egm.GroupId == g.Id)
                })
                .ToListAsync();

            return Ok(groups);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting equipment groups");
            return StatusCode(500, new { error = "Failed to retrieve equipment groups" });
        }
    }

    /// <summary>
    /// Get equipment group by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<EquipmentGroupDto>> GetById(Guid id)
    {
        try
        {
            var group = await _context.EquipmentGroups
                .Where(g => g.Id == id)
                .Select(g => new EquipmentGroupDto
                {
                    Id = g.Id,
                    GroupCode = g.GroupCode,
                    GroupName = g.GroupName,
                    Category = g.Category,
                    Department = g.Department,
                    PicRole = g.PicRole,
                    PicCrewId = g.PicCrewId,
                    Description = g.Description,
                    IsActive = g.IsActive,
                    MemberCount = _context.EquipmentGroupMembers.Count(egm => egm.GroupId == g.Id)
                })
                .FirstOrDefaultAsync();

            if (group == null)
                return NotFound(new { error = "Equipment group not found" });

            return Ok(group);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting equipment group {Id}", id);
            return StatusCode(500, new { error = "Failed to retrieve equipment group" });
        }
    }

    /// <summary>
    /// Get equipment group members with asset details
    /// </summary>
    [HttpGet("{id}/members")]
    public async Task<ActionResult<List<GroupMemberAssetDto>>> GetMembers(Guid id)
    {
        try
        {
            var members = await _context.EquipmentGroupMembers
                .Where(egm => egm.GroupId == id)
                .Include(egm => egm.Asset)
                .OrderBy(egm => egm.SequenceOrder)
                .Select(egm => new GroupMemberAssetDto
                {
                    Id = egm.Asset.Id,
                    AssetCode = egm.Asset.AssetCode,
                    AssetName = egm.Asset.AssetName,
                    Category = egm.Asset.Category,
                    Location = egm.Asset.Location,
                    CurrentRunningHours = egm.Asset.CurrentRunningHours,
                    IsActive = egm.Asset.IsActive
                })
                .ToListAsync();

            return Ok(members);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting equipment group members for {Id}", id);
            return StatusCode(500, new { error = "Failed to retrieve group members" });
        }
    }

    /// <summary>
    /// Create new equipment group
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<EquipmentGroupDto>> Create([FromBody] CreateEquipmentGroupRequest request)
    {
        try
        {
            // Validate required fields
            if (string.IsNullOrWhiteSpace(request.GroupCode) || string.IsNullOrWhiteSpace(request.GroupName))
            {
                return BadRequest(new { error = "GroupCode and GroupName are required" });
            }

            // Check for duplicate group code
            var exists = await _context.EquipmentGroups.AnyAsync(g => g.GroupCode == request.GroupCode);
            if (exists)
            {
                return BadRequest(new { error = "Equipment group with this code already exists" });
            }

            // Create new group
            var group = new EquipmentGroup
            {
                Id = Guid.NewGuid(),
                GroupCode = request.GroupCode,
                GroupName = request.GroupName,
                Category = request.Category,
                Department = request.Department,
                PicRole = request.PicRole,
                PicCrewId = request.PicCrewId,
                Description = request.Description,
                IsActive = request.IsActive ?? true,
                CreatedAt = DateTime.UtcNow
            };

            _context.EquipmentGroups.Add(group);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Created equipment group {GroupCode} - {GroupName}", group.GroupCode, group.GroupName);

            // Return created group
            var dto = new EquipmentGroupDto
            {
                Id = group.Id,
                GroupCode = group.GroupCode,
                GroupName = group.GroupName,
                Category = group.Category,
                Department = group.Department,
                PicRole = group.PicRole,
                PicCrewId = group.PicCrewId,
                Description = group.Description,
                IsActive = group.IsActive,
                MemberCount = 0
            };

            return CreatedAtAction(nameof(GetById), new { id = group.Id }, dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating equipment group");
            return StatusCode(500, new { error = "Failed to create equipment group" });
        }
    }

    /// <summary>
    /// Update equipment group
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<EquipmentGroupDto>> Update(Guid id, [FromBody] UpdateEquipmentGroupRequest request)
    {
        try
        {
            var group = await _context.EquipmentGroups.FindAsync(id);
            if (group == null)
            {
                return NotFound(new { error = "Equipment group not found" });
            }

            // Check for duplicate group code (excluding current group)
            if (!string.IsNullOrWhiteSpace(request.GroupCode) && request.GroupCode != group.GroupCode)
            {
                var exists = await _context.EquipmentGroups.AnyAsync(g => g.GroupCode == request.GroupCode && g.Id != id);
                if (exists)
                {
                    return BadRequest(new { error = "Equipment group with this code already exists" });
                }
            }

            // Update fields
            if (!string.IsNullOrWhiteSpace(request.GroupCode))
                group.GroupCode = request.GroupCode;
            if (!string.IsNullOrWhiteSpace(request.GroupName))
                group.GroupName = request.GroupName;
            
            group.Category = request.Category;
            group.Department = request.Department;
            group.PicRole = request.PicRole;
            group.PicCrewId = request.PicCrewId;
            group.Description = request.Description;
            
            if (request.IsActive.HasValue)
                group.IsActive = request.IsActive.Value;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Updated equipment group {Id} - {GroupCode}", id, group.GroupCode);

            // Return updated group
            var dto = new EquipmentGroupDto
            {
                Id = group.Id,
                GroupCode = group.GroupCode,
                GroupName = group.GroupName,
                Category = group.Category,
                Department = group.Department,
                PicRole = group.PicRole,
                PicCrewId = group.PicCrewId,
                Description = group.Description,
                IsActive = group.IsActive,
                MemberCount = await _context.EquipmentGroupMembers.CountAsync(egm => egm.GroupId == group.Id)
            };

            return Ok(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating equipment group {Id}", id);
            return StatusCode(500, new { error = "Failed to update equipment group" });
        }
    }

    /// <summary>
    /// Delete equipment group
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        try
        {
            var group = await _context.EquipmentGroups.FindAsync(id);
            if (group == null)
            {
                return NotFound(new { error = "Equipment group not found" });
            }

            // Check if group has maintenance schedules
            var hasSchedules = await _context.MaintenanceSchedules.AnyAsync(s => s.EquipmentGroupId == id);
            if (hasSchedules)
            {
                return BadRequest(new { error = "Cannot delete group with active maintenance schedules. Please delete or reassign schedules first." });
            }

            // Delete all group members
            var members = await _context.EquipmentGroupMembers.Where(egm => egm.GroupId == id).ToListAsync();
            _context.EquipmentGroupMembers.RemoveRange(members);

            // Delete group
            _context.EquipmentGroups.Remove(group);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Deleted equipment group {Id} - {GroupCode} and {MemberCount} members", id, group.GroupCode, members.Count);

            return Ok(new { message = "Equipment group deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting equipment group {Id}", id);
            return StatusCode(500, new { error = "Failed to delete equipment group" });
        }
    }

    /// <summary>
    /// Add asset to equipment group
    /// </summary>
    [HttpPost("{groupId}/assets/{assetId}")]
    public async Task<ActionResult> AddAsset(Guid groupId, Guid assetId)
    {
        try
        {
            // Check if group exists
            var groupExists = await _context.EquipmentGroups.AnyAsync(g => g.Id == groupId);
            if (!groupExists)
                return NotFound(new { error = "Equipment group not found" });

            // Check if asset exists
            var assetExists = await _context.EquipmentAssets.AnyAsync(a => a.Id == assetId);
            if (!assetExists)
                return NotFound(new { error = "Equipment asset not found" });

            // Check if already member
            var existingMember = await _context.EquipmentGroupMembers
                .FirstOrDefaultAsync(egm => egm.GroupId == groupId && egm.AssetId == assetId);

            if (existingMember != null)
                return BadRequest(new { error = "Asset is already a member of this group" });

            // Get max sequence order
            var maxSequence = await _context.EquipmentGroupMembers
                .Where(egm => egm.GroupId == groupId)
                .MaxAsync(egm => (int?)egm.SequenceOrder) ?? 0;

            // Add member
            var member = new EquipmentGroupMember
            {
                Id = Guid.NewGuid(),
                GroupId = groupId,
                AssetId = assetId,
                SequenceOrder = maxSequence + 1,
                CreatedAt = DateTime.UtcNow
            };

            _context.EquipmentGroupMembers.Add(member);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Asset added to group successfully" });
        }
        catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException { SqlState: "23505" })
        {
            return Conflict(new { error = "Asset is already a member of this group" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding asset {AssetId} to group {GroupId}", assetId, groupId);
            return StatusCode(500, new { error = "Failed to add asset to group" });
        }
    }

    /// <summary>
    /// Remove asset from equipment group
    /// </summary>
    [HttpDelete("{groupId}/assets/{assetId}")]
    public async Task<ActionResult> RemoveAsset(Guid groupId, Guid assetId)
    {
        try
        {
            var member = await _context.EquipmentGroupMembers
                .FirstOrDefaultAsync(egm => egm.GroupId == groupId && egm.AssetId == assetId);

            if (member == null)
                return NotFound(new { error = "Asset is not a member of this group" });

            _context.EquipmentGroupMembers.Remove(member);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Asset removed from group successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing asset {AssetId} from group {GroupId}", assetId, groupId);
            return StatusCode(500, new { error = "Failed to remove asset from group" });
        }
    }

    /// <summary>
    /// Get all groups that an asset belongs to
    /// </summary>
    [HttpGet("by-asset/{assetId}")]
    public async Task<ActionResult<List<EquipmentGroupDto>>> GetGroupsByAsset(Guid assetId)
    {
        try
        {
            var groups = await _context.EquipmentGroupMembers
                .Where(egm => egm.AssetId == assetId)
                .Include(egm => egm.Group)
                .Select(egm => new EquipmentGroupDto
                {
                    Id = egm.Group.Id,
                    GroupCode = egm.Group.GroupCode,
                    GroupName = egm.Group.GroupName,
                    Category = egm.Group.Category,
                    Description = egm.Group.Description,
                    IsActive = egm.Group.IsActive,
                    MemberCount = _context.EquipmentGroupMembers.Count(m => m.GroupId == egm.GroupId)
                })
                .ToListAsync();

            return Ok(groups);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting groups for asset {AssetId}", assetId);
            return StatusCode(500, new { error = "Failed to retrieve asset groups" });
        }
    }
}

public class EquipmentGroupDto
{
    public Guid Id { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public string GroupName { get; set; } = string.Empty;
    public string? Category { get; set; }
    public string? Department { get; set; }
    public string? PicRole { get; set; }
    public string? PicCrewId { get; set; }
    public string? Description { get; set; }
    public bool IsActive { get; set; }
    public int MemberCount { get; set; }
}

public class CreateEquipmentGroupRequest
{
    public string GroupCode { get; set; } = string.Empty;
    public string GroupName { get; set; } = string.Empty;
    public string? Category { get; set; }
    public string? Department { get; set; }
    public string? PicRole { get; set; }
    public string? PicCrewId { get; set; }
    public string? Description { get; set; }
    public bool? IsActive { get; set; }
}

public class UpdateEquipmentGroupRequest
{
    public string? GroupCode { get; set; }
    public string? GroupName { get; set; }
    public string? Category { get; set; }
    public string? Department { get; set; }
    public string? PicRole { get; set; }
    public string? PicCrewId { get; set; }
    public string? Description { get; set; }
    public bool? IsActive { get; set; }
}

public class GroupMemberAssetDto
{
    public Guid Id { get; set; }
    public string AssetCode { get; set; } = string.Empty;
    public string AssetName { get; set; } = string.Empty;
    public string? Category { get; set; }
    public string? Location { get; set; }
    public double? CurrentRunningHours { get; set; }
    public bool IsActive { get; set; }
}
