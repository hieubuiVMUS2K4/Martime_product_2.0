using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;

namespace ProductApi.Controllers.Pms;

[ApiController]
[Route("api/maintenance-schedules")]
public class MaintenanceSchedulesController : ControllerBase
{
    private readonly AppDbContext _context;

    public MaintenanceSchedulesController(AppDbContext context) => _context = context;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? vesselId = null)
    {
        var query = _context.MaintenanceSchedules
            .Include(s => s.SpareParts)
            .Include(s => s.ChecklistTemplates)
            .Where(s => s.IsActive)
            .AsNoTracking();
        if (vesselId.HasValue) query = query.Where(s => s.VesselId == vesselId.Value);
        var list = await query.OrderBy(s => s.ScheduleCode).ToListAsync();
        return Ok(list);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var item = await _context.MaintenanceSchedules
            .Include(s => s.SpareParts)
            .Include(s => s.ChecklistTemplates)
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == id);
        return item == null ? NotFound() : Ok(item);
    }

    [HttpGet("group/{groupId:guid}")]
    public async Task<IActionResult> GetByGroupId(Guid groupId)
    {
        var list = await _context.MaintenanceSchedules
            .Where(s => s.EquipmentGroupId == groupId && s.IsActive)
            .AsNoTracking().ToListAsync();
        return Ok(list);
    }

    [HttpGet("preview")]
    public async Task<IActionResult> GetPreview()
    {
        var list = await _context.MaintenanceSchedules
            .Where(s => s.IsActive)
            .Select(s => new
            {
                s.Id, s.ScheduleCode, s.ScheduleName,
                s.EquipmentAssetId, s.EquipmentGroupId,
                s.IntervalType, s.IntervalDays, s.IntervalHours,
                s.NextDueDate, s.Priority, s.IsActive
            })
            .AsNoTracking()
            .ToListAsync();
        return Ok(list);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] MaintenanceSchedule dto)
    {
        if (await _context.MaintenanceSchedules.AnyAsync(s => s.ScheduleCode == dto.ScheduleCode))
            return Conflict(new { message = "Schedule code already exists" });

        var entity = new MaintenanceSchedule
        {
            ScheduleCode = dto.ScheduleCode,
            ScheduleName = dto.ScheduleName,
            EquipmentAssetId = dto.EquipmentAssetId,
            EquipmentGroupId = dto.EquipmentGroupId,
            MaintenanceCategory = dto.MaintenanceCategory,
            IntervalType = dto.IntervalType,
            IntervalHours = dto.IntervalHours,
            IntervalDays = dto.IntervalDays,
            DaysBeforeDue = dto.DaysBeforeDue,
            Priority = dto.Priority,
            EstimatedDurationHours = dto.EstimatedDurationHours,
            AutoGenerate = dto.AutoGenerate,
            AssignedToRole = dto.AssignedToRole,
            Instructions = dto.Instructions,
        };

        if (dto.SpareParts?.Count > 0)
        {
            foreach (var sp in dto.SpareParts)
                entity.SpareParts.Add(new ScheduleSparePart
                {
                    MaterialItemId = sp.MaterialItemId,
                    QuantityRequired = sp.QuantityRequired,
                    IsMandatory = sp.IsMandatory,
                    Notes = sp.Notes,
                });
        }

        if (dto.ChecklistTemplates?.Count > 0)
        {
            foreach (var ct in dto.ChecklistTemplates)
                entity.ChecklistTemplates.Add(new ScheduleChecklistTemplate
                {
                    SequenceOrder = ct.SequenceOrder,
                    CheckpointDescription = ct.CheckpointDescription,
                    RequiresReading = ct.RequiresReading,
                    NormalRangeMin = ct.NormalRangeMin,
                    NormalRangeMax = ct.NormalRangeMax,
                    Unit = ct.Unit,
                });
        }

        _context.MaintenanceSchedules.Add(entity);
        await _context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, entity);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] MaintenanceSchedule dto)
    {
        var entity = await _context.MaintenanceSchedules
            .AsTracking()
            .Include(s => s.SpareParts)
            .Include(s => s.ChecklistTemplates)
            .FirstOrDefaultAsync(s => s.Id == id);
        if (entity == null) return NotFound();

        if (entity.PmsProtocolVersion >= 2)
            return Conflict(new { code = "pms_edge_owned", message = "Công việc PMS được quản lý trên tàu. Bờ chỉ xem dữ liệu đã đồng bộ." });

        entity.ScheduleName = dto.ScheduleName;
        entity.EquipmentAssetId = dto.EquipmentAssetId;
        entity.EquipmentGroupId = dto.EquipmentGroupId;
        entity.MaintenanceCategory = dto.MaintenanceCategory;
        entity.IntervalType = dto.IntervalType;
        entity.IntervalHours = dto.IntervalHours;
        entity.IntervalDays = dto.IntervalDays;
        entity.DaysBeforeDue = dto.DaysBeforeDue;
        entity.Priority = dto.Priority;
        entity.EstimatedDurationHours = dto.EstimatedDurationHours;
        entity.AutoGenerate = dto.AutoGenerate;
        entity.AssignedToRole = dto.AssignedToRole;
        entity.Instructions = dto.Instructions;
        entity.UpdatedAt = DateTime.UtcNow;

        // Replace spare parts
        _context.ScheduleSpareParts.RemoveRange(entity.SpareParts);
        if (dto.SpareParts?.Count > 0)
            foreach (var sp in dto.SpareParts)
                entity.SpareParts.Add(new ScheduleSparePart
                {
                    ScheduleId = id, MaterialItemId = sp.MaterialItemId,
                    QuantityRequired = sp.QuantityRequired, IsMandatory = sp.IsMandatory, Notes = sp.Notes,
                });

        // Replace checklist
        _context.ScheduleChecklistTemplates.RemoveRange(entity.ChecklistTemplates);
        if (dto.ChecklistTemplates?.Count > 0)
            foreach (var ct in dto.ChecklistTemplates)
                entity.ChecklistTemplates.Add(new ScheduleChecklistTemplate
                {
                    ScheduleId = id, SequenceOrder = ct.SequenceOrder,
                    CheckpointDescription = ct.CheckpointDescription,
                    RequiresReading = ct.RequiresReading, NormalRangeMin = ct.NormalRangeMin,
                    NormalRangeMax = ct.NormalRangeMax, Unit = ct.Unit,
                });

        await _context.SaveChangesAsync();
        return Ok(entity);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var entity = await _context.MaintenanceSchedules.FindAsync(id);
        if (entity == null) return NotFound();
        if (entity.PmsProtocolVersion >= 2)
            return Conflict(new { code = "pms_edge_owned", message = "Công việc PMS được quản lý trên tàu. Bờ chỉ xem dữ liệu đã đồng bộ." });
        entity.IsActive = false;
        entity.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return NoContent();
    }
}
