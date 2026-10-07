using System.Text.Json;
using System.Security.Cryptography;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

public partial class SyncReliabilityTests
{
    [ShorePostgresFact]
    public async Task MaintenanceHistory_FilesArriveAfterNextCycle_AndRetryKeepsVerifiedShorePaths()
    {
        await using var db = await Database(); await BindNode(db, "HISTORY-FILES");
        var files = new Dictionary<string, byte[]>(); var storage = new Mock<ISyncFileStorageService>();
        storage.Setup(s => s.Exists(It.IsAny<string>())).Returns((string p) => files.ContainsKey(p));
        storage.Setup(s => s.GetFileSize(It.IsAny<string>())).Returns((string p) => files[p].LongLength);
        storage.Setup(s => s.ComputeSha256HexAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns((string p, CancellationToken _) => Task.FromResult(Convert.ToHexString(SHA256.HashData(files[p])).ToLowerInvariant()));
        storage.Setup(s => s.CreateRelativeStoragePath(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()))
            .Returns((string table, string role, string key, string name, string hash) => "/uploads/" + hash + ".png");
        storage.Setup(s => s.WriteAllBytesAsync(It.IsAny<string>(), It.IsAny<byte[]>(), It.IsAny<CancellationToken>()))
            .Returns((string p, byte[] bytes, CancellationToken _) => { files[p] = bytes; return Task.CompletedTask; });
        var inbox = new SyncInboxService(db, new ConflictResolverService(NullLogger<ConflictResolverService>.Instance),
            NullLogger<SyncInboxService>.Instance, Mock.Of<ProductApi.Services.INotificationService>(), new ConfigurationBuilder().Build(),
            storage.Object, new ProductApi.Services.Background.ReportEvaluationQueue());
        var stream = Guid.NewGuid(); var task = Guid.NewGuid(); var schedule = Guid.NewGuid(); var history = Guid.NewGuid();
        var source = "/uploads/edge.png"; var signature = "/uploads/edge-sign.png";
        var report = JsonSerializer.Serialize(new { task = new { status = "COMPLETED", completionPhotos = JsonSerializer.Serialize(new[] { source }) },
            details = new[] { new { signatureUrl = signature } } });
        var item = MirrorEvent("maintenance_history", history.ToString(), "HISTORY-FILES", stream, 3, HistoryPayload(task, schedule, report, DateTime.UtcNow));
        var bytes = new byte[] { 1, 2, 3 }; var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        item.FileRefs = MaintenanceHistorySyncFiles.References(item.Payload).Select(reference => new SyncFileReferenceDto {
            FileId = Guid.NewGuid(), FileRole = reference.Role, FileName = "evidence.png", SizeBytes = bytes.Length, Sha256 = hash, SourcePath = reference.Path }).ToList();
        Assert.Equal(3, (await inbox.ProcessBatchAsync([item,
            MirrorEvent("maintenance_task", task.ToString(), "HISTORY-FILES", stream, 2, new { Id = task, TaskId = "FILES", TaskType = "CALENDAR", TaskDescription = "Inspection", ScheduleId = schedule, Status = "SCHEDULED", NextDueAt = DateTime.UtcNow }),
            MirrorEvent("maintenance_schedule", schedule.ToString(), "HISTORY-FILES", stream, 1, new { ScheduleCode = "FILES", ScheduleName = "Inspection", IntervalType = "CALENDAR" })])).Succeeded);
        Assert.Equal(1, (await inbox.ProcessBatchAsync([MirrorEvent("maintenance_task", task.ToString(), "HISTORY-FILES", stream, 4, new { Status = "DUE" }, "UPDATE")])).Succeeded);
        var transfers = new SyncFileTransferService(db, storage.Object, new ConfigurationBuilder().Build(), NullLogger<SyncFileTransferService>.Instance);
        foreach (var reference in item.FileRefs)
        {
            var request = await db.SyncFileTransferRequests.SingleAsync(r => r.ManifestId == reference.FileId);
            var result = await transfers.AcceptUploadedFileAsync(new SyncFileContentDto { RequestId = request.Id, ManifestId = reference.FileId,
                FileId = reference.FileId, RequesterNodeId = "SHORE", SupplierNodeId = "HISTORY-FILES", TableName = item.TableName,
                RecordKey = item.RecordKey, FileRole = reference.FileRole, FileName = reference.FileName, SizeBytes = bytes.Length,
                Sha256 = hash, Base64Content = Convert.ToBase64String(bytes) }, default);
            Assert.True(result.Success);
        }
        db.ChangeTracker.Clear(); var stored = (await db.MaintenanceHistories.SingleAsync()).ReportSnapshot!;
        var json = JsonSerializer.Deserialize<JsonElement>(stored);
        Assert.Contains("/uploads/" + hash, json.GetProperty("task").GetProperty("completionPhotos").GetString());
        Assert.Equal("/uploads/" + hash + ".png", json.GetProperty("details")[0].GetProperty("signatureUrl").GetString());
        item.EventId = Guid.NewGuid(); item.SyncVersion = 5;
        Assert.Equal(1, (await inbox.ProcessBatchAsync([item])).Succeeded); db.ChangeTracker.Clear();
        Assert.Equal(stored, (await db.MaintenanceHistories.SingleAsync()).ReportSnapshot);
        Assert.Equal("DUE", (await db.MaintenanceTasks.SingleAsync()).Status);
        Assert.Equal(2, await db.SyncFileTransferRequests.CountAsync()); Assert.Single(files);
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task MaintenanceHistory_ScheduleCodeMigrationKeepsExistingSchedules()
    {
        await using var db = await Database(); var vessel = await BindNode(db, "HISTORY-MIGRATION");
        db.MaintenanceSchedules.Add(new() { ScheduleCode = "EXISTING", ScheduleName = "Inspection", VesselId = vessel });
        await db.SaveChangesAsync();
        await db.Database.ExecuteSqlRawAsync("DROP INDEX \"IX_maintenance_schedules_VesselId_ScheduleCode\"; CREATE UNIQUE INDEX \"IX_maintenance_schedules_ScheduleCode\" ON maintenance_schedules (\"ScheduleCode\")");
        var assembly = db.GetService<IMigrationsAssembly>();
        var migration = assembly.CreateMigration(assembly.Migrations["20261006233000_ScopeMaintenanceScheduleCodeByVessel"], "Npgsql.EntityFrameworkCore.PostgreSQL");
        foreach (var command in db.GetService<IMigrationsSqlGenerator>().Generate(migration.UpOperations, db.Model))
            await db.Database.ExecuteSqlRawAsync(command.CommandText);
        Assert.Single(await db.MaintenanceSchedules.ToListAsync());
        var otherVessel = await BindNode(db, "HISTORY-MIGRATION-B");
        db.MaintenanceSchedules.Add(new() { ScheduleCode = "EXISTING", ScheduleName = "Another ship", VesselId = otherVessel });
        await db.SaveChangesAsync(); Assert.Equal(2, await db.MaintenanceSchedules.CountAsync());
        await db.Database.EnsureDeletedAsync();
    }

    private static object HistoryPayload(Guid task, Guid schedule, string report, DateTime executed) => new
    {
        TaskId = task, ScheduleId = schedule, ExecutedAt = executed, CompletedBy = "CHIEF-OFFICER",
        ReportSnapshot = report, Notes = "Completed cycle", OriginNode = "FORGED"
    };

    [ShorePostgresFact]
    public async Task MaintenanceHistory_TwoCycles_RetryAndReorderedParents_PreserveReportsAndSingleTask()
    {
        await using var db = await Database(); await BindNode(db, "HISTORY");
        var inbox = Inbox(db); var stream = Guid.NewGuid(); var task = Guid.NewGuid(); var schedule = Guid.NewGuid();
        var firstReport = JsonSerializer.Serialize(new { task = new { taskId = "RECURRING", status = "COMPLETED", notes = "First report" }, checklist = new[] { new { isCompleted = true } } });
        var history = MirrorEvent("maintenance_history", Guid.NewGuid().ToString(), "HISTORY", stream, 3,
            HistoryPayload(task, schedule, firstReport, DateTime.UtcNow.AddDays(-30)), "CREATE");
        var failed = await inbox.ProcessBatchAsync([history]);
        Assert.Equal(1, failed.Failed); Assert.Empty(failed.AcknowledgedEventIds);
        Assert.Contains("dependency_missing", failed.FailedItems.Single().Error);
        var parent = MirrorEvent("maintenance_task", task.ToString(), "HISTORY", stream, 2,
            new { Id = task, TaskId = "RECURRING", TaskType = "CALENDAR", TaskDescription = "Inspection", ScheduleId = schedule, Status = "SCHEDULED", NextDueAt = DateTime.UtcNow.AddDays(30) });
        var config = MirrorEvent("maintenance_schedule", schedule.ToString(), "HISTORY", stream, 1,
            new { ScheduleCode = "RECURRING", ScheduleName = "Inspection", IntervalType = "CALENDAR", IntervalDays = 30 });
        Assert.Equal(3, (await inbox.ProcessBatchAsync([history, parent, config])).Succeeded);
        Assert.Equal(3, (await inbox.ProcessBatchAsync([history, parent, config])).Succeeded);
        var secondReport = firstReport.Replace("First report", "Second report");
        var second = MirrorEvent("maintenance_history", Guid.NewGuid().ToString(), "HISTORY", stream, 4,
            HistoryPayload(task, schedule, secondReport, DateTime.UtcNow), "CREATE");
        var nextCycle = MirrorEvent("maintenance_task", task.ToString(), "HISTORY", stream, 5,
            new { Status = "DUE", Notes = (string?)null }, "UPDATE");
        Assert.Equal(2, (await inbox.ProcessBatchAsync([nextCycle, second])).Succeeded);
        // A stale event with a new delivery ID cannot roll back a later cycle.
        parent.EventId = Guid.NewGuid();
        Assert.Equal(1, (await inbox.ProcessBatchAsync([parent])).Succeeded);
        db.ChangeTracker.Clear();
        Assert.Equal("DUE", (await db.MaintenanceTasks.SingleAsync()).Status);
        var reports = await db.MaintenanceHistories.OrderBy(h => h.ExecutedAt).ToListAsync();
        Assert.Equal(2, reports.Count); Assert.Equal(firstReport, reports[0].ReportSnapshot);
        Assert.Equal(secondReport, reports[1].ReportSnapshot); Assert.All(reports, h => Assert.Equal(task, h.TaskId));
        Assert.Empty(await db.SyncOutbox.ToListAsync()); await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task MaintenanceHistory_SharedIdsBetweenShips_MapParentsAndIsolateReports()
    {
        await using var db = await Database(); var a = await BindNode(db, "HISTORY-A"); var b = await BindNode(db, "HISTORY-B");
        var inbox = Inbox(db); var stream = Guid.NewGuid(); var task = Guid.NewGuid(); var schedule = Guid.NewGuid(); var history = Guid.NewGuid();
        foreach (var node in new[] { "HISTORY-A", "HISTORY-B" })
        {
            var events = new[] {
                MirrorEvent("maintenance_history", history.ToString(), node, stream, 3, HistoryPayload(task, schedule, node, DateTime.UtcNow)),
                MirrorEvent("maintenance_task", task.ToString(), node, stream, 2, new { Id = task, TaskId = "SHARED", TaskType = "CALENDAR", TaskDescription = "Inspection", ScheduleId = schedule, NextDueAt = DateTime.UtcNow }),
                MirrorEvent("maintenance_schedule", schedule.ToString(), node, stream, 1, new { ScheduleCode = "SHARED", ScheduleName = "Inspection", IntervalType = "CALENDAR" }) };
            var received = await inbox.ProcessBatchAsync(events.ToList());
            Assert.True(received.Succeeded == 3, JsonSerializer.Serialize(received.FailedItems));
            Assert.Equal(3, (await inbox.ProcessBatchAsync(events.ToList())).Succeeded);
        }
        db.ChangeTracker.Clear();
        Assert.Equal(2, await db.MaintenanceHistories.CountAsync());
        foreach (var node in new[] { "HISTORY-A", "HISTORY-B" })
        {
            var report = await db.MaintenanceHistories.SingleAsync(h => h.OriginNode == node);
            Assert.Equal(node, report.ReportSnapshot);
            Assert.Equal(node == "HISTORY-A" ? a : b, (await db.MaintenanceTasks.SingleAsync(t => t.Id == report.TaskId)).VesselId);
            Assert.Equal(report.ScheduleId, (await db.MaintenanceTasks.SingleAsync(t => t.Id == report.TaskId)).ScheduleId);
            Assert.Equal(node == "HISTORY-A" ? a : b, (await db.MaintenanceSchedules.SingleAsync(s => s.Id == report.ScheduleId)).VesselId);
        }
        var foreignTask = Guid.NewGuid();
        await inbox.ProcessBatchAsync([MirrorEvent("maintenance_task", foreignTask.ToString(), "HISTORY-A", stream, 4, TaskPayload(foreignTask))]);
        var forged = await inbox.ProcessBatchAsync([MirrorEvent("maintenance_history", Guid.NewGuid().ToString(), "HISTORY-B", stream, 5,
            HistoryPayload(foreignTask, schedule, "forged", DateTime.UtcNow))]);
        Assert.Equal(1, forged.Failed); Assert.Empty(forged.AcknowledgedEventIds);
        Assert.Equal(2, await db.MaintenanceHistories.CountAsync()); await db.Database.EnsureDeletedAsync();
    }
}
