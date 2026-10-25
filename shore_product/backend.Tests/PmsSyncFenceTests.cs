using Maritime.Shared.DTOs.Sync;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using Xunit;

namespace ProductApi.Tests;

public partial class SyncReliabilityTests
{
    [ShorePostgresFact]
    public async Task PmsSyncFence_ShorePushExcludesMirroredJobsAndKeepsEquipmentAndLegacyJobs()
    {
        await using var db = await Database();
        try
        {
            var vessel = await BindNode(db, "PMS-PUSH-FENCE");
            var legacy = new ProductApi.Models.MaintenanceSchedule { ScheduleCode = "LEGACY", ScheduleName = "Legacy", VesselId = vessel };
            var mirror = new ProductApi.Models.MaintenanceSchedule { ScheduleCode = "MIRROR", ScheduleName = "Edge-owned", VesselId = vessel, PmsProtocolVersion = 2 };
            db.SuppressAutoOutbox = true; db.MaintenanceSchedules.AddRange(legacy, mirror);
            db.EquipmentAssets.Add(new ProductApi.Models.EquipmentAsset { AssetCode = "PUMP", AssetName = "Pump", VesselId = vessel });
            await db.SaveChangesAsync();
            await Push(db).PushAsync("PMS-PUSH-FENCE", [ProductApi.Services.Sync.SyncScope.Equipment]);
            var jobs = await Queued(db, "PMS-PUSH-FENCE", "maintenance_schedule");
            Assert.Equal(legacy.Id.ToString(), Assert.Single(jobs).RecordKey);
            Assert.Single(await Queued(db, "PMS-PUSH-FENCE", "equipment_asset"));
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [ShorePostgresFact]
    public async Task PmsSyncFence_PrecedesOldDuplicateReceiptAndLeavesOtherModulesWorking()
    {
        await using var db = await Database();
        try
        {
            var vessel = await BindNode(db, "PMS-FENCE");
            var inbox = Inbox(db); var stream = Guid.NewGuid(); var key = Guid.NewGuid();
            var legacy = Event("PMS-FENCE", stream, key, 1, "SNAPSHOT", new
            { Id = key, ScheduleCode = "LEGACY", ScheduleName = "Original definition" });
            legacy.TableName = "maintenance_schedule";
            Assert.Equal(1, (await inbox.ProcessBatchAsync([legacy])).Succeeded);
            // Simulate an event already recorded by an older receiver which did
            // not understand its new metadata. It must not get a false ACK.
            legacy.Payload = System.Text.Json.JsonSerializer.Serialize(new
            { Id = key, ScheduleCode = "LEGACY", ScheduleName = "Must not overwrite", PmsProtocolVersion = 2 });
            var ordinary = Event("PMS-FENCE", stream, Guid.NewGuid(), 2, "SNAPSHOT", new
            { AssetCode = "UNCHANGED-MODULE", AssetName = "Pump", Category = "DECK" });
            var result = await inbox.ProcessBatchAsync([legacy, ordinary]);
            Assert.Equal(1, result.Succeeded); Assert.Equal(1, result.Failed);
            Assert.DoesNotContain(legacy.EventId, result.AcknowledgedEventIds);
            Assert.Contains(ordinary.EventId, result.AcknowledgedEventIds);
            Assert.Contains("pms_protocol_upgrade_required", Assert.Single(result.FailedItems).Error);
            db.ChangeTracker.Clear();
            var stored = await db.MaintenanceSchedules.SingleAsync();
            Assert.Equal(vessel, stored.VesselId); Assert.Equal("Original definition", stored.ScheduleName);
            Assert.Null(stored.PmsProtocolVersion);
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [Theory]
    [InlineData("maintenance_task", "{\"PmsProtocolVersion\":2}")]
    [InlineData("maintenance_schedule", "{\"pmsProtocolVersion\":2}")]
    [InlineData("pms_work_order_reports", "{}")]
    [InlineData("pms_work_order_material_postings", "{}")]
    public async Task PmsSyncFence_DirectEntryRejectsBeforeAnyDatabaseOrPayloadMutation(string table, string payload)
    {
        // No server is needed: the fence must run before any lookup/write.
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=127.0.0.1;Port=1;Database=unused;Username=unused;Password=unused").Options);
        var item = new SyncQueueItemDto { TableName = table, Payload = payload };
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => Inbox(db).ProcessIncomingAsync(item));
        Assert.Contains("pms_protocol_upgrade_required", error.Message);
        Assert.Equal(payload, item.Payload); Assert.Empty(db.ChangeTracker.Entries());
    }
}
