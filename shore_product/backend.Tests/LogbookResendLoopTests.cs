using System.Reflection;
using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using ProductApi.Data;
using ProductApi.Services.Background;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

/// <summary>
/// Lỗi gặp khi chạy thử thật: tác vụ đối soát 30 giây gửi lại kỳ phục vụ chưa "đồng bộ" — nhưng không gì đánh
/// dấu đã đồng bộ (tàu chỉ ACK, không gửi ngược bản ghi bờ tạo) → gửi lại mãi, và gửi cả hồ sơ thuyền viên đã
/// rời tàu nên tàu dựng lại người không còn thuộc tàu.
/// </summary>
public partial class SyncReliabilityTests
{
    private static Task Reconcile(AppDbContext db)
    {
        var services = new ServiceCollection().AddSingleton(db).AddSingleton<ISyncOutboxService>(Outbox(db)).BuildServiceProvider();
        var worker = new NetworkAwareSyncBackgroundService(services, NullLogger<NetworkAwareSyncBackgroundService>.Instance);
        var method = typeof(NetworkAwareSyncBackgroundService).GetMethod("ReconcileUnsyncedCrewRecordsAsync", BindingFlags.NonPublic | BindingFlags.Instance)!;
        return (Task)method.Invoke(worker, [services, CancellationToken.None])!;
    }

    private static async Task<CrewLogbookEntry> SeaService(AppDbContext db, CrewMember crew, Guid vesselId)
    {
        db.SuppressAutoOutbox = true;
        var entry = new CrewLogbookEntry
        {
            CrewMemberId = crew.Id, VesselId = vesselId, EntryType = "SEA_SERVICE", EntryOrigin = "SHORE",
            RecordStatus = "DRAFT", Status = "Draft", Title = "Kỳ phục vụ", EntryDate = DateTime.UtcNow,
            SignOnDate = DateTime.UtcNow, IsSynced = false, OriginNode = "SHORE", UpdatedAt = DateTime.UtcNow.AddMinutes(-1)
        };
        db.CrewLogbookEntries.Add(entry);
        await db.SaveChangesAsync();
        db.SuppressAutoOutbox = false;
        return entry;
    }

    [ShorePostgresFact]
    public async Task Reconcile_AfterShipAcknowledged_StopsResending()
    {
        await using var db = await Database(); var outbox = Outbox(db);
        var vessel = await BindNode(db, "edge-a");
        var crew = await Crew(db, vessel, "A");
        var entry = await SeaService(db, crew, vessel);

        await Reconcile(db);
        var first = await db.SyncOutbox.AsNoTracking().Where(o => o.TableName == "crew_logbook_entry").ToListAsync();
        Assert.Single(first);

        // Tàu áp xong và ACK → kỳ phục vụ đã đồng bộ, chu kỳ sau không gửi lại.
        await outbox.AcknowledgeDeliveryAsync("edge-a", first.Select(o => o.Id).ToList());
        db.ChangeTracker.Clear();
        Assert.True((await db.CrewLogbookEntries.SingleAsync(e => e.Id == entry.Id)).IsSynced);

        await Reconcile(db); await Reconcile(db);
        Assert.Single(await db.SyncOutbox.AsNoTracking().Where(o => o.TableName == "crew_logbook_entry").ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task Reconcile_WhileShipHasNotPulled_DoesNotPileUpCopies()
    {
        await using var db = await Database();
        var vessel = await BindNode(db, "edge-a");
        var crew = await Crew(db, vessel, "A");
        await SeaService(db, crew, vessel);

        await Reconcile(db); await Reconcile(db); await Reconcile(db);

        Assert.Single(await db.SyncOutbox.AsNoTracking().Where(o => o.TableName == "crew_logbook_entry").ToListAsync());
        Assert.Single(await db.SyncOutbox.AsNoTracking().Where(o => o.TableName == "crew_member").ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task Reconcile_CrewWhoLeftTheShip_IsNotResentToThatShip()
    {
        await using var db = await Database();
        var vessel = await BindNode(db, "edge-a");
        var crew = await Crew(db, null, "LEFT"); // đã sign-off: không còn thuộc tàu
        await SeaService(db, crew, vessel);

        await Reconcile(db);

        Assert.Empty(await db.SyncOutbox.AsNoTracking().Where(o => o.TableName == "crew_logbook_entry" || o.TableName == "crew_member").ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task Acknowledge_DoesNotMarkEntryEditedAfterThePackageWasQueued()
    {
        await using var db = await Database(); var outbox = Outbox(db);
        var vessel = await BindNode(db, "edge-a");
        var crew = await Crew(db, vessel, "A");
        var entry = await SeaService(db, crew, vessel);
        await Reconcile(db);
        var queued = await db.SyncOutbox.AsNoTracking().Where(o => o.TableName == "crew_logbook_entry").Select(o => o.Id).ToListAsync();

        // Bờ sửa tiếp sau khi gói đã xếp hàng: ACK gói cũ không được coi bản mới là đã đồng bộ.
        await db.CrewLogbookEntries.Where(e => e.Id == entry.Id).ExecuteUpdateAsync(s => s.SetProperty(e => e.UpdatedAt, DateTime.UtcNow.AddMinutes(5)));
        await outbox.AcknowledgeDeliveryAsync("edge-a", queued);

        db.ChangeTracker.Clear();
        Assert.False((await db.CrewLogbookEntries.SingleAsync(e => e.Id == entry.Id)).IsSynced);
        await db.Database.EnsureDeletedAsync();
    }
}
