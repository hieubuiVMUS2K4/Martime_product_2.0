using System.Globalization;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Services.Inventory;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

/// <summary>Business code only. TaskId, UUIDs, checklist keys and signed snapshots stay immutable.</summary>
public static class PmsWorkOrderCodes
{
    private static string Prefix(DateTime createdAt) => $"WO-{createdAt.Year:D4}-";
    private static async Task<int> LastAsync(EdgeDbContext db, string origin, DateTime createdAt, CancellationToken token)
    {
        var prefix = Prefix(createdAt);
        var code = await db.MaintenanceTasks.Where(w => w.OriginNode == origin && w.WorkOrderCode != null && w.WorkOrderCode.StartsWith(prefix))
            .OrderByDescending(w => w.WorkOrderCode).Select(w => w.WorkOrderCode).FirstOrDefaultAsync(token);
        if (code == null) return 0;
        return int.TryParse(code[prefix.Length..], NumberStyles.None, CultureInfo.InvariantCulture, out var value) ? value
            : throw new PmsRequestException(409, "Dãy mã WO không hợp lệ; cần kiểm tra dữ liệu.");
    }
    private static string Format(DateTime createdAt, int number) => number is > 0 and <= 999999
        ? Prefix(createdAt) + number.ToString("D6", CultureInfo.InvariantCulture)
        : throw new PmsRequestException(409, "Đã hết dãy mã WO của năm.");

    // Callers hold InventoryWriteScope through code allocation and saving the new order.
    public static async Task<string> NextAsync(EdgeDbContext db, string origin, DateTime createdAt, CancellationToken token = default) =>
        Format(createdAt, checked(await LastAsync(db, origin, createdAt, token) + 1));

    public static async Task<int> BackfillAsync(EdgeDbContext db, CancellationToken token = default)
    {
        await using var tx = await InventoryWriteScope.BeginAsync(db);
        if (await db.SyncState.AnyAsync(s => s.Key == "pms-dataset-id", token) &&
            !await db.SyncState.AnyAsync(s => s.Key == "pms-cutover-state" && s.Value == "ACTIVE", token)) return 0;
        var orders = await db.MaintenanceTasks.Where(w => w.PmsProtocolVersion == 2 && w.WorkOrderCode == null)
            .OrderBy(w => w.CreatedAt).ThenBy(w => w.Id).ToListAsync(token);
        foreach (var group in orders.GroupBy(w => new { w.OriginNode, w.CreatedAt.Year }))
        {
            var first = group.First(); var number = await LastAsync(db, first.OriginNode, first.CreatedAt, token);
            foreach (var order in group)
            {
                order.WorkOrderCode = Format(order.CreatedAt, checked(++number));
                order.UpdatedAt = DateTime.UtcNow; order.IsSynced = false;
            }
        }
        // Normal SaveChanges also creates the source-owned sync snapshots in this transaction.
        if (orders.Count > 0) await db.SaveChangesAsync(token);
        if (tx != null) await tx.CommitAsync(token);
        return orders.Count;
    }
}
