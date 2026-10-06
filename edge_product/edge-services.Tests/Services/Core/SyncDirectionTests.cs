using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Controllers.Crew;
using MaritimeEdge.Controllers.Voyage;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

public partial class SyncReliabilityTests
{
    private static SyncQueueItemDto ShoreItem(string table, Guid key, long version, object payload, string action = "SNAPSHOT") => new()
    {
        TableName = table, RecordKey = key.ToString(), OutboxId = version, SyncVersion = version,
        OriginNode = "SHORE", ActionType = action, Payload = JsonSerializer.Serialize(payload)
    };

    [MaritimeEdge.Tests.Inventory.PmsPostgresFact]
    public async Task ShoreVoyageSnapshot_PreservesPendingOperationalFields_AndAppliesPlanningFields()
    {
        var id = Guid.NewGuid(); var departed = DateTime.UtcNow.AddDays(-1);
        departed = new DateTime(departed.Ticks / 10 * 10, DateTimeKind.Utc); // PostgreSQL stores microseconds.
        var incoming = ShoreItem("voyage_record", id, 1, new
        {
            Id = id, VoyageNumber = "V-1", VoyageStatus = "PLANNING", FuelConsumed = 10.0,
            DepartureTime = departed.AddHours(5), DistanceTraveled = 20.0, PlannedDistance = 800.0
        });
        var receipts = new List<long>();
        var (services, sync) = Build(true, async request =>
        {
            if (request.Method == System.Net.Http.HttpMethod.Get) return Response(JsonSerializer.Serialize(new SyncPullResponse { Items = [incoming] }));
            var ack = JsonSerializer.Deserialize<SyncAcknowledgeDto>(await request.Content!.ReadAsStringAsync(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            receipts.AddRange(ack.ItemIds); return Response("{}");
        }, PostgresConnection());
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); await db.Database.EnsureCreatedAsync();
            db.VoyageRecords.Add(new() { Id = id, VoyageNumber = "V-1", VoyageStatus = "UNDERWAY", DepartureTime = departed,
                FuelConsumed = 75, DistanceTraveled = 500, PlannedDistance = 700 });
            await db.SaveChangesAsync(); var pending = await db.SyncQueue.CountAsync();
            Assert.True(pending > 0);
            await sync.PullFromShoreAsync(default); db.ChangeTracker.Clear();
            var local = await db.VoyageRecords.SingleAsync();
            Assert.Equal(75, local.FuelConsumed); Assert.Equal(500, local.DistanceTraveled);
            Assert.Equal(departed, local.DepartureTime); Assert.Equal("UNDERWAY", local.VoyageStatus);
            Assert.Equal(800, local.PlannedDistance); Assert.Equal(pending, await db.SyncQueue.CountAsync());
            Assert.Equal([1L], receipts);
            await db.Database.EnsureDeletedAsync();
        }
    }

    [MaritimeEdge.Tests.Inventory.PmsPostgresFact]
    public async Task ServiceRecovery_CreatesMissingHistory_PreservesLocalHistory_AndDoesNotAckUnsupportedUpdate()
    {
        var crew = new CrewMember { CrewId = "RECOVERY", FullName = "Recovery" };
        var missing = new ServiceRecord { CrewMemberId = crew.Id, VesselName = "Recovered", BoardingDate = DateTime.UtcNow };
        var existing = new ServiceRecord { CrewMemberId = crew.Id, VesselName = "Local", BoardingDate = DateTime.UtcNow };
        var receipts = new List<long>();
        var (services, sync) = Build(true, async request =>
        {
            if (request.Method == System.Net.Http.HttpMethod.Get) return Response(JsonSerializer.Serialize(new SyncPullResponse
            {
                Items = [ShoreItem("service_record", missing.Id, 1, missing),
                    ShoreItem("service_record", existing.Id, 2, new { existing.Id, VesselName = "Stale shore" }),
                    ShoreItem("service_record", existing.Id, 3, new { existing.Id, VesselName = "Unsupported" }, "UPDATE")]
            }));
            var ack = JsonSerializer.Deserialize<SyncAcknowledgeDto>(await request.Content!.ReadAsStringAsync(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            receipts.AddRange(ack.ItemIds); return Response("{}");
        }, PostgresConnection());
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); await db.Database.EnsureCreatedAsync(); db.SuppressSyncQueue = true;
            db.CrewMembers.Add(crew); db.ServiceRecords.Add(existing); await db.SaveChangesAsync();
            await sync.PullFromShoreAsync(default); db.ChangeTracker.Clear();
            Assert.Equal("Recovered", (await db.ServiceRecords.FindAsync(missing.Id))!.VesselName);
            Assert.Equal("Local", (await db.ServiceRecords.FindAsync(existing.Id))!.VesselName);
            Assert.Equal([1L, 2L], receipts); Assert.Empty(await db.SyncQueue.ToListAsync());
            await db.Database.EnsureDeletedAsync();
        }
    }

