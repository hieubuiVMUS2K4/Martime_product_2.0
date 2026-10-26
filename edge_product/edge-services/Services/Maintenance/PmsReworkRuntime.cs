using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

public static class PmsReworkRuntime
{
    public static async Task<bool> CanAutoReleaseAsync(EdgeDbContext db, IConfiguration? config, CancellationToken token = default)
    {
        if (config?.GetValue<bool>("Pms:ReworkApiEnabled") != true || !config.GetValue("Pms:AutomaticReleaseEnabled", true)) return false;
        // Local operation must not depend on Shore availability or a transport handshake.
        // The sync sender separately negotiates protocol/dataset/stream before delivering the outbox.
        var values = await db.SyncState.AsNoTracking().Where(s => s.Key == "pms-dataset-id" || s.Key == "pms-cutover-state")
            .ToDictionaryAsync(s => s.Key, s => s.Value, token);
        var node = await db.EdgeProvisioningProfiles.AsNoTracking().Where(p => p.IsActive).Select(p => p.NodeId).SingleOrDefaultAsync(token);
        return values.GetValueOrDefault("pms-cutover-state") == "ACTIVE" &&
            !string.IsNullOrWhiteSpace(node) &&
            Guid.TryParse(values.GetValueOrDefault("pms-dataset-id"), out var dataset) && dataset != Guid.Empty;
    }
}
