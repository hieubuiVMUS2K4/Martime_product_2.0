using System.Text.Json;
using MaritimeEdge.DTOs;
using MaritimeEdge.Services.Maintenance;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

public partial class PmsWorkOrderWorkflowTests
{
    private static CreatePmsAdHocOrderDto AdHoc(Setup setup, bool issue = false) => new()
    {
        CommandId = Guid.NewGuid(), Name = "Inspect fire pump", EquipmentAssetId = setup.AssetId,
        Instructions = "Inspect impeller and record pressure", DueDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(7),
        CrewId = setup.Worker.CrewId, IssueNow = issue,
        Checklist = [new() { SequenceOrder = 1, CheckpointDescription = "Record pressure", RequiresReading = true, Unit = "bar", NormalRangeMin = 1, NormalRangeMax = 10 }]
    };

    [PmsPostgresFact]
    public async Task AdHocDraftIsIncompleteUntilIssued_ThenUsesIndependentSignedWorkflowWithoutFakeJob()
    {
        var setup = await Seed(); await using var db = fixture.CreateContext(); var workflow = Service(db);
        var jobsBefore = await db.MaintenanceSchedules.CountAsync();
        var initial = new CreatePmsAdHocOrderDto { CommandId = Guid.NewGuid(),
            Checklist = [new() { SequenceOrder = 1, CheckpointDescription = "Template before selecting equipment" }] };
        var draft = await workflow.CreateAdHocAsync(initial, setup.Reviewer.Id, "PMS-WORKFLOW", "WEB");
        Assert.Equal("DRAFT", draft.Status);
        var order = await db.MaintenanceTasks.SingleAsync(t => t.Id == draft.Id);
        Assert.Equal(3, PmsWorkOrderWorkflowService.MissingAdHocInformation(order).Length);
        Assert.Contains("Template before selecting equipment", order.DraftChecklistJson!);
        Assert.False(await db.TaskChecklistItems.AnyAsync(c => c.TaskId == order.TaskId));
        Assert.Equal(400, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.IssueAdHocDraftAsync(draft.Id, new(draft.Version), setup.Reviewer.Id, "WEB"))).Status);
        var definition = AdHoc(setup);
        var update = new UpdatePmsAdHocDraftDto { ExpectedVersion = draft.Version, Name = definition.Name,
            EquipmentAssetId = definition.EquipmentAssetId, Instructions = definition.Instructions, DueDate = definition.DueDate,
            CrewId = definition.CrewId, Checklist = definition.Checklist };
        var state = await workflow.UpdateAdHocDraftAsync(draft.Id, update, setup.Reviewer.Id, "WEB");
        Assert.Null(order.JobSnapshot);
        var replay = await workflow.CreateAdHocAsync(initial, setup.Reviewer.Id, "PMS-WORKFLOW", "WEB");
        Assert.Equal(state, replay); Assert.Equal(definition.Name, order.TaskDescription);
        state = await workflow.IssueAdHocDraftAsync(state.Id, new(state.Version), setup.Reviewer.Id, "WEB");
        Assert.Equal("ASSIGNED", state.Status); Assert.Null(order.ScheduleId); Assert.Contains("AD_HOC", order.JobSnapshot!);
        Assert.Contains(definition.Instructions!, order.JobSnapshot!);
        Assert.Equal(jobsBefore, await db.MaintenanceSchedules.CountAsync());
        Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.UpdateAdHocDraftAsync(state.Id,
            new() { ExpectedVersion = state.Version, Name = "Must not overwrite released content" }, setup.Reviewer.Id, "WEB"))).Status);
        Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.DeleteAdHocDraftAsync(state.Id, state.Version, setup.Reviewer.Id, "WEB"))).Status);
        var frozenDefinition = order.JobSnapshot;
        state = await workflow.StartAsync(state.Id, new(state.Version), setup.Worker.Id, "WEB");
        var checkpoint = await db.TaskChecklistItems.SingleAsync(c => c.TaskId == order.TaskId);
        state = await workflow.SubmitAsync(state.Id, new() { ExpectedVersion = state.Version, CommandId = Guid.NewGuid(), ActualDurationMinutes = 60,
            Checklist = [new(checkpoint.Id, true, 5, "Normal")] }, setup.Worker.Id, "WEB");
        state = await Sign(db, setup, state, await Prepare(db, state, true));
        Assert.Equal("COMPLETED", state.Status); Assert.Equal(frozenDefinition, order.JobSnapshot);
        var report = await db.PmsWorkOrderReports.SingleAsync(r => r.WorkOrderId == state.Id);
        Assert.Null(report.JobId); Assert.Equal("APPROVED", report.Decision);
        Assert.Contains(definition.Instructions!, report.SnapshotJson);
        Assert.Null((await db.MaintenanceSchedules.SingleAsync(j => j.Id == setup.JobId)).LastExecutedAt);
        Assert.False(await db.PmsWorkOrderMaterialPostings.AnyAsync(p => p.WorkOrderId == state.Id));
    }

    [PmsPostgresFact]
    public async Task AdHocCreationRetryAndConcurrentRequestsReturnOneOrder_ChangedBodyConflicts()
    {
        var setup = await Seed(); var dto = AdHoc(setup, true);
        async Task<PmsWorkflowResult> Create()
        {
            await using var db = fixture.CreateContext();
            return await Service(db).CreateAdHocAsync(dto, setup.Reviewer.Id, "PMS-WORKFLOW", "WEB");
        }
        var created = await Task.WhenAll(Create(), Create()); Assert.Equal(created[0].Id, created[1].Id);
        await using var check = fixture.CreateContext();
        Assert.Single(await check.MaintenanceTasks.Where(t => t.CreationCommandId == dto.CommandId).ToListAsync());
        Assert.Single(await check.TaskStatusHistories.Where(h => h.TaskId == created[0].Id).ToListAsync());
        dto.Name = "Changed content";
        Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => Service(check).CreateAdHocAsync(dto, setup.Reviewer.Id, "PMS-WORKFLOW", "WEB"))).Status);
    }

    [PmsPostgresFact]
    public async Task DeletedAdHocDraftKeepsCreationReceiptAndCannotBeRecreatedByRetry()
    {
        var setup = await Seed(); await using var db = fixture.CreateContext(); var workflow = Service(db);
        var dto = new CreatePmsAdHocOrderDto { CommandId = Guid.NewGuid(), Name = "Draft for deletion" };
        var draft = await workflow.CreateAdHocAsync(dto, setup.Reviewer.Id, "PMS-WORKFLOW", "WEB");
        await workflow.DeleteAdHocDraftAsync(draft.Id, draft.Version, setup.Reviewer.Id, "WEB");
        Assert.Equal(410, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.CreateAdHocAsync(dto, setup.Reviewer.Id, "PMS-WORKFLOW", "WEB"))).Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.StartAsync(draft.Id, new(draft.Version), setup.Worker.Id, "WEB"))).Status);
        var retained = await db.MaintenanceTasks.SingleAsync(t => t.Id == draft.Id);
        Assert.True(retained.IsDeleted); Assert.NotNull(retained.DeletedAt); Assert.Equal(dto.CommandId, retained.CreationCommandId);
        Assert.False(await db.PmsWorkOrderReports.AnyAsync(r => r.WorkOrderId == draft.Id));
    }

    [PmsPostgresFact]
    public async Task AdHocCreatePermissionDoesNotGrantAssignment_AndReadDoesNotNeedJobPermission()
    {
        var setup = await Seed(); await using var db = fixture.CreateContext();
        var rank = await db.CrewMembers.Where(c => c.CrewId == setup.Outsider.CrewId).Select(c => c.RankId).SingleAsync();
        var grants = await db.RankPermissionConfigs.SingleAsync(c => c.RankId == rank);
        grants.GrantsJson = "[\"pms.work.access\",\"pms.work.create\"]"; await db.SaveChangesAsync();
        var dto = AdHoc(setup, true); var workflow = Service(db);
        Assert.Equal(403, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.CreateAdHocAsync(dto, setup.Outsider.Id, "PMS-WORKFLOW", "WEB"))).Status);
        // A fresh request context has no pending tracked rows from the rejected write.
        await using var fresh = fixture.CreateContext();
        dto.CrewId = null;
        var unassigned = await Service(fresh).CreateAdHocAsync(dto, setup.Outsider.Id, "PMS-WORKFLOW", "WEB");
        Assert.Equal("UNASSIGNED", unassigned.Status);
        var detail = JsonSerializer.SerializeToElement(await new PmsWorkOrderReadService(fresh, Config()).DetailAsync(unassigned.Id));
        Assert.Equal("AD_HOC", detail.GetProperty("TaskType").GetString());
        Assert.Equal(dto.DueDate!.Value.ToString("yyyy-MM-dd"), detail.GetProperty("dueDate").GetString());
        Assert.True(await fresh.SyncQueue.AnyAsync(q => q.RecordKey == unassigned.Id.ToString() && q.TableName == "maintenance_task"));
    }

    [PmsPostgresFact]
    public async Task AdHocIssueRechecksCrewAndAsset_AndVesselDateRoundTripsWithoutTimestampGuessing()
    {
        var setup = await Seed(); await using var db = fixture.CreateContext();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["Pms:ReworkApiEnabled"] = "true", ["Pms:VesselTimeZone"] = "Asia/Ho_Chi_Minh" }).Build();
        var workflow = new PmsWorkOrderWorkflowService(db, new(db), config);
        var dto = AdHoc(setup); dto.DueDate = new(2026, 10, 26);
        var draft = await workflow.CreateAdHocAsync(dto, setup.Reviewer.Id, "PMS-WORKFLOW", "WEB");
        var task = await db.MaintenanceTasks.SingleAsync(t => t.Id == draft.Id);
        Assert.Equal(new DateTime(2026, 10, 25, 17, 0, 0, DateTimeKind.Utc), task.WorkOrderDueAt);
        var detail = JsonSerializer.SerializeToElement(await new PmsWorkOrderReadService(db, config).DetailAsync(draft.Id));
        Assert.Equal("2026-10-26", detail.GetProperty("dueDate").GetString());
        var crew = await db.CrewMembers.SingleAsync(c => c.CrewId == setup.Worker.CrewId);
        crew.IsOnboard = false; crew.OnboardStatus = "Offboard"; await db.SaveChangesAsync();
        Assert.Equal(400, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.IssueAdHocDraftAsync(draft.Id, new(draft.Version), setup.Reviewer.Id, "WEB"))).Status);
        crew.IsOnboard = true; await db.SaveChangesAsync();
        var asset = await db.EquipmentAssets.SingleAsync(a => a.Id == setup.AssetId); asset.Status = "DECOMMISSIONED"; await db.SaveChangesAsync();
        Assert.Equal(400, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.IssueAdHocDraftAsync(draft.Id, new(draft.Version), setup.Reviewer.Id, "WEB"))).Status);
        Assert.Equal("DRAFT", task.Status); Assert.Null(task.JobSnapshot);
    }

    [PmsPostgresFact]
    public async Task AdHocDeadlinesPersistAndDriveLiveReadAndCalendarFiltering()
    {
        var setup = await Seed();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["Pms:ReworkApiEnabled"] = "true", ["Pms:VesselTimeZone"] = "Asia/Ho_Chi_Minh" }).Build();
        var zone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Ho_Chi_Minh");
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, zone));
        foreach (var (days, expected) in new[] { (12, "NOT_DUE"), (7, "UPCOMING"), (0, "DUE"), (-1, "OVERDUE") })
        {
            await using var write = fixture.CreateContext();
            var dto = AdHoc(setup, true); dto.DueDate = today.AddDays(days);
            var created = await new PmsWorkOrderWorkflowService(write, new(write), config)
                .CreateAdHocAsync(dto, setup.Reviewer.Id, "PMS-WORKFLOW", "WEB");
            await using var read = fixture.CreateContext();
            var stored = await read.MaintenanceTasks.AsNoTracking().SingleAsync(t => t.Id == created.Id);
            var expectedUtc = TimeZoneInfo.ConvertTimeToUtc(dto.DueDate.Value.ToDateTime(TimeOnly.MinValue), zone);
            Assert.Equal(expectedUtc, stored.WorkOrderDueAt);
            Assert.Equal(expected, stored.DueState);
            var reader = new PmsWorkOrderReadService(read, config);
            var detail = JsonSerializer.SerializeToElement(await reader.DetailAsync(created.Id), new JsonSerializerOptions(JsonSerializerDefaults.Web));
            Assert.Equal(dto.DueDate.Value.ToString("yyyy-MM-dd"), detail.GetProperty("dueDate").GetString());
            Assert.Equal(expected, detail.GetProperty("workOrder").GetProperty("dueState").GetString());
            var calendar = await reader.ListAsync(new() { EquipmentAssetId = setup.AssetId, DueFrom = expectedUtc,
                DueTo = expectedUtc.AddDays(1).AddTicks(-1), Status = "ALL", ExcludeCancelled = true });
            Assert.Contains(calendar.Items, item => item.Id == created.Id && item.DueAt == expectedUtc);
        }
        // A future date must not hide an already reached equipment-counter deadline.
        await using var hoursDb = fixture.CreateContext();
        var counter = (await hoursDb.EquipmentAssets.SingleAsync(a => a.Id == setup.AssetId)).CurrentRunningHours ?? 0;
        var hybrid = AdHoc(setup, true); hybrid.DueDate = today.AddDays(12); hybrid.DueHours = counter;
        var hybridOrder = await new PmsWorkOrderWorkflowService(hoursDb, new(hoursDb), config)
            .CreateAdHocAsync(hybrid, setup.Reviewer.Id, "PMS-WORKFLOW", "WEB");
        var hybridDetail = JsonSerializer.SerializeToElement(await new PmsWorkOrderReadService(hoursDb, config).DetailAsync(hybridOrder.Id), new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal("DUE", hybridDetail.GetProperty("workOrder").GetProperty("dueState").GetString());
    }

    [Fact]
    public void AdHocDefinitionRejectsExecutionAndLegacyFormFields()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        foreach (var property in new[] { "materials", "actualDurationMinutes", "submittedBy", "jobId", "photos", "riskAssessment" })
            Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<CreatePmsAdHocOrderDto>("{\"" + property + "\":null}", options));
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<CreatePmsAdHocOrderDto>("{\"checklist\":[{\"sequenceOrder\":1,\"checkpointDescription\":\"Check\",\"completed\":true}]}", options));
    }
}
