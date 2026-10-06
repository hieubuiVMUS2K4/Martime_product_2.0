using System.Text.Json;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Core;

/// <summary>Repairs legacy ACKs without changing or deleting their delivery history.</summary>
public static class SensorDeferralSyncBackfill
{
    public const string CoverageKey = "sensor-deferral-sync-v1:queue-baseline";
    public static readonly HashSet<string> Tables = new(StringComparer.OrdinalIgnoreCase)
        { "nmea_raw_data", "navigation_data", "environmental_data", "task_deferral_request" };

    public static async Task ReconcileAsync(EdgeDbContext db, CancellationToken token)
    {
        await using var transaction = db.Database.IsRelational() && db.Database.CurrentTransaction == null
            ? await db.Database.BeginTransactionAsync(token) : null;
        var state = await db.SyncState.SingleOrDefaultAsync(s => s.Key == CoverageKey, token);
        if (state == null)
        {
            // EnsureCreated/test databases also need the same repair as the upgrade migration.
            var lastId = await db.SyncQueue.Select(q => (long?)q.Id).MaxAsync(token) ?? 0;
            state = new SyncState { Key = CoverageKey, Value = lastId.ToString(), UpdatedAt = DateTime.UtcNow };
            db.SyncState.Add(state);
            if (db.Database.IsRelational())
            {
                await db.NmeaRawData.ExecuteUpdateAsync(s => s.SetProperty(x => x.IsSynced, false), token);
                await db.NavigationData.ExecuteUpdateAsync(s => s.SetProperty(x => x.IsSynced, false), token);
                await db.EnvironmentalData.ExecuteUpdateAsync(s => s.SetProperty(x => x.IsSynced, false), token);
                await db.TaskDeferralRequests.ExecuteUpdateAsync(s => s.SetProperty(x => x.IsSynced, false), token);
            }
            else
            {
                foreach (var row in await db.NmeaRawData.AsTracking().ToListAsync(token)) row.IsSynced = false;
                foreach (var row in await db.NavigationData.AsTracking().ToListAsync(token)) row.IsSynced = false;
                foreach (var row in await db.EnvironmentalData.AsTracking().ToListAsync(token)) row.IsSynced = false;
                foreach (var row in await db.TaskDeferralRequests.AsTracking().ToListAsync(token)) row.IsSynced = false;
            }
        }
        var baseline = long.Parse(state.Value);
        // Correlated, indexed queries avoid loading the entire telemetry backlog into memory.
        var raw = await LockedRowsAsync<NmeaRawData>(db, "nmea_raw_data", baseline,
            db.NmeaRawData.AsNoTracking().Where(x => !x.IsSynced && !db.SyncQueue.Any(q =>
            q.Id > baseline && q.TableName == "nmea_raw_data" && q.RecordKey == x.Id.ToString()
            && (q.ActionType == SyncActionType.CREATE || q.ActionType == SyncActionType.SNAPSHOT)))
            .OrderBy(x => x.Id).Take(200), token);
        var navigation = await LockedRowsAsync<NavigationData>(db, "navigation_data", baseline,
            db.NavigationData.AsNoTracking().Where(x => !x.IsSynced && !db.SyncQueue.Any(q =>
            q.Id > baseline && q.TableName == "navigation_data" && q.RecordKey == x.Id.ToString()
            && (q.ActionType == SyncActionType.CREATE || q.ActionType == SyncActionType.SNAPSHOT)))
            .OrderBy(x => x.Id).Take(200), token);
        var environment = await LockedRowsAsync<EnvironmentalData>(db, "environmental_data", baseline,
            db.EnvironmentalData.AsNoTracking().Where(x => !x.IsSynced && !db.SyncQueue.Any(q =>
            q.Id > baseline && q.TableName == "environmental_data" && q.RecordKey == x.Id.ToString()
            && (q.ActionType == SyncActionType.CREATE || q.ActionType == SyncActionType.SNAPSHOT)))
            .OrderBy(x => x.Id).Take(200), token);
        var deferrals = await LockedRowsAsync<TaskDeferralRequest>(db, "task_deferral_request", baseline,
            db.TaskDeferralRequests.AsNoTracking().Where(x => !x.IsSynced && !db.SyncQueue.Any(q =>
            q.Id > baseline && q.TableName == "task_deferral_request" && q.RecordKey == x.Id.ToString()
            && (q.ActionType == SyncActionType.CREATE || q.ActionType == SyncActionType.SNAPSHOT)))
            .OrderBy(x => x.Id).Take(200), token);
        foreach (var row in raw) AddSnapshot(db, "nmea_raw_data", row.Id, row);
        foreach (var row in navigation) AddSnapshot(db, "navigation_data", row.Id, row);
        foreach (var row in environment) AddSnapshot(db, "environmental_data", row.Id, row);
        foreach (var row in deferrals)
        {
            await EnqueueTaskAsync(db, db.BuildSyncPayload(row), token);
            AddSnapshot(db, "task_deferral_request", row.Id, row);
        }
        var suppressed = db.SuppressSyncQueue;
        db.SuppressSyncQueue = true;
        try { await db.SaveChangesAsync(token); }
        finally { db.SuppressSyncQueue = suppressed; }
        if (transaction != null) await transaction.CommitAsync(token);
    }

