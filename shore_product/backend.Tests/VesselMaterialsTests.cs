using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Configuration;
using Moq;
using Npgsql;
using ProductApi.Controllers.Materials;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.Services.Sync;
using ProductApi.Services;
using ProductApi.Services.Background;
using Xunit;

namespace ProductApi.Tests;

public class VesselMaterialsTests
{
    private static AppDbContext Database()
    {
        var connection = Environment.GetEnvironmentVariable("SHORE_PMS_TEST_CONNECTION_STRING")!;
        if (new NpgsqlConnectionStringBuilder(connection).Database?.StartsWith("codex_pms_tests_", StringComparison.Ordinal) != true)
            throw new InvalidOperationException("Tests require an isolated database.");
        return new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection)
            .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking).Options);
    }
    private static Vessel Vessel() => new() { Id = Guid.NewGuid(), IMO = Guid.NewGuid().ToString("N")[..7], Name = "Test", BuildDate = DateTime.UtcNow };
    private static VesselMaterialsController Controller(AppDbContext context) => new(context,
        new SyncOutboxService(context, NullLogger<SyncOutboxService>.Instance, Mock.Of<ISyncFileStorageService>()));
    private static JsonElement Body(IActionResult result) => JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(result).Value);

    [ShorePostgresFact]
    public async Task Definitions_AreScoped_NoCategoryRequired_AndSyncWaitsForAcknowledgement()
    {
        await using var context = Database(); await context.Database.EnsureCreatedAsync();
        var a = Vessel(); var b = Vessel();
        context.Vessels.AddRange(a, b);
        context.SyncNodeTrackers.Add(new() { NodeId = a.IMO, VesselId = a.Id, IsRegistered = true });
        await context.SaveChangesAsync();
        var controller = Controller(context);
        var input = new VesselMaterialDefinition { ItemCode = "SP-001", Name = "Pump", Unit = "PCS" };
        var id = Body(await controller.Create(a.Id, input)).GetProperty("Id").GetGuid();
        Assert.IsType<OkObjectResult>(await controller.Create(b.Id, input));
        Assert.Equal(1, Body(await controller.List(a.Id)).GetArrayLength());
        Assert.IsType<NotFoundResult>(await controller.Update(b.Id, id, input));
        Assert.Equal("NotSynced", Body(await controller.List(a.Id))[0].GetProperty("syncStatus").GetString());
        Assert.IsType<OkObjectResult>(await controller.Sync(a.Id));
        var sent = await context.SyncOutbox.AsTracking().SingleAsync(o => o.RecordKey == id.ToString());
        Assert.Equal(a.IMO, sent.TargetNode); Assert.NotEqual("*", sent.TargetNode);
        Assert.DoesNotContain("onHandQuantity", sent.Payload, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("Pending", Body(await controller.List(a.Id))[0].GetProperty("syncStatus").GetString());
        sent.DeliveredAt = DateTime.UtcNow; await context.SaveChangesAsync();
        Assert.Equal("Synced", Body(await controller.List(a.Id))[0].GetProperty("syncStatus").GetString());
        var ownEquipment = new EquipmentAsset { Id = Guid.NewGuid(), AssetCode = Guid.NewGuid().ToString("N"), AssetName = "Pump", Category = "PUMP", VesselId = a.Id };
        var otherEquipment = new EquipmentAsset { Id = Guid.NewGuid(), AssetCode = Guid.NewGuid().ToString("N"), AssetName = "Other pump", Category = "PUMP", VesselId = b.Id };
        context.EquipmentAssets.AddRange(ownEquipment, otherEquipment); await context.SaveChangesAsync();
        var catalogId = Body(await controller.List(a.Id))[0].GetProperty("catalogId").GetGuid();
        var links = new MaterialController(context);
        Assert.IsType<BadRequestObjectResult>(await links.LinkEquipment(catalogId, [otherEquipment.Id]));
        Assert.IsType<OkObjectResult>(await links.LinkEquipment(catalogId, [ownEquipment.Id]));
        Assert.Equal("Synced", Body(await controller.List(a.Id))[0].GetProperty("syncStatus").GetString());
        Assert.IsType<ConflictObjectResult>(await controller.Sync(a.Id));
        var linkDelivery = await context.SyncOutbox.AsTracking().OrderByDescending(o => o.Id).FirstAsync(o => o.RecordKey == id.ToString());
        Assert.Null(JsonSerializer.Deserialize<VesselMaterialDefinition>(linkDelivery.Payload, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!.EquipmentLinks);
        linkDelivery.DeliveredAt = DateTime.UtcNow; await context.SaveChangesAsync();
        var stock = await context.MaterialItemShips.AsTracking().SingleAsync(s => s.Id == id);
        stock.OnHandQuantity = 9; stock.UpdatedAt = DateTime.UtcNow.AddSeconds(1); await context.SaveChangesAsync();
        Assert.Equal("Synced", Body(await controller.List(a.Id))[0].GetProperty("syncStatus").GetString());
        input.Name = "New pump";
        Assert.IsType<OkObjectResult>(await controller.Update(a.Id, id, input));
        Assert.Equal("New pump", Body(await controller.List(a.Id))[0].GetProperty("name").GetString());
        Assert.Equal("NotSynced", Body(await controller.List(a.Id))[0].GetProperty("syncStatus").GetString());
        Assert.IsType<OkObjectResult>(await controller.Delete(a.Id, [id]));
        Assert.Empty(Body(await controller.List(a.Id)).EnumerateArray());
        Assert.IsType<OkObjectResult>(await controller.Sync(a.Id));
        var deleted = await context.SyncOutbox.OrderByDescending(o => o.Id).FirstAsync(o => o.RecordKey == id.ToString());
        Assert.False(JsonSerializer.Deserialize<VesselMaterialDefinition>(deleted.Payload, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!.IsActive);
        Assert.Equal(9, (await context.MaterialItemShips.SingleAsync(s => s.Id == id)).OnHandQuantity);
    }

    [ShorePostgresFact]
    public async Task Acknowledgement_OnlyMarksExactIds_AndRepeatedAckDoesNotConsumeNextDelivery()
    {
        await using var context = Database(); await context.Database.EnsureCreatedAsync();
        var vessel = Vessel(); context.Vessels.Add(vessel);
        context.SyncNodeTrackers.Add(new() { NodeId = vessel.IMO, VesselId = vessel.Id, IsRegistered = true });
        await context.SaveChangesAsync();
        var controller = Controller(context);
        var id = Body(await controller.Create(vessel.Id, new() { ItemCode = "ACK", Name = "Filter", Unit = "PCS" })).GetProperty("Id").GetGuid();
        await controller.Sync(vessel.Id);
        var first = await context.SyncOutbox.SingleAsync(o => o.RecordKey == id.ToString());
        var outbox = new SyncOutboxService(context, NullLogger<SyncOutboxService>.Instance, Mock.Of<ISyncFileStorageService>());
        await outbox.AcknowledgeDeliveryAsync(vessel.IMO, [first.Id]);
        await controller.Update(vessel.Id, id, new() { ItemCode = "ACK", Name = "Updated filter", Unit = "PCS" });
        await controller.Sync(vessel.Id);
        var second = await context.SyncOutbox.OrderByDescending(o => o.Id).FirstAsync(o => o.RecordKey == id.ToString());
        await outbox.AcknowledgeDeliveryAsync(vessel.IMO, [first.Id]);
        await outbox.AcknowledgeDeliveryAsync(vessel.IMO, [0]);
        await outbox.AcknowledgeDeliveryAsync("another-node", [second.Id]);
        context.ChangeTracker.Clear();
        Assert.Null((await context.SyncOutbox.SingleAsync(o => o.Id == second.Id)).DeliveredAt);
        await outbox.AcknowledgeDeliveryAsync(vessel.IMO, [second.Id]);
        context.ChangeTracker.Clear();
        Assert.NotNull((await context.SyncOutbox.SingleAsync(o => o.Id == second.Id)).DeliveredAt);
    }

    [ShorePostgresFact]
    public async Task Sync_RejectsUnchangedPendingOrDeliveredData_AndQueuesOnlyChangesIncludingDeletion()
    {
        await using var context = Database(); await context.Database.EnsureCreatedAsync();
        var vessel = Vessel(); context.Vessels.Add(vessel);
        context.SyncNodeTrackers.Add(new() { NodeId = vessel.IMO, VesselId = vessel.Id, IsRegistered = true });
        await context.SaveChangesAsync();
        var controller = Controller(context);
        Assert.IsType<ConflictObjectResult>(await controller.Sync(vessel.Id));
        var input = new VesselMaterialDefinition { ItemCode = "A", Name = "Filter", Unit = "PCS", PartNumber = "PN-1" };
        var id = Body(await controller.Create(vessel.Id, input)).GetProperty("Id").GetGuid();
        await controller.Create(vessel.Id, new() { ItemCode = "B", Name = "Pump", Unit = "PCS" });
        Assert.Equal(2, Body(await controller.Sync(vessel.Id)).GetProperty("queued").GetInt32());
        var pending = Assert.IsType<ConflictObjectResult>(await controller.Sync(vessel.Id));
        Assert.Equal("MATERIAL_SYNC_PENDING", JsonSerializer.SerializeToElement(pending.Value).GetProperty("code").GetString());
        Assert.Equal(2, await context.SyncOutbox.CountAsync(o => o.TargetNode == vessel.IMO));
        var outbox = new SyncOutboxService(context, NullLogger<SyncOutboxService>.Instance, Mock.Of<ISyncFileStorageService>());
        await outbox.AcknowledgeDeliveryAsync(vessel.IMO, await context.SyncOutbox.Where(o => o.TargetNode == vessel.IMO).Select(o => o.Id).ToListAsync());
        var unchanged = Assert.IsType<ConflictObjectResult>(await controller.Sync(vessel.Id));
        Assert.Equal("NO_MATERIAL_CHANGES", JsonSerializer.SerializeToElement(unchanged.Value).GetProperty("code").GetString());
        input.PartNumber = "PN-2";
        await controller.Update(vessel.Id, id, input);
        Assert.Equal(1, Body(await controller.Sync(vessel.Id)).GetProperty("queued").GetInt32());
        Assert.Equal(3, await context.SyncOutbox.CountAsync(o => o.TargetNode == vessel.IMO));
        Assert.IsType<ConflictObjectResult>(await controller.Sync(vessel.Id));
        await controller.Delete(vessel.Id, [id]);
        Assert.Equal(1, Body(await controller.Sync(vessel.Id)).GetProperty("queued").GetInt32());
        Assert.IsType<ConflictObjectResult>(await controller.Sync(vessel.Id));
        Assert.Equal(4, await context.SyncOutbox.CountAsync(o => o.TargetNode == vessel.IMO));
    }

    [ShorePostgresFact]
    public async Task Sync_SimultaneousRequests_DoNotQueueDuplicateDefinitions()
    {
        await using var context = Database(); await context.Database.EnsureCreatedAsync();
        var vessel = Vessel(); context.Vessels.Add(vessel);
        context.SyncNodeTrackers.Add(new() { NodeId = vessel.IMO, VesselId = vessel.Id, IsRegistered = true });
        await context.SaveChangesAsync();
        await Controller(context).Create(vessel.Id, new() { ItemCode = "CONCURRENT", Name = "Filter", Unit = "PCS" });
        await using var first = Database(); await using var second = Database();
        var results = await Task.WhenAll(Controller(first).Sync(vessel.Id), Controller(second).Sync(vessel.Id));
        Assert.Single(results.OfType<OkObjectResult>());
        Assert.Single(results.OfType<ConflictObjectResult>());
        Assert.Equal(1, await context.SyncOutbox.CountAsync(o => o.TargetNode == vessel.IMO));
    }

    [ShorePostgresFact]
    public async Task Import_InvalidOrDuplicateBatch_WritesNothing_AndValidBatchIsVesselScoped()
    {
        await using var context = Database(); await context.Database.EnsureCreatedAsync();
        var vessel = Vessel(); context.Vessels.Add(vessel); await context.SaveChangesAsync();
        var controller = Controller(context);
        var valid = new VesselMaterialDefinition { ItemCode = "A", Name = "Filter", Unit = "PCS" };
        Assert.IsType<BadRequestObjectResult>(await controller.Import(vessel.Id, [valid, new() { ItemCode = "B", Name = "", Unit = "PCS" }]));
        Assert.False(await context.MaterialItemShips.AnyAsync(s => s.VesselId == vessel.Id));
        Assert.IsType<OkObjectResult>(await controller.Import(vessel.Id, [valid]));
        Assert.IsType<ConflictObjectResult>(await controller.Import(vessel.Id, [valid]));
        Assert.Single(await context.MaterialItemShips.Where(s => s.VesselId == vessel.Id).ToListAsync());
        Assert.IsType<ConflictObjectResult>(await controller.Sync(vessel.Id));
    }

    [ShorePostgresFact]
    public async Task LegacyMaterialUploads_AreIgnored_WithoutChangingShoreData()
    {
        await using var context = Database(); await context.Database.EnsureCreatedAsync();
        var vessel = Vessel(); var other = Vessel(); context.Vessels.AddRange(vessel, other);
        context.SyncNodeTrackers.AddRange(new() { NodeId = vessel.IMO, VesselId = vessel.Id, IsRegistered = true },
            new() { NodeId = other.IMO, VesselId = other.Id, IsRegistered = true });
        await context.SaveChangesAsync();
        var controller = Controller(context);
        var input = new VesselMaterialDefinition { ItemCode = "SHORE", Name = "Shore definition", Unit = "PCS", Notes = "New" };
        var id = Body(await controller.Create(vessel.Id, input)).GetProperty("Id").GetGuid();
        await controller.Delete(vessel.Id, [id]); context.ChangeTracker.Clear();
        var inbox = new SyncInboxService(context, Mock.Of<IConflictResolverService>(), NullLogger<SyncInboxService>.Instance,
            Mock.Of<INotificationService>(), new ConfigurationBuilder().Build(), Mock.Of<ISyncFileStorageService>(), new ReportEvaluationQueue());
        var item = new SyncQueueItemDto { TableName = "material_item", RecordKey = id.ToString(), ActionType = "UPDATE",
            OriginNode = vessel.IMO, SyncVersion = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Payload = JsonSerializer.Serialize(new { id, itemCode = "OLD", notes = "Old", isActive = true, onHandQuantity = 0, minStock = 3 }) };
        await inbox.ProcessIncomingAsync(item); await context.SaveChangesAsync(); context.ChangeTracker.Clear();
        var batch = await inbox.ProcessBatchAsync([new() { TableName = "material_item", RecordKey = Guid.NewGuid().ToString(), ActionType = "CREATE", OriginNode = vessel.IMO, SyncVersion = item.SyncVersion, Payload = item.Payload }]);
        Assert.Equal(1, batch.Succeeded); Assert.Equal(0, batch.Failed);
        var row = await context.MaterialItemShips.SingleAsync(s => s.Id == id);
        Assert.False(row.IsActive); Assert.Equal("SHORE", row.ShipItemCode); Assert.Equal("New", row.Notes);
        Assert.Equal(0, row.OnHandQuantity); Assert.Null(row.MinStock);
        item.OriginNode = other.IMO; item.SyncVersion++;
        await inbox.ProcessIncomingAsync(item);
        var activeId = Body(await controller.Create(vessel.Id, new() { ItemCode = "ACTIVE", Name = "Active", Unit = "PCS" })).GetProperty("Id").GetGuid();
        item.RecordKey = activeId.ToString(); item.ActionType = "DELETE"; item.OriginNode = vessel.IMO;
        await inbox.ProcessIncomingAsync(item); await context.SaveChangesAsync(); context.ChangeTracker.Clear();
        Assert.True((await context.MaterialItemShips.SingleAsync(s => s.Id == activeId)).IsActive);
    }

    [ShorePostgresFact]
    public async Task MaintenanceUpload_PreservesOriginalWorkCodeAndCalendarUnits()
    {
        await using var context = Database(); await context.Database.EnsureCreatedAsync();
        var vessel = Vessel(); context.Vessels.Add(vessel);
        context.SyncNodeTrackers.Add(new() { NodeId = vessel.IMO, VesselId = vessel.Id, IsRegistered = true });
        var asset = new EquipmentAsset { AssetCode = Guid.NewGuid().ToString("N"), AssetName = "Device", Category = "ENGINE", VesselId = vessel.Id };
        context.EquipmentAssets.Add(asset); await context.SaveChangesAsync();
        var inbox = new SyncInboxService(context, Mock.Of<IConflictResolverService>(), NullLogger<SyncInboxService>.Instance,
            Mock.Of<INotificationService>(), new ConfigurationBuilder().Build(), Mock.Of<ISyncFileStorageService>(), new ReportEvaluationQueue());
        var id = Guid.NewGuid();
        var result = await inbox.ProcessBatchAsync([new() {
            TableName = "maintenance_schedule", RecordKey = id.ToString(), ActionType = "CREATE", OriginNode = vessel.IMO,
            SyncVersion = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), Payload = JsonSerializer.Serialize(new {
                id, scheduleCode = Guid.NewGuid().ToString("N"), workCode = "E001", scheduleName = "Monthly work", equipmentAssetId = asset.Id,
                maintenanceCategory = "PERIODIC", intervalType = "CALENDAR", intervalMonths = 3, intervalYears = (int?)null, intervalDays = (int?)null,
                autoGenerate = false, isActive = true, priority = "NORMAL", createdAt = DateTime.UtcNow, updatedAt = DateTime.UtcNow,
            })
        }]);
        Assert.Equal(1, result.Succeeded); Assert.Equal(0, result.Failed);
        context.ChangeTracker.Clear();
        var schedule = await context.MaintenanceSchedules.SingleAsync(s => s.Id == id);
        Assert.Equal("E001", schedule.WorkCode); Assert.Equal(3, schedule.IntervalMonths);
        Assert.Null(schedule.IntervalDays); Assert.Null(schedule.IntervalYears); Assert.Equal(vessel.Id, schedule.VesselId);
    }
    [ShorePostgresFact]
    public async Task EquipmentUpload_UsesRegisteredNodeVessel_InsteadOfTreatingNodeIdAsImo()
    {
        await using var context = Database(); await context.Database.EnsureCreatedAsync();
        var vessel = Vessel(); var other = Vessel(); context.Vessels.AddRange(vessel, other);
        var nodeId = $"edge-{vessel.IMO}-main";
        context.SyncNodeTrackers.Add(new() { NodeId = nodeId, ImoNumber = vessel.IMO, VesselId = vessel.Id, IsRegistered = true });
        await context.SaveChangesAsync();
        var inbox = new SyncInboxService(context, Mock.Of<IConflictResolverService>(), NullLogger<SyncInboxService>.Instance,
            Mock.Of<INotificationService>(), new ConfigurationBuilder().Build(), Mock.Of<ISyncFileStorageService>(), new ReportEvaluationQueue());
        var id = Guid.NewGuid();
        var result = await inbox.ProcessBatchAsync([new() { TableName = "equipment_asset", RecordKey = id.ToString(), ActionType = "CREATE", OriginNode = nodeId,
            SyncVersion = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), Payload = JsonSerializer.Serialize(new {
                id, assetCode = Guid.NewGuid().ToString("N"), assetName = "Imported device", category = "ENGINE", vesselId = other.Id, originNode = "SHIP_01",
                isActive = true, createdAt = DateTime.UtcNow, updatedAt = DateTime.UtcNow,
            }) }]);
        Assert.Equal(1, result.Succeeded); Assert.Equal(0, result.Failed);
        context.ChangeTracker.Clear();
        Assert.Equal(vessel.Id, (await context.EquipmentAssets.SingleAsync(a => a.Id == id)).VesselId);
    }

    [ShorePostgresFact]
    public async Task CrewPull_AcceptsLegacyImoTarget_QueuesReferences_AndKeepsAckScopedToVessel()
    {
        await using var context = Database(); await context.Database.EnsureCreatedAsync();
        var vessel = Vessel(); var other = Vessel(); context.Vessels.AddRange(vessel, other);
        var nodeId = $"edge-{vessel.IMO}-main"; var otherNode = $"edge-{other.IMO}-main";
        context.SyncNodeTrackers.AddRange(new() { NodeId = nodeId, VesselId = vessel.Id, ImoNumber = vessel.IMO, IsRegistered = true },
            new() { NodeId = otherNode, VesselId = other.Id, ImoNumber = other.IMO, IsRegistered = true });
        var rank = new Maritime.Shared.Models.Crew.Rank { RankCode = Guid.NewGuid().ToString("N")[..8], RankName = "Captain" };
        var country = new Maritime.Shared.Models.Crew.Country { CountryCode = Guid.NewGuid().ToString("N")[..3], CountryName = "Test" };
        context.Ranks.Add(rank); context.Countries.Add(country); await context.SaveChangesAsync();
        var crewKey = Guid.NewGuid().ToString();
        var pending = new Maritime.Shared.Models.Sync.SyncOutbox { TargetNode = vessel.IMO, TableName = "crew_member", RecordKey = crewKey,
            Payload = JsonSerializer.Serialize(new { rankId = rank.Id, countryId = country.Id, onboardStatus = "PendingReview" }) };
        context.SyncOutbox.Add(pending); await context.SaveChangesAsync();
        var outbox = new SyncOutboxService(context, NullLogger<SyncOutboxService>.Instance, Mock.Of<ISyncFileStorageService>());
        var pull = await outbox.GetPendingItemsAsync(nodeId, null, null, 1000);
        Assert.Contains(pull.Items, i => i.OutboxId == pending.Id);
        Assert.Contains(pull.Items, i => i.TableName == "rank" && i.RecordKey == rank.Id.ToString());
        Assert.Contains(pull.Items, i => i.TableName == "country" && i.RecordKey == country.Id.ToString());
        await outbox.GetPendingItemsAsync(nodeId, null, null, 1000);
        Assert.Equal(1, await context.SyncOutbox.CountAsync(o => o.TargetNode == nodeId && o.TableName == "rank" && o.RecordKey == rank.Id.ToString()));
        await outbox.AcknowledgeDeliveryAsync(otherNode, [pending.Id]);
        context.ChangeTracker.Clear();
        Assert.Null((await context.SyncOutbox.SingleAsync(o => o.Id == pending.Id)).DeliveredAt);
        await outbox.AcknowledgeDeliveryAsync(nodeId, [pending.Id]);
        context.ChangeTracker.Clear();
        Assert.NotNull((await context.SyncOutbox.SingleAsync(o => o.Id == pending.Id)).DeliveredAt);
        var newKey = Guid.NewGuid().ToString();
        await outbox.EnqueueAsync(vessel.IMO, "crew_member", newKey, Maritime.Shared.Models.Sync.SyncActionType.UPDATE, new { id = newKey });
        Assert.Equal(nodeId, (await context.SyncOutbox.SingleAsync(o => o.RecordKey == newKey)).TargetNode);
    }

    [ShorePostgresFact]
    public async Task RepairEquipmentOwnership_UsesSuccessfulSyncLogs_AndSkipsAmbiguousOrExistingOwners()
    {
        await using var context = Database(); await context.Database.EnsureCreatedAsync();
        var vessel = Vessel(); var other = Vessel(); context.Vessels.AddRange(vessel, other);
        var node = $"edge-{vessel.IMO}-main"; var otherNode = $"edge-{other.IMO}-main";
        context.SyncNodeTrackers.AddRange(new() { NodeId = node, VesselId = vessel.Id, IsRegistered = true },
            new() { NodeId = otherNode, VesselId = other.Id, IsRegistered = true });
        EquipmentAsset Asset(Guid? owner = null) => new() { AssetCode = Guid.NewGuid().ToString("N"), AssetName = "Device", Category = "ENGINE", VesselId = owner };
        var repair = Asset(); var ambiguous = Asset(); var existing = Asset(other.Id); var noEvidence = Asset();
        context.EquipmentAssets.AddRange(repair, ambiguous, existing, noEvidence);
        Maritime.Shared.Models.Sync.SyncLog Log(EquipmentAsset asset, string source) => new() { TableName = "equipment_asset", RecordKey = asset.Id.ToString(), OriginNode = source, Status = "SUCCESS", Direction = "EDGE_TO_SHORE" };
        context.SyncLogs.AddRange(Log(repair, node), Log(ambiguous, node), Log(ambiguous, otherNode), Log(existing, node));
        await context.SaveChangesAsync();
        var migration = new ProductApi.Migrations.RepairSyncedEquipmentVesselOwnership();
        var sql = Assert.IsType<Microsoft.EntityFrameworkCore.Migrations.Operations.SqlOperation>(Assert.Single(migration.UpOperations)).Sql;
        await context.Database.ExecuteSqlRawAsync(sql);
        context.ChangeTracker.Clear();
        Assert.Equal(vessel.Id, (await context.EquipmentAssets.SingleAsync(a => a.Id == repair.Id)).VesselId);
        Assert.Null((await context.EquipmentAssets.SingleAsync(a => a.Id == ambiguous.Id)).VesselId);
        Assert.Equal(other.Id, (await context.EquipmentAssets.SingleAsync(a => a.Id == existing.Id)).VesselId);
        Assert.Null((await context.EquipmentAssets.SingleAsync(a => a.Id == noEvidence.Id)).VesselId);
    }
}
