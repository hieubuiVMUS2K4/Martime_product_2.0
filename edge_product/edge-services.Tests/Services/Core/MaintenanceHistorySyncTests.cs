using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Maintenance;
using MaritimeEdge.Repositories;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

public partial class SyncReliabilityTests
{
    [MaritimeEdge.Tests.Inventory.PmsPostgresFact]
    public async Task MaintenanceHistory_ApprovalCapturesTwoFullReportsAndResetsInTheSameQueueTransaction()
    {
        await using var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>().UseNpgsql(PostgresConnection()).Options);
        await db.Database.EnsureCreatedAsync();
        var now = DateTime.UtcNow;
        var asset = new EquipmentAsset { AssetCode = "HISTORY", AssetName = "Engine", Category = "ENGINE" };
        var schedule = new MaintenanceSchedule { ScheduleCode = "HISTORY", ScheduleName = "Inspection", EquipmentAssetId = asset.Id,
            MaintenanceCategory = "PERIODIC", IntervalType = "CALENDAR", IntervalDays = 30, IsActive = true, AutoGenerate = true };
        var task = new MaintenanceTask { TaskId = "STABLE-HISTORY", ScheduleId = schedule.Id, EquipmentAssetId = asset.Id,
            TaskType = "PERIODIC", Status = "COMPLETED", CompletedAt = now, CompletedBy = "PIC", VerifiedBy = "MASTER", VerifiedAt = now, Notes = "First cycle" };
        db.AddRange(asset, schedule, task); await db.SaveChangesAsync();
        var service = new MaintenanceCompletionService(db, new MaintenanceScheduleRepository(db), Mock.Of<IEquipmentAssetRepository>(), NullLogger<MaintenanceCompletionService>.Instance);
        await service.PostApprovalScheduleUpdateAsync(task); await db.SaveChangesAsync();
        var first = (await db.MaintenanceHistories.SingleAsync()).ReportSnapshot;
        Assert.Contains("First cycle", first!); Assert.Equal("SCHEDULED", task.Status);
        task.Status = "COMPLETED"; task.CompletedAt = now.AddDays(30); task.VerifiedAt = task.CompletedAt; task.VerifiedBy = "MASTER"; task.Notes = "Second cycle";
        await service.PostApprovalScheduleUpdateAsync(task); await db.SaveChangesAsync();
        Assert.Single(await db.MaintenanceTasks.ToListAsync());
        Assert.Equal(2, await db.MaintenanceHistories.CountAsync());
        var histories = await db.SyncQueue.Where(q => q.TableName == "maintenance_history").ToListAsync();
        Assert.Equal(2, histories.Count);
        Assert.All(histories, q => { Assert.Equal(SyncActionType.CREATE, q.ActionType); Assert.Equal(SyncPriority.Operational, q.Priority); });
        var reports = histories.Select(q => JsonSerializer.Deserialize<JsonElement>(q.Payload).GetProperty("ReportSnapshot").GetString()).ToList();
        Assert.Contains(first, reports); Assert.Contains(reports, report => report!.Contains("Second cycle"));
        Assert.Contains(await db.SyncQueue.Where(q => q.TableName == "maintenance_task").ToListAsync(), q => q.ActionType == SyncActionType.UPDATE && q.Payload.Contains("SCHEDULED"));
        await db.Database.EnsureDeletedAsync();
    }

    [Fact]
    public async Task MaintenanceHistory_LostQueueIsReconciledAndSentWithSnapshotFiles()
    {
        var source = "/uploads/maintenance.jpg";
        var signature = "/uploads/signature.png";
        var snapshot = JsonSerializer.Serialize(new { task = new { status = "COMPLETED", completionPhotos = JsonSerializer.Serialize(new[] { source, "data:image/png;base64,AA==", "https://example.test/image.jpg" }) },
            details = new[] { new { photoUrl = source, signatureUrl = signature } } });
        var sent = new List<SyncQueueItemDto>(); var storage = new Mock<ISyncFileStorageService>();
        storage.Setup(s => s.Exists(It.IsAny<string>())).Returns(true);
        storage.Setup(s => s.ResolveLocalPath(It.IsAny<string>())).Returns((string path) => Path.Combine(Path.GetTempPath(), "codex-maintenance-evidence.png"));
        var preparation = new Mock<ISyncFilePreparationService>();
        preparation.Setup(p => p.PrepareForSyncAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string path, string table, string key, string role, CancellationToken _) =>
                new PreparedSyncFile(path, path, "evidence.png", "image/png", 3, 3, new string('a', 64), false, null));
        var (services, sync) = Build(true, async request =>
        {
            sent.AddRange(JsonSerializer.Deserialize<List<SyncQueueItemDto>>(await request.Content!.ReadAsStringAsync(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!);
            return Response(JsonSerializer.Serialize(new { total = sent.Count, succeeded = sent.Count, failed = 0, acknowledgedEventIds = sent.Select(i => i.EventId), sensorDeferralSyncVersion = 1 }));
        }, storage: storage.Object, preparation: preparation.Object);
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); db.SuppressSyncQueue = true;
            db.SyncState.Add(new() { Key = SensorDeferralSyncBackfill.CoverageKey, Value = "0" });
            var history = new MaintenanceHistory { ReportSnapshot = snapshot, TaskId = Guid.NewGuid(), ScheduleId = Guid.NewGuid() };
            db.MaintenanceHistories.Add(history); await db.SaveChangesAsync();
            Assert.Empty(await db.SyncQueue.ToListAsync());
            await sync.ExecuteSyncAsync(default);
            var item = Assert.Single(sent.Where(i => i.TableName == "maintenance_history"));
            Assert.Equal(history.Id.ToString(), item.RecordKey); Assert.Equal("SNAPSHOT", item.ActionType);
            Assert.Equal(2, item.FileRefs.Count);
            Assert.Contains(item.FileRefs, f => f.FileRole == MaintenanceHistorySyncFiles.Role(source));
            Assert.Contains(item.FileRefs, f => f.FileRole == MaintenanceHistorySyncFiles.Role(signature));
            Assert.Equal(snapshot, JsonSerializer.Deserialize<JsonElement>(item.Payload).GetProperty("ReportSnapshot").GetString());
            db.ChangeTracker.Clear();
            Assert.True((await db.MaintenanceHistories.SingleAsync()).IsSynced);
            await sync.ExecuteSyncAsync(default);
            Assert.Single(sent.Where(i => i.TableName == "maintenance_history"));
        }
    }

    [Fact]
    public void MaintenanceFiles_RewriteOnlyMatchingPathsAndKeepInlineAndExternalImages()
    {
        var snapshot = JsonSerializer.Serialize(new { task = new { completionPhotos = "[\"/uploads/a.png\",\"data:image/png;base64,AA==\",\"https://example.test/a.png\"]" },
            details = new[] { new { signatureUrl = "/uploads/sign.png" } } });
        var rewritten = MaintenanceHistorySyncFiles.Rewrite(snapshot, MaintenanceHistorySyncFiles.Role("/uploads/a.png"), "/uploads/shore.png");
        var report = JsonSerializer.Deserialize<JsonElement>(rewritten!);
        var photos = JsonSerializer.Deserialize<string[]>(report.GetProperty("task").GetProperty("completionPhotos").GetString()!)!;
        Assert.Equal("/uploads/shore.png", photos[0]); Assert.StartsWith("data:", photos[1]); Assert.StartsWith("https:", photos[2]);
        Assert.Equal("/uploads/sign.png", report.GetProperty("details")[0].GetProperty("signatureUrl").GetString());
        Assert.Equal(rewritten, MaintenanceHistorySyncFiles.Rewrite(rewritten, MaintenanceHistorySyncFiles.Role("/uploads/a.png"), "/uploads/other.png"));
    }
}
