using System.Text.Json;
using System.Data.Common;
using MaritimeEdge.Controllers.Maintenance;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Maintenance;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

public class PmsReworkApiTests
{
    [Theory]
    [InlineData("status")]
    [InlineData("lastExecutedAt")]
    [InlineData("nextDueDate")]
    [InlineData("requiredSpareParts")]
    [InlineData("equipmentGroupId")]
    [InlineData("completedBy")]
    public void JobPayloadRejectsExecutionAndMaterialAssignmentFields(string field) =>
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<SavePmsJobDto>(
            "{\"" + field + "\":null}", new JsonSerializerOptions(JsonSerializerDefaults.Web)));

    [Theory]
    [InlineData("baselineAt")]
    [InlineData("lastExecutedAt")]
    [InlineData("nextDueDate")]
    [InlineData("autoGenerate")]
    public void ImportCannotReintroduceExecutionBaselinesOrEnableAutomaticRelease(string field) =>
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<ImportPmsJobRow>(
            "{\"" + field + "\":null}", new JsonSerializerOptions(JsonSerializerDefaults.Web)));

    [Fact]
    public async Task NewEndpointsAreDisabledUntilExplicitlyEnabled_AndTranslateBusinessConflicts()
    {
        async Task<ActionExecutingContext> Run(bool enabled)
        {
            using var services = new ServiceCollection().AddSingleton<IConfiguration>(new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?> { ["Pms:ReworkApiEnabled"] = enabled.ToString() }).Build()).BuildServiceProvider();
            var action = new ActionContext(new DefaultHttpContext { RequestServices = services }, new RouteData(), new ActionDescriptor());
            var context = new ActionExecutingContext(action, [], new Dictionary<string, object?>(), new object());
            await new PmsReworkEndpointAttribute().OnActionExecutionAsync(context, () =>
                throw new PmsRequestException(409, "Stale version"));
            return context;
        }
        Assert.Equal(503, Assert.IsType<ObjectResult>((await Run(false)).Result).StatusCode);
        Assert.Equal(409, Assert.IsType<ObjectResult>((await Run(true)).Result).StatusCode);
    }

    [Fact]
    public async Task BusinessErrorsCapturedByMvcBecomeConflictsInsteadOfUnhandledServerErrors()
    {
        using var services = new ServiceCollection().AddSingleton<IConfiguration>(new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Pms:ReworkApiEnabled"] = "true" }).Build()).BuildServiceProvider();
        var action = new ActionContext(new DefaultHttpContext { RequestServices = services }, new RouteData(), new ActionDescriptor());
        var context = new ActionExecutingContext(action, [], new Dictionary<string, object?>(), new object());
        var executed = new ActionExecutedContext(action, [], new object()) { Exception = new PmsRequestException(409, "Stale Job") };
        await new PmsReworkEndpointAttribute().OnActionExecutionAsync(context, () => Task.FromResult(executed));
        Assert.True(executed.ExceptionHandled); Assert.Equal(409, Assert.IsType<ObjectResult>(executed.Result).StatusCode);
    }

    [Fact]
    public async Task JobReportCannotReadAnotherJobsHistoryOrMutableCurrentTask()
    {
        await using var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options)
        { SuppressSyncQueue = true };
        var a = new MaintenanceSchedule { ScheduleCode = "A", PmsProtocolVersion = 2 };
        var b = new MaintenanceSchedule { ScheduleCode = "B", PmsProtocolVersion = 2 };
        var task = new MaintenanceTask { TaskId = "WORKING", ScheduleId = a.Id, Status = "IN_PROGRESS", Notes = "Do not expose mutable results" };
        var history = new MaintenanceHistory { ScheduleId = b.Id, TaskId = task.Id, Notes = "Legacy result", ReportSnapshot = "{\"immutable\":true}" };
        db.AddRange(a, b, task, history); await db.SaveChangesAsync();
        var controller = new PmsJobsController(new(db), db, Mock.Of<IEdgeRuntimeConfigService>());
        Assert.IsType<NotFoundResult>(await controller.Report(a.Id, history.Id, default));
        var result = Assert.IsType<OkObjectResult>(await controller.Report(b.Id, history.Id, default));
        Assert.DoesNotContain("Do not expose mutable results", JsonSerializer.Serialize(result.Value));
        var report = JsonSerializer.SerializeToElement(result.Value);
        Assert.Equal("LEGACY_EXECUTED_AT", report.GetProperty("timeSource").GetString());
        Assert.False(report.TryGetProperty("submittedAt", out _));
        var page = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(await controller.History(a.Id)).Value);
        Assert.Equal(0, page.GetProperty("total").GetInt32());
    }
}

