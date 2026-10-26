using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Maintenance;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

public class PmsPeriodicReleaseSweepTests
{
    private static readonly DateTime Now = new(2026, 10, 26, 0, 0, 0, DateTimeKind.Utc);
    private static Guid Id(int number) => Guid.Parse($"00000000-0000-0000-0000-{number:D12}");

    private static ServiceProvider Provider()
    {
        var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("PMS_TEST_CONNECTION_STRING"));
        if (connection.Database?.StartsWith("codex_pms_tests_", StringComparison.Ordinal) != true)
            throw new InvalidOperationException("An isolated test database is required.");
        connection.Database += "_sweep_" + Guid.NewGuid().ToString("N")[..12];
        return new ServiceCollection().AddDbContext<EdgeDbContext>(o => o.UseNpgsql(connection.ConnectionString)).BuildServiceProvider();
    }

    private static PmsPeriodicReleaseSweep Sweep(ServiceProvider services) => new(
        services.GetRequiredService<IServiceScopeFactory>(), NullLogger<PmsPeriodicReleaseSweep>.Instance);

    private static MaintenanceSchedule AddJob(EdgeDbContext db, int number, double hours = 100)
    {
        var asset = new EquipmentAsset { AssetCode = $"SWEEP-{number}", AssetName = "Pump", Category = "DECK", CurrentRunningHours = hours };
        var job = new MaintenanceSchedule { Id = Id(number), ScheduleCode = $"SWEEP-{number}", ScheduleName = "Check pump",
            EquipmentAssetId = asset.Id, MaintenanceCategory = "PERIODIC", IntervalType = "RUNNING_HOURS", IntervalHours = 100,
            BaselineRunningHours = 0, WarningHours = 10, AutoGenerate = true };
        PmsJobRules.PrepareForSave(job); db.AddRange(asset, job);
        db.ScheduleChecklistTemplates.Add(new() { ScheduleId = job.Id, SequenceOrder = 1, CheckpointDescription = "Inspect seal" });
        return job;
    }

    [PmsPostgresFact]
    public async Task KeysetBatchesRespectPoliciesAndContinueAfterOneInvalidAsset()
    {
        await using var services = Provider();
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();
        await db.Database.EnsureCreatedAsync();
        try
        {
            var legacy = AddJob(db, 1); legacy.PmsProtocolVersion = null;
            AddJob(db, 2).AutoGenerate = false;
            AddJob(db, 3);
            var onDue = AddJob(db, 4, 95); onDue.ReleasePolicy = "ON_DUE";
            AddJob(db, 5, 10);
            var broken = AddJob(db, 6); db.EquipmentAssets.Local.Single(a => a.Id == broken.EquipmentAssetId).IsActive = false;
            AddJob(db, 7, 95); // default ON_UPCOMING
            var paused = AddJob(db, 8); paused.JobState = PmsJobRules.Paused; paused.IsActive = false;
            await db.SaveChangesAsync();
            var sweep = Sweep(services);
            var first = await sweep.RunBatchAsync(Now, TimeZoneInfo.Utc, batchSize: 2);
            Assert.Equal(2, first.Scanned); Assert.Equal(1, first.Created); Assert.Equal(1, first.Skipped);
            Assert.Equal(Id(4), first.NextCursor); Assert.Empty(first.FailedJobIds);
            var second = await sweep.RunBatchAsync(Now, TimeZoneInfo.Utc, first.NextCursor, 2);
            Assert.Equal(2, second.Scanned); Assert.Equal(0, second.Created); Assert.Equal(1, second.Skipped);
            Assert.Equal(new[] { Id(6) }, second.FailedJobIds); Assert.Equal(Id(6), second.NextCursor);
            var third = await sweep.RunBatchAsync(Now, TimeZoneInfo.Utc, second.NextCursor, 2);
            Assert.Equal(1, third.Created); Assert.Null(third.NextCursor);
            Assert.Equal(2, await db.MaintenanceTasks.CountAsync());
            var repeat = await sweep.RunBatchAsync(Now, TimeZoneInfo.Utc);
            Assert.Equal(0, repeat.Created); Assert.Equal(4, repeat.Skipped); Assert.Single(repeat.FailedJobIds);
            var order = await db.MaintenanceTasks.SingleAsync(t => t.ScheduleId == Id(3));
            var frozen = order.JobSnapshot; order.Status = "CANCELLED"; await db.SaveChangesAsync();
            Assert.Equal(0, (await sweep.RunBatchAsync(Now, TimeZoneInfo.Utc)).Created);
            await db.Entry(order).ReloadAsync(); Assert.Equal("CANCELLED", order.Status); Assert.Equal(frozen, order.JobSnapshot);
            var asset = await db.EquipmentAssets.SingleAsync(a => a.Id == onDue.EquipmentAssetId);
            asset.CurrentRunningHours = 100; await db.SaveChangesAsync();
            Assert.Equal(1, (await sweep.RunBatchAsync(Now, TimeZoneInfo.Utc)).Created);
            Assert.Equal(3, await db.MaintenanceTasks.CountAsync());
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [PmsPostgresFact]
    public async Task ConcurrentSweepsCountOnlyActuallyCreatedOrdersAndDoNotResetCompletedOnes()
    {
        await using var services = Provider(); await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EdgeDbContext>(); await db.Database.EnsureCreatedAsync();
        try
        {
            var job = AddJob(db, 10); await db.SaveChangesAsync();
            var results = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => Sweep(services).RunBatchAsync(Now, TimeZoneInfo.Utc)));
            Assert.Equal(1, results.Sum(r => r.Created)); Assert.All(results, r => Assert.Empty(r.FailedJobIds));
            var order = await db.MaintenanceTasks.SingleAsync();
            Assert.Single(await db.TaskChecklistItems.ToListAsync());
            order.Status = "COMPLETED"; order.SubmittedAt = Now; order.ActualRunningHours = 100;
            PmsJobRules.ApplyApprovedExecution(job, order); await db.SaveChangesAsync();
            Assert.Equal(0, (await Sweep(services).RunBatchAsync(Now, TimeZoneInfo.Utc)).Created);
            var asset = await db.EquipmentAssets.SingleAsync(); asset.CurrentRunningHours = 200; await db.SaveChangesAsync();
            Assert.Equal(1, (await Sweep(services).RunBatchAsync(Now, TimeZoneInfo.Utc)).Created);
            await db.Entry(order).ReloadAsync(); Assert.Equal("COMPLETED", order.Status);
            Assert.Equal(2, await db.MaintenanceTasks.CountAsync());
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [Fact]
    public async Task InvalidBatchArgumentsFailBeforeResolvingAnyDatabase()
    {
        await using var services = new ServiceCollection().BuildServiceProvider(); var sweep = Sweep(services);
        await Assert.ThrowsAsync<ArgumentException>(() => sweep.RunBatchAsync(DateTime.SpecifyKind(Now, DateTimeKind.Local), TimeZoneInfo.Utc));
        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() => sweep.RunBatchAsync(Now, TimeZoneInfo.Utc, batchSize: 0));
        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() => sweep.RunBatchAsync(Now, TimeZoneInfo.Utc, batchSize: 201));
    }

    [PmsPostgresFact]
    public async Task HostedWorkerRequiresLocalCommissioningButNotShoreAndStopsDuringCutover()
    {
        await using var services = Provider(); await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EdgeDbContext>(); await db.Database.EnsureCreatedAsync();
        try
        {
            var epoch = Guid.NewGuid(); var stream = Guid.NewGuid();
            db.EdgeProvisioningProfiles.Add(new() { IsActive = true, NodeId = "SWEEP-NODE" });
            db.SyncState.AddRange(new() { Key = "pms-dataset-id", Value = epoch.ToString(), UpdatedAt = Now },
                new() { Key = "sync-stream-id", Value = stream.ToString(), UpdatedAt = Now },
                new() { Key = "pms-cutover-state", Value = "ACTIVE", UpdatedAt = Now }); await db.SaveChangesAsync();
            AddJob(db, 50); await db.SaveChangesAsync();
            var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["Pms:ReworkApiEnabled"] = "true", ["Pms:VesselTimeZone"] = "Asia/Ho_Chi_Minh", ["Pms:AutomaticReleaseEnabled"] = "false" }).Build();
            var worker = new PmsPeriodicReleaseWorker(services.GetRequiredService<IServiceScopeFactory>(), Sweep(services), config,
                NullLogger<PmsPeriodicReleaseWorker>.Instance);
            Assert.Equal(0, await worker.RunCycleAsync(Now));
            config["Pms:AutomaticReleaseEnabled"] = "true";
            Assert.False(await db.SyncState.AnyAsync(s => s.Key == "pms-peer-ready"));
            Assert.Equal(1, await worker.RunCycleAsync(Now));
            Assert.Equal(0, await worker.RunCycleAsync(Now));
            var state = await db.SyncState.SingleAsync(s => s.Key == "pms-cutover-state"); state.Value = "PREPARED"; await db.SaveChangesAsync();
            Assert.Equal(0, await worker.RunCycleAsync(Now));
            var order = await db.MaintenanceTasks.SingleAsync(); order.Notes = "must not save during reset";
            Assert.Equal(409, (await Assert.ThrowsAsync<MaritimeEdge.DTOs.PmsRequestException>(() => db.SaveChangesAsync())).Status);
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [PmsPostgresFact]
    public async Task OfflineCounterReleasePersistsUnsentOrderAndDoesNotDependOnPeerOrSyncStream()
    {
        await using var services = Provider(); await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EdgeDbContext>(); await db.Database.EnsureCreatedAsync();
        try
        {
            var dataset = Guid.NewGuid();
            db.EdgeProvisioningProfiles.Add(new() { IsActive = true, NodeId = "OFFLINE-NODE" });
            db.SyncState.AddRange(new() { Key = "pms-dataset-id", Value = dataset.ToString(), UpdatedAt = Now },
                new() { Key = "pms-cutover-state", Value = "ACTIVE", UpdatedAt = Now });
            await db.SaveChangesAsync();
            var automatic = AddJob(db, 60, 0); automatic.ReleasePolicy = "ON_DUE";
            var manual = AddJob(db, 61, 100); manual.AutoGenerate = false;
            await db.SaveChangesAsync();
            var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
                { ["Pms:ReworkApiEnabled"] = "true", ["Pms:VesselTimeZone"] = "Asia/Ho_Chi_Minh" }).Build();
            var worker = new PmsPeriodicReleaseWorker(services.GetRequiredService<IServiceScopeFactory>(), Sweep(services), config,
                NullLogger<PmsPeriodicReleaseWorker>.Instance);
            Assert.Equal(0, await worker.RunCycleAsync(Now));
            var asset = await db.EquipmentAssets.SingleAsync(a => a.Id == automatic.EquipmentAssetId);
            asset.CurrentRunningHours = 100; await db.SaveChangesAsync();
            Assert.Equal(1, await worker.RunCycleAsync(Now));
            var order = await db.MaintenanceTasks.SingleAsync(); Assert.Equal(automatic.Id, order.ScheduleId);
            var queued = await db.SyncQueue.SingleAsync(q => q.TableName == "maintenance_task" && q.RecordKey == order.Id.ToString());
            Assert.Null(queued.SyncedAt); var payload = queued.Payload; var eventId = queued.EventId;
            using var json = System.Text.Json.JsonDocument.Parse(payload);
            Assert.Equal(dataset, json.RootElement.GetProperty("PmsDatasetId").GetGuid());
            Assert.Equal(2, json.RootElement.GetProperty("PmsProtocolVersion").GetInt32());
            Assert.Equal(0, await worker.RunCycleAsync(Now.AddMinutes(1)));
            Assert.Single(await db.MaintenanceTasks.ToListAsync());
            Assert.False(await db.SyncState.AnyAsync(s => s.Key == "sync-stream-id" || s.Key == "pms-peer-ready"));
            // A stale transport proof also cannot prevent local work.
            db.SyncState.Add(new() { Key = "pms-peer-ready", Value = "old-dataset/old-stream/other-node", UpdatedAt = Now });
            await db.SaveChangesAsync(); Assert.True(await PmsReworkRuntime.CanAutoReleaseAsync(db, config));
            await db.Entry(queued).ReloadAsync(); Assert.Equal(payload, queued.Payload); Assert.Equal(eventId, queued.EventId); Assert.Null(queued.SyncedAt);
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [PmsPostgresFact]
    public async Task EquipmentBranchScopeIncludesNestedAssetsAndTerminatesOnMalformedCycles()
    {
        await using var services = Provider(); await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EdgeDbContext>(); await db.Database.EnsureCreatedAsync();
        try
        {
            var root = new EquipmentAsset { AssetCode = "ROOT", AssetName = "Engine room", Category = "SYSTEM" };
            var child = new EquipmentAsset { AssetCode = "CHILD", AssetName = "Pumps", Category = "SYSTEM", ParentId = root.Id };
            var leaf = new EquipmentAsset { AssetCode = "LEAF", AssetName = "Fire pump", Category = "DECK", ParentId = child.Id };
            var other = new EquipmentAsset { AssetCode = "OTHER", AssetName = "Another branch", Category = "DECK" };
            db.AddRange(root, child, leaf, other); await db.SaveChangesAsync();
            Assert.Equal(3, (await PmsEquipmentScope.DescendantsAsync(db, root.Id)).Length);
            Assert.Equal(new[] { leaf.Id }, await PmsEquipmentScope.DescendantsAsync(db, leaf.Id));
            Assert.Empty(await PmsEquipmentScope.DescendantsAsync(db, Guid.NewGuid()));
            root.ParentId = leaf.Id; await db.SaveChangesAsync();
            Assert.Equal(3, (await PmsEquipmentScope.DescendantsAsync(db, root.Id)).Length);
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }
}
