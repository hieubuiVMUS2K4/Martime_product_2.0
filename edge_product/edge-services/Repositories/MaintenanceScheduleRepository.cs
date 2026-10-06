using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Repositories;

public interface IMaintenanceScheduleRepository
{
    Task<List<MaintenanceSchedule>> GetAllAsync();
    Task<MaintenanceSchedule?> GetByIdAsync(Guid id);
    Task<List<MaintenanceSchedule>> GetByGroupIdAsync(Guid groupId);
    Task<List<MaintenanceSchedule>> GetDueSchedulesAsync(DateTime asOfDate);
    Task<List<MaintenanceSchedule>> GetAutoGenerateSchedulesAsync();
    Task<MaintenanceSchedule> CreateAsync(MaintenanceSchedule schedule);
    Task<MaintenanceSchedule> UpdateAsync(MaintenanceSchedule schedule);
    Task<bool> DeleteAsync(Guid id);
    Task<bool> ScheduleCodeExistsAsync(string scheduleCode);
    Task<List<ScheduleSparePart>> GetSparePartsByScheduleIdAsync(Guid scheduleId);
    Task AddSparePartsAsync(Guid scheduleId, List<ScheduleSparePart> spareParts);
    Task RemoveSparePartsAsync(Guid scheduleId);
}

public class MaintenanceScheduleRepository : IMaintenanceScheduleRepository
{
    private readonly EdgeDbContext _context;

    public MaintenanceScheduleRepository(EdgeDbContext context)
    {
        _context = context;
    }

    public async Task<List<MaintenanceSchedule>> GetAllAsync()
    {
        return await _context.MaintenanceSchedules
            .Where(s => s.IsActive)
            .OrderBy(s => s.NextDueDate)
            .ToListAsync();
    }

    public async Task<MaintenanceSchedule?> GetByIdAsync(Guid id)
    {
        return await _context.MaintenanceSchedules
            .FirstOrDefaultAsync(s => s.Id == id);
    }

    public async Task<List<MaintenanceSchedule>> GetByGroupIdAsync(Guid groupId)
    {
        return await _context.MaintenanceSchedules
            .Where(s => s.EquipmentGroupId == groupId && s.IsActive)
            .OrderBy(s => s.NextDueDate)
            .ToListAsync();
    }

    public async Task<List<MaintenanceSchedule>> GetDueSchedulesAsync(DateTime asOfDate)
    {
        return await _context.MaintenanceSchedules
            .Where(s => s.IsActive && 
                       s.AutoGenerate && 
                       s.NextDueDate != null && 
                       s.NextDueDate <= asOfDate)
            .ToListAsync();
    }

    public async Task<List<MaintenanceSchedule>> GetAutoGenerateSchedulesAsync()
    {
        // Event-driven work waits for an explicit request/voyage/docking, not the periodic scheduler.
        return await _context.MaintenanceSchedules
            .Where(s => s.IsActive && s.AutoGenerate && s.MaintenanceCategory != "DRY_DOCK"
                && s.MaintenanceCategory != "ON_DEMAND" && s.MaintenanceCategory != "VOYAGE")
            .ToListAsync();
    }

    public async Task<MaintenanceSchedule> CreateAsync(MaintenanceSchedule schedule)
    {
        schedule.CreatedAt = DateTime.UtcNow;
        schedule.UpdatedAt = DateTime.UtcNow;
        
        _context.MaintenanceSchedules.Add(schedule);
        await _context.SaveChangesAsync();
        
        return schedule;
    }

    public async Task<MaintenanceSchedule> UpdateAsync(MaintenanceSchedule schedule)
    {
        schedule.UpdatedAt = DateTime.UtcNow;
        
        // No need to call _context.MaintenanceSchedules.Update(schedule)
        // Entity is already tracked by EF Core change tracker - only modified columns will be updated
        await _context.SaveChangesAsync();
        
        return schedule;
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var schedule = await GetByIdAsync(id);
        if (schedule == null) return false;
        
        schedule.IsActive = false;
        schedule.UpdatedAt = DateTime.UtcNow;
        
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> ScheduleCodeExistsAsync(string scheduleCode)
    {
        return await _context.MaintenanceSchedules
            .AnyAsync(s => s.ScheduleCode == scheduleCode);
    }

    public async Task<List<ScheduleSparePart>> GetSparePartsByScheduleIdAsync(Guid scheduleId)
    {
        return await _context.ScheduleSpareParts
            .Where(sp => sp.ScheduleId == scheduleId)
            .ToListAsync();
    }

    public async Task AddSparePartsAsync(Guid scheduleId, List<ScheduleSparePart> spareParts)
    {
        foreach (var part in spareParts)
        {
            part.ScheduleId = scheduleId;
            part.CreatedAt = DateTime.UtcNow;
        }
        
        await _context.ScheduleSpareParts.AddRangeAsync(spareParts);
        await _context.SaveChangesAsync();
    }

    public async Task RemoveSparePartsAsync(Guid scheduleId)
    {
        var existingParts = await GetSparePartsByScheduleIdAsync(scheduleId);
        _context.ScheduleSpareParts.RemoveRange(existingParts);
        await _context.SaveChangesAsync();
    }
}
