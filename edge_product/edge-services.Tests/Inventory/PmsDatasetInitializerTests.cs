using System.Text.Json;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Maintenance;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

public class PmsDatasetInitializerTests
{
    private static IConfiguration Config() => new ConfigurationBuilder().AddInMemoryCollection(
        new Dictionary<string, string?> { ["Pms:ReworkApiEnabled"] = "true" }).Build();

    private static EdgeDbContext Database() => new(new DbContextOptionsBuilder<EdgeDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static void Provision(EdgeDbContext db) => db.EdgeProvisioningProfiles.Add(new()
        { NodeId = "INIT-NODE", VesselId = Guid.NewGuid(), IsActive = true });

    [Fact]
    public async Task InitializesOfflineAndPreservesExistingJobsAndQueuedPayloads()
    {
        await using var db = Database();
        Provision(db);
        var stream = Guid.NewGuid();
        db.SyncState.Add(new() { Key = "sync-stream-id", Value = stream.ToString() });
        var job = new MaintenanceSchedule { ScheduleCode = "INIT-1", ScheduleName = "Pump inspection",
            PmsProtocolVersion = 2, OriginNode = "INIT-NODE", JobVersion = 3 };
        db.MaintenanceSchedules.Add(job);
        await db.SaveChangesAsync();
        var original = await db.SyncQueue.Where(q => q.TableName == "maintenance_schedule").ToDictionaryAsync(q => q.Id, q => q.Payload);
        Assert.True(await PmsDatasetInitializer.InitializeAsync(db, Config()));
        Assert.True(await PmsReworkRuntime.CanAutoReleaseAsync(db, Config()));
        var dataset = await db.SyncState.SingleAsync(s => s.Key == "pms-dataset-id");
        Assert.NotEqual(Guid.Empty, Guid.Parse(dataset.Value));
        Assert.Equal(stream.ToString(), (await db.SyncState.SingleAsync(s => s.Key == "sync-stream-id")).Value);
        Assert.Equal(job.Id, (await db.MaintenanceSchedules.SingleAsync()).Id);
        Assert.Equal(3, job.JobVersion);
        foreach (var queued in original) Assert.Equal(queued.Value, (await db.SyncQueue.SingleAsync(q => q.Id == queued.Key)).Payload);
        var snapshot = Assert.Single(await db.SyncQueue.Where(q => q.TableName == "maintenance_schedule" && !original.Keys.Contains(q.Id)).ToListAsync());
        Assert.Equal(Guid.Parse(dataset.Value), JsonDocument.Parse(snapshot.Payload).RootElement.GetProperty("PmsDatasetId").GetGuid());
        var count = await db.SyncQueue.CountAsync();
        Assert.False(await PmsDatasetInitializer.InitializeAsync(db, Config()));
        Assert.Equal(count, await db.SyncQueue.CountAsync());
    }

    [Theory]
    [InlineData("legacy")]
    [InlineData("foreign")]
    [InlineData("cutover")]
    [InlineData("stream")]
    [InlineData("disabled")]
    public async Task DoesNotReplaceUnsafeOrExplicitlyDisabledDatasets(string condition)
    {
        await using var db = Database();
        Provision(db);
        if (condition is "legacy" or "foreign") db.MaintenanceSchedules.Add(new()
            { ScheduleCode = "BLOCKED", PmsProtocolVersion = condition == "legacy" ? null : 2, OriginNode = "OTHER" });
        if (condition == "cutover") db.SyncState.Add(new() { Key = "pms-cutover-state", Value = "PREPARED" });
        if (condition == "stream") db.SyncState.Add(new() { Key = "sync-stream-id", Value = "invalid" });
        await db.SaveChangesAsync();
        var config = condition == "disabled" ? new ConfigurationBuilder().Build() : Config();
        Assert.False(await PmsDatasetInitializer.InitializeAsync(db, config));
        Assert.False(await db.SyncState.AnyAsync(s => s.Key == "pms-dataset-id"));
    }

    [Fact]
    public async Task CanInitializeAfterVesselProvisioningArrivesLater()
    {
        await using var db = Database();
        Assert.False(await PmsDatasetInitializer.InitializeAsync(db, Config()));
        Provision(db);
        await db.SaveChangesAsync();
        Assert.True(await PmsDatasetInitializer.InitializeAsync(db, Config()));
    }
}
