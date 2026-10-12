using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Documents;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

/// <summary>
/// Một bờ — nhiều tàu: tàu chỉ áp dữ liệu thuyền viên bờ gửi cho chính nó (bờ đóng dấu IMO tàu đích),
/// và gỡ thuyền viên không còn thuộc tàu khi bờ gửi danh sách đối chiếu (crew_roster).
/// </summary>
public class CrewVesselGuardTests
{
    private const string OwnImo = "9876543";
    private const string OtherImo = "8765432";

    private static async Task<EdgeDbContext> Db()
    {
        var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options) { SuppressSyncQueue = true };
        db.ShipData.Add(new ShipData { ImoNumber = OwnImo, ShipName = "MV PACIFIC VOYAGER" });
        await db.SaveChangesAsync();
        return db;
    }

    private static SyncConflictHandler Handler() => new(NullLogger<SyncConflictHandler>.Instance);

    private static CrewMember Crew(string code, bool synced = true) =>
        new() { Id = Guid.NewGuid(), CrewId = code, FullName = code, IsOnboard = true, IsSynced = synced, OriginNode = "SHORE" };

    /// <summary>Payload đúng dạng bờ gửi: entity camelCase + targetVesselImo.</summary>
    private static SyncQueueItemDto Item(string table, string key, object payload, string? imo, string action = "SNAPSHOT")
    {
        var json = JsonSerializer.SerializeToNode(payload, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase })!.AsObject();
        if (imo != null) json[SyncConflictHandler.TargetVesselImoField] = imo;
        return new SyncQueueItemDto { TableName = table, RecordKey = key, ActionType = action, Payload = json.ToJsonString() };
    }

    private static SyncQueueItemDto Roster(IEnumerable<Guid> ids, string? imo) =>
        Item(SyncConflictHandler.CrewRosterTable, Guid.NewGuid().ToString(), new { vesselId = Guid.NewGuid(), crewIds = ids }, imo);

    [Fact]
    public async Task CrewForAnotherShip_IsNotApplied()
    {
        await using var db = await Db();
        var crew = Crew("CREW-MS-001");
        await Handler().HandleIncomingAsync(db, Item("crew_member", crew.Id.ToString(), crew, OtherImo), default);
        await db.SaveChangesAsync();
        Assert.Empty(await db.CrewMembers.ToListAsync());
    }

    [Fact]
    public async Task CrewForThisShip_IsApplied()
    {
        await using var db = await Db();
        var crew = Crew("CREW-016");
        await Handler().HandleIncomingAsync(db, Item("crew_member", crew.Id.ToString(), crew, OwnImo), default);
        await db.SaveChangesAsync();
        Assert.Equal("CREW-016", (await db.CrewMembers.SingleAsync()).CrewId);
    }

    [Fact]
    public async Task UpdateForAnotherShip_DoesNotOverwriteLocalCrew()
    {
        await using var db = await Db();
        var crew = Crew("CREW-016"); db.CrewMembers.Add(crew); await db.SaveChangesAsync();
        var foreign = Crew("CREW-016"); foreign.Id = crew.Id; foreign.FullName = "Wrong ship";
        await Handler().HandleIncomingAsync(db, Item("crew_member", crew.Id.ToString(), foreign, OtherImo, "UPDATE"), default);
        await db.SaveChangesAsync();
        Assert.Equal("CREW-016", (await db.CrewMembers.SingleAsync()).FullName);
    }

    [Fact]
    public async Task Roster_ReturnsCrewNotOnThisShipToShore()
    {
        await using var db = await Db();
        var mine = Crew("CREW-016"); var stray = Crew("CREW-MS-001");
        db.CrewMembers.AddRange(mine, stray); await db.SaveChangesAsync();

        await Handler().HandleIncomingAsync(db, Roster([mine.Id], OwnImo), default);
        await db.SaveChangesAsync();

        Assert.Equal([mine.Id], await db.CrewMembers.Select(c => c.Id).ToListAsync());
        Assert.Contains(await db.SystemLogs.ToListAsync(), l => l.Action == "CREW_RETURNED_TO_SHORE" && l.EntityId == stray.Id.ToString());
    }

    [Fact]
    public async Task Roster_KeepsCrewCreatedOnShipNotYetSynced()
    {
        await using var db = await Db();
        var local = Crew("CREW-NEW", synced: false);
        db.CrewMembers.Add(local); await db.SaveChangesAsync();

        await Handler().HandleIncomingAsync(db, Roster([], OwnImo), default);
        await db.SaveChangesAsync();

        Assert.Single(await db.CrewMembers.ToListAsync());
    }

    [Fact]
    public async Task Roster_KeepsCrewWithChangesWaitingToUpload()
    {
        await using var db = await Db();
        var crew = Crew("CREW-020");
        db.CrewMembers.Add(crew);
        db.SyncQueue.Add(new() { TableName = "crew_logbook_entry", RecordKey = Guid.NewGuid().ToString(), Payload = $"{{\"crewMemberId\":\"{crew.Id}\"}}" });
        await db.SaveChangesAsync();

        await Handler().HandleIncomingAsync(db, Roster([], OwnImo), default);
        await db.SaveChangesAsync();

        Assert.Single(await db.CrewMembers.ToListAsync());
    }

    [Fact]
    public async Task Roster_CrewWithAutoLoginAccount_IsRemoved_AndAccountIsLockedNotDeleted()
    {
        await using var db = await Db();
        var crew = Crew("CREW-MS-001");
        db.CrewMembers.Add(crew);
        db.Users.Add(new User { Username = "CREW-MS-001", PasswordHash = "x", RoleId = 1, CrewId = "CREW-MS-001" });
        await db.SaveChangesAsync();

        await Handler().HandleIncomingAsync(db, Roster([], OwnImo), default);
        await db.SaveChangesAsync();

        Assert.Empty(await db.CrewMembers.ToListAsync());
        var account = await db.Users.SingleAsync();
        Assert.False(account.IsActive);
        Assert.Null(account.CrewId);
    }

    [Fact]
    public async Task Roster_ForAnotherShip_OrWithoutVesselStamp_RemovesNothing()
    {
        await using var db = await Db();
        db.CrewMembers.Add(Crew("CREW-016")); await db.SaveChangesAsync();

        await Handler().HandleIncomingAsync(db, Roster([], OtherImo), default);
        await Handler().HandleIncomingAsync(db, Roster([], null), default);
        await db.SaveChangesAsync();

        Assert.Single(await db.CrewMembers.ToListAsync());
    }

    [Fact]
    public async Task CrewDocument_ForThisShip_IsStoredInTheSharedTableWithItsCategory()
    {
        await using var db = await Db();
        var crew = Crew("CREW-016"); db.CrewMembers.Add(crew); await db.SaveChangesAsync();
        var doc = new CrewMemberDocument { Id = Guid.NewGuid(), CrewMemberId = crew.Id, Category = CrewDocumentCategory.Health, DocumentType = "medical", DocumentNumber = "MED-1" };

        await Handler().HandleIncomingAsync(db, Item(CrewMemberDocument.SyncTable, doc.Id.ToString(), doc, OwnImo), default);
        await db.SaveChangesAsync();

        var stored = await db.CrewMemberDocuments.SingleAsync();
        Assert.Equal(CrewDocumentCategory.Health, stored.Category);
        Assert.Equal("MED-1", stored.DocumentNumber);
    }

    [Fact]
    public async Task CrewDocument_ForAnotherShip_IsNotStored()
    {
        await using var db = await Db();
        var crew = Crew("CREW-016"); db.CrewMembers.Add(crew); await db.SaveChangesAsync();
        var doc = new CrewMemberDocument { Id = Guid.NewGuid(), CrewMemberId = crew.Id, Category = CrewDocumentCategory.Travel, DocumentType = "passport", DocumentNumber = "P-1" };

        await Handler().HandleIncomingAsync(db, Item(CrewMemberDocument.SyncTable, doc.Id.ToString(), doc, OtherImo), default);
        await db.SaveChangesAsync();

        Assert.Empty(await db.CrewMemberDocuments.ToListAsync());
    }
}
