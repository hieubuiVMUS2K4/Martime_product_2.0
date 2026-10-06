using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

public partial class SyncReliabilityTests
{
    [MaritimeEdge.Tests.Inventory.PmsPostgresFact]
    public async Task SensorsAndDeferral_AutomaticCapturePreservesFullPayloadAndGeneratedRawKey()
    {
        var (services, _) = Build(false, _ => throw new InvalidOperationException(), PostgresConnection());
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); await db.Database.EnsureCreatedAsync();
            var task = new MaintenanceTask { TaskId = "CAPTURE-TASK", TaskType = "CALENDAR", TaskDescription = "Inspection", NextDueAt = DateTime.UtcNow };
            db.MaintenanceTasks.Add(task); await db.SaveChangesAsync();
            var raw = new NmeaRawData { SentenceType = "RMC", RawSentence = "$GPRMC,RAW", ChecksumValid = true };
            var nav = new NavigationData { Timestamp = DateTime.UtcNow, HeadingTrue = 0.0, Depth = null, Roll = 3.2 };
            var env = new EnvironmentalData { Timestamp = DateTime.UtcNow, SeaTemperature = 27.5, Visibility = null };
            var deferral = new TaskDeferralRequest { TaskId = task.Id, RequestedBy = "CHIEF", Reason = "Waiting for spare parts", CurrentDueDate = DateTime.UtcNow, ProposedDueDate = DateTime.UtcNow.AddDays(7), DeferralDays = 7, Attachments = "[]", RootCause = "No spare aboard" };
            db.AddRange(raw, nav, env, deferral); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
            Assert.True(raw.Id > 0);
            var rows = await db.SyncQueue.Where(q => SensorDeferralSyncBackfill.Tables.Contains(q.TableName)).ToListAsync(); Assert.Equal(4, rows.Count);
            Assert.Equal(raw.Id.ToString(), rows.Single(q => q.TableName == "nmea_raw_data").RecordKey);
            using var payload = JsonDocument.Parse(rows.Single(q => q.TableName == "navigation_data").Payload);
            Assert.Equal(0.0, payload.RootElement.GetProperty("HeadingTrue").GetDouble()); Assert.Equal(JsonValueKind.Null, payload.RootElement.GetProperty("Depth").ValueKind);
            Assert.Equal(SyncPriority.Operational, rows.Single(q => q.TableName == "task_deferral_request").Priority);
            Assert.All(rows.Where(q => q.TableName != "task_deferral_request"), q => Assert.Equal(SyncPriority.Low, q.Priority));
            Assert.Equal(4, rows.Select(q => q.EventId).Distinct().Count()); await db.Database.EnsureDeletedAsync();
        }
    }

    [Theory]
    [InlineData("nmea_raw_data")] [InlineData("navigation_data")] [InlineData("environmental_data")] [InlineData("task_deferral_request")]
    public async Task LegacyShoreAck_DoesNotCountAsMirrorPersistence_AndNewReceiptCompletesTheSameEvent(string table)
    {
        var version = 0; var sent = new List<Guid>();
        var (services, sync) = Build(true, async request =>
        {
            var items = JsonSerializer.Deserialize<List<SyncQueueItemDto>>(await request.Content!.ReadAsStringAsync(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            sent.AddRange(items.Select(i => i.EventId));
            return Response(JsonSerializer.Serialize(new { total = items.Count, succeeded = items.Count, failed = 0, acknowledgedEventIds = items.Select(i => i.EventId), sensorDeferralSyncVersion = version }));
        });
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); var item = Queue(); item.TableName = table; db.SyncQueue.Add(item); await db.SaveChangesAsync();
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
            var pending = await db.SyncQueue.SingleAsync(); Assert.Null(pending.SyncedAt); Assert.Contains("Shore upgrade required", pending.LastError);
            version = 1; pending.NextRetryAt = null; await db.SaveChangesAsync();
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear(); Assert.NotNull((await db.SyncQueue.SingleAsync()).SyncedAt);
            Assert.Equal(2, sent.Count); Assert.Equal(sent[0], sent[1]);
        }
    }

    [MaritimeEdge.Tests.Inventory.PmsPostgresFact]
    public async Task Upgrade_RequeuesLegacyAcknowledgedData_InBoundedBatches_WithoutLosingHistoryOrRepeatingSnapshots()
    {
        var (services, _) = Build(false, _ => throw new InvalidOperationException(), PostgresConnection());
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); await db.Database.EnsureCreatedAsync(); db.SuppressSyncQueue = true;
            var raw = Enumerable.Range(0, 205).Select(i => new NmeaRawData { SentenceType = "RMC", RawSentence = "$GPRMC," + i, Timestamp = DateTime.UtcNow.AddDays(-3), IsSynced = true }).ToList();
            var task = new MaintenanceTask { TaskId = "OLD-TASK", TaskType = "CALENDAR", TaskDescription = "Legacy inspection", NextDueAt = DateTime.UtcNow, IsSynced = true };
            db.MaintenanceTasks.Add(task); db.NmeaRawData.AddRange(raw);
            db.NavigationData.Add(new NavigationData { Timestamp = DateTime.UtcNow, HeadingTrue = 50, IsSynced = true });
            db.EnvironmentalData.Add(new EnvironmentalData { Timestamp = DateTime.UtcNow, SeaTemperature = 20, IsSynced = true });
            db.TaskDeferralRequests.Add(new TaskDeferralRequest { TaskId = task.Id, RequestedBy = "CHIEF", Reason = "Legacy pending approval", CurrentDueDate = DateTime.UtcNow, ProposedDueDate = DateTime.UtcNow.AddDays(1), IsSynced = true });
            await db.SaveChangesAsync();
            var old = new SyncQueue { TableName = "nmea_raw_data", RecordKey = raw[0].Id.ToString(), ActionType = SyncActionType.CREATE, Payload = "{}", SyncedAt = DateTime.UtcNow.AddDays(-2) };
            db.SyncQueue.Add(old); await db.SaveChangesAsync();
            await db.Database.ExecuteSqlRawAsync("DROP INDEX public.idx_sync_table_record_id");
            var migrations = db.GetService<IMigrationsAssembly>();
            var migration = migrations.CreateMigration(migrations.Migrations["20261006100000_EnableSensorAndDeferralSync"], "Npgsql.EntityFrameworkCore.PostgreSQL");
            foreach (var command in db.GetService<IMigrationsSqlGenerator>().Generate(migration.UpOperations, db.Model)) await db.Database.ExecuteSqlRawAsync(command.CommandText);
            db.ChangeTracker.Clear();
            Assert.Equal(205, await db.NmeaRawData.CountAsync(x => !x.IsSynced));
            Assert.Empty(await db.NmeaRawData.Where(x => x.IsSynced && x.Timestamp < DateTime.UtcNow.AddDays(-1)).ToListAsync());
            await SensorDeferralSyncBackfill.ReconcileAsync(db, default); db.ChangeTracker.Clear();
            Assert.Equal(200, await db.SyncQueue.CountAsync(q => q.TableName == "nmea_raw_data" && q.SyncedAt == null));
            Assert.Equal(old.EventId, (await db.SyncQueue.SingleAsync(q => q.Id == old.Id)).EventId);
            var request = await db.SyncQueue.SingleAsync(q => q.TableName == "task_deferral_request"); Assert.Equal(SyncPriority.Operational, request.Priority);
            var parent = await db.SyncQueue.SingleAsync(q => q.TableName == "maintenance_task"); Assert.Equal(SyncPriority.Operational, parent.Priority); Assert.True(parent.Id < request.Id);
            await SensorDeferralSyncBackfill.ReconcileAsync(db, default); db.ChangeTracker.Clear();
            Assert.Equal(205, await db.SyncQueue.CountAsync(q => q.TableName == "nmea_raw_data" && q.SyncedAt == null));
            var events = await db.SyncQueue.OrderBy(q => q.Id).Select(q => q.EventId).ToListAsync();
            await SensorDeferralSyncBackfill.ReconcileAsync(db, default); db.ChangeTracker.Clear();
            Assert.Equal(events, await db.SyncQueue.OrderBy(q => q.Id).Select(q => q.EventId).ToListAsync());
            await db.Database.EnsureDeletedAsync();
        }
    }

    [Fact]
    public void SensorPriority_WaitsForBulkLink_WhileDeferralAndItsParentsUseVsat()
    {
        var vsat = SyncLinkPolicy.Priorities(NetworkType.Satellite_VSAT);
        foreach (var sensor in new[] { "nmea_raw_data", "navigation_data", "environmental_data" })
        {
            Assert.DoesNotContain(SyncLinkPolicy.TablePriority(sensor), vsat);
            Assert.Contains(SyncLinkPolicy.TablePriority(sensor), SyncLinkPolicy.Priorities(NetworkType.Satellite_LEO));
        }
        foreach (var parent in new[] { "task_deferral_request", "maintenance_task", "maintenance_schedule", "equipment_asset", "equipment_group" })
            Assert.Contains(SyncLinkPolicy.TablePriority(parent), vsat);
    }

    [Fact]
    public async Task Vsat_SendsDeferralWithFileManifestsAndItsTask_AndRetainsSensorDataForTheNextBulkLink()
    {
        var link = Path.GetTempFileName(); await File.WriteAllTextAsync(link, "Satellite_VSAT");
        try
        {
            var sent = new List<SyncQueueItemDto>(); var storage = new Mock<ISyncFileStorageService>();
            storage.Setup(s => s.Exists(It.IsAny<string>())).Returns(true);
            storage.Setup(s => s.ResolveLocalPath(It.IsAny<string>())).Returns((string path) => Path.Combine(Path.GetTempPath(), "codex-deferral-evidence.pdf"));
            var preparation = new Mock<ISyncFilePreparationService>();
            preparation.Setup(p => p.PrepareForSyncAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((string source, string table, string key, string role, CancellationToken _) =>
                    new PreparedSyncFile(source, source, "evidence.pdf", "application/pdf", 3, 3, new string('a', 64), false, null));
            var (services, sync) = Build(true, async request =>
            {
                sent.AddRange(JsonSerializer.Deserialize<List<SyncQueueItemDto>>(await request.Content!.ReadAsStringAsync(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!);
                return Response(JsonSerializer.Serialize(new { total = sent.Count, succeeded = sent.Count, failed = 0, acknowledgedEventIds = sent.Select(i => i.EventId), sensorDeferralSyncVersion = 1 }));
            }, overrides: new() { ["Sync:ActiveLinkFile"] = link }, storage: storage.Object, preparation: preparation.Object);
            using (services)
            {
                var db = services.GetRequiredService<EdgeDbContext>(); db.SyncState.Add(new() { Key = SensorDeferralSyncBackfill.CoverageKey, Value = "0" }); await db.SaveChangesAsync();
                var task = new MaintenanceTask { TaskId = "VSAT-TASK", TaskType = "CALENDAR", TaskDescription = "Inspection", NextDueAt = DateTime.UtcNow };
                db.MaintenanceTasks.Add(task); await db.SaveChangesAsync();
                var request = new TaskDeferralRequest { TaskId = task.Id, RequestedBy = "CHIEF", Reason = "Awaiting parts", CurrentDueDate = DateTime.UtcNow, ProposedDueDate = DateTime.UtcNow.AddDays(7),
                    Attachments = "[\"/uploads/evidence.pdf\"]", ClassPermissionLetter = "/uploads/class.pdf" };
                db.AddRange(request, new NmeaRawData { SentenceType = "RMC", RawSentence = "$GPRMC,VSAT" },
                    new NavigationData { Timestamp = DateTime.UtcNow }, new EnvironmentalData { Timestamp = DateTime.UtcNow }); await db.SaveChangesAsync();
                await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
                Assert.Equal(2, sent.Count); Assert.Contains(sent, i => i.TableName == "maintenance_task");
                var deferral = sent.Single(i => i.TableName == "task_deferral_request"); Assert.Equal(2, deferral.FileRefs.Count);
                Assert.Contains(deferral.FileRefs, f => f.FileRole == DeferralSyncFiles.Role("/uploads/evidence.pdf"));
                Assert.Contains(deferral.FileRefs, f => f.FileRole == DeferralSyncFiles.Role("/uploads/class.pdf", true));
                Assert.True((await db.TaskDeferralRequests.SingleAsync()).IsSynced);
                Assert.All(await db.SyncQueue.Where(q => q.Priority == SyncPriority.Low).ToListAsync(), q => Assert.Null(q.SyncedAt));
                Assert.False((await db.NmeaRawData.SingleAsync()).IsSynced);
            }
        }
        finally { File.Delete(link); }
    }

    private sealed class PauseSnapshotWrite : SaveChangesInterceptor
    {
        public TaskCompletionSource Ready { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data, InterceptionResult<int> result, CancellationToken token = default)
        {
            if (data.Context!.ChangeTracker.Entries<SyncQueue>().Any(q => q.State == EntityState.Added && q.Entity.TableName == "navigation_data"))
            { Ready.TrySetResult(); await Release.Task.WaitAsync(TimeSpan.FromSeconds(20), token); }
            return result;
        }
    }

    [MaritimeEdge.Tests.Inventory.PmsPostgresFact]
    public async Task BackfillSnapshot_CannotReceiveASequenceAfterAConcurrentNewerBusinessUpdate()
    {
        var connection = PostgresConnection();
        var options = new DbContextOptionsBuilder<EdgeDbContext>().UseNpgsql(connection).Options;
        await using var seed = new EdgeDbContext(options); await seed.Database.EnsureCreatedAsync(); seed.SuppressSyncQueue = true;
        var row = new NavigationData { Timestamp = DateTime.UtcNow, HeadingTrue = 10 };
        seed.NavigationData.Add(row); seed.SyncState.Add(new SyncState { Key = SensorDeferralSyncBackfill.CoverageKey, Value = "0" }); await seed.SaveChangesAsync();
        var pause = new PauseSnapshotWrite();
        await using var backfill = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>().UseNpgsql(connection).AddInterceptors(pause).Options);
        await using var writer = new EdgeDbContext(options);
        var running = SensorDeferralSyncBackfill.ReconcileAsync(backfill, default);
        await pause.Ready.Task.WaitAsync(TimeSpan.FromSeconds(20));
        var newer = await writer.NavigationData.SingleAsync(); newer.HeadingTrue = 20;
        var updating = writer.SaveChangesAsync();
        try { await Task.Delay(150); Assert.False(updating.IsCompleted); }
        finally { pause.Release.TrySetResult(); }
        await running; await updating;
        seed.ChangeTracker.Clear(); var events = await seed.SyncQueue.OrderBy(q => q.Id).ToListAsync();
        Assert.Equal(2, events.Count); Assert.Equal(SyncActionType.SNAPSHOT, events[0].ActionType); Assert.Equal(SyncActionType.UPDATE, events[1].ActionType);
        using var oldPayload = JsonDocument.Parse(events[0].Payload); using var newPayload = JsonDocument.Parse(events[1].Payload);
        Assert.Equal(10.0, oldPayload.RootElement.GetProperty("HeadingTrue").GetDouble()); Assert.Equal(20.0, newPayload.RootElement.GetProperty("HeadingTrue").GetDouble());
        await seed.Database.EnsureDeletedAsync();
    }
}