    [MaritimeEdge.Tests.Inventory.PmsPostgresFact]
    public async Task VoyageAssignment_ReceivesSnapshotAndDelete_WithValidVoyageCrewAndRankReferences()
    {
        var voyage = new VoyageRecord { VoyageNumber = "ASSIGNMENT" };
        var crew = new CrewMember { CrewId = "ASSIGNMENT", FullName = "Assignment" };
        var rank = new Rank { RankCode = "TEST", RankName = "Test" };
        var assignment = new VoyageCrewAssignment { VoyageId = voyage.Id, CrewMemberId = crew.Id };
        var pulls = 0; var receipts = new List<long>();
        var (services, sync) = Build(true, async request =>
        {
            if (request.Method == System.Net.Http.HttpMethod.Get)
            {
                pulls++;
                return Response(JsonSerializer.Serialize(new SyncPullResponse { Items = [ShoreItem("voyage_crew_assignment", assignment.Id, pulls,
                    new { assignment.Id, assignment.VoyageId, assignment.CrewMemberId, RankId = rank.Id, Role = "REGULAR" }, pulls == 1 ? "SNAPSHOT" : "DELETE")] }));
            }
            var ack = JsonSerializer.Deserialize<SyncAcknowledgeDto>(await request.Content!.ReadAsStringAsync(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            receipts.AddRange(ack.ItemIds); return Response("{}");
        }, PostgresConnection());
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); await db.Database.EnsureCreatedAsync(); db.SuppressSyncQueue = true;
            db.VoyageRecords.Add(voyage); db.CrewMembers.Add(crew); db.Ranks.Add(rank); await db.SaveChangesAsync();
            await sync.PullFromShoreAsync(default); db.ChangeTracker.Clear();
            var stored = await db.VoyageCrewAssignments.SingleAsync();
            Assert.Equal(rank.Id, stored.RankId); Assert.Equal(crew.Id, stored.CrewMemberId); Assert.Equal(voyage.Id, stored.VoyageId);
            await sync.PullFromShoreAsync(default); db.ChangeTracker.Clear();
            Assert.Empty(await db.VoyageCrewAssignments.ToListAsync()); Assert.Equal([1L, 2L], receipts);
            Assert.Empty(await db.SyncQueue.ToListAsync()); await db.Database.EnsureDeletedAsync();
        }
    }

    [Fact]
    public async Task CatalogWriteRoutes_Return405WithoutChangingRows_AndPortsAreNotReconciledUpward()
    {
        var (services, sync) = Build(false, _ => throw new InvalidOperationException("Disabled"));
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>();
            var rank = new Rank { RankCode = "MASTER", RankName = "Master" };
            var country = new Country { CountryCode = "VN", CountryName = "Vietnam" };
            var port = new Port { PortCode = "VNSGN", PortName = "Saigon" };
            db.Ranks.Add(rank); db.Countries.Add(country); db.Ports.Add(port); await db.SaveChangesAsync();
            var ranks = new RanksController(db, NullLogger<RanksController>.Instance);
            var countries = new CountriesController(db);
            var ports = new PortController(db, NullLogger<PortController>.Instance);
            var results = new IActionResult?[] {
                (await ranks.CreateRank(new Rank())).Result, await ranks.UpdateRank(rank.Id, rank),
                await ranks.DeleteRank(rank.Id), await ranks.PermanentDeleteRank(rank.Id),
                (await countries.PostCountry(new Country())).Result, await countries.PutCountry(country.Id, country), await countries.DeleteCountry(country.Id),
                await ports.Create(new()), await ports.Update(port.Id, new()), await ports.Delete(port.Id)
            };
            Assert.All(results, result => Assert.Equal(405, Assert.IsType<ObjectResult>(result).StatusCode));
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
            Assert.Single(await db.Ranks.ToListAsync()); Assert.Single(await db.Countries.ToListAsync()); Assert.Single(await db.Ports.ToListAsync());
            Assert.Empty(await db.SyncQueue.ToListAsync());
        }
    }

    [Theory]
    [InlineData("PLANNING", "APPROVED", true)]
    [InlineData("APPROVED", "READY", true)]
    [InlineData("READY", "APPROVED", false)]
    [InlineData("UNDERWAY", "READY", false)]
    [InlineData("COMPLETED", "PLANNING", false)]
    public void ShoreVoyageStatus_OnlyChangesPlanningWorkflow(string existing, string incoming, bool allowed)
        => Assert.Equal(allowed, VoyageSyncOwnership.AcceptShoreStatus(existing, incoming));
}
