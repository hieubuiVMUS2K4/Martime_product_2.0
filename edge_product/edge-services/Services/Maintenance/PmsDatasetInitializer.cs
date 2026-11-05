using Maritime.Shared.Models.Sync;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Inventory;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

public static class PmsDatasetInitializer
{
    public static async Task<bool> InitializeAsync(EdgeDbContext db, IConfiguration configuration, CancellationToken token = default)
    {
        if (!configuration.GetValue<bool>("Pms:ReworkApiEnabled")) return false;
        if (await db.SyncState.AsNoTracking().AnyAsync(s => s.Key == "pms-dataset-id" || s.Key == "pms-cutover-state", token))
            return false;

        await using var transaction = await InventoryWriteScope.BeginAsync(db);
        var state = await db.SyncState.Where(s => s.Key == "pms-dataset-id" || s.Key == "pms-cutover-state" || s.Key == "sync-stream-id")
            .ToDictionaryAsync(s => s.Key, token);
        // Existing epochs and unfinished cutovers require their original recovery procedure.
        if (state.ContainsKey("pms-dataset-id") || state.ContainsKey("pms-cutover-state")) return false;
        var profile = await db.EdgeProvisioningProfiles.AsNoTracking().SingleOrDefaultAsync(p => p.IsActive, token);
        if (string.IsNullOrWhiteSpace(profile?.NodeId) || profile.VesselId == null || profile.VesselId == Guid.Empty) return false;
        if (await db.MaintenanceSchedules.AnyAsync(j => j.PmsProtocolVersion != 2 || j.OriginNode != profile.NodeId, token) ||
            await db.MaintenanceTasks.AnyAsync(t => t.PmsProtocolVersion != 2 || t.OriginNode != profile.NodeId, token) ||
            await db.MaintenanceHistories.AnyAsync(token)) return false;
        if (state.TryGetValue("sync-stream-id", out var stream) &&
            (!Guid.TryParse(stream.Value, out var streamId) || streamId == Guid.Empty)) return false;

        var now = DateTime.UtcNow;
        db.SyncState.AddRange(new SyncState { Key = "pms-dataset-id", Value = Guid.NewGuid().ToString(), UpdatedAt = now },
            new SyncState { Key = "pms-cutover-state", Value = "ACTIVE", UpdatedAt = now });
        if (stream == null) db.SyncState.Add(new SyncState { Key = "sync-stream-id", Value = Guid.NewGuid().ToString(), UpdatedAt = now });
        await db.SaveChangesAsync(token);

        // Pre-initialization protocol-2 records retain their IDs, versions and evidence.
        // New snapshot events carry the epoch without rewriting previously queued events.
        foreach (var job in await db.MaintenanceSchedules.AsNoTracking().ToListAsync(token)) Queue(job, "maintenance_schedule", job.Id);
        foreach (var order in await db.MaintenanceTasks.AsNoTracking().ToListAsync(token)) Queue(order, "maintenance_task", order.Id);
        foreach (var report in await db.PmsWorkOrderReports.AsNoTracking().ToListAsync(token)) Queue(report, "pms_work_order_report", report.Id);
        foreach (var posting in await db.PmsWorkOrderMaterialPostings.AsNoTracking().ToListAsync(token)) Queue(posting, "pms_work_order_material_posting", posting.Id);
        db.SystemLogs.Add(new SystemLog { Category = "PMS", Action = "PMS_DATASET_INITIALIZED", Level = "INFO",
            EntityType = "PmsDataset", EntityId = db.SyncState.Local.Single(s => s.Key == "pms-dataset-id").Value,
            Message = "Initialized protocol-2 PMS dataset while preserving existing operational records." });
        await db.SaveChangesAsync(token);
        if (transaction != null) await transaction.CommitAsync(token);
        return true;

        void Queue(object entity, string table, Guid id) => db.SyncQueue.Add(new SyncQueue
        {
            TableName = table, RecordKey = id.ToString(), ActionType = SyncActionType.SNAPSHOT,
            Payload = db.BuildSyncPayload(entity), Priority = SyncPriority.Operational, CreatedAt = now
        });
    }
}
