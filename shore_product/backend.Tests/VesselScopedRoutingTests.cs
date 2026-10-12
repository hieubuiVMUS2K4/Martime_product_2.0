using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

/// <summary>
/// Quy tắc một bờ — nhiều tàu: DANH MỤC (dữ liệu chung công ty) gửi cho mọi tàu; mọi dữ liệu khác (thuyền viên,
/// chuyến đi, thông số/vật tư/thiết bị, báo cáo của tàu) chỉ tới đúng một tàu, kèm IMO tàu đích — không bao giờ "*".
/// </summary>
public partial class SyncReliabilityTests
{
    private static async Task<string> ImoOf(AppDbContext db, Guid vesselId) =>
        await db.Vessels.Where(v => v.Id == vesselId).Select(v => v.IMO).SingleAsync();

    // ---------- Tự xếp hàng khi bờ sửa dữ liệu ----------

    [ShorePostgresFact]
    public async Task AutoOutbox_SharedCatalogEdits_GoToEveryShip()
    {
        await using var db = await Database();
        await BindNode(db, "edge-a"); await BindNode(db, "edge-b");

        db.Ranks.Add(new Rank { RankCode = "C/O", RankName = "Chief Officer" });
        db.Ports.Add(new Port { PortCode = "VNSGN", PortName = "Sai Gon", CountryCode = "VN" });
        await db.SaveChangesAsync();

        var rows = await db.SyncOutbox.Where(o => o.TableName == "rank" || o.TableName == "port").ToListAsync();
        Assert.Equal(2, rows.Count);
        Assert.All(rows, o => Assert.Equal("*", o.TargetNode));
        Assert.All(rows, o => Assert.Null(StampOf(o)));
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task AutoOutbox_VoyageOfShipA_GoesOnlyToShipA_AndItsLegsFollowTheVoyage()
    {
        await using var db = await Database();
        var vesselA = await BindNode(db, "edge-a"); await BindNode(db, "edge-b");
        var imoA = await ImoOf(db, vesselA);

        var voyage = new VoyageRecord { VoyageNumber = "V-A-01", VesselIMO = imoA, OriginNode = "SHORE" };
        db.VoyageRecords.Add(voyage); await db.SaveChangesAsync();
        db.VoyagePlanLegs.Add(new VoyagePlanLeg { VoyageId = voyage.Id, Sequence = 1 }); await db.SaveChangesAsync();

        var rows = await db.SyncOutbox.Where(o => o.TableName == "voyage_record" || o.TableName == "voyage_plan_leg").ToListAsync();
        Assert.Equal(2, rows.Count);
        Assert.All(rows, o => Assert.Equal("edge-a", o.TargetNode));
        Assert.All(rows, o => Assert.Equal(imoA, StampOf(o)));
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task AutoOutbox_VoyageWithoutShip_IsNotSentAnywhere()
    {
        await using var db = await Database();
        await BindNode(db, "edge-a");

        db.VoyageRecords.Add(new VoyageRecord { VoyageNumber = "V-NOSHIP", OriginNode = "SHORE" });
        await db.SaveChangesAsync();

        Assert.Empty(await db.SyncOutbox.Where(o => o.TableName == "voyage_record").ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task AutoOutbox_EquipmentEditedOnShore_GoesOnlyToItsShip()
    {
        await using var db = await Database();
        var vesselA = await BindNode(db, "edge-a"); await BindNode(db, "edge-b");

        db.EquipmentAssets.Add(new EquipmentAsset { AssetCode = "ME-01", AssetName = "Main engine", Category = "ENGINE", VesselId = vesselA });
        await db.SaveChangesAsync();

        var row = Assert.Single(await db.SyncOutbox.Where(o => o.TableName == "equipment_asset").ToListAsync());
        Assert.Equal("edge-a", row.TargetNode);
        Assert.Equal(await ImoOf(db, vesselA), StampOf(row));
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task Pull_LegacyBroadcastOfShipData_IsNeverDelivered_ButCatalogIs()
    {
        await using var db = await Database(); var outbox = Outbox(db);
        await BindNode(db, "edge-new");
        // Gói "*" của dữ liệu riêng tàu (do bản cũ để lại): không tàu nào được nhận.
        foreach (var table in new[] { "voyage_record", "equipment_asset", "maritime_report", "ship_data" })
            db.SyncOutbox.Add(new SyncOutbox { TargetNode = "*", TableName = table, RecordKey = Guid.NewGuid().ToString(), ActionType = SyncActionType.SNAPSHOT, Payload = "{}", SyncVersion = 1, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
        await outbox.BroadcastAsync("port", "1", SyncActionType.SNAPSHOT, new { Id = 1 });

        var items = (await outbox.GetPendingItemsAsync("edge-new", null, null, 50)).Items;
        Assert.Equal(["port"], items.Select(i => i.TableName));
        await db.Database.EnsureDeletedAsync();
    }

    // ---------- Gửi theo nhóm từ màn hình Đồng bộ ----------

    [ShorePostgresFact]
    public async Task PushEquipment_ToAllShips_EachShipGetsOnlyItsOwnEquipment()
    {
        await using var db = await Database();
        var vesselA = await BindNode(db, "edge-a"); var vesselB = await BindNode(db, "edge-b");
        db.SuppressAutoOutbox = true;
        db.EquipmentAssets.Add(new EquipmentAsset { AssetCode = "A-ME", AssetName = "A main engine", Category = "ENGINE", VesselId = vesselA });
        db.EquipmentAssets.Add(new EquipmentAsset { AssetCode = "B-ME", AssetName = "B main engine", Category = "ENGINE", VesselId = vesselB });
        await db.SaveChangesAsync(); db.SuppressAutoOutbox = false;

        await Push(db).PushAsync("ALL", [SyncScope.Equipment]);

        var a = await Queued(db, "edge-a", "equipment_asset"); var b = await Queued(db, "edge-b", "equipment_asset");
        Assert.Equal(["A-ME"], a.Select(o => Prop(Json(o), "assetCode")));
        Assert.Equal(["B-ME"], b.Select(o => Prop(Json(o), "assetCode")));
        Assert.All(a, o => Assert.NotNull(StampOf(o)));
        Assert.Empty(await db.SyncOutbox.Where(o => o.TargetNode == "*").ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task PushVoyages_SendsOnlyThatShipsVoyages_WithTheirLegs()
    {
        await using var db = await Database();
        var vesselA = await BindNode(db, "edge-a"); var vesselB = await BindNode(db, "edge-b");
        db.SuppressAutoOutbox = true;
        var va = new VoyageRecord { VoyageNumber = "V-A", VesselIMO = await ImoOf(db, vesselA), OriginNode = "SHORE" };
        var vb = new VoyageRecord { VoyageNumber = "V-B", VesselIMO = await ImoOf(db, vesselB), OriginNode = "SHORE" };
        db.VoyageRecords.AddRange(va, vb); await db.SaveChangesAsync();
        db.VoyagePlanLegs.Add(new VoyagePlanLeg { VoyageId = va.Id, Sequence = 1 });
        db.VoyagePlanLegs.Add(new VoyagePlanLeg { VoyageId = vb.Id, Sequence = 1 });
        await db.SaveChangesAsync(); db.SuppressAutoOutbox = false;

        await Push(db).PushAsync("edge-a", [SyncScope.Voyages]);

        Assert.Equal([va.Id.ToString()], (await Queued(db, "edge-a", "voyage_record")).Select(o => o.RecordKey));
        Assert.Single(await Queued(db, "edge-a", "voyage_plan_leg"));
        Assert.Empty(await db.SyncOutbox.Where(o => o.TargetNode != "edge-a").ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task PushReports_SendsEachShipOnlyTheReportsItSent()
    {
        await using var db = await Database();
        await BindNode(db, "edge-a"); await BindNode(db, "edge-b");
        db.SuppressAutoOutbox = true;
        db.MaritimeReports.Add(new MaritimeReport { ReportNumber = "A-NR-1", ReportTypeId = 1, Status = "SUBMITTED", ReportData = "{}", OriginNode = "edge-a" });
        db.MaritimeReports.Add(new MaritimeReport { ReportNumber = "B-NR-1", ReportTypeId = 1, Status = "SUBMITTED", ReportData = "{}", OriginNode = "edge-b" });
        await db.SaveChangesAsync(); db.SuppressAutoOutbox = false;

        await Push(db).PushAsync("edge-a", [SyncScope.Reports]);

        Assert.Equal(["A-NR-1"], (await Queued(db, "edge-a", "maritime_report")).Select(o => Prop(Json(o), "reportNumber")));
        Assert.Empty(await Queued(db, "edge-b", "maritime_report"));
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task PushCatalog_IncludesReportTypes_ForEveryShip()
    {
        await using var db = await Database();
        await BindNode(db, "edge-a"); await BindNode(db, "edge-b");
        db.SuppressAutoOutbox = true;
        db.ReportTypes.Add(new ReportType { TypeCode = "NOON", TypeName = "Noon report" });
        await db.SaveChangesAsync(); db.SuppressAutoOutbox = false;

        await Push(db).PushAsync("ALL", [SyncScope.Catalog]);

        Assert.Single(await Queued(db, "edge-a", "report_type"));
        Assert.Single(await Queued(db, "edge-b", "report_type"));
        await db.Database.EnsureDeletedAsync();
    }
}