[Collection("PMS inventory")]
public class PmsReworkApiPostgresTests(PmsDatabaseFixture fixture)
{
    [PmsPostgresFact]
    public async Task CounterGridAndMaterialSelectorPageAtDatabase_ExposeOnlyNeededFields()
    {
        await using var db = fixture.CreateContext();
        var prefix = "UI-" + Guid.NewGuid().ToString("N")[..8];
        var first = new EquipmentAsset { AssetCode = prefix + "1", AssetName = prefix + "1", Category = "DECK", CurrentRunningHours = 100 };
        var second = new EquipmentAsset { AssetCode = prefix + "2", AssetName = prefix + "2", Category = "DECK", CurrentRunningHours = 200 };
        db.AddRange(first, second, new EquipmentAsset { AssetCode = prefix + "3", AssetName = prefix + "3", Category = "SYSTEM" },
            new EquipmentAsset { AssetCode = prefix + "4", AssetName = prefix + "4", Category = "DECK", IsActive = false });
        var category = new MaterialCategory { CategoryCode = prefix, Name = prefix }; db.Add(category); await db.SaveChangesAsync();
        var part = new MaterialItem { ItemCode = prefix, Name = prefix, Unit = "PCS", CategoryId = category.Id, OnHandQuantity = 99 };
        var location = new StoreLocation { LocationCode = prefix, Name = prefix }; db.AddRange(part, location);
        db.InventoryStocks.Add(new() { MaterialItemId = part.Id, StoreLocationId = location.Id, Quantity = 5 }); await db.SaveChangesAsync();
        var counters = new PmsCountersController(db);
        var counterPage = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(await counters.List(new() { Name = prefix, Page = 2, PageSize = 1 }, default)).Value);
        Assert.Equal(2, counterPage.GetProperty("total").GetInt32());
        Assert.Equal(second.Id, Assert.Single(counterPage.GetProperty("items").EnumerateArray()).GetProperty("Id").GetGuid());
        Assert.DoesNotContain("TechnicalSpecs", counterPage.ToString());
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Pms:VesselTimeZone"] = "Asia/Ho_Chi_Minh" }).Build();
        var controller = new PmsWorkOrdersController(new(db, config), new(db, new(db), config), db, Mock.Of<IEdgeRuntimeConfigService>(), config);
        var options = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(await controller.MaterialOptions(new() { SelectedIds = part.Id.ToString(), PageSize = 200 }, default)).Value);
        var item = Assert.Single(options.GetProperty("items").EnumerateArray());
        Assert.Equal("PCS", item.GetProperty("Unit").GetString()); Assert.Equal(5m, item.GetProperty("onHand").GetDecimal());
        Assert.DoesNotContain("UnitPrice", options.ToString());
        Assert.Equal(400, (await Assert.ThrowsAsync<PmsRequestException>(() => controller.MaterialOptions(new() { SelectedIds = "invalid" }, default))).Status);
        var settings = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(controller.Settings()).Value);
        Assert.Equal("Asia/Ho_Chi_Minh", settings.GetProperty("vesselTimeZone").GetString());
    }
    [PmsPostgresFact]
    public async Task WarningDaysUseVesselCalendarEvenAcrossDaylightSavingChanges()
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        var today = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, zone).Date;
        var offset = zone.GetUtcOffset(today);
        var warningDays = Enumerable.Range(1, 365).First(d => zone.GetUtcOffset(today.AddDays(d)) != offset) + 5;
        var lastWarningDay = today.AddDays(warningDays);
        var due = TimeZoneInfo.ConvertTimeToUtc(lastWarningDay.AddDays(1).AddMinutes(-15), zone);
        var outside = TimeZoneInfo.ConvertTimeToUtc(lastWarningDay.AddDays(1).AddMinutes(30), zone);
        var asset = await Asset();
        await using var db = fixture.CreateContext();
        var first = new MaintenanceTask { TaskId = Guid.NewGuid().ToString("N"), PmsProtocolVersion = 2, Status = "ASSIGNED",
            EquipmentAssetId = asset.Id, WorkOrderDueAt = due, NextDueAt = due, WorkOrderWarningDays = warningDays };
        var second = new MaintenanceTask { TaskId = Guid.NewGuid().ToString("N"), PmsProtocolVersion = 2, Status = "ASSIGNED",
            EquipmentAssetId = asset.Id, WorkOrderDueAt = outside, NextDueAt = outside, WorkOrderWarningDays = warningDays };
        db.AddRange(first, second); await db.SaveChangesAsync();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Pms:VesselTimeZone"] = "America/New_York" }).Build();
        var service = new PmsWorkOrderReadService(db, config);
        var upcoming = await service.ListAsync(new() { EquipmentAssetId = asset.Id, DueState = "UPCOMING" });
        Assert.Equal(first.Id, Assert.Single(upcoming.Items).Id);
        var notDue = await service.ListAsync(new() { EquipmentAssetId = asset.Id, DueState = "NOT_DUE" });
        Assert.Equal(second.Id, Assert.Single(notDue.Items).Id);
    }
    private sealed class ConcurrentUpdateInterceptor(Func<Task> update) : DbCommandInterceptor
    {
        private int triggered;
        public override async ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand command, CommandExecutedEventData eventData,
            DbDataReader result, CancellationToken cancellationToken = default)
        {
            if (command.CommandText.Contains("maintenance_tasks") && Interlocked.Exchange(ref triggered, 1) == 0)
                await update();
            return result;
        }
    }

    [PmsPostgresFact]
    public async Task WorkOrderDetailNeverMixesMetadataAndResultsFromDifferentConcurrentVersions()
    {
        await using var seed = fixture.CreateContext();
        var task = new MaintenanceTask { TaskId = Guid.NewGuid().ToString("N"), PmsProtocolVersion = 2, Status = "IN_PROGRESS",
            TaskDescription = "Original description", Notes = "Original result", ReportRevision = 1 };
        seed.MaintenanceTasks.Add(task); await seed.SaveChangesAsync();
        var interceptor = new ConcurrentUpdateInterceptor(async () =>
        {
            await using var writer = fixture.CreateContext();
            var changed = await writer.MaintenanceTasks.SingleAsync(t => t.Id == task.Id);
            changed.TaskDescription = "Concurrent description"; changed.Notes = "Concurrent result"; changed.ReportRevision = 2;
            await writer.SaveChangesAsync();
        });
        await using var reader = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>()
            .UseNpgsql(seed.Database.GetConnectionString()).AddInterceptors(interceptor).Options);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Pms:VesselTimeZone"] = "UTC" }).Build();
        var result = JsonSerializer.SerializeToElement(await new PmsWorkOrderReadService(reader, configuration).DetailAsync(task.Id));
        Assert.Equal("Original result", result.GetProperty("Notes").GetString());
        Assert.Equal("Original description", result.GetProperty("workOrder").GetProperty("Name").GetString());
        Assert.Equal(1, result.GetProperty("workOrder").GetProperty("ReportRevision").GetInt32());
        await seed.Entry(task).ReloadAsync(); Assert.Equal(2, task.ReportRevision);
    }
    [PmsPostgresFact]
    public async Task ImportPreviewIsReadOnly_ImportIsAtomicAndDoesNotBypassSoftDeletion()
    {
        var asset = await Asset();
        await using var db = fixture.CreateContext(); var service = new PmsJobService(db);
        var code = Guid.NewGuid().ToString("N");
        var request = new ImportPmsJobsDto { ValidateOnly = true, Rows = [new()
        { RowNumber = 2, AssetCode = asset.AssetCode, Code = code, Name = "Imported job", IntervalMonths = 3 }] };
        var before = await db.MaintenanceSchedules.CountAsync(); var queueBefore = await db.SyncQueue.CountAsync();
        var preview = await service.ImportAsync(request, 1, "NODE"); Assert.True(preview.Valid); Assert.Equal(0, preview.Imported);
        Assert.Equal(before, await db.MaintenanceSchedules.CountAsync()); Assert.Equal(queueBefore, await db.SyncQueue.CountAsync());
        request.ValidateOnly = false;
        request.Rows.Add(new() { RowNumber = 3, AssetCode = "NO-SUCH-ASSET", Code = code + "-bad", Name = "Invalid job", IntervalMonths = 3 });
        var invalid = await service.ImportAsync(request, 1, "NODE"); Assert.False(invalid.Valid); Assert.Equal(0, invalid.Imported);
        Assert.Equal(before, await db.MaintenanceSchedules.CountAsync());
        request.Rows.RemoveAt(1);
        var imported = await service.ImportAsync(request, 1, "NODE"); Assert.True(imported.Valid); Assert.Equal(1, imported.Imported);
        var job = await db.MaintenanceSchedules.SingleAsync(j => j.ScheduleCode == code);
        Assert.Equal(PmsJobRules.NeedsInformation, job.JobState); Assert.False(job.AutoGenerate);
        Assert.Null(job.LastExecutedAt); Assert.Null(job.NextDueDate);
        Assert.False(await db.MaintenanceTasks.AnyAsync(t => t.ScheduleId == job.Id));
        await service.DeleteAsync(job.Id, job.JobVersion!.Value, 1);
        Assert.Empty((await service.ListAsync(new() { EquipmentAssetId = asset.Id })).Items);
        Assert.Single((await service.ListAsync(new() { EquipmentAssetId = asset.Id, State = PmsJobRules.Removed })).Items);
        var duplicate = await service.ImportAsync(request, 1, "NODE"); Assert.False(duplicate.Valid); Assert.Equal(0, duplicate.Imported);
        await service.ChangeStateAsync(job.Id, new(job.JobVersion!.Value, PmsJobRules.Active, "Restore removed definition"), 1);
        Assert.Equal(PmsJobRules.NeedsInformation, job.JobState); Assert.False(job.AutoGenerate);
        Assert.Single((await service.ListAsync(new() { EquipmentAssetId = asset.Id })).Items);
    }
    private static SavePmsJobDto Definition(Guid asset, string? name = null) => new()
    {
        Code = Guid.NewGuid().ToString("N"), Name = name ?? "Pump maintenance", EquipmentAssetId = asset,
        IntervalMonths = 3, BaselineAt = DateTime.UtcNow.Date, Checklist = [new() { SequenceOrder = 1, CheckpointDescription = "Inspect pressure" }]
    };

    private async Task<EquipmentAsset> Asset()
    {
        await using var db = fixture.CreateContext();
        var asset = new EquipmentAsset { AssetCode = Guid.NewGuid().ToString("N"), AssetName = "Fire pump", Category = "DECK", CurrentRunningHours = 900 };
        db.EquipmentAssets.Add(asset); await db.SaveChangesAsync(); return asset;
    }

    [PmsPostgresFact]
    public async Task JobCrudUsesExplicitBaselineAndVersion_WithServerFilteringAndNoMaterialWrites()
    {
        var asset = await Asset();
        await using var db = fixture.CreateContext(); var service = new PmsJobService(db);
        var dto = Definition(asset.Id); dto.BaselineAt = null;
        var id = await service.SaveAsync(null, dto, 1, "TEST-NODE");
        var job = await db.MaintenanceSchedules.SingleAsync(j => j.Id == id);
        Assert.Equal(PmsJobRules.NeedsInformation, job.JobState); Assert.Null(job.LastExecutedAt);
        dto.ExpectedVersion = job.JobVersion; dto.BaselineAt = DateTime.UtcNow.Date;
        await service.SaveAsync(id, dto, 1, "");
        Assert.Equal(PmsJobRules.Active, job.JobState); Assert.False(job.AutoGenerate);
        Assert.Equal(dto.BaselineAt.Value.AddMonths(3), job.NextDueDate);
        Assert.False(await db.MaintenanceTasks.AnyAsync(t => t.ScheduleId == id));
        Assert.False(await db.ScheduleSpareParts.AnyAsync(p => p.ScheduleId == id));
        var stale = await Assert.ThrowsAsync<PmsRequestException>(() => service.SaveAsync(id, dto, 1, "")); Assert.Equal(409, stale.Status);
        var page = await service.ListAsync(new() { EquipmentAssetId = asset.Id, Name = dto.Code[..8], PageSize = 1 });
        Assert.Equal(1, page.Total); Assert.Equal(id, Assert.Single(page.Items).Id);
        var detail = JsonSerializer.SerializeToElement(await service.DetailAsync(id));
        Assert.Equal(1, detail.GetProperty("checklist").GetArrayLength());
        Assert.Empty(detail.GetProperty("equipmentMaterials").EnumerateArray());
        await service.ChangeStateAsync(id, new(job.JobVersion!.Value, PmsJobRules.Paused, "Pause"), 1);
        dto.ExpectedVersion = job.JobVersion; await service.SaveAsync(id, dto, 1, "");
        Assert.Equal(PmsJobRules.Paused, job.JobState); Assert.False(job.IsActive);
        var duplicate = Definition(asset.Id); duplicate.Code = dto.Code.ToUpperInvariant();
        Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => service.SaveAsync(null, duplicate, 1, "NODE"))).Status);
    }

    [PmsPostgresFact]
    public async Task ExistingOrderPreventsDeleteAndChangingEquipment_AndKeepsReleasedChecklist()
    {
        var asset = await Asset(); var other = await Asset();
        await using var db = fixture.CreateContext(); var service = new PmsJobService(db);
        var dto = Definition(asset.Id); dto.BaselineAt = DateTime.UtcNow.Date.AddMonths(-3);
        var id = await service.SaveAsync(null, dto, 1, "NODE");
        var order = (await new PmsWorkOrderReleaseService(db).ReleasePeriodicAsync(id, DateTime.UtcNow, TimeZoneInfo.Utc, false))!;
        var job = await db.MaintenanceSchedules.SingleAsync(j => j.Id == id);
        Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => service.DeleteAsync(id, job.JobVersion!.Value, 1))).Status);
        dto.ExpectedVersion = job.JobVersion; dto.EquipmentAssetId = other.Id;
        Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => service.SaveAsync(id, dto, 1, ""))).Status);
        dto.EquipmentAssetId = asset.Id; dto.Checklist[0].CheckpointDescription = "New instruction";
        await service.SaveAsync(id, dto, 1, "");
        Assert.Equal("Inspect pressure", (await db.TaskChecklistItems.SingleAsync(c => c.TaskId == order.TaskId)).CheckpointDescription);
        Assert.DoesNotContain("New instruction", order.JobSnapshot!);
        Assert.True(await db.SystemLogs.AnyAsync(l => l.Action == "PMS_JOB_UPDATED" && l.EntityId == id.ToString()));
    }

    [PmsPostgresFact]
    public async Task WorkOrderFiltersComputeLiveDeadlinesOnServer_AndNeverUseLegacyEstimatedDates()
    {
        var asset = await Asset();
        await using var db = fixture.CreateContext();
        var code = Guid.NewGuid().ToString("N");
        var rh = new MaintenanceTask { TaskId = code, PmsProtocolVersion = 2, Status = "IN_PROGRESS", EquipmentAssetId = asset.Id,
            EquipmentAssetName = "Fire pump", WorkOrderDueHours = 920, WorkOrderWarningHours = 50,
            NextDueAt = DateTime.UtcNow.AddYears(-5), TaskDescription = "Hourly task" };
        var overdue = new MaintenanceTask { TaskId = code + "-2", PmsProtocolVersion = 2, Status = "PENDING_APPROVAL", EquipmentAssetId = asset.Id,
            WorkOrderDueAt = DateTime.UtcNow.AddDays(-2), TaskDescription = "Calendar task" };
        var legacy = new MaintenanceTask { TaskId = code + "-legacy", Status = "IN_PROGRESS", EquipmentAssetId = asset.Id };
        db.AddRange(rh, overdue, legacy); await db.SaveChangesAsync();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Pms:VesselTimeZone"] = "UTC" }).Build();
        var service = new PmsWorkOrderReadService(db, config);
        var upcoming = await service.ListAsync(new() { EquipmentAssetId = asset.Id, DueState = "UPCOMING", PageSize = 1 });
        Assert.Equal(1, upcoming.Total); Assert.Equal(rh.Id, Assert.Single(upcoming.Items).Id); Assert.Null(upcoming.Items[0].DueAt);
        var late = await service.ListAsync(new() { EquipmentAssetId = asset.Id, DueState = "OVERDUE" });
        Assert.Equal(overdue.Id, Assert.Single(late.Items).Id); Assert.Equal("PENDING_APPROVAL", late.Items[0].Status);
        var trackedAsset = await db.EquipmentAssets.SingleAsync(a => a.Id == asset.Id); trackedAsset.CurrentRunningHours = 921; await db.SaveChangesAsync();
        late = await service.ListAsync(new() { EquipmentAssetId = asset.Id, DueState = "OVERDUE" }); Assert.Equal(2, late.Total);
        var all = await service.ListAsync(new() { EquipmentAssetId = asset.Id }); Assert.Equal(2, all.Total);
        Assert.DoesNotContain(all.Items, i => i.Id == legacy.Id);
        Assert.NotNull(await service.DetailAsync(rh.Id));
    }
}
