using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using ProductApi.Controllers;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.Services.Crew;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

/// <summary>
/// Mỗi tàu chỉ được nhận thuyền viên của chính nó. Lỗi cũ: dữ liệu thuyền viên phát "*" cho mọi tàu và
/// nút "Đồng bộ lại" gửi cả công ty, nên tàu PACIFIC VOYAGER nhận cả 14 thuyền viên của MEKONG SPIRIT.
/// </summary>
public partial class SyncReliabilityTests
{
    private static async Task<CrewMember> Crew(AppDbContext db, Guid? vesselId, string code)
    {
        var crew = new CrewMember { CrewId = code + "-" + Guid.NewGuid().ToString("N")[..6], FullName = code, VesselId = vesselId, IsOnboard = vesselId.HasValue };
        var suppress = db.SuppressAutoOutbox;
        db.SuppressAutoOutbox = true;
        db.CrewMembers.Add(crew);
        await db.SaveChangesAsync();
        db.SuppressAutoOutbox = suppress;
        return crew;
    }

    private static async Task<List<string>> PendingKeys(SyncOutboxService outbox, string node, string table) =>
        (await outbox.GetPendingItemsAsync(node, null, null, 500)).Items
            .Where(i => i.TableName == table).Select(i => i.RecordKey).ToList();

    [ShorePostgresFact]
    public async Task CrewData_CannotBeBroadcastToEveryShip()
    {
        await using var db = await Database(); var outbox = Outbox(db);
        foreach (var table in SyncOutboxService.CrewScopedTables)
            await Assert.ThrowsAsync<InvalidOperationException>(() => outbox.BroadcastAsync(table, Guid.NewGuid().ToString(), SyncActionType.UPDATE, new { }));
        Assert.Empty(await db.SyncOutbox.ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task CrewData_GoesOnlyToTheShipTheCrewBelongsTo()
    {
        await using var db = await Database(); var outbox = Outbox(db);
        var vesselA = await BindNode(db, "edge-a"); await BindNode(db, "edge-b");
        var onA = await Crew(db, vesselA, "A");

        await outbox.EnqueueForCrewAsync(onA.Id, "crew_member", onA.Id.ToString(), SyncActionType.UPDATE, onA);

        Assert.Equal([onA.Id.ToString()], await PendingKeys(outbox, "edge-a", "crew_member"));
        Assert.Empty(await PendingKeys(outbox, "edge-b", "crew_member"));
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task CrewData_ForPoolCrewWithoutShip_IsNotSentAnywhere()
    {
        await using var db = await Database(); var outbox = Outbox(db);
        await BindNode(db, "edge-a");
        var pool = await Crew(db, null, "POOL");

        await outbox.EnqueueForCrewAsync(pool.Id, "crew_member", pool.Id.ToString(), SyncActionType.UPDATE, pool);
        await outbox.EnqueueForVesselAsync(null, "crew_member", pool.Id.ToString(), SyncActionType.UPDATE, pool);

        Assert.Empty(await db.SyncOutbox.Where(o => o.TableName == "crew_member").ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task LegacyBroadcastCrewItems_AreNotDeliveredToNewShips_ButMasterDataStillIs()
    {
        await using var db = await Database(); var outbox = Outbox(db);
        await BindNode(db, "edge-new");
        // Gói "*" do bản cũ để lại trong hàng đợi: tàu mới cài đặt không được kéo về thuyền viên của tàu khác.
        db.SyncOutbox.Add(new SyncOutbox { TargetNode = "*", TableName = "crew_member", RecordKey = Guid.NewGuid().ToString(), ActionType = SyncActionType.SNAPSHOT, Payload = "{}", SyncVersion = 1, CreatedAt = DateTime.UtcNow });
        db.SyncOutbox.Add(new SyncOutbox { TargetNode = "*", TableName = "crew_certificate", RecordKey = "7", ActionType = SyncActionType.SNAPSHOT, Payload = "{}", SyncVersion = 1, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
        await outbox.BroadcastAsync("rank", "1", SyncActionType.SNAPSHOT, new { Id = 1 });

        var items = (await outbox.GetPendingItemsAsync("edge-new", null, null, 50)).Items;
        Assert.DoesNotContain(items, i => SyncOutboxService.CrewScopedTables.Contains(i.TableName));
        Assert.Contains(items, i => i.TableName == "rank");
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task ForceResync_SendsOnlyThatShipsCrew()
    {
        await using var db = await Database(); var outbox = Outbox(db);
        var vesselA = await BindNode(db, "edge-a"); var vesselB = await BindNode(db, "edge-b");
        var onA = await Crew(db, vesselA, "A"); var onB = await Crew(db, vesselB, "B"); await Crew(db, null, "POOL");

        var controller = new SyncDashboardController(db, Mock.Of<ProductApi.Security.IDataEncryptionService>(), NullLogger<SyncDashboardController>.Instance);
        await controller.ForceResync("edge-a", Push(db));

        Assert.Equal([onA.Id.ToString()], await PendingKeys(outbox, "edge-a", "crew_member"));
        Assert.DoesNotContain(onB.Id.ToString(), await PendingKeys(outbox, "edge-b", "crew_member"));
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task AssignToAnotherShip_WithoutSigningOff_IsRejected()
    {
        await using var db = await Database();
        var vesselA = await BindNode(db, "edge-a"); var vesselB = await BindNode(db, "edge-b");
        var crew = await Crew(db, vesselA, "A");
        var outbox = new Mock<ISyncOutboxService>();

        var service = new CrewService(db, NullLogger<CrewService>.Instance, outbox.Object);
        await Assert.ThrowsAsync<ArgumentException>(() => service.AssignToVesselAsync(crew.Id, vesselB));

        db.ChangeTracker.Clear();
        Assert.Equal(vesselA, (await db.CrewMembers.SingleAsync(c => c.Id == crew.Id)).VesselId);
        outbox.VerifyNoOtherCalls();
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task DeleteCrew_TellsOnlyTheirShip()
    {
        await using var db = await Database();
        var vesselA = await BindNode(db, "edge-a");
        var crew = await Crew(db, vesselA, "A");
        var outbox = new Mock<ISyncOutboxService>();

        Assert.True(await new CrewService(db, NullLogger<CrewService>.Instance, outbox.Object).DeleteCrewAsync(crew.Id));

        outbox.Verify(o => o.EnqueueForVesselAsync(vesselA, "crew_member", crew.Id.ToString(), SyncActionType.DELETE, It.IsAny<object>()), Times.Once);
        outbox.Verify(o => o.BroadcastAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<SyncActionType>(), It.IsAny<object>()), Times.Never);
        await db.Database.EnsureDeletedAsync();
    }
}
