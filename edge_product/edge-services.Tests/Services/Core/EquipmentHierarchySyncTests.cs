using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

public partial class SyncReliabilityTests
{
    [Fact]
    public Task EquipmentImport_SendsParentsBeforeChildrenAcrossSmallBatches()
        => VerifyEquipmentHierarchyAsync();

    [MaritimeEdge.Tests.Inventory.PmsPostgresFact]
    public Task EquipmentImport_PostgresFiltersDependenciesBeforeBatchLimit()
        => VerifyEquipmentHierarchyAsync(PostgresConnection());

    private static async Task VerifyEquipmentHierarchyAsync(string? connection = null)
    {
        var sent = new List<string>();
        var (services, sync) = Build(true, async request =>
        {
            var items = JsonSerializer.Deserialize<List<SyncQueueItemDto>>(
                await request.Content!.ReadAsStringAsync(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            sent.AddRange(items.Select(i => i.RecordKey));
            return Response(JsonSerializer.Serialize(new { succeeded = items.Count, failed = 0, total = items.Count,
                acknowledgedEventIds = items.Select(i => i.EventId).ToArray() }));
        }, connection, new() { ["Sync:AdaptiveProfiles:Shore_WiFi:BatchSize"] = "1" });
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>();
            if (connection != null) await db.Database.EnsureCreatedAsync();
            try
            {
                db.SuppressSyncQueue = true;
                var root = new EquipmentAsset { AssetCode = "ROOT", AssetName = "Root", Category = "SYSTEM" };
                var parent = new EquipmentAsset { AssetCode = "PARENT", AssetName = "Parent", Category = "SYSTEM", ParentId = root.Id };
                var child = new EquipmentAsset { AssetCode = "CHILD", AssetName = "Child", Category = "UNCLASSIFIED", ParentId = parent.Id };
                db.EquipmentAssets.AddRange(root, parent, child);
                await db.SaveChangesAsync();
                // Children precede both ancestors in FIFO order, as in the import.
                var queuedAt = DateTime.UtcNow.AddMinutes(-10);
                foreach (var asset in new[] { child, parent, root })
                {
                    db.SyncQueue.Add(new SyncQueue { TableName = "equipment_asset", RecordKey = asset.Id.ToString(),
                        ActionType = SyncActionType.SNAPSHOT,
                        Payload = JsonSerializer.Serialize(new { asset.Id, asset.AssetCode, asset.AssetName, asset.Category, asset.ParentId }),
                        CreatedAt = queuedAt, Priority = SyncPriority.Operational });
                    queuedAt = queuedAt.AddSeconds(1);
                }
                await db.SaveChangesAsync();
                for (var cycle = 0; cycle < 3; cycle++) await sync.ExecuteSyncAsync(default);
                Assert.Equal(new[] { root.Id.ToString(), parent.Id.ToString(), child.Id.ToString() }, sent);
                db.ChangeTracker.Clear();
                Assert.Equal(3, await db.SyncQueue.CountAsync(q => q.SyncedAt != null));
            }
            finally { if (connection != null) await db.Database.EnsureDeletedAsync(); }
        }
    }

    [Fact]
    public async Task ImportLargerThanReconciliationLimit_WaitsForAnUnqueuedParent()
    {
        var sent = new List<SyncQueueItemDto>();
        var (services, sync) = Build(true, async request =>
        {
            var items = JsonSerializer.Deserialize<List<SyncQueueItemDto>>(
                await request.Content!.ReadAsStringAsync(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            sent.AddRange(items);
            return Response(JsonSerializer.Serialize(new { succeeded = items.Count, failed = 0, total = items.Count,
                acknowledgedEventIds = items.Select(i => i.EventId).ToArray() }));
        });
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); db.SuppressSyncQueue = true;
            var root = new EquipmentAsset { Id = Guid.Parse("ffffffff-ffff-4fff-afff-ffffffffffff"),
                AssetCode = "ROOT", AssetName = "Root", Category = "SYSTEM" };
            db.EquipmentAssets.Add(root);
            for (var i = 1; i <= 205; i++)
                db.EquipmentAssets.Add(new EquipmentAsset { Id = Guid.Parse($"00000000-0000-4000-a000-{i:D12}"),
                    AssetCode = "CHILD-" + i, AssetName = "Child " + i, Category = "UNCLASSIFIED", ParentId = root.Id });
            await db.SaveChangesAsync();
            // Reconciliation queues only 200 rows per table per cycle, in UUID order.
            await sync.ExecuteSyncAsync(default);
            Assert.Empty(sent);
            Assert.Equal(200, await db.SyncQueue.CountAsync());
            await sync.ExecuteSyncAsync(default);
            Assert.Equal(root.Id.ToString(), Assert.Single(sent).RecordKey);
            await sync.ExecuteSyncAsync(default);
            // The metadata byte budget may pack fewer than 100 children.
            Assert.InRange(sent.Count, 2, 101);
            Assert.All(sent.Skip(1), item => Assert.NotEqual(root.Id.ToString(), item.RecordKey));
            db.ChangeTracker.Clear();
            Assert.Equal(0, await db.SyncQueue.CountAsync(q => q.RetryCount > 0));
        }
    }

    [Fact]
    public async Task ParentInCooldown_DefersChildWithoutRetryingIt_AndTelemetryStillSends()
    {
        var sent = new List<SyncQueueItemDto>();
        var (services, sync) = Build(true, async request =>
        {
            var items = JsonSerializer.Deserialize<List<SyncQueueItemDto>>(
                await request.Content!.ReadAsStringAsync(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            sent.AddRange(items);
            return Response(JsonSerializer.Serialize(new { succeeded = items.Count, failed = 0, total = items.Count,
                acknowledgedEventIds = items.Select(i => i.EventId).ToArray() }));
        });
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); db.SuppressSyncQueue = true;
            var parent = new EquipmentAsset { AssetCode = "P", AssetName = "Parent", Category = "SYSTEM" };
            var child = new EquipmentAsset { AssetCode = "C", AssetName = "Child", Category = "UNCLASSIFIED", ParentId = parent.Id };
            db.EquipmentAssets.AddRange(parent, child);
            db.SyncQueue.AddRange(
                new SyncQueue { TableName = "equipment_asset", RecordKey = parent.Id.ToString(), ActionType = SyncActionType.SNAPSHOT,
                    Payload = "{}", NextRetryAt = DateTime.UtcNow.AddHours(1) },
                new SyncQueue { TableName = "equipment_asset", RecordKey = child.Id.ToString(), ActionType = SyncActionType.SNAPSHOT, Payload = "{}" },
                Queue("TELEMETRY"));
            await db.SaveChangesAsync();
            await sync.ExecuteSyncAsync(default);
            Assert.Equal("TELEMETRY", Assert.Single(sent).RecordKey);
            db.ChangeTracker.Clear();
            var deferred = await db.SyncQueue.SingleAsync(q => q.RecordKey == child.Id.ToString());
            Assert.Null(deferred.SyncedAt); Assert.Equal(0, deferred.RetryCount); Assert.Null(deferred.LastError);
        }
    }
}
