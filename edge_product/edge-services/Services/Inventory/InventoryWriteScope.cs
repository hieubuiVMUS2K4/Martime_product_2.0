using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace MaritimeEdge.Services.Inventory;

/// <summary>
/// Serializes the inventory declaration, adjustment and receipt endpoints before
/// they read stock. The transaction also includes their automatic sync queue entries.
/// </summary>
internal static class InventoryWriteScope
{
    public static async Task<IDbContextTransaction?> BeginAsync(EdgeDbContext context)
    {
        if (!context.Database.IsRelational()) return null;

        var transaction = await context.Database.BeginTransactionAsync();
        try
        {
            if (context.Database.IsNpgsql())
            {
                // One transaction-scoped lock per database; released on commit/rollback.
                await context.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(7311042026)");
            }
            return transaction;
        }
        catch
        {
            await transaction.DisposeAsync();
            throw;
        }
    }

    public static async Task RefreshTotalsAsync(EdgeDbContext context, IEnumerable<Guid> materialIds)
    {
        var ids = materialIds.Distinct().ToArray();
        // Load every location. Tracking queries retain pending changes to existing rows.
        await context.InventoryStocks.Where(s => ids.Contains(s.MaterialItemId)).LoadAsync();
        var stocks = context.InventoryStocks.Local.ToList();
        foreach (var id in ids)
        {
            var material = await context.MaterialItems.FindAsync(id);
            if (material == null) continue;
            material.OnHandQuantity = (double)stocks.Where(s => s.MaterialItemId == id).Sum(s => s.Quantity);
            material.UpdatedAt = DateTime.UtcNow;
        }
    }
}
