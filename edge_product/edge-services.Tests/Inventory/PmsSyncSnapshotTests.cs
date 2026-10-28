using System.Text.Json;
using MaritimeEdge.Controllers.Core;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Npgsql;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

[Collection("PMS inventory")]
public class PmsSyncSnapshotTests
{
    [PmsPostgresFact]
    public async Task OperationsSnapshotIncludesDefinitionsFrozenReportsAndDataset_WithoutResendingCatalog()
    {
        var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("PMS_TEST_CONNECTION_STRING"));
        if (connection.Database?.StartsWith("codex_pms_tests_", StringComparison.Ordinal) != true) throw new InvalidOperationException("Test database required");
        connection.Database += "_snapshot_" + Guid.NewGuid().ToString("N")[..8];
        await using var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>().UseNpgsql(connection.ConnectionString).Options);
        await db.Database.EnsureCreatedAsync();
        try {
        var epoch = Guid.NewGuid();
        db.SyncState.AddRange(new() { Key = "pms-dataset-id", Value = epoch.ToString() }, new() { Key = "pms-cutover-state", Value = "ACTIVE" });
        var asset = new EquipmentAsset { AssetCode = Guid.NewGuid().ToString("N"), AssetName = "Pump" };
        var job = new MaintenanceSchedule { PmsProtocolVersion = 2, ScheduleCode = asset.AssetCode, ScheduleName = "Inspect pump", EquipmentAssetId = asset.Id, JobVersion = 1 };
        var order = new MaintenanceTask { PmsProtocolVersion = 2, TaskId = "WO-" + Guid.NewGuid().ToString("N"), ScheduleId = job.Id,
            EquipmentAssetId = asset.Id, WorkflowVersion = 4, ReportRevision = 1, Status = "COMPLETED" };
        const string signed = "{\"notes\":\"Keep exact signed bytes\"}";
        var report = new PmsWorkOrderReport { WorkOrderId = order.Id, JobId = job.Id, Revision = 1, SubmitCommandId = Guid.NewGuid(),
            SnapshotJson = signed, ContentHash = "retained-hash", CommandHash = "command", SubmittedByCrewId = "PIC", SubmittedAt = DateTime.UtcNow };
        db.AddRange(asset, job, order, report, new ScheduleChecklistTemplate { ScheduleId = job.Id, SequenceOrder = 1, CheckpointDescription = "Seal" });
        await db.SaveChangesAsync();
        // Simulate the earlier bad ACK: records exist but their events are already marked delivered.
        await db.SyncQueue.ExecuteUpdateAsync(s => s.SetProperty(q => q.SyncedAt, DateTime.UtcNow));
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["Pms:ReworkApiEnabled"] = "true" }).Build();
        var controller = new SyncController(db, NullLogger<SyncController>.Instance, Mock.Of<ISyncService>(), Mock.Of<IHttpClientFactory>(), configuration, Mock.Of<IEdgeRuntimeConfigService>());
        Assert.IsType<OkObjectResult>(await controller.Snapshot(new() { Groups = ["pms_work"] }));
        var pending = await db.SyncQueue.AsNoTracking().Where(q => q.SyncedAt == null).ToListAsync();
        Assert.Equal(3, pending.Count);
        Assert.DoesNotContain(pending, q => q.TableName == "equipment_asset");
        foreach (var entry in pending)
            Assert.Equal(epoch, JsonDocument.Parse(entry.Payload).RootElement.GetProperty("PmsDatasetId").GetGuid());
        var jobPayload = JsonDocument.Parse(pending.Single(q => q.TableName == "maintenance_schedule").Payload).RootElement;
        Assert.Single(jobPayload.GetProperty("PmsChecklistTemplates").EnumerateArray());
        var reportPayload = JsonDocument.Parse(pending.Single(q => q.TableName == "pms_work_order_report").Payload).RootElement;
        Assert.Equal(signed, reportPayload.GetProperty("SnapshotJson").GetString());
        Assert.Equal("retained-hash", reportPayload.GetProperty("ContentHash").GetString());
        Assert.IsType<OkObjectResult>(await controller.Snapshot(new() { Groups = ["pms_work"] }));
        Assert.Equal(3, await db.SyncQueue.CountAsync(q => q.SyncedAt == null));
        var state = await db.SyncState.SingleAsync(s => s.Key == "pms-cutover-state"); state.Value = "PREPARED"; await db.SaveChangesAsync();
        Assert.Equal(503, Assert.IsType<ObjectResult>(await controller.Snapshot(new() { Groups = ["pms_work"] })).StatusCode);
        } finally { await db.Database.EnsureDeletedAsync(); }
    }
}
