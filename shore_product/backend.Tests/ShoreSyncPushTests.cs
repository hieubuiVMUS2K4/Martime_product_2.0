using System.Text.Json;
using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

/// <summary>
/// Đồng bộ bờ → tàu theo nhóm, một bờ phục vụ nhiều tàu. Mỗi test dựng 2 tàu (A, B) với node riêng và kiểm:
/// dữ liệu riêng tàu chỉ tới đúng tàu, danh mục dùng chung tới mọi tàu được chọn, không gì đi lạc.
/// </summary>
public partial class SyncReliabilityTests
{
    private static ShoreSyncPushService Push(AppDbContext db) =>
        new(db, Outbox(db), NullLogger<ShoreSyncPushService>.Instance);

    private static Task<List<SyncOutbox>> Queued(AppDbContext db, string node, string table) =>
        db.SyncOutbox.AsNoTracking().Where(o => o.TargetNode == node && o.TableName == table).OrderBy(o => o.Id).ToListAsync();

    private static JsonElement Json(SyncOutbox row) => JsonDocument.Parse(row.Payload).RootElement;

    private static string? Prop(JsonElement e, string name) =>
        e.EnumerateObject().FirstOrDefault(p => p.Name.Equals(name, StringComparison.OrdinalIgnoreCase)).Value is { ValueKind: not JsonValueKind.Undefined } v
            ? v.ToString() : null;

