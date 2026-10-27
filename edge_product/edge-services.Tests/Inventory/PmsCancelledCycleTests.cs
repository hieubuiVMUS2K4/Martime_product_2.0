using MaritimeEdge.DTOs;
using MaritimeEdge.Services.Maintenance;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

public partial class PmsWorkOrderWorkflowTests
{
    [PmsPostgresFact]
    public async Task FailedReplacementRollsBackCycleIdentityAndDoesNotCreateOrder()
    {
        var setup = await Seed();
        int? version;
        await using (var db = fixture.CreateContext())
        {
            await Service(db).CancelAsync(setup.Order.Id, new(setup.Order.Version, "Cancelled"), setup.Reviewer.Id, "WEB");
            var job = await db.MaintenanceSchedules.SingleAsync(j => j.Id == setup.JobId); version = job.JobVersion;
            var asset = await db.EquipmentAssets.SingleAsync(a => a.Id == setup.AssetId); asset.IsActive = false; await db.SaveChangesAsync();
            Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => Service(db).ResolveCancelledCycleAsync(job.Id,
                new(version!.Value, PmsJobRules.CycleKey(job), setup.Order.Id, "REPLACE", "Attempt replacement"), setup.Reviewer.Id))).Status);
        }
        await using var check = fixture.CreateContext();
        var unchanged = await check.MaintenanceSchedules.SingleAsync(j => j.Id == setup.JobId);
        Assert.Equal(version, unchanged.JobVersion); Assert.Null(unchanged.CycleReleaseAttempt);
        Assert.Single(await check.MaintenanceTasks.Where(w => w.ScheduleId == setup.JobId).ToListAsync());
    }

    [PmsPostgresFact]
    public async Task ReplacementIsAtomicPreservesCancelledOrderAndRejectsReplay()
    {
        var setup = await Seed();
        await using var db = fixture.CreateContext();
        await Service(db).CancelAsync(setup.Order.Id, new(setup.Order.Version, "Faulty assignment"), setup.Reviewer.Id, "WEB");
        var job = await db.MaintenanceSchedules.SingleAsync(j => j.Id == setup.JobId);
        var old = await db.MaintenanceTasks.SingleAsync(w => w.Id == setup.Order.Id);
        var due = job.NextDueDate; var hours = job.NextDueRunningHours;
        var dto = new ResolvePmsCycleDto(job.JobVersion!.Value, PmsJobRules.CycleKey(job), old.Id, "REPLACE", "Issue corrected order");
        await Service(db).ResolveCancelledCycleAsync(job.Id, dto, setup.Reviewer.Id);
        var replacement = await db.MaintenanceTasks.SingleAsync(w => w.ScheduleId == job.Id && w.Id != old.Id);
        Assert.Equal("CANCELLED", old.Status); Assert.Equal("PERIODIC:1", old.CycleKey);
        Assert.Equal("PERIODIC:1:R1", replacement.CycleKey); Assert.Equal(due, replacement.WorkOrderDueAt);
        Assert.Equal(hours, replacement.WorkOrderDueHours); Assert.Equal(1L, job.NextCycleNumber);
        Assert.Null(job.LastExecutedAt); Assert.Null(job.LastExecutedRunningHours);
        Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => Service(db).ResolveCancelledCycleAsync(job.Id, dto, setup.Reviewer.Id))).Status);
        await Service(db).CancelAsync(replacement.Id, new(replacement.WorkflowVersion!.Value, "Cancel replacement"), setup.Reviewer.Id, "WEB");
        await Service(db).ResolveCancelledCycleAsync(job.Id, new(job.JobVersion!.Value, PmsJobRules.CycleKey(job), replacement.Id, "REPLACE", "Retry same planned cycle"), setup.Reviewer.Id);
        Assert.Equal(3, await db.MaintenanceTasks.CountAsync(w => w.ScheduleId == job.Id));
        Assert.Equal("PERIODIC:1:R2", PmsJobRules.CycleKey(job));
    }

    [PmsPostgresFact]
    public async Task SkipKeepsExecutionCounterAndReportsUntouched_AndUnblocksFollowingCycle()
    {
        var setup = await Seed();
        await using var db = fixture.CreateContext();
        await Service(db).CancelAsync(setup.Order.Id, new(setup.Order.Version, "Not performed"), setup.Reviewer.Id, "WEB");
        var job = await db.MaintenanceSchedules.SingleAsync(j => j.Id == setup.JobId);
        var due = job.NextDueDate; var hours = job.NextDueRunningHours;
        var dto = new ResolvePmsCycleDto(job.JobVersion!.Value, PmsJobRules.CycleKey(job), setup.Order.Id, "SKIP", "Approved postponement");
        Assert.Equal(403, (await Assert.ThrowsAsync<PmsRequestException>(() => Service(db).ResolveCancelledCycleAsync(job.Id, dto, setup.Worker.Id))).Status);
        await Service(db).ResolveCancelledCycleAsync(job.Id, dto, setup.Reviewer.Id);
        Assert.Equal(due!.Value.AddMonths(3), job.NextDueDate); Assert.Equal(hours + 100, job.NextDueRunningHours);
        Assert.Null(job.LastExecutedAt); Assert.Null(job.LastExecutedRunningHours);
        Assert.Equal(1000d, (await db.EquipmentAssets.SingleAsync(a => a.Id == setup.AssetId)).CurrentRunningHours);
        Assert.Empty(await db.PmsWorkOrderReports.Where(r => r.JobId == job.Id).ToListAsync());
        Assert.Equal("PERIODIC:2", PmsJobRules.CycleKey(job));
        var next = await new PmsWorkOrderReleaseService(db).ReleasePeriodicAsync(job.Id, DateTime.UtcNow, TimeZoneInfo.Utc, false, "Manual next cycle");
        Assert.Equal("PERIODIC:2", next!.CycleKey); Assert.Equal(job.NextDueDate, next.WorkOrderDueAt);
        Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => Service(db).ResolveCancelledCycleAsync(job.Id, dto, setup.Reviewer.Id))).Status);
    }

    [PmsPostgresFact]
    public async Task ResolutionRequiresReasonAndCancelledOrderOfCurrentCycle()
    {
        var setup = await Seed();
        await using var db = fixture.CreateContext();
        var job = await db.MaintenanceSchedules.SingleAsync(j => j.Id == setup.JobId);
        var dto = new ResolvePmsCycleDto(job.JobVersion!.Value, PmsJobRules.CycleKey(job), setup.Order.Id, "SKIP", " ");
        Assert.Equal(400, (await Assert.ThrowsAsync<PmsRequestException>(() => Service(db).ResolveCancelledCycleAsync(job.Id, dto, setup.Reviewer.Id))).Status);
        Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => Service(db).ResolveCancelledCycleAsync(job.Id, dto with { Reason = "Not cancelled yet" }, setup.Reviewer.Id))).Status);
        Assert.Equal(1L, job.NextCycleNumber); Assert.Single(await db.MaintenanceTasks.Where(w => w.ScheduleId == job.Id).ToListAsync());
    }
}
