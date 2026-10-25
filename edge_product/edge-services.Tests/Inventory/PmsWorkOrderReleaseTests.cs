using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Maintenance;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

[Collection("PMS inventory")]
public class PmsWorkOrderReleaseTests(PmsDatabaseFixture database)
{
    private static readonly DateTime Now = new(2026, 10, 18, 0, 0, 0, DateTimeKind.Utc);

    private async Task<Guid> Seed()
    {
        await using var db = database.CreateContext();
        var asset = new EquipmentAsset { AssetCode = Guid.NewGuid().ToString("N"), AssetName = "Pump", Category = "DECK", CurrentRunningHours = 1090 };
        var job = new MaintenanceSchedule { ScheduleCode = Guid.NewGuid().ToString("N"), ScheduleName = "Pump inspection",
            EquipmentAssetId = asset.Id, IntervalType = "HYBRID", IntervalMonths = 3, IntervalHours = 1000,
            BaselineAt = Now.AddDays(7).AddMonths(-3), BaselineRunningHours = 100, DaysBeforeDue = 7,
            WarningHours = 50, AutoGenerate = true };
        PmsJobRules.PrepareForSave(job);
        db.AddRange(asset, job, new ScheduleChecklistTemplate { ScheduleId = job.Id, SequenceOrder = 1,
            CheckpointDescription = "Measure pressure", RequiresReading = true, Unit = "bar" });
        await db.SaveChangesAsync();
        return job.Id;
    }

    [PmsPostgresFact]
    public async Task ReleaseRechecksEquipmentAfterDefinitionWasSaved()
    {
        var id = await Seed(); await using var db = database.CreateContext();
        var assetId = await db.MaintenanceSchedules.Where(j => j.Id == id).Select(j => j.EquipmentAssetId).SingleAsync();
        var asset = await db.EquipmentAssets.SingleAsync(a => a.Id == assetId);
        asset.IsActive = false; await db.SaveChangesAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => new PmsWorkOrderReleaseService(db).ReleasePeriodicAsync(id, Now, TimeZoneInfo.Utc));
        asset.IsActive = true; asset.Status = "DECOMMISSIONED"; await db.SaveChangesAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => new PmsWorkOrderReleaseService(db).ReleasePeriodicAsync(id, Now, TimeZoneInfo.Utc));
        Assert.False(await db.MaintenanceTasks.AnyAsync(t => t.ScheduleId == id));
    }

    [PmsPostgresFact]
    public async Task ConcurrentReleaseUsesOneCycleAndOneChecklist_PreservesSnapshotAndCancelledCycle()
    {
        var id = await Seed();
        async Task<Guid> Release()
        {
            await using var db = database.CreateContext();
            return (await new PmsWorkOrderReleaseService(db).ReleasePeriodicAsync(id, Now, TimeZoneInfo.Utc))!.Id;
        }
        var ids = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => Release()));
        Assert.Single(ids.Distinct());
        await using var check = database.CreateContext();
        var order = await check.MaintenanceTasks.SingleAsync(t => t.ScheduleId == id);
        Assert.Equal("UNASSIGNED", order.Status); Assert.Equal("UPCOMING", order.DueState);
        Assert.Single(await check.TaskChecklistItems.Where(c => c.TaskId == order.TaskId).ToListAsync());
        var snapshot = order.JobSnapshot;
        var job = await check.MaintenanceSchedules.SingleAsync(j => j.Id == id);
        job.ScheduleName = "Changed definition"; PmsJobRules.PrepareForSave(job);
        order.Status = "CANCELLED"; await check.SaveChangesAsync();
        Assert.Equal(order.Id, await Release());
        await check.Entry(order).ReloadAsync();
        Assert.Equal("CANCELLED", order.Status); Assert.Equal(snapshot, order.JobSnapshot);
        Assert.Contains("Measure pressure", snapshot!); Assert.DoesNotContain("Changed definition", snapshot!);
        Assert.True(await check.SyncQueue.AnyAsync(q => q.RecordKey == order.Id.ToString() && q.TableName == "maintenance_task"));
    }

    [PmsPostgresFact]
    public async Task ApprovalKeepsFirstWorkOrderAndNextReleaseCreatesDifferentIdentity()
    {
        var id = await Seed();
        await using var db = database.CreateContext();
        var service = new PmsWorkOrderReleaseService(db);
        var first = (await service.ReleasePeriodicAsync(id, Now, TimeZoneInfo.Utc))!;
        var job = await db.MaintenanceSchedules.SingleAsync(j => j.Id == id);
        first.Status = "COMPLETED"; first.SubmittedAt = Now.AddDays(5); first.CompletedAt = Now.AddDays(9);
        first.ActualRunningHours = 1095; first.Notes = "First immutable report";
        PmsJobRules.ApplyApprovedExecution(job, first); await db.SaveChangesAsync();
        var second = await service.ReleasePeriodicAsync(id, Now.AddMonths(3), TimeZoneInfo.Utc);
        Assert.NotNull(second); Assert.NotEqual(first.Id, second.Id); Assert.NotEqual(first.TaskId, second.TaskId);
        Assert.Equal("PERIODIC:1", first.CycleKey); Assert.Equal("PERIODIC:2", second.CycleKey);
        Assert.Equal("COMPLETED", first.Status); Assert.Equal("First immutable report", first.Notes);
        Assert.Equal(Now.AddDays(5).AddMonths(3), job.NextDueDate);
        Assert.Equal(2095d, job.NextDueRunningHours);
    }

    [PmsPostgresFact]
    public async Task InactiveAutomaticPolicyDoesNotRelease_AndEarlyManualReleaseNeedsReason()
    {
        var id = await Seed();
        await using var db = database.CreateContext();
        var job = await db.MaintenanceSchedules.SingleAsync(j => j.Id == id);
        job.AutoGenerate = false;
        job.BaselineAt = Now.AddYears(1);
        var asset = await db.EquipmentAssets.SingleAsync(a => a.Id == job.EquipmentAssetId);
        asset.CurrentRunningHours = 100;
        PmsJobRules.PrepareForSave(job); await db.SaveChangesAsync();
        var service = new PmsWorkOrderReleaseService(db);
        Assert.Null(await service.ReleasePeriodicAsync(id, Now, TimeZoneInfo.Utc));
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.ReleasePeriodicAsync(id, Now, TimeZoneInfo.Utc, false));
        var order = await service.ReleasePeriodicAsync(id, Now, TimeZoneInfo.Utc, false, "Early planned inspection");
        Assert.NotNull(order); Assert.Equal("NOT_DUE", order.DueState);
    }
}
