using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Maintenance;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

public partial class PmsWorkOrderWorkflowTests
{
    private async Task<(Setup Setup, int Version)> DemandSetup(string category)
    {
        var setup = await Seed();
        await using var db = fixture.CreateContext();
        var job = new MaintenanceSchedule { ScheduleCode = Guid.NewGuid().ToString("N"), ScheduleName = "Clean cooler on request",
            EquipmentAssetId = setup.AssetId, MaintenanceCategory = category, IntervalType = "RUNNING_HOURS",
            AutoGenerate = true, NextDueDate = DateTime.UtcNow.AddDays(5), NextDueRunningHours = 9999,
            OriginNode = "PMS-WORKFLOW", AssignmentPolicy = "PREASSIGNED", AssignedToCrewId = setup.Worker.CrewId,
            Instructions = "Isolate and measure pressure", DaysBeforeDue = 7, WarningHours = 50 };
        PmsJobRules.PrepareForSave(job);
        db.MaintenanceSchedules.Add(job);
        db.ScheduleChecklistTemplates.Add(new() { ScheduleId = job.Id, SequenceOrder = 1, CheckpointDescription = "Pressure",
            RequiresReading = true, Unit = "bar", NormalRangeMin = 1, NormalRangeMax = 10 });
        await db.SaveChangesAsync();
        Assert.False(job.AutoGenerate); Assert.Null(job.NextDueDate); Assert.Null(job.NextDueRunningHours);
        return (setup with { JobId = job.Id }, job.JobVersion!.Value);
    }

    [PmsPostgresTheory]
    [InlineData("ON_DEMAND")]
    [InlineData("DRY_DOCK")]
    [InlineData("VOYAGE")]
    public async Task DemandReleaseUsesSignedWorkflow_RecordsLastExecutionWithoutInventingNextCycle(string category)
    {
        var (setup, version) = await DemandSetup(category);
        await using var db = fixture.CreateContext(); var workflow = Service(db);
        var request = new ReleasePmsManualOrderDto(setup.JobId, version, Guid.NewGuid(), "Cooling performance decreased", DateOnly.FromDateTime(DateTime.UtcNow).AddDays(2), null);
        var state = await workflow.ReleaseManualAsync(request, setup.Reviewer.Id, "WEB");
        var order = await db.MaintenanceTasks.SingleAsync(t => t.Id == state.Id);
        Assert.Equal("ASSIGNED", state.Status); Assert.Equal(category, order.TaskType);
        Assert.StartsWith("REQUEST:", order.CycleKey); Assert.Contains(request.Reason, order.JobSnapshot!);
        Assert.Equal("Isolate and measure pressure", order.WorkOrderInstructions);
        Assert.Equal(setup.JobId, order.ScheduleId); Assert.Null(order.WorkOrderDueHours);
        var checklist = await db.TaskChecklistItems.SingleAsync(c => c.TaskId == order.TaskId);
        Assert.Equal("bar", checklist.Unit);
        setup = setup with { Order = state };
        state = await workflow.StartAsync(state.Id, new(state.Version), setup.Worker.Id, "WEB");
        state = await workflow.SubmitAsync(state.Id, await Results(db, setup, state), setup.Worker.Id, "WEB");
        var frozen = order.JobSnapshot;
        // Stopping the plan must not stop the already issued WO or its approval.
        var job = await db.MaintenanceSchedules.SingleAsync(j => j.Id == setup.JobId);
        job.JobState = PmsJobRules.Paused; job.IsActive = false; await db.SaveChangesAsync();
        state = await Sign(db, setup, state, await Prepare(db, state, true));
        Assert.Equal("COMPLETED", state.Status); Assert.Equal(frozen, order.JobSnapshot);
        Assert.Equal(order.SubmittedAt, job.LastExecutedAt); Assert.Equal(1001d, job.LastExecutedRunningHours);
        Assert.Null(job.NextDueDate); Assert.Null(job.NextDueRunningHours); Assert.Equal(PmsJobRules.Paused, job.JobState);
        Assert.Single(await db.PmsWorkOrderReports.Where(r => r.WorkOrderId == state.Id).ToListAsync());
        Assert.Single(await db.PmsWorkOrderMaterialPostings.Where(p => p.WorkOrderId == state.Id).ToListAsync());
        Assert.True(await db.SyncQueue.AnyAsync(q => q.RecordKey == state.Id.ToString() && q.TableName == "maintenance_task"));
        // A new need is a new explicit request; completing one never releases the next automatically.
        job.JobState = null; PmsJobRules.PrepareForSave(job); await db.SaveChangesAsync();
        var next = await workflow.ReleaseManualAsync(request with { CommandId = Guid.NewGuid(), ExpectedJobVersion = job.JobVersion!.Value }, setup.Reviewer.Id, "WEB");
        Assert.NotEqual(state.Id, next.Id);
        Assert.Equal(2, await db.MaintenanceTasks.CountAsync(t => t.ScheduleId == job.Id));
    }

    [PmsPostgresTheory]
    [InlineData("ON_DEMAND")]
    [InlineData("DRY_DOCK")]
    [InlineData("VOYAGE")]
    public async Task DemandReleaseIsRetrySafeAndRejectsDuplicateOpenOrdersStaleJobsAndMissingRights(string category)
    {
        var (setup, version) = await DemandSetup(category);
        var request = new ReleasePmsManualOrderDto(setup.JobId, version, Guid.NewGuid(), "Inspection finding", null, 0);
        async Task<PmsWorkflowResult> Release() { await using var db = fixture.CreateContext(); return await Service(db).ReleaseManualAsync(request, setup.Reviewer.Id, "WEB"); }
        var results = await Task.WhenAll(Release(), Release()); Assert.Equal(results[0], results[1]);
        await using var check = fixture.CreateContext(); var workflow = Service(check);
        Assert.Equal(1, await check.MaintenanceTasks.CountAsync(t => t.ScheduleId == setup.JobId));
        Assert.Equal(0d, (await check.MaintenanceTasks.SingleAsync(t => t.Id == results[0].Id)).WorkOrderDueHours);
        Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.ReleaseManualAsync(request with { Reason = "Different" }, setup.Reviewer.Id, "WEB"))).Status);
        Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.ReleaseManualAsync(request with { CommandId = Guid.NewGuid() }, setup.Reviewer.Id, "WEB"))).Status);
        Assert.Equal(403, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.ReleaseManualAsync(request, setup.Outsider.Id, "WEB"))).Status);
        Assert.Equal(400, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.ReleaseManualAsync(request with { DueHours = null }, setup.Reviewer.Id, "WEB"))).Status);
        Assert.Equal(400, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.ReleaseManualAsync(request with { Reason = " " }, setup.Reviewer.Id, "WEB"))).Status);
        Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.ReleaseManualAsync(request with { CommandId = Guid.NewGuid(), ExpectedJobVersion = version + 1 }, setup.Reviewer.Id, "WEB"))).Status);
    }
}
