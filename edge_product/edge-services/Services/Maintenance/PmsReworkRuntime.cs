using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

public static class PmsReworkRuntime
{
    public static async Task<bool> CanAutoReleaseAsync(EdgeDbContext db, IConfiguration? config, CancellationToken token = default)
    {
        if (config?.GetValue<bool>("Pms:ReworkApiEnabled") != true || !config.GetValue("Pms:AutomaticReleaseEnabled", true)) return false;
        var values = await db.SyncState.AsNoTracking().Where(s => s.Key == "pms-dataset-id" || s.Key == "pms-cutover-state" ||
            s.Key == "sync-stream-id" || s.Key == "pms-peer-ready").ToDictionaryAsync(s => s.Key, s => s.Value, token);
        var streamValue = config["Sync:StreamId"] ?? values.GetValueOrDefault("sync-stream-id");
        var node = await db.EdgeProvisioningProfiles.AsNoTracking().Where(p => p.IsActive).Select(p => p.NodeId).SingleOrDefaultAsync(token);
        return values.GetValueOrDefault("pms-cutover-state") == "ACTIVE" &&
            !string.IsNullOrWhiteSpace(node) &&
            Guid.TryParse(values.GetValueOrDefault("pms-dataset-id"), out var dataset) && dataset != Guid.Empty &&
            Guid.TryParse(streamValue, out var stream) && stream != Guid.Empty &&
            values.GetValueOrDefault("pms-peer-ready") == $"{dataset:D}/{stream:D}/{node}";
    }
}