    [ShorePostgresFact]
    public async Task PushCrew_ToAllShips_EachShipGetsOnlyItsOwnCrewAndRoster()
    {
        await using var db = await Database();
        var vesselA = await BindNode(db, "edge-a"); var vesselB = await BindNode(db, "edge-b");
        var onA = await Crew(db, vesselA, "A"); var onB = await Crew(db, vesselB, "B"); var pool = await Crew(db, null, "POOL");

        var result = await Push(db).PushAsync("ALL", [SyncScope.Crew]);

        Assert.Equal(2, result.Nodes.Count);
        Assert.Equal([onA.Id.ToString()], (await Queued(db, "edge-a", "crew_member")).Select(o => o.RecordKey));
        Assert.Equal([onB.Id.ToString()], (await Queued(db, "edge-b", "crew_member")).Select(o => o.RecordKey));
        Assert.DoesNotContain(await db.SyncOutbox.ToListAsync(), o => o.RecordKey == pool.Id.ToString());

        var imoA = await db.Vessels.Where(v => v.Id == vesselA).Select(v => v.IMO).SingleAsync();
        var rosterA = Json(Assert.Single(await Queued(db, "edge-a", SyncOutboxService.CrewRosterTable)));
        Assert.Equal([onA.Id.ToString()], rosterA.GetProperty("crewIds").EnumerateArray().Select(x => x.GetString()));
        Assert.Equal(imoA, Prop(rosterA, SyncOutboxService.TargetVesselImoField));
        Assert.All(await Queued(db, "edge-a", "crew_member"), o => Assert.Equal(imoA, Prop(Json(o), SyncOutboxService.TargetVesselImoField)));
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task PushCrew_ToShipWithoutCrew_SendsEmptyRosterSoStrayCrewReturnToShore()
    {
        await using var db = await Database();
        await BindNode(db, "edge-a");

        await Push(db).PushAsync("edge-a", [SyncScope.Crew]);

        Assert.Empty(await Queued(db, "edge-a", "crew_member"));
        var roster = Json(Assert.Single(await Queued(db, "edge-a", SyncOutboxService.CrewRosterTable)));
        Assert.Empty(roster.GetProperty("crewIds").EnumerateArray());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task PushCatalog_ToAllShips_SendsSameCatalogIncludingCompanyMaterials()
    {
        await using var db = await Database();
        await BindNode(db, "edge-a"); await BindNode(db, "edge-b");
        db.SuppressAutoOutbox = true;
        db.Countries.Add(new Country { CountryCode = "VN", CountryName = "Vietnam" });
        db.Ranks.Add(new Rank { RankCode = "AB", RankName = "Able Seaman" });
        var category = new MaterialCategory { CategoryCode = "SPARE", Name = "Phụ tùng" };
        db.MaterialCategories.Add(category); await db.SaveChangesAsync();
        db.MaterialItems.Add(new MaterialItem { ItemCode = "IMPA-1", Name = "Bulong", CategoryId = category.Id });
        await db.SaveChangesAsync();

        await Push(db).PushAsync("ALL", [SyncScope.Catalog]);

        foreach (var node in new[] { "edge-a", "edge-b" })
            foreach (var table in new[] { "country", "rank", "material_category", "material_item_catalog" })
                Assert.Single(await Queued(db, node, table));
        Assert.DoesNotContain(await db.SyncOutbox.ToListAsync(), o => o.TargetNode == "*");
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task PushVessel_SendsOnlyThatShipsParticularsAndShipMaterials()
    {
        await using var db = await Database();
        var vesselA = await BindNode(db, "edge-a"); var vesselB = await BindNode(db, "edge-b");
        db.SuppressAutoOutbox = true;
        var category = new MaterialCategory { CategoryCode = "SPARE", Name = "Phụ tùng" };
        db.MaterialCategories.Add(category); await db.SaveChangesAsync();
        db.MaterialItems.Add(new MaterialItem { ItemCode = "IMPA-1", Name = "Bulong", CategoryId = category.Id });
        var shipA = new MaterialItemShip { ShipItemCode = "A-1", MaterialItemCode = "IMPA-1", CategoryId = category.Id, VesselId = vesselA };
        var shipB = new MaterialItemShip { ShipItemCode = "B-1", MaterialItemCode = "IMPA-1", CategoryId = category.Id, VesselId = vesselB };
        db.MaterialItemShips.AddRange(shipA, shipB); await db.SaveChangesAsync();

        await Push(db).PushAsync("edge-a", [SyncScope.Vessel]);

        var imoA = await db.Vessels.Where(v => v.Id == vesselA).Select(v => v.IMO).SingleAsync();
        Assert.Equal(imoA, Prop(Json(Assert.Single(await Queued(db, "edge-a", "ship_data"))), "ImoNumber"));
        Assert.Equal([shipA.Id.ToString()], (await Queued(db, "edge-a", "vessel_material_definition")).Select(o => o.RecordKey));
        Assert.Empty(await db.SyncOutbox.Where(o => o.TargetNode == "edge-b").ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task PushEverything_ToOneShip_LeavesOtherShipsUntouched()
    {
        await using var db = await Database();
        var vesselA = await BindNode(db, "edge-a"); var vesselB = await BindNode(db, "edge-b");
        await Crew(db, vesselA, "A"); await Crew(db, vesselB, "B");

        var result = await Push(db).PushAsync("edge-a", Enum.GetValues<SyncScope>());

        Assert.Equal("edge-a", Assert.Single(result.Nodes).NodeId);
        Assert.All(await db.SyncOutbox.ToListAsync(), o => Assert.Equal("edge-a", o.TargetNode));
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task Push_RejectsUnknownOrRevokedShipAndEmptySelection()
    {
        await using var db = await Database();
        await BindNode(db, "edge-a"); await BindNode(db, "edge-revoked");
        (await db.SyncNodeTrackers.SingleAsync(n => n.NodeId == "edge-revoked")).IsRevoked = true;
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<ArgumentException>(() => Push(db).PushAsync("edge-unknown", [SyncScope.Crew]));
        await Assert.ThrowsAsync<ArgumentException>(() => Push(db).PushAsync("edge-revoked", [SyncScope.Crew]));
        await Assert.ThrowsAsync<ArgumentException>(() => Push(db).PushAsync("edge-a", []));
        var all = await Push(db).PushAsync("ALL", [SyncScope.Crew]);
        Assert.Equal(["edge-a"], all.Nodes.Select(n => n.NodeId));
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task CrewData_ToUnresolvableTarget_IsRefused()
    {
        await using var db = await Database(); var outbox = Outbox(db);
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            outbox.EnqueueAsync("edge-nobody", "crew_member", Guid.NewGuid().ToString(), SyncActionType.SNAPSHOT, new { Id = Guid.NewGuid() }));
        Assert.Empty(await db.SyncOutbox.ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }
}