    private static async Task<List<T>> LockedRowsAsync<T>(EdgeDbContext db, string table, long baseline,
        IQueryable<T> fallback, CancellationToken token) where T : class
    {
        if (!db.Database.IsRelational()) return await fallback.ToListAsync(token);
        if (!Tables.Contains(table)) throw new InvalidOperationException("Unknown backfill table.");
        var physical = table == "task_deferral_request" ? "task_deferral_requests" : table;
        // Lock precisely the selected rows until their snapshots commit. Otherwise a concurrent
        // business update could allocate its queue ID before a stale backfill snapshot.
        var sql = $$"""
            SELECT source.* FROM public.{{physical}} source
            WHERE NOT source.is_synced AND NOT EXISTS (
                SELECT 1 FROM public.sync_queue q WHERE q.id > {0} AND q.table_name = {1}
                AND q.record_key = source.id::text AND q.action_type IN (0, 3))
            ORDER BY source.id LIMIT 200 FOR UPDATE
            """;
        return await db.Set<T>().FromSqlRaw(sql, baseline, table).AsNoTracking().ToListAsync(token);
    }

    private static IQueryable<T> LockedParent<T>(EdgeDbContext db, Guid id) where T : class
    {
        if (!db.Database.IsRelational()) return db.Set<T>().AsNoTracking().Where(x => EF.Property<Guid>(x, "Id") == id);
        var table = db.Model.FindEntityType(typeof(T))!.GetTableName()!;
        var quotedTable = "\"" + table.Replace("\"", "\"\"") + "\"";
        var sql = $"SELECT * FROM public.{quotedTable} WHERE id = {{0}} FOR SHARE";
        return db.Set<T>().FromSqlRaw(sql, id).AsNoTracking();
    }

    public static async Task EnqueueTaskAsync(EdgeDbContext db, string payload, CancellationToken token)
    {
        using var json = JsonDocument.Parse(payload);
        var taskValue = json.RootElement.EnumerateObject().FirstOrDefault(p =>
            p.Name.Replace("_", "").Equals("TaskId", StringComparison.OrdinalIgnoreCase)).Value;
        if (taskValue.ValueKind != JsonValueKind.String || !taskValue.TryGetGuid(out var taskId)) return;
        await using var transaction = db.Database.IsRelational() && db.Database.CurrentTransaction == null
            ? await db.Database.BeginTransactionAsync(token) : null;
        var task = await LockedParent<MaintenanceTask>(db, taskId).SingleOrDefaultAsync(token);
        if (task == null) return; // Keep the request pending; Shore rejects a missing dependency.
        var visited = new HashSet<Guid>();
        async Task Asset(Guid? id)
        {
            if (!id.HasValue || !visited.Add(id.Value)) return;
            var asset = await LockedParent<EquipmentAsset>(db, id.Value).SingleOrDefaultAsync(token);
            if (asset == null) return;
            await Asset(asset.ParentId);
            await EnsureSnapshotAsync(db, "equipment_asset", asset.Id, asset, token);
        }
        async Task Group(Guid? id)
        {
            if (!id.HasValue) return;
            var group = await LockedParent<EquipmentGroup>(db, id.Value).SingleOrDefaultAsync(token);
            if (group != null) await EnsureSnapshotAsync(db, "equipment_group", group.Id, group, token);
        }
        await Group(task.EquipmentGroupId);
        await Asset(task.EquipmentAssetId);
        if (task.ScheduleId.HasValue)
        {
            var schedule = await LockedParent<MaintenanceSchedule>(db, task.ScheduleId.Value).SingleOrDefaultAsync(token);
            if (schedule != null)
            {
                await Group(schedule.EquipmentGroupId);
                await Asset(schedule.EquipmentAssetId);
                await EnsureSnapshotAsync(db, "maintenance_schedule", schedule.Id, schedule, token);
            }
        }
        await EnsureSnapshotAsync(db, "maintenance_task", task.Id, task, token);
        if (transaction != null)
        {
            var suppressed = db.SuppressSyncQueue;
            db.SuppressSyncQueue = true;
            try { await db.SaveChangesAsync(token); }
            finally { db.SuppressSyncQueue = suppressed; }
            await transaction.CommitAsync(token);
        }
    }

    private static async Task EnsureSnapshotAsync(EdgeDbContext db, string table, Guid id, object entity, CancellationToken token)
    {
        var key = id.ToString();
        var pending = await db.SyncQueue.Where(q => q.TableName == table && q.RecordKey == key && q.SyncedAt == null).ToListAsync(token);
        pending.AddRange(db.SyncQueue.Local.Where(q => q.TableName == table && q.RecordKey == key && q.SyncedAt == null));
        foreach (var queue in pending) queue.Priority = SyncPriority.Operational;
        if (!pending.Any(q => q.ActionType == SyncActionType.CREATE || q.ActionType == SyncActionType.SNAPSHOT))
            AddSnapshot(db, table, id, entity);
    }

    private static void AddSnapshot(EdgeDbContext db, string table, object key, object entity) => db.SyncQueue.Add(new SyncQueue
    {
        TableName = table, RecordKey = key.ToString()!, ActionType = SyncActionType.SNAPSHOT,
        Payload = db.BuildSyncPayload(entity), Priority = SyncLinkPolicy.TablePriority(table), CreatedAt = DateTime.UtcNow
    });
}
