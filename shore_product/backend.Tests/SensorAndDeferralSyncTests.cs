using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using ProductApi.Models;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

public partial class SyncReliabilityTests
{
    private static SyncQueueItemDto MirrorEvent(string table, string key, string node, Guid stream, long version, object payload, string action = "SNAPSHOT")
    {
        var item = Event(node, stream, Guid.NewGuid(), version, action, payload);
        item.TableName = table; item.RecordKey = key;
        return item;
    }

    private static object TaskPayload(Guid key) => new { Id = key, TaskId = "DEFERRAL-TASK", TaskType = "CALENDAR", TaskDescription = "Engine inspection", NextDueAt = DateTime.UtcNow.AddDays(1) };
    private static object DeferralPayload(Guid task) => new { TaskId = task, RequestedBy = "CHIEF-ENGINEER", Reason = "Waiting for spare parts at next port", CurrentDueDate = DateTime.UtcNow, ProposedDueDate = DateTime.UtcNow.AddDays(7), DeferralDays = 7, Status = "PENDING", IsOverdueDeferral = true, RootCause = "No spare aboard", PreventiveMeasures = "Monitor daily" };

    [ShorePostgresFact]
    public async Task MirrorMigration_AddsAllFourTablesAndKeepsExistingData()
    {
        await using var db = await Database(); await BindNode(db, "MIGRATION");
        await db.Database.ExecuteSqlRawAsync("DROP TABLE nmea_raw_data, navigation_data, environmental_data, task_deferral_request");
        var migrations = db.GetService<IMigrationsAssembly>();
        var id = migrations.Migrations.Keys.Single(k => k.EndsWith("_AddSensorAndDeferralSyncMirrors"));
        var migration = migrations.CreateMigration(migrations.Migrations[id], "Npgsql.EntityFrameworkCore.PostgreSQL");
        foreach (var command in db.GetService<IMigrationsSqlGenerator>().Generate(migration.UpOperations, db.Model))
            await db.Database.ExecuteSqlRawAsync(command.CommandText);
        Assert.Single(await db.Vessels.ToListAsync());
        Assert.Empty(await db.NmeaRawData.ToListAsync()); Assert.Empty(await db.NavigationData.ToListAsync());
        Assert.Empty(await db.EnvironmentalData.ToListAsync()); Assert.Empty(await db.TaskDeferralRequests.ToListAsync());
        Assert.Equal(DeleteBehavior.Restrict, db.Model.FindEntityType(typeof(TaskDeferralRequest))!.GetForeignKeys().Single(f => f.PrincipalEntityType.ClrType == typeof(MaintenanceTask)).DeleteBehavior);
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task RawCountersAndSensorGuids_AreIsolatedPerVessel_WithRetryAndDeltaSafety()
    {
        await using var db = await Database(); var a = await BindNode(db, "SENSOR-A"); var b = await BindNode(db, "SENSOR-B");
        var inbox = Inbox(db); var stream = Guid.NewGuid(); var sharedKey = Guid.NewGuid();
        var rawA = MirrorEvent("nmea_raw_data", "1", "SENSOR-A", stream, 1, new { Timestamp = DateTime.UtcNow, SentenceType = "RMC", RawSentence = "$GPRMC,A", ChecksumValid = true });
        var rawB = MirrorEvent("nmea_raw_data", "1", "SENSOR-B", stream, 2, new { Timestamp = DateTime.UtcNow, SentenceType = "RMC", RawSentence = "$GPRMC,B", ChecksumValid = false, VesselId = a, OriginNode = "SENSOR-A" });
        Assert.Equal(2, (await inbox.ProcessBatchAsync([rawA, rawB])).Succeeded);
        Assert.Equal(2, (await inbox.ProcessBatchAsync([rawA, rawB])).Succeeded);
        db.ChangeTracker.Clear(); var raw = await db.NmeaRawData.ToListAsync(); Assert.Equal(2, raw.Count);
        Assert.Equal(a, raw.Single(r => r.RawSentence == "$GPRMC,A").VesselId);
        Assert.Equal(b, raw.Single(r => r.RawSentence == "$GPRMC,B").VesselId);
        Assert.Equal("SENSOR-B", raw.Single(r => r.VesselId == b).OriginNode);
        foreach (var node in new[] { "SENSOR-A", "SENSOR-B" })
        {
            Assert.Equal(1, (await inbox.ProcessBatchAsync([MirrorEvent("navigation_data", sharedKey.ToString(), node, stream, 3,
                new { Timestamp = DateTime.UtcNow, HeadingTrue = 0.0, Depth = 123.4, Roll = 2.5 })])).Succeeded);
            Assert.Equal(1, (await inbox.ProcessBatchAsync([MirrorEvent("environmental_data", sharedKey.ToString(), node, stream, 4,
                new { Timestamp = DateTime.UtcNow, AirTemperature = 28.5, SeaTemperature = 26.0, WaveHeight = 1.7 })])).Succeeded);
        }
        var delta = MirrorEvent("navigation_data", sharedKey.ToString(), "SENSOR-A", stream, 5, new { Depth = (double?)null }, "UPDATE");
        delta.Timestamp = DateTime.UtcNow.AddDays(-10); // Clock skew must not discard a newer source sequence.
        Assert.Equal(1, (await inbox.ProcessBatchAsync([delta])).Succeeded);
        db.ChangeTracker.Clear(); var nav = await db.NavigationData.SingleAsync(r => r.VesselId == a);
        Assert.Null(nav.Depth); Assert.Equal(0.0, nav.HeadingTrue); Assert.Equal(2.5, nav.Roll);
        Assert.Equal(123.4, (await db.NavigationData.SingleAsync(r => r.VesselId == b)).Depth);
        Assert.Equal(2, await db.EnvironmentalData.CountAsync());
        var deleted = MirrorEvent("nmea_raw_data", "1", "SENSOR-A", stream, 6, new { }, "DELETE");
        Assert.Equal(1, (await inbox.ProcessBatchAsync([deleted])).Succeeded);
        rawA.EventId = Guid.NewGuid(); Assert.Equal(1, (await inbox.ProcessBatchAsync([rawA])).Succeeded);
        Assert.Single(await db.NmeaRawData.ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task Deferral_WaitsForTask_RemapUsesItsOwnVessel_AndCannotMoveAcrossTasks()
    {
        await using var db = await Database(); await BindNode(db, "DEFERRAL-A"); var b = await BindNode(db, "DEFERRAL-B");
        var inbox = Inbox(db); var stream = Guid.NewGuid(); var taskKey = Guid.NewGuid(); var requestKey = Guid.NewGuid();
        var request = MirrorEvent("task_deferral_request", requestKey.ToString(), "DEFERRAL-B", stream, 2, DeferralPayload(taskKey));
        var missing = await inbox.ProcessBatchAsync([request]); Assert.Equal(1, missing.Failed); Assert.Empty(missing.AcknowledgedEventIds);
        Assert.Contains("dependency_missing", missing.FailedItems.Single().Error);
        Assert.Equal(1, (await inbox.ProcessBatchAsync([MirrorEvent("maintenance_task", taskKey.ToString(), "DEFERRAL-A", stream, 1, TaskPayload(taskKey))])).Succeeded);
        // Deliberately reversed: task dependency must be processed before the request.
        var received = await inbox.ProcessBatchAsync([request, MirrorEvent("maintenance_task", taskKey.ToString(), "DEFERRAL-B", stream, 1, TaskPayload(taskKey))]);
        Assert.Equal(2, received.Succeeded); db.ChangeTracker.Clear();
        var stored = await db.TaskDeferralRequests.Include(r => r.Task).SingleAsync();
        Assert.Equal(b, stored.VesselId); Assert.Equal(b, stored.Task.VesselId); Assert.NotEqual(taskKey, stored.TaskId);
        Assert.True(stored.IsOverdueDeferral); Assert.Equal("No spare aboard", stored.RootCause);
        var foreignKey = Guid.NewGuid();
        await inbox.ProcessBatchAsync([MirrorEvent("maintenance_task", foreignKey.ToString(), "DEFERRAL-A", stream, 3, TaskPayload(foreignKey))]);
        var forged = await inbox.ProcessBatchAsync([MirrorEvent("task_deferral_request", Guid.NewGuid().ToString(), "DEFERRAL-B", stream, 4, DeferralPayload(foreignKey))]);
        Assert.Equal(1, forged.Failed); Assert.Empty(forged.AcknowledgedEventIds);
        var moved = await inbox.ProcessBatchAsync([MirrorEvent("task_deferral_request", requestKey.ToString(), "DEFERRAL-B", stream, 5, new { TaskId = foreignKey }, "UPDATE")]);
        Assert.Equal(1, moved.Failed); Assert.Empty(moved.AcknowledgedEventIds);
        Assert.Equal(1, (await inbox.ProcessBatchAsync([MirrorEvent("task_deferral_request", requestKey.ToString(), "DEFERRAL-B", stream, 6,
            new { Status = "APPROVED", ReviewedBy = "MASTER", ReviewNotes = (string?)null }, "UPDATE")])).Succeeded);
        db.ChangeTracker.Clear(); Assert.Equal("APPROVED", (await db.TaskDeferralRequests.SingleAsync()).Status);
        Assert.Empty(await db.SyncOutbox.ToListAsync()); await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task InvalidSensorPayload_IsNotAcknowledged_AndDoesNotPoisonTheNextRetry()
    {
        await using var db = await Database(); await BindNode(db, "SENSOR-INVALID"); var stream = Guid.NewGuid(); var key = Guid.NewGuid(); var inbox = Inbox(db);
        var item = MirrorEvent("environmental_data", key.ToString(), "SENSOR-INVALID", stream, 1, new { Timestamp = DateTime.UtcNow, AirTemperature = "bad number" });
        var failed = await inbox.ProcessBatchAsync([item]); Assert.Equal(1, failed.Failed); Assert.Empty(failed.AcknowledgedEventIds);
        Assert.Empty(await db.EnvironmentalData.ToListAsync()); Assert.Empty(await db.SyncRecordIdentities.ToListAsync());
        item.Payload = JsonSerializer.Serialize(new { Timestamp = DateTime.UtcNow, AirTemperature = 0.0, Humidity = (double?)null });
        var received = await inbox.ProcessBatchAsync([item]); Assert.Contains(item.EventId, received.AcknowledgedEventIds);
        Assert.Equal(0.0, (await db.EnvironmentalData.SingleAsync()).AirTemperature);
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task DeferralFiles_UseTheSupplierKeyMapping_ReuseVerifiedBytes_AndIgnoreRemovedEvidence()
    {
        await using var db = await Database(); await BindNode(db, "FILE-A"); var vesselB = await BindNode(db, "FILE-B");
        db.ChangeTracker.Clear(); db.ChangeTracker.QueryTrackingBehavior = QueryTrackingBehavior.NoTracking;
        var data = new Dictionary<string, byte[]>(); var storage = new Mock<ISyncFileStorageService>();
        storage.Setup(s => s.Exists(It.IsAny<string>())).Returns((string p) => data.ContainsKey(p));
        storage.Setup(s => s.GetFileSize(It.IsAny<string>())).Returns((string p) => data[p].LongLength);
        storage.Setup(s => s.ComputeSha256HexAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns((string p, CancellationToken _) => Task.FromResult(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(data[p])).ToLowerInvariant()));
        storage.Setup(s => s.CreateRelativeStoragePath(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()))
            .Returns((string table, string role, string key, string name, string hash) => "uploads/" + hash + ".pdf");
        storage.Setup(s => s.WriteAllBytesAsync(It.IsAny<string>(), It.IsAny<byte[]>(), It.IsAny<CancellationToken>()))
            .Returns((string p, byte[] bytes, CancellationToken _) => { data[p] = bytes; return Task.CompletedTask; });
        var inbox = new SyncInboxService(db, new ConflictResolverService(NullLogger<ConflictResolverService>.Instance),
            NullLogger<SyncInboxService>.Instance, Mock.Of<ProductApi.Services.INotificationService>(),
            new ConfigurationBuilder().Build(), storage.Object, new ProductApi.Services.Background.ReportEvaluationQueue());
        var stream = Guid.NewGuid(); var task = Guid.NewGuid(); var key = Guid.NewGuid();
        foreach (var node in new[] { "FILE-A", "FILE-B" })
        {
            Assert.Equal(1, (await inbox.ProcessBatchAsync([MirrorEvent("maintenance_task", task.ToString(), node, stream, 1, TaskPayload(task))])).Succeeded);
            Assert.Equal(1, (await inbox.ProcessBatchAsync([MirrorEvent("task_deferral_request", key.ToString(), node, stream, 2, DeferralPayload(task))])).Succeeded);
        }
        var source = "/uploads/evidence.pdf"; var letterSource = "/uploads/class.pdf";
        var payload = new { Attachments = JsonSerializer.Serialize(new[] { source }), ClassPermissionLetter = letterSource };
        var item = MirrorEvent("task_deferral_request", key.ToString(), "FILE-B", stream, 3, payload, "UPDATE");
        var bytes = new byte[] { 1, 4, 7 }; var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)).ToLowerInvariant();
        item.FileRefs = [new() { FileId = Guid.NewGuid(), FileRole = DeferralSyncFiles.Role(source), FileName = "evidence.pdf", SizeBytes = bytes.Length, Sha256 = hash, SourcePath = source },
            new() { FileId = Guid.NewGuid(), FileRole = DeferralSyncFiles.Role(letterSource, true), FileName = "class.pdf", SizeBytes = bytes.Length, Sha256 = hash, SourcePath = letterSource }];
        Assert.Equal(1, (await inbox.ProcessBatchAsync([item])).Succeeded); db.ChangeTracker.Clear();
        var transfers = new SyncFileTransferService(db, storage.Object, new ConfigurationBuilder().Build(), NullLogger<SyncFileTransferService>.Instance);
        foreach (var reference in item.FileRefs)
        {
            var request = await db.SyncFileTransferRequests.SingleAsync(r => r.ManifestId == reference.FileId);
            var result = await transfers.AcceptUploadedFileAsync(new SyncFileContentDto { RequestId = request.Id, ManifestId = reference.FileId,
                FileId = reference.FileId, RequesterNodeId = "SHORE", SupplierNodeId = "FILE-B", TableName = item.TableName,
                RecordKey = key.ToString(), FileRole = reference.FileRole, FileName = reference.FileName, SizeBytes = bytes.Length,
                Sha256 = hash, Base64Content = Convert.ToBase64String(bytes) }, default);
            Assert.True(result.Success);
        }
        db.ChangeTracker.Clear(); var stored = await db.TaskDeferralRequests.SingleAsync(r => r.VesselId == vesselB);
        Assert.Equal("uploads/" + hash + ".pdf", stored.ClassPermissionLetter);
        Assert.Equal(new[] { "uploads/" + hash + ".pdf" }, JsonSerializer.Deserialize<List<string>>(stored.Attachments!)!);
        Assert.Null((await db.TaskDeferralRequests.SingleAsync(r => r.VesselId != vesselB)).Attachments);
        // A later full snapshot carries original Edge paths; verified Shore paths must survive.
        item.EventId = Guid.NewGuid(); item.SyncVersion = 4;
        Assert.Equal(1, (await inbox.ProcessBatchAsync([item])).Succeeded); db.ChangeTracker.Clear();
        Assert.Equal(stored.Attachments, (await db.TaskDeferralRequests.SingleAsync(r => r.VesselId == vesselB)).Attachments);
        Assert.Equal(2, await db.SyncFileTransferRequests.CountAsync());
        var removed = MirrorEvent(item.TableName, key.ToString(), "FILE-B", stream, 5, new { Attachments = "[]", ClassPermissionLetter = (string?)null }, "UPDATE");
        Assert.Equal(1, (await inbox.ProcessBatchAsync([removed])).Succeeded);
        var oldRef = item.FileRefs[0]; var oldRequest = await db.SyncFileTransferRequests.SingleAsync(r => r.ManifestId == oldRef.FileId);
        await transfers.AcceptUploadedFileAsync(new SyncFileContentDto { RequestId = oldRequest.Id, ManifestId = oldRef.FileId, FileId = oldRef.FileId,
            RequesterNodeId = "SHORE", SupplierNodeId = "FILE-B", TableName = item.TableName, RecordKey = key.ToString(), FileRole = oldRef.FileRole,
            FileName = oldRef.FileName, SizeBytes = bytes.Length, Sha256 = hash, Base64Content = Convert.ToBase64String(bytes) }, default);
        db.ChangeTracker.Clear(); Assert.Equal("[]", (await db.TaskDeferralRequests.SingleAsync(r => r.VesselId == vesselB)).Attachments);
        await db.Database.EnsureDeletedAsync();
    }
}
