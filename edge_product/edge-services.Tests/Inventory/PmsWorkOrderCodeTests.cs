using System.Text.Json;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Inventory;
using MaritimeEdge.Services.Maintenance;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

[Collection("PMS inventory")]
public class PmsWorkOrderCodeTests(PmsDatabaseFixture fixture)
{
    [PmsPostgresFact]
    public async Task ExistingCodesAreAssignedOnceWithoutChangingIdentifiersOrSignedSnapshots_AndRemainSearchable()
    {
        await using var db = fixture.CreateContext();
        var origin = Guid.NewGuid().ToString("N");
        var asset = new EquipmentAsset { AssetCode = origin, AssetName = "Fire pump" };
        var task = new MaintenanceTask { TaskId = "WO-" + Guid.NewGuid().ToString("N"), OriginNode = origin,
            PmsProtocolVersion = 2, EquipmentAssetId = asset.Id, Status = "COMPLETED", CreatedAt = new DateTime(2026, 10, 27, 0, 0, 0, DateTimeKind.Utc), WorkflowVersion = 4 };
        var report = new PmsWorkOrderReport { WorkOrderId = task.Id, Revision = 1, SubmitCommandId = Guid.NewGuid(),
            SnapshotJson = "{\"Code\":\"immutable-old-code\"}", ContentHash = "signed-hash", CommandHash = "command", SubmittedByCrewId = "PIC", SubmittedAt = DateTime.UtcNow };
        var item = new TaskChecklistItem { TaskId = task.TaskId, AssetId = asset.Id, SequenceOrder = 1, CheckpointDescription = "Retained" };
        db.AddRange(asset, task, report, item); await db.SaveChangesAsync();
        var key = task.TaskId; var originalId = task.Id;
        await PmsWorkOrderCodes.BackfillAsync(db);
        Assert.Equal("WO-2026-000001", task.WorkOrderCode);
        Assert.Equal(originalId, task.Id); Assert.Equal(key, task.TaskId); Assert.Equal(key, item.TaskId);
        Assert.Equal("{\"Code\":\"immutable-old-code\"}", report.SnapshotJson); Assert.Equal("signed-hash", report.ContentHash);
        Assert.Equal(0, await PmsWorkOrderCodes.BackfillAsync(db));
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["Pms:VesselTimeZone"] = "UTC" }).Build();
        var found = await new PmsWorkOrderReadService(db, config).ListAsync(new() { Status = "ALL", Code = task.WorkOrderCode });
        Assert.Contains(found.Items, w => w.Id == task.Id && w.Code == task.WorkOrderCode);
        // A cancelled/deleted code is retained and cannot be reused by the next order.
        task.IsDeleted = true; await db.SaveChangesAsync();
        await using var tx = await db.Database.BeginTransactionAsync();
        Assert.Equal("WO-2026-000002", await PmsWorkOrderCodes.NextAsync(db, origin, task.CreatedAt));
        Assert.Equal("WO-2027-000001", await PmsWorkOrderCodes.NextAsync(db, origin, task.CreatedAt.AddYears(1)));
    }
}
