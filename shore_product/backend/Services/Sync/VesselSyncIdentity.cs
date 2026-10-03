using Microsoft.EntityFrameworkCore;
using ProductApi.Data;

namespace ProductApi.Services.Sync;

public static class VesselSyncIdentity
{
    public static async Task<Guid?> ResolveVesselIdAsync(AppDbContext context, string nodeId)
    {
        var node = await context.SyncNodeTrackers.AsNoTracking().SingleOrDefaultAsync(n => n.NodeId == nodeId && !n.IsRevoked);
        if (node?.VesselId != null && await context.Vessels.AnyAsync(v => v.Id == node.VesselId)) return node.VesselId;
        var imo = node?.ImoNumber ?? nodeId;
        return await context.Vessels.Where(v => v.IMO == imo).Select(v => (Guid?)v.Id).SingleOrDefaultAsync();
    }

    public static async Task<string> CanonicalTargetAsync(AppDbContext context, string target)
    {
        if (target == "*") return target;
        var vesselId = await context.Vessels.Where(v => v.IMO == target).Select(v => (Guid?)v.Id).SingleOrDefaultAsync();
        if (!vesselId.HasValue) return target;
        var nodes = await context.SyncNodeTrackers.AsNoTracking()
            .Where(n => n.VesselId == vesselId && n.IsRegistered && !n.IsRevoked).Select(n => n.NodeId).ToListAsync();
        return nodes.Count == 1 ? nodes[0] : target;
    }

    public static async Task<string?> LegacyImoAsync(AppDbContext context, string nodeId)
    {
        var node = await context.SyncNodeTrackers.AsNoTracking().SingleOrDefaultAsync(n => n.NodeId == nodeId && n.IsRegistered && !n.IsRevoked);
        if (node?.VesselId == null) return null;
        return await context.Vessels.Where(v => v.Id == node.VesselId).Select(v => v.IMO).SingleOrDefaultAsync();
    }
}
