using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using ProductApi.DTOs;
using ProductApi.Models;
using ProductApi.Services.Sync;
using ProductApi.Services.Voyage;
using Xunit;

namespace ProductApi.Tests;

public partial class SyncReliabilityTests
{
    [ShorePostgresFact]
    public async Task LegacyEdgePortEvents_AreAcknowledgedWithoutWritingTheShoreCatalog()
    {
        await using var db = await Database(); await BindNode(db, "A");
        db.Ports.Add(new() { PortCode = "VNSGN", PortName = "Shore catalog" });
        await db.SaveChangesAsync(); var port = await db.Ports.SingleAsync();
        var stream = Guid.NewGuid();
        SyncQueueItemDto Item(string key, long sequence, string action, object payload) => new()
        {
            EventId = Guid.NewGuid(), StreamId = stream, OriginNode = "A", TableName = "port", RecordKey = key,
            SyncVersion = sequence, ActionType = action, Timestamp = DateTime.UtcNow,
            Payload = JsonSerializer.Serialize(payload)
        };
        var items = new List<SyncQueueItemDto>
        {
            Item(port.Id.ToString(), 1, "UPDATE", new { port.Id, port.PortCode, PortName = "Edge edit" }),
            Item(port.Id.ToString(), 2, "DELETE", new { port.Id, port.PortCode }),
            Item("99999", 3, "CREATE", new { Id = 99999, PortCode = "TEST", PortName = "Edge addition" })
        };
        var result = await Inbox(db).ProcessBatchAsync(items); db.ChangeTracker.Clear();
        Assert.Empty(result.FailedItems); Assert.Equal(3, result.Succeeded);
        Assert.Equal(items.Select(i => i.EventId).Order(), result.AcknowledgedEventIds.Order());
        var retained = Assert.Single(await db.Ports.ToListAsync());
        Assert.Equal("Shore catalog", retained.PortName); Assert.True(retained.IsActive);
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task VoyageService_CreateUpdateDelete_RoutesParentAndChildrenOnlyToTheirVessel()
    {
        await using var db = await Database(); var vesselId = await BindNode(db, "A"); await BindNode(db, "B");
        var vessel = await db.Vessels.FindAsync(vesselId);
        var outbox = Outbox(db);
        var service = new VoyageService(db, NullLogger<VoyageService>.Instance, outbox);
        var id = await service.CreateVoyageAsync(new CreateVoyageRequest
        {
            VoyageNumber = "ROUTE-A", VesselIMO = vessel!.IMO,
            PlanLegs = [new() { Sequence = 1, FromPortCode = "VNSGN", ToPortCode = "VNHAN" }],
            PortCalls = [new() { PortCode = "VNSGN" }],
            CostEstimates = [new() { CostCategory = "FUEL", EstimatedAmount = 500 }]
        });
        var events = await db.SyncOutbox.OrderBy(o => o.Id).ToListAsync();
        Assert.All(events, item => Assert.Equal("A", item.TargetNode));
        Assert.Contains(events, item => item.TableName == "voyage_cost_estimate");
        Assert.Equal("voyage_record", events[0].TableName);
        Assert.Empty((await outbox.GetPendingItemsAsync("B", null, null, 100)).Items);
        Assert.Equal(events.Count, (await outbox.GetPendingItemsAsync("A", null, null, 100)).Items.Count);
        await service.UpdateVoyageAsync(id, new UpdateVoyageRequest { VoyageInstructions = "Updated", PlanLegs = [new() { Sequence = 2 }] });
        db.ChangeTracker.Clear();
        await service.DeleteVoyageAsync(id);
        events = await db.SyncOutbox.OrderBy(o => o.Id).ToListAsync();
        Assert.All(events, item => Assert.Equal("A", item.TargetNode));
        Assert.Contains(events, item => item.TableName == "voyage_plan_leg" && item.ActionType == SyncActionType.DELETE);
        Assert.Equal("voyage_record", events.Last().TableName); Assert.Equal(SyncActionType.DELETE, events.Last().ActionType);
        Assert.Empty((await outbox.GetPendingItemsAsync("B", null, null, 100)).Items);
        Assert.False(await db.VoyageRecords.AnyAsync()); await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task UnassignedVoyage_IsKeptPending_AndGetsScopedWhenItsVesselIsAssigned()
    {
        await using var db = await Database(); var vesselId = await BindNode(db, "A"); await BindNode(db, "B");
        var voyage = new VoyageRecord { VoyageNumber = "UNASSIGNED", OriginNode = "SHORE" };
        db.VoyageRecords.Add(voyage); await db.SaveChangesAsync();
        Assert.Equal($"voyage:{voyage.Id}", (await db.SyncOutbox.SingleAsync()).TargetNode);
        var outbox = Outbox(db); Assert.Empty((await outbox.GetPendingItemsAsync("A", null, null, 100)).Items);
        voyage.VesselIMO = (await db.Vessels.FindAsync(vesselId))!.IMO; await db.SaveChangesAsync();
        Assert.Empty((await outbox.GetPendingItemsAsync("B", null, null, 100)).Items);
        Assert.Equal(2, (await outbox.GetPendingItemsAsync("A", null, null, 100)).Items.Count);
        Assert.All(await db.SyncOutbox.ToListAsync(), item => Assert.Equal("A", item.TargetNode));
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task LegacyVoyageBroadcast_IsRoutedWithoutLosingItsRecipientReceipt_AndUnscopedDeleteIsHeld()
    {
        await using var db = await Database(); var vesselId = await BindNode(db, "A"); await BindNode(db, "B");
        db.SuppressAutoOutbox = true;
        var voyage = new VoyageRecord { VoyageNumber = "LEGACY", VesselIMO = (await db.Vessels.FindAsync(vesselId))!.IMO };
        db.VoyageRecords.Add(voyage); await db.SaveChangesAsync();
        var legacy = new SyncOutbox { TableName = "voyage_record", RecordKey = voyage.Id.ToString(), TargetNode = "*", Payload = JsonSerializer.Serialize(voyage), ActionType = SyncActionType.SNAPSHOT };
        var missingKey = Guid.NewGuid();
        var unscoped = new SyncOutbox { TableName = "voyage_crew_assignment", RecordKey = missingKey.ToString(), TargetNode = "*", Payload = JsonSerializer.Serialize(new { Id = missingKey }), ActionType = SyncActionType.DELETE };
        db.SyncOutbox.AddRange(legacy, unscoped); await db.SaveChangesAsync();
        db.SyncOutboxDeliveries.Add(new() { OutboxId = legacy.Id, NodeId = "A", AppliedAtUtc = DateTime.UtcNow }); await db.SaveChangesAsync();
        var outbox = Outbox(db);
        Assert.Empty((await outbox.GetPendingItemsAsync("B", null, null, 100)).Items);
        Assert.Empty((await outbox.GetPendingItemsAsync("A", null, null, 100)).Items);
        db.ChangeTracker.Clear();
        var routed = await db.SyncOutbox.FindAsync(legacy.Id); Assert.Equal("A", routed!.TargetNode); Assert.NotNull(routed.DeliveredAt);
        Assert.StartsWith("unrouted:", (await db.SyncOutbox.FindAsync(unscoped.Id))!.TargetNode);
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task CrewRecovery_OnlyRestoresServiceHistoryUploadedByTheRecipientVessel()
    {
        await using var db = await Database(); await BindNode(db, "A"); await BindNode(db, "B");
        var crew = new CrewMember { CrewId = "RECOVERY", FullName = "Recovery" };
        db.CrewMembers.Add(crew); await db.SaveChangesAsync();
        var a = new ServiceRecord { CrewMemberId = crew.Id, OriginNode = "A", VesselName = "A", BoardingDate = DateTime.UtcNow };
        var b = new ServiceRecord { CrewMemberId = crew.Id, OriginNode = "B", VesselName = "B", BoardingDate = DateTime.UtcNow };
        db.ServiceRecords.AddRange(a, b); await db.SaveChangesAsync();
        var orchestrator = new CrewSyncOrchestrator(db, Outbox(db), NullLogger<CrewSyncOrchestrator>.Instance);
        await orchestrator.QueueFullCrewSnapshotAsync("A");
        var histories = await db.SyncOutbox.Where(o => o.TableName == "service_record").ToListAsync();
        var history = Assert.Single(histories); Assert.Equal(a.Id.ToString(), history.RecordKey); Assert.Equal("A", history.TargetNode);
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task VoyageWrite_RollsBackWhenTheScopedOutboxWriteFails()
    {
        await using var db = await Database(new RejectOutbox()); var vesselId = await BindNode(db, "A");
        var service = new VoyageService(db, NullLogger<VoyageService>.Instance, Outbox(db));
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CreateVoyageAsync(new CreateVoyageRequest
        {
            VoyageNumber = "ROLLBACK", VesselIMO = db.Vessels.Local.Single(v => v.Id == vesselId).IMO,
            PlanLegs = [new() { Sequence = 1 }]
        }));
        db.ChangeTracker.Clear();
        Assert.False(await db.VoyageRecords.AnyAsync()); Assert.False(await db.Set<VoyagePlanLeg>().AnyAsync()); Assert.False(await db.SyncOutbox.AnyAsync());
        await db.Database.EnsureDeletedAsync();
    }
}
