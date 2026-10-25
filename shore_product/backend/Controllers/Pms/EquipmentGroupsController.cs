using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;

namespace ProductApi.Controllers.Pms;

[ApiController]
[Route("api/equipment-groups")]
public class EquipmentGroupsController(AppDbContext context) : ControllerBase
{
    private IQueryable<object> Groups(IQueryable<EquipmentGroup> query) => query.Select(g => new
    {
        g.Id, g.GroupCode, g.GroupName, g.Category, g.Department, g.PicRole,
        g.Description, g.IsActive, g.VesselId,
        MemberCount = context.EquipmentGroupMembers.Count(m => m.GroupId == g.Id)
    });

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? vesselId = null)
    {
        var query = context.EquipmentGroups.AsNoTracking().Where(g => g.IsActive);
        if (vesselId.HasValue) query = query.Where(g => g.VesselId == vesselId || g.VesselId == null);
        return Ok(await Groups(query.OrderBy(g => g.GroupCode)).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var group = await Groups(context.EquipmentGroups.AsNoTracking().Where(g => g.Id == id)).FirstOrDefaultAsync();
        return group == null ? NotFound() : Ok(group);
    }

    [HttpGet("{id:guid}/members")]
    public async Task<IActionResult> GetMembers(Guid id)
    {
        if (!await context.EquipmentGroups.AnyAsync(g => g.Id == id)) return NotFound();
        return Ok(await context.EquipmentGroupMembers.AsNoTracking().Where(m => m.GroupId == id)
            .OrderBy(m => m.SequenceOrder).Select(m => new
            {
                m.Asset.Id, m.Asset.AssetCode, m.Asset.AssetName, m.Asset.Category,
                m.Asset.Location, m.Asset.CurrentRunningHours, m.Asset.IsActive
            }).ToListAsync());
    }

    [HttpGet("{id:guid}/with-assets")]
    public async Task<IActionResult> GetWithAssets(Guid id)
    {
        var group = await context.EquipmentGroups.AsNoTracking().FirstOrDefaultAsync(g => g.Id == id);
        if (group == null) return NotFound();
        var members = await context.EquipmentGroupMembers.AsNoTracking().Where(m => m.GroupId == id)
            .OrderBy(m => m.SequenceOrder).Select(m => new
            {
                m.Asset.Id, m.Asset.AssetCode, m.Asset.AssetName, m.Asset.Category,
                m.Asset.Location, m.Asset.CurrentRunningHours, m.Asset.IsActive
            }).ToListAsync();
        return Ok(new { group.Id, group.GroupCode, group.GroupName, group.Category, group.Department,
            group.PicRole, group.Description, group.IsActive, MemberCount = members.Count, Members = members });
    }

    [HttpGet("by-asset/{assetId:guid}")]
    public async Task<IActionResult> GetByAsset(Guid assetId) => Ok(await Groups(
        context.EquipmentGroups.AsNoTracking().Where(g => g.IsActive &&
            context.EquipmentGroupMembers.Any(m => m.GroupId == g.Id && m.AssetId == assetId))).ToListAsync());

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] EquipmentGroup dto)
    {
        if (string.IsNullOrWhiteSpace(dto.GroupCode) || string.IsNullOrWhiteSpace(dto.GroupName))
            return BadRequest(new { error = "Group code and name are required" });
        if (await context.EquipmentGroups.AnyAsync(g => g.GroupCode == dto.GroupCode.Trim()))
            return Conflict(new { error = "Group code already exists" });
        var group = new EquipmentGroup { VesselId = dto.VesselId };
        Apply(group, dto);
        context.EquipmentGroups.Add(group);
        await context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = group.Id }, new
        { group.Id, group.GroupCode, group.GroupName, group.Category, group.Department,
            group.PicRole, group.Description, group.IsActive, MemberCount = 0 });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] EquipmentGroup dto)
    {
        var group = await context.EquipmentGroups.FindAsync(id);
        if (group == null) return NotFound();
        if (string.IsNullOrWhiteSpace(dto.GroupCode) || string.IsNullOrWhiteSpace(dto.GroupName))
            return BadRequest(new { error = "Group code and name are required" });
        if (await context.EquipmentGroups.AnyAsync(g => g.Id != id && g.GroupCode == dto.GroupCode.Trim()))
            return Conflict(new { error = "Group code already exists" });
        Apply(group, dto);
        await context.SaveChangesAsync();
        return await GetById(id);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var group = await context.EquipmentGroups.FindAsync(id);
        if (group == null) return NotFound();
        // Preserve links used by historical schedules and maintenance records.
        group.IsActive = false;
        group.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{groupId:guid}/assets/{assetId:guid}")]
    public async Task<IActionResult> AddAsset(Guid groupId, Guid assetId)
    {
        var group = await context.EquipmentGroups.AsNoTracking().FirstOrDefaultAsync(g => g.Id == groupId && g.IsActive);
        var asset = await context.EquipmentAssets.AsNoTracking().FirstOrDefaultAsync(a => a.Id == assetId && a.IsActive);
        if (group == null || asset == null) return NotFound();
        if (group.VesselId.HasValue && asset.VesselId.HasValue && group.VesselId != asset.VesselId)
            return BadRequest(new { error = "Group and asset belong to different vessels" });
        if (await context.EquipmentGroupMembers.AnyAsync(m => m.GroupId == groupId && m.AssetId == assetId))
            return NoContent();
        context.EquipmentGroupMembers.Add(new EquipmentGroupMember { GroupId = groupId, AssetId = assetId });
        await context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{groupId:guid}/assets/{assetId:guid}")]
    public async Task<IActionResult> RemoveAsset(Guid groupId, Guid assetId)
    {
        var member = await context.EquipmentGroupMembers.FirstOrDefaultAsync(m => m.GroupId == groupId && m.AssetId == assetId);
        if (member == null) return NotFound();
        context.EquipmentGroupMembers.Remove(member);
        await context.SaveChangesAsync();
        return NoContent();
    }

    private static void Apply(EquipmentGroup group, EquipmentGroup dto)
    {
        group.GroupCode = dto.GroupCode.Trim();
        group.GroupName = dto.GroupName.Trim();
        group.Category = dto.Category;
        group.Department = dto.Department;
        group.PicRole = dto.PicRole;
        group.Description = dto.Description;
        group.IsActive = dto.IsActive;
        group.UpdatedAt = DateTime.UtcNow;
    }
}
