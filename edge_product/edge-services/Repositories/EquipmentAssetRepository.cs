using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Repositories;

public interface IEquipmentAssetRepository
{
    Task<List<EquipmentAsset>> GetAllAsync();
    Task<EquipmentAsset?> GetByIdAsync(Guid id);
    Task<EquipmentAsset?> GetByAssetCodeAsync(string assetCode);
    Task<List<EquipmentAsset>> GetByCategoryAsync(string category);
    Task<List<EquipmentAsset>> GetByGroupIdAsync(Guid groupId);
    Task<EquipmentAsset> CreateAsync(EquipmentAsset asset);
    Task<EquipmentAsset> UpdateAsync(EquipmentAsset asset);
    Task<bool> DeleteAsync(Guid id);
    Task<bool> AssetCodeExistsAsync(string assetCode);
    Task<int> BulkCreateAsync(List<EquipmentAsset> assets);
    Task UpdateRunningHoursAsync(Guid assetId, double runningHours);
}

public class EquipmentAssetRepository : IEquipmentAssetRepository
{
    private readonly EdgeDbContext _context;

    public EquipmentAssetRepository(EdgeDbContext context)
    {
        _context = context;
    }

    public async Task<List<EquipmentAsset>> GetAllAsync()
    {
        return await _context.EquipmentAssets
            .Where(a => a.IsActive)
            .OrderBy(a => a.Category)
            .ThenBy(a => a.AssetCode)
            .ToListAsync();
    }

    public async Task<EquipmentAsset?> GetByIdAsync(Guid id)
    {
        return await _context.EquipmentAssets
            .FirstOrDefaultAsync(a => a.Id == id);
    }

    public async Task<EquipmentAsset?> GetByAssetCodeAsync(string assetCode)
    {
        return await _context.EquipmentAssets
            .FirstOrDefaultAsync(a => a.AssetCode == assetCode);
    }

    public async Task<List<EquipmentAsset>> GetByCategoryAsync(string category)
    {
        return await _context.EquipmentAssets
            .Where(a => a.Category == category && a.IsActive)
            .OrderBy(a => a.AssetCode)
            .ToListAsync();
    }

    public async Task<List<EquipmentAsset>> GetByGroupIdAsync(Guid groupId)
    {
        return await _context.EquipmentAssets
            .Where(a => a.IsActive && (a.EquipmentGroupId == groupId ||
                _context.EquipmentGroupMembers.Any(m => m.GroupId == groupId && m.AssetId == a.Id)))
            .OrderBy(a => a.AssetCode)
            .ToListAsync();
    }

    public async Task<EquipmentAsset> CreateAsync(EquipmentAsset asset)
    {
        asset.CreatedAt = DateTime.UtcNow;
        asset.UpdatedAt = DateTime.UtcNow;
        
        _context.EquipmentAssets.Add(asset);
        await _context.SaveChangesAsync();
        
        return asset;
    }

    public async Task<EquipmentAsset> UpdateAsync(EquipmentAsset asset)
    {
        asset.UpdatedAt = DateTime.UtcNow;
        
        // No need to call _context.EquipmentAssets.Update(asset)
        // Entity is already tracked by EF Core change tracker - only modified columns will be updated
        await _context.SaveChangesAsync();
        
        return asset;
    }

    public async Task<bool> DeleteAsync(Guid id)
    {
        var asset = await GetByIdAsync(id);
        if (asset == null) return false;
        
        asset.IsActive = false;
        asset.UpdatedAt = DateTime.UtcNow;
        
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> AssetCodeExistsAsync(string assetCode)
    {
        return await _context.EquipmentAssets
            .AnyAsync(a => a.AssetCode == assetCode);
    }

    public async Task<int> BulkCreateAsync(List<EquipmentAsset> assets)
    {
        var now = DateTime.UtcNow;
        foreach (var asset in assets)
        {
            asset.CreatedAt = now;
            asset.UpdatedAt = now;
        }
        
        await _context.EquipmentAssets.AddRangeAsync(assets);
        return await _context.SaveChangesAsync();
    }

    public async Task UpdateRunningHoursAsync(Guid assetId, double runningHours)
    {
        var asset = await GetByIdAsync(assetId);
        if (asset != null)
        {
            asset.CurrentRunningHours = runningHours;
            asset.LastRunningHoursUpdate = DateTime.UtcNow;
            asset.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }
    }
}
