using System.Text.Json;
using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Sync;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using ProductApi.Controllers;
using ProductApi.Controllers.Crew;
using ProductApi.Data;
using ProductApi.Security;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

public partial class SyncReliabilityTests
{
    private static SyncDashboardController Dashboard(AppDbContext db) => new(db,
        Mock.Of<IDataEncryptionService>(), NullLogger<SyncDashboardController>.Instance);
    private static JsonElement DashboardBody(IActionResult result) => JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(result).Value);

    [ShorePostgresFact]
    public async Task Dashboard_PaginatesAllHistoryAndFiltersWithoutAttributingShoreLogsToEveryShip()
    {
        await using var db = await Database();
        try
        {
            var timestamp = DateTime.UtcNow;
            for (var i = 0; i < 35; i++) db.SyncLogs.Add(new SyncLog {
                OriginNode = "A", TableName = "port", RecordKey = i.ToString(),
                Status = i == 0 ? "CONFLICT" : "SUCCESS", ProcessedAt = timestamp,
                ConflictDetail = i == 0 ? "Version conflict" : null
            });
            db.SyncLogs.Add(new SyncLog { OriginNode = "SHORE", TableName = "port", ProcessedAt = timestamp });
            db.SyncLogs.Add(new SyncLog { OriginNode = "B", TableName = "port", ProcessedAt = timestamp });
            await db.SaveChangesAsync();
            var controller = Dashboard(db);
            var page = DashboardBody(await controller.GetLogs(nodeId: "A", page: 2, pageSize: 25));
            Assert.Equal(35, page.GetProperty("total").GetInt32());
            Assert.Equal(10, page.GetProperty("items").GetArrayLength());
            Assert.Equal(2, page.GetProperty("totalPages").GetInt32());
            var conflict = DashboardBody(await controller.GetLogs(nodeId: "A", status: "conflict", search: "Version",
                from: new DateTimeOffset(timestamp.AddMinutes(-1)), to: new DateTimeOffset(timestamp.AddMinutes(1))));
            Assert.Equal(1, conflict.GetProperty("total").GetInt32());
            Assert.Equal("Version conflict", conflict.GetProperty("items")[0].GetProperty("ConflictDetail").GetString());
            Assert.IsType<BadRequestObjectResult>(await controller.GetLogs(page: 0));
            Assert.IsType<BadRequestObjectResult>(await controller.GetLogs(from: DateTimeOffset.UtcNow, to: DateTimeOffset.UtcNow.AddDays(-1)));
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [ShorePostgresFact]
    public async Task Dashboard_OutboxTracksBroadcastReceiptsSeparatelyForEachShip()
    {
        await using var db = await Database();
        try
        {
            await BindNode(db, "A"); await BindNode(db, "B");
            var outbox = Outbox(db);
            await outbox.BroadcastAsync("rank", "1", SyncActionType.SNAPSHOT, new { Id = 1 });
            var broadcast = await db.SyncOutbox.SingleAsync();
            await outbox.AcknowledgeDeliveryAsync("A", [broadcast.Id]);
            var controller = Dashboard(db);
            Assert.Equal(0, DashboardBody(await controller.GetOutbox("A")).GetProperty("total").GetInt32());
            Assert.Equal(1, DashboardBody(await controller.GetOutbox("B")).GetProperty("total").GetInt32());
            Assert.Equal(1, DashboardBody(await controller.GetOutbox()).GetProperty("total").GetInt32());
            await outbox.AcknowledgeDeliveryAsync("B", [broadcast.Id]);
            Assert.Equal(0, DashboardBody(await controller.GetOutbox()).GetProperty("total").GetInt32());
            Assert.IsType<BadRequestObjectResult>(await controller.GetOutbox(pageSize: 201));
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [ShorePostgresFact]
    public async Task RankRequirements_PreservesUnchangedIdsAndBroadcastsOnlyAddedAndRemovedMappings()
    {
        await using var db = await Database();
        try
        {
            var rank = new Rank { RankCode = "TEST", RankName = "Test rank" };
            var otherRank = new Rank { RankCode = "OTHER", RankName = "Other rank" };
            var certificates = Enumerable.Range(1, 3).Select(i => new Certificate { CertificateCode = "C" + i, CertificateName = "Certificate " + i }).ToArray();
            db.Ranks.AddRange(rank, otherRank); db.CrewCertificateTypes.AddRange(certificates); await db.SaveChangesAsync();
            var keep = new RankCertificate { RankId = rank.Id, CertificateId = certificates[0].Id };
            var remove = new RankCertificate { RankId = rank.Id, CertificateId = certificates[1].Id };
            var unrelated = new RankCertificate { RankId = otherRank.Id, CertificateId = certificates[1].Id };
            db.RankCertificates.AddRange(keep, remove, unrelated); await db.SaveChangesAsync();
            var previousOutboxId = await db.SyncOutbox.MaxAsync(o => o.Id);
            var controller = new RankCertificatesController(db, Outbox(db));
            Assert.IsType<OkObjectResult>(await controller.UpdateRequirements(rank.Id, new() { CertificateIds = [certificates[0].Id, certificates[2].Id, certificates[2].Id] }));
            Assert.True(await db.RankCertificates.AnyAsync(rc => rc.Id == keep.Id));
            Assert.True(await db.RankCertificates.AnyAsync(rc => rc.Id == unrelated.Id));
            Assert.False(await db.RankCertificates.AnyAsync(rc => rc.Id == remove.Id));
            var events = await db.SyncOutbox.Where(o => o.Id > previousOutboxId).ToListAsync();
            Assert.Equal(2, events.Count);
            Assert.All(events, e => Assert.Equal("rank_certificate", e.TableName));
            Assert.Contains(events, e => e.ActionType == SyncActionType.DELETE && e.RecordKey == remove.Id.ToString());
            Assert.Contains(events, e => e.ActionType == SyncActionType.CREATE);
            Assert.IsType<BadRequestObjectResult>(await controller.UpdateRequirements(rank.Id, new() { CertificateIds = [int.MaxValue] }));
            Assert.Equal(2, await db.RankCertificates.CountAsync(rc => rc.RankId == rank.Id));
            Assert.IsType<OkObjectResult>(await controller.UpdateRequirements(rank.Id, new() { CertificateIds = [] }));
            Assert.Empty(await db.RankCertificates.Where(rc => rc.RankId == rank.Id).ToListAsync());
            Assert.True(await db.RankCertificates.AnyAsync(rc => rc.Id == unrelated.Id));
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [ShorePostgresFact]
    public async Task RankRequirements_RollsBackBusinessChangeWhenBroadcastFails()
    {
        await using var db = await Database();
        try
        {
            var rank = new Rank { RankCode = "ROLLBACK", RankName = "Rollback rank" };
            var certificate = new Certificate { CertificateCode = "ROLLBACK", CertificateName = "Rollback cert" };
            db.Ranks.Add(rank); db.CrewCertificateTypes.Add(certificate); await db.SaveChangesAsync();
            var outbox = new Mock<ISyncOutboxService>();
            outbox.Setup(o => o.BroadcastAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<SyncActionType>(), It.IsAny<object>()))
                .ThrowsAsync(new InvalidOperationException("Outbox unavailable"));
            var controller = new RankCertificatesController(db, outbox.Object);
            await Assert.ThrowsAsync<InvalidOperationException>(() => controller.UpdateRequirements(rank.Id, new() { CertificateIds = [certificate.Id] }));
            db.ChangeTracker.Clear();
            Assert.Empty(await db.RankCertificates.ToListAsync());
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }
}
