using Microsoft.EntityFrameworkCore;
using ProductApi.Data;

namespace ProductApi.Services.Sync;

public static class VesselSyncIdentity
{
    public static async Task<Guid?> ResolveVesselIdAsync(AppDbContext context, string nodeId)
    {
        var node = await context.SyncNodeTrackers.AsNoTracking().SingleOrDefaultAsync(n => n.NodeId == nodeId && n.IsRegistered && !n.IsRevoked);
        if (node?.VesselId != null && await context.Vessels.AnyAsync(v => v.Id == node.VesselId)) return node.VesselId;
        return null;
    }

    public static async Task<string> CanonicalTargetAsync(AppDbContext context, string target)
    {
        if (target == "*") return target;
        var vesselId = await context.Vessels.Where(v => v.IMO == target).Select(v => (Guid?)v.Id).SingleOrDefaultAsync();
        if (target.StartsWith("vessel:", StringComparison.Ordinal) && Guid.TryParse(target[7..], out var pendingVessel)) vesselId = pendingVessel;
        if (!vesselId.HasValue) return target;
        var nodes = await context.SyncNodeTrackers.AsNoTracking()
            .Where(n => n.VesselId == vesselId && n.IsRegistered && !n.IsRevoked).Select(n => n.NodeId).ToListAsync();
        if (nodes.Count > 1) throw new InvalidOperationException($"Multiple active sync nodes are bound to vessel {vesselId}; select one node before routing.");
        return nodes.Count == 1 ? nodes[0] : $"vessel:{vesselId}";
    }

    public static async Task<List<string>> HistoricalOriginsAsync(AppDbContext context, Guid vesselId)
    {
        var origins = await context.SyncNodeTrackers.AsNoTracking().Where(n => n.VesselId == vesselId).Select(n => n.NodeId).ToListAsync();
        var imo = await context.Vessels.Where(v => v.Id == vesselId).Select(v => v.IMO).SingleOrDefaultAsync();
        if (imo != null) origins.Add(imo); // Read old records; never route or authenticate by IMO.
        return origins.Distinct(StringComparer.Ordinal).ToList();
    }

    // Convert old addresses once a vessel has exactly one registered node. Pull and ACK
    // subsequently use exact NodeId addresses; IMO is never an alternate recipient.
    public static async Task BindPendingRoutesAsync(AppDbContext context, string nodeId)
    {
        var node = await context.SyncNodeTrackers.AsNoTracking().SingleOrDefaultAsync(n => n.NodeId == nodeId && n.IsRegistered && !n.IsRevoked);
        if (node?.VesselId == null) return;
        var imo = await context.Vessels.Where(v => v.Id == node.VesselId).Select(v => v.IMO).SingleOrDefaultAsync();
        if (imo == null || await CanonicalTargetAsync(context, imo) != nodeId) return;
        var pendingAddress = $"vessel:{node.VesselId}";
        await context.SyncOutbox.Where(o => o.TargetNode == imo || o.TargetNode == pendingAddress)
            .ExecuteUpdateAsync(setters => setters.SetProperty(o => o.TargetNode, nodeId).SetProperty(o => o.DeliveredAt, (DateTime?)null));
    }
}
