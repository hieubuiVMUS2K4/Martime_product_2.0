using Maritime.Shared.Models.Crew;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using ProductApi.Controllers.Crew;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

/// <summary>
/// Lỗi gặp khi chạy thử thật luồng sổ thuyền viên:
/// 1) Bờ duyệt/từ chối nhưng KHÔNG lưu (DbContext mặc định NoTracking) — tàu thấy kết quả, bờ thì không.
/// 2) Gói đề nghị cũ của tàu tới SAU quyết định của bờ lật ngược quyết định.
/// </summary>
public partial class SyncReliabilityTests
{
    private static async Task<(ProductApi.Data.AppDbContext Db, CrewMember Crew, CrewLogbookEntry Entry)> PendingSignOff()
    {
        var db = await Database();
        var vessel = await BindNode(db, "edge-a");
        var crew = await Crew(db, vessel, "A");
        var entry = await SeaService(db, crew, vessel);
        await db.CrewLogbookEntries.Where(e => e.Id == entry.Id).ExecuteUpdateAsync(s => s
            .SetProperty(e => e.RecordStatus, "PENDING_APPROVAL")
            .SetProperty(e => e.SignOffRequestedAt, DateTime.UtcNow.AddMinutes(-5))
            .SetProperty(e => e.SignOffRequestReason, "Hết hợp đồng"));
        db.ChangeTracker.Clear();
        // Như production (Program.cs): mặc định không theo dõi thực thể.
        db.ChangeTracker.QueryTrackingBehavior = QueryTrackingBehavior.NoTracking;
        return (db, crew, entry);
    }

    private static LogbookController Logbook(ProductApi.Data.AppDbContext db) => new(db, Outbox(db), NullLogger<LogbookController>.Instance);

    [ShorePostgresFact]
    public async Task ApproveSignOff_IsSavedOnShore_AndCrewLeavesTheShip()
    {
        var (db, crew, entry) = await PendingSignOff();
        await using var _ = db;

        Assert.IsType<OkObjectResult>(await Logbook(db).ApproveSignOff(crew.Id, entry.Id, new ApproveSignOffDto { ApprovedBy = "HR" }));

        db.ChangeTracker.Clear();
        Assert.Equal("CLOSED", (await db.CrewLogbookEntries.SingleAsync(e => e.Id == entry.Id)).RecordStatus);
        var saved = await db.CrewMembers.SingleAsync(c => c.Id == crew.Id);
        Assert.Null(saved.VesselId);
        Assert.False(saved.IsOnboard);
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task RejectSignOff_IsSavedOnShore_AndCrewStaysOnTheShip()
    {
        var (db, crew, entry) = await PendingSignOff();
        await using var _ = db;

        Assert.IsType<OkObjectResult>(await Logbook(db).RejectSignOff(crew.Id, entry.Id, new RejectSignOffDto { Reason = "Thiếu biên bản", RejectedBy = "HR" }));

        db.ChangeTracker.Clear();
        var saved = await db.CrewLogbookEntries.SingleAsync(e => e.Id == entry.Id);
        Assert.Equal("REJECTED", saved.RecordStatus);
        Assert.Equal("Thiếu biên bản", saved.RejectionReason);
        Assert.NotNull(saved.RejectedAt);
        Assert.NotNull((await db.CrewMembers.SingleAsync(c => c.Id == crew.Id)).VesselId);
        await db.Database.EnsureDeletedAsync();
    }

    private static ConflictResolution ResolveFromShip(CrewLogbookEntry existing, CrewLogbookEntry incoming) =>
        new ConflictResolverService(NullLogger<ConflictResolverService>.Instance).Resolve("crew_logbook_entry", existing, incoming, "edge-a");

    [Fact]
    public void LateShipRequest_AfterShoreApproved_DoesNotReopenTheEntry()
    {
        var existing = new CrewLogbookEntry { RecordStatus = "CLOSED", Status = "Approved", SignOffDate = new DateTime(2026, 10, 8, 0, 0, 0, DateTimeKind.Utc), Notes = "cũ" };
        var stale = new CrewLogbookEntry { RecordStatus = "PENDING_APPROVAL", Status = "Draft", SignOffDate = new DateTime(2026, 10, 9, 0, 0, 0, DateTimeKind.Utc), SignOffRequestedAt = DateTime.UtcNow, Notes = "ghi chú tàu" };

        ResolveFromShip(existing, stale);

        Assert.Equal("CLOSED", existing.RecordStatus);
        Assert.Equal(new DateTime(2026, 10, 8, 0, 0, 0, DateTimeKind.Utc), existing.SignOffDate);
        Assert.Equal("ghi chú tàu", existing.Notes); // trường ngoài vòng duyệt vẫn nhận
    }

    [Fact]
    public void ShipRequest_SentBeforeShoreRejected_DoesNotUndoTheRejection()
    {
        var rejectedAt = DateTime.UtcNow;
        var existing = new CrewLogbookEntry { RecordStatus = "REJECTED", RejectedAt = rejectedAt };
        var stale = new CrewLogbookEntry { RecordStatus = "PENDING_APPROVAL", SignOffRequestedAt = rejectedAt.AddMinutes(-1) };

        ResolveFromShip(existing, stale);

        Assert.Equal("REJECTED", existing.RecordStatus);
    }

    [Fact]
    public void ShipResubmit_AfterShoreRejected_IsAccepted()
    {
        var rejectedAt = DateTime.UtcNow.AddMinutes(-2);
        var existing = new CrewLogbookEntry { RecordStatus = "REJECTED", RejectedAt = rejectedAt };
        var resubmit = new CrewLogbookEntry { RecordStatus = "PENDING_APPROVAL", SignOffRequestedAt = rejectedAt.AddMinutes(1), SignOffRequestReason = "Đã bổ sung" };

        ResolveFromShip(existing, resubmit);

        Assert.Equal("PENDING_APPROVAL", existing.RecordStatus);
        Assert.Equal("Đã bổ sung", existing.SignOffRequestReason);
    }
}
