using System.Text.Json;
using Maritime.Shared.Models.Crew;
using Microsoft.EntityFrameworkCore;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

/// <summary>
/// AppDbContext tự xếp hàng đồng bộ khi lưu. Với dữ liệu thuyền viên, gói phải tới đúng tàu thuyền viên
/// ĐANG thuộc (kèm IMO), không bao giờ "*" — lỗi cũ: chứng chỉ, giấy tờ, thuyền viên danh bạ chung phát cho mọi tàu.
/// </summary>
public partial class SyncReliabilityTests
{
    private static string? StampOf(Maritime.Shared.Models.Sync.SyncOutbox row) =>
        JsonDocument.Parse(row.Payload).RootElement.TryGetProperty(SyncOutboxService.TargetVesselImoField, out var v) ? v.GetString() : null;

    [ShorePostgresFact]
    public async Task AutoOutbox_CrewChange_GoesToTheirShipOnly_WithImo()
    {
        await using var db = await Database();
        var vesselA = await BindNode(db, "edge-a"); await BindNode(db, "edge-b");
        var crew = await Crew(db, vesselA, "A");

        crew.FullName = "Renamed"; await db.SaveChangesAsync();

        var row = Assert.Single(await db.SyncOutbox.Where(o => o.TableName == "crew_member").ToListAsync());
        Assert.Equal("edge-a", row.TargetNode);
        Assert.Equal(await db.Vessels.Where(v => v.Id == vesselA).Select(v => v.IMO).SingleAsync(), StampOf(row));
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task AutoOutbox_PoolCrewChange_IsNotSentToAnyShip()
    {
        await using var db = await Database();
        await BindNode(db, "edge-a");
        var pool = await Crew(db, null, "POOL");

        pool.FullName = "Renamed"; await db.SaveChangesAsync();

        Assert.Empty(await db.SyncOutbox.Where(o => o.TableName == "crew_member").ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task AutoOutbox_CrewLeavingShip_IsReportedToThePreviousShip()
    {
        await using var db = await Database();
        var vesselA = await BindNode(db, "edge-a");
        var crew = await Crew(db, vesselA, "A");

        crew.VesselId = null; crew.IsOnboard = false; await db.SaveChangesAsync();

        Assert.Equal("edge-a", Assert.Single(await db.SyncOutbox.Where(o => o.TableName == "crew_member").ToListAsync()).TargetNode);
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task AutoOutbox_LogbookEntry_FollowsCrewsCurrentShip_NotTheEntrysOldShip()
    {
        await using var db = await Database();
        var vesselA = await BindNode(db, "edge-a"); var vesselB = await BindNode(db, "edge-b");
        var crew = await Crew(db, vesselB, "B");

        // Kỳ phục vụ cũ ở tàu A, người này nay ở tàu B → sổ phải tới B (nơi đang có hồ sơ), không tới A.
        db.CrewLogbookEntries.Add(new CrewLogbookEntry { CrewMemberId = crew.Id, VesselId = vesselA, EntryDate = DateTime.UtcNow });
        await db.SaveChangesAsync();

        var row = Assert.Single(await db.SyncOutbox.Where(o => o.TableName == "crew_logbook_entry").ToListAsync());
        Assert.Equal("edge-b", row.TargetNode);
        Assert.DoesNotContain(await db.SyncOutbox.ToListAsync(), o => o.TargetNode == "*" && SyncOutboxService.CrewScopedTables.Contains(o.TableName));
        await db.Database.EnsureDeletedAsync();
    }
}
