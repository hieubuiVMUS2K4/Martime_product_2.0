using MaritimeEdge.Controllers.Inventory;
using MaritimeEdge.Controllers.Maintenance;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Repositories;
using MaritimeEdge.Services.Maintenance;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

[Collection("PMS inventory")]
public class PmsOwnershipTests(PmsDatabaseFixture database)
{
    private static string Code() => Guid.NewGuid().ToString("N");

    private static EquipmentAssetController Assets(MaritimeEdge.Data.EdgeDbContext context)
    {
        var assets = new EquipmentAssetRepository(context);
        var schedules = new MaintenanceScheduleRepository(context);
        return new(assets, context, NullLogger<EquipmentAssetController>.Instance,
            new MaintenanceCompletionService(context, schedules, assets, NullLogger<MaintenanceCompletionService>.Instance));
    }

    [Fact]
    public async Task EquipmentTree_LargeFleet_PreservesHierarchyAndPicWithoutTracking()
    {
        await using var context = database.CreateContext();
        var prefix = Code();
        var crew = new Maritime.Shared.Models.Crew.CrewMember { CrewId = Code(), FullName = "Tree PIC", IsOnboard = true };
        var group = new EquipmentGroup { GroupCode = Code(), GroupName = "Engine", PicCrewId = crew.CrewId };
        var folder = new EquipmentAsset { AssetCode = prefix + "-ROOT", AssetName = "Engine", Category = "SYSTEM", EquipmentGroupId = group.Id };
        var devices = Enumerable.Range(0, 750).Select(i => new EquipmentAsset
        {
            AssetCode = prefix + "-" + i.ToString("D3"), AssetName = "Device " + i,
            Category = "ENGINE", ParentId = folder.Id, EquipmentGroupId = group.Id,
            CurrentRunningHours = i, Manufacturer = "Maker", TechnicalSpecs = "Specs"
        }).ToList();
        var standalone = new EquipmentAsset { AssetCode = prefix + "-SOLO", AssetName = "Standalone", Category = "ENGINE" };
        var inactive = new EquipmentAsset { AssetCode = prefix + "-OFF", AssetName = "Inactive", Category = "ENGINE", IsActive = false };
        context.CrewMembers.Add(crew);
        context.EquipmentGroups.Add(group);
        context.EquipmentAssets.AddRange(devices);
        context.EquipmentAssets.AddRange(folder, standalone, inactive);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var result = Assert.IsType<OkObjectResult>((await Assets(context).GetTree()).Result);
        var rows = Assert.IsType<List<EquipmentAssetDto>>(result.Value);
        var imported = rows.Where(a => a.AssetCode.StartsWith(prefix)).ToList();
        Assert.Equal(752, imported.Count);
        Assert.DoesNotContain(imported, a => a.Id == inactive.Id);
        foreach (var device in devices)
        {
            var row = Assert.Single(imported, a => a.Id == device.Id);
            Assert.Equal(folder.Id, row.ParentId);
            Assert.Equal(crew.CrewId, row.PicCrewId);
            Assert.Equal(crew.FullName, row.PicCrewName);
            Assert.Equal(device.CurrentRunningHours, row.CurrentRunningHours);
            Assert.Equal(device.TechnicalSpecs, row.TechnicalSpecs);
        }
        Assert.Null(Assert.Single(imported, a => a.Id == standalone.Id).PicCrewName);
        Assert.Empty(context.ChangeTracker.Entries());
    }

    [Fact]
    public async Task GroupPic_RequiresOnboardCrew_AndIsReturnedAfterReload()
    {
        await using var context = database.CreateContext();
        var controller = Assets(context);
        var dto = new CreateEquipmentAssetDto { AssetCode = Code(), AssetName = "Group", Category = "SYSTEM" };
        Assert.IsType<BadRequestObjectResult>((await controller.Create(dto)).Result);
        dto.PicCrewId = Code();
        Assert.IsType<BadRequestObjectResult>((await controller.Create(dto)).Result);
        var crew = new Maritime.Shared.Models.Crew.CrewMember { CrewId = dto.PicCrewId, FullName = "PIC", IsOnboard = true };
        context.CrewMembers.Add(crew);
        await context.SaveChangesAsync();
        var result = Assert.IsType<CreatedAtActionResult>((await controller.Create(dto)).Result);
        var folder = Assert.IsType<EquipmentAssetDto>(result.Value);
        Assert.Equal(crew.CrewId, folder.PicCrewId);
        Assert.NotNull(folder.EquipmentGroupId);
        var group = await context.EquipmentGroups.FindAsync(folder.EquipmentGroupId);
        Assert.Equal(crew.CrewId, group!.PicCrewId);
        var childResult = Assert.IsType<CreatedAtActionResult>((await controller.Create(new()
        {
            AssetCode = Code(), AssetName = "Device", Category = "UNCLASSIFIED", ParentId = folder.Id
        })).Result);
        Assert.Equal(folder.EquipmentGroupId, Assert.IsType<EquipmentAssetDto>(childResult.Value).EquipmentGroupId);
        context.ChangeTracker.Clear();
        var loaded = Assert.IsType<OkObjectResult>((await controller.GetById(folder.Id!.Value)).Result);
        Assert.Equal(crew.CrewId, Assert.IsType<EquipmentAssetDto>(loaded.Value).PicCrewId);
    }

    [Fact]
    public async Task LegacyFolder_PicEdit_ReusesExistingTables_AndLinksDescendantEquipment()
    {
        await using var context = database.CreateContext();
        var crew = new Maritime.Shared.Models.Crew.CrewMember { CrewId = Code(), FullName = "PIC", IsOnboard = true };
        var folder = new EquipmentAsset { AssetCode = Code(), AssetName = "Folder", Category = "SYSTEM" };
        var child = new EquipmentAsset { AssetCode = Code(), AssetName = "Device", Category = "ENGINE", ParentId = folder.Id };
        context.CrewMembers.Add(crew);
        context.EquipmentAssets.AddRange(folder, child);
        await context.SaveChangesAsync();
        Assert.IsType<OkObjectResult>((await Assets(context).Update(folder.Id, new()
        {
            AssetName = "Renamed group", PicCrewId = crew.CrewId
        })).Result);
        Assert.NotNull(folder.EquipmentGroupId);
        Assert.Equal(folder.EquipmentGroupId, child.EquipmentGroupId);
        Assert.Equal(crew.CrewId, (await context.EquipmentGroups.FindAsync(folder.EquipmentGroupId))!.PicCrewId);
    }

    [Fact]
    public async Task DeleteGroup_RejectsActiveChildren_AndSoftDeletesEmptyGroup()
    {
        await using var context = database.CreateContext();
        var folder = new EquipmentAsset { AssetCode = Code(), AssetName = "Folder", Category = "SYSTEM" };
        var child = new EquipmentAsset { AssetCode = Code(), AssetName = "Device", Category = "ENGINE", ParentId = folder.Id };
        context.EquipmentAssets.AddRange(folder, child);
        await context.SaveChangesAsync();
        var controller = Assets(context);

        Assert.IsType<ConflictObjectResult>(await controller.Delete(folder.Id));
        context.ChangeTracker.Clear();
        Assert.True((await context.EquipmentAssets.FindAsync(folder.Id))!.IsActive);
        Assert.True((await context.EquipmentAssets.FindAsync(child.Id))!.IsActive);
        Assert.IsType<NoContentResult>(await controller.Delete(child.Id));
        Assert.IsType<NoContentResult>(await controller.Delete(folder.Id));
        context.ChangeTracker.Clear();
        Assert.False((await context.EquipmentAssets.FindAsync(folder.Id))!.IsActive);
        Assert.DoesNotContain(await new EquipmentAssetRepository(context).GetAllAsync(), a => a.Id == folder.Id);
    }

    [Fact]
    public async Task Configuration_RejectsFolderAndGroupTargets_OnCreateAndUpdate()
    {
        await using var context = database.CreateContext();
        var folder = new EquipmentAsset { AssetCode = Code(), AssetName = "Folder", Category = "SYSTEM" };
        var device = new EquipmentAsset { AssetCode = Code(), AssetName = "Device", Category = "ENGINE" };
        var schedule = new MaintenanceSchedule { ScheduleCode = Code(), ScheduleName = "Existing", EquipmentAssetId = device.Id, IntervalType = "CALENDAR" };
        context.EquipmentAssets.AddRange(folder, device);
        context.MaintenanceSchedules.Add(schedule);
        await context.SaveChangesAsync();
        var controller = new WorkItemConfigController(new MaintenanceScheduleRepository(context),
            new EquipmentAssetRepository(context), context, NullLogger<WorkItemConfigController>.Instance);
        var dto = new CreateMaintenanceScheduleDto { ScheduleCode = Code(), ScheduleName = "Invalid", EquipmentAssetId = folder.Id };
        Assert.IsType<BadRequestObjectResult>((await controller.Create(dto)).Result);
        Assert.IsType<BadRequestObjectResult>((await controller.Update(schedule.Id, dto)).Result);
        dto.EquipmentAssetId = null;
        dto.EquipmentGroupId = Guid.NewGuid();
        Assert.IsType<BadRequestObjectResult>((await controller.Create(dto)).Result);
        Assert.IsType<BadRequestObjectResult>((await controller.Update(schedule.Id, dto)).Result);
        Assert.Equal(device.Id, schedule.EquipmentAssetId);
    }

    [Fact]
    public async Task ImportMaintenance_ValidatesWholeFile_PreservesCalendarUnits_AndRejectsReimport()
    {
        await using var context = database.CreateContext();
        var asset = new EquipmentAsset { AssetCode = Code(), AssetName = "Device", Category = "ENGINE" };
        context.EquipmentAssets.Add(asset);
        await context.SaveChangesAsync();
        var controller = new WorkItemConfigController(new MaintenanceScheduleRepository(context),
            new EquipmentAssetRepository(context), context, NullLogger<WorkItemConfigController>.Instance);
        var start = new DateTime(2024, 1, 31, 0, 0, 0, DateTimeKind.Utc);
        var rows = new List<ImportMaintenanceRow> {
            new() { RowNumber = 2, ScheduleCode = Code(), WorkCode = "M001", AssetCode = asset.AssetCode, ScheduleName = "Monthly", IntervalMonths = 1, LastExecutedAt = start },
            new() { RowNumber = 3, ScheduleCode = Code(), WorkCode = "Y001", AssetCode = asset.AssetCode, ScheduleName = "Yearly", IntervalYears = 1, LastExecutedAt = start },
            new() { RowNumber = 4, ScheduleCode = Code(), AssetCode = asset.AssetCode, ScheduleName = "Hours", IntervalType = "RUNNING_HOURS", IntervalHours = 500, LastExecutedRunningHours = 1000 },
            new() { RowNumber = 5, ScheduleCode = Code(), AssetCode = asset.AssetCode, ScheduleName = "Docking", MaintenanceCategory = "DRY_DOCK" },
        };
        var request = new ImportMaintenanceRequest { Rows = rows, ValidateOnly = true };
        Assert.IsType<OkObjectResult>(await controller.Import(request));
        Assert.False(await context.MaintenanceSchedules.AnyAsync(s => s.ScheduleCode == rows[0].ScheduleCode));
        request.ValidateOnly = false;
        var bad = new ImportMaintenanceRow { RowNumber = 6, ScheduleCode = Code(), AssetCode = "missing", ScheduleName = "Bad", IntervalDays = 30 };
        rows.Add(bad);
        Assert.IsType<BadRequestObjectResult>(await controller.Import(request));
        Assert.False(await context.MaintenanceSchedules.AnyAsync(s => s.ScheduleCode == rows[0].ScheduleCode));
        rows.Remove(bad);
        rows.Add(rows[0]);
        Assert.IsType<BadRequestObjectResult>(await controller.Import(request));
        rows.RemoveAt(rows.Count - 1);
        Assert.IsType<OkObjectResult>(await controller.Import(request));
        context.ChangeTracker.Clear();
        var codes = rows.Select(r => r.ScheduleCode).ToList();
        var saved = await context.MaintenanceSchedules.Where(s => codes.Contains(s.ScheduleCode)).ToListAsync();
        Assert.Equal(4, saved.Count);
        Assert.All(saved, s => Assert.False(s.AutoGenerate));
        var month = saved.Single(s => s.ScheduleCode == rows[0].ScheduleCode);
        Assert.Equal("M001", month.WorkCode); Assert.Equal(1, month.IntervalMonths); Assert.Null(month.IntervalDays);
        Assert.Equal(new DateTime(2024, 2, 29, 0, 0, 0, DateTimeKind.Utc), month.NextDueDate);
        Assert.Equal(start.AddYears(1), saved.Single(s => s.ScheduleCode == rows[1].ScheduleCode).NextDueDate);
        Assert.Equal(1500d, saved.Single(s => s.ScheduleCode == rows[2].ScheduleCode).NextDueRunningHours);
        Assert.Null(saved.Single(s => s.ScheduleCode == rows[3].ScheduleCode).NextDueDate);
        Assert.False(await context.MaintenanceTasks.AnyAsync(t => t.ScheduleId.HasValue && saved.Select(s => s.Id).Contains(t.ScheduleId.Value)));
        var hourly = saved.Single(s => s.ScheduleCode == rows[2].ScheduleCode);
        Assert.IsType<OkObjectResult>((await controller.Update(hourly.Id, new() {
            ScheduleCode = hourly.ScheduleCode, ScheduleName = hourly.ScheduleName, EquipmentAssetId = asset.Id,
            IntervalType = "CALENDAR", IntervalMonths = 2, AutoGenerate = false,
        })).Result);
        context.ChangeTracker.Clear();
        hourly = (await context.MaintenanceSchedules.FindAsync(hourly.Id))!;
        Assert.Equal(2, hourly.IntervalMonths); Assert.Null(hourly.IntervalHours); Assert.Null(hourly.NextDueRunningHours);
        Assert.IsType<BadRequestObjectResult>(await controller.Import(request));
        Assert.Equal(4, await context.MaintenanceSchedules.CountAsync(s => codes.Contains(s.ScheduleCode)));
    }

    [Fact]
    public void CalendarIntervals_PreserveMonthEndsAndLeapYears_WhenAdvancingPastDueDates()
    {
        var start = new DateTime(2024, 1, 31, 0, 0, 0, DateTimeKind.Utc);
        var monthly = new MaintenanceSchedule { IntervalMonths = 1 };
        Assert.Equal(start.AddMonths(1), MaritimeEdge.Constants.MaintenanceCalendar.AddInterval(monthly, start));
        Assert.Equal(start.AddMonths(2), MaritimeEdge.Constants.MaintenanceCalendar.AdvanceTo(monthly, start, start.AddMonths(1).AddDays(1), out var count));
        Assert.Equal(2, count);
        var yearly = new MaintenanceSchedule { IntervalYears = 1 };
        var leap = new DateTime(2024, 2, 29, 0, 0, 0, DateTimeKind.Utc);
        Assert.Equal(leap.AddYears(1), MaritimeEdge.Constants.MaintenanceCalendar.AddInterval(yearly, leap));
    }

    [Theory]
    [InlineData("SYSTEM", 30, null, null)]
    [InlineData("ENGINE", 30, 1, null)]
    [InlineData("ENGINE", null, null, null)]
    [InlineData("ENGINE", -1, null, null)]
    [InlineData("ENGINE", int.MaxValue, null, null)]
    public async Task ImportMaintenance_RejectsFoldersAndInvalidIntervals(string category, int? days, int? months, int? years)
    {
        await using var context = database.CreateContext();
        var asset = new EquipmentAsset { AssetCode = Code(), AssetName = "Target", Category = category };
        context.EquipmentAssets.Add(asset); await context.SaveChangesAsync();
        var controller = new WorkItemConfigController(new MaintenanceScheduleRepository(context), new EquipmentAssetRepository(context), context, NullLogger<WorkItemConfigController>.Instance);
        var row = new ImportMaintenanceRow { RowNumber = 2, ScheduleCode = Code(), AssetCode = asset.AssetCode, ScheduleName = "Invalid", IntervalDays = days, IntervalMonths = months, IntervalYears = years };
        Assert.IsType<BadRequestObjectResult>(await controller.Import(new() { Rows = new() { row } }));
        Assert.False(await context.MaintenanceSchedules.AnyAsync(s => s.ScheduleCode == row.ScheduleCode));
    }

    [PmsPostgresFact]
    public async Task ShoreCrewWithReferences_IsSavedAndAppearsInPendingReview()
    {
        await using var context = database.CreateContext();
        var rank = new Maritime.Shared.Models.Crew.Rank { Id = Random.Shared.Next(1000000, 2000000), RankCode = Code()[..8], RankName = "Captain" };
        var country = new Maritime.Shared.Models.Crew.Country { Id = Random.Shared.Next(1000000, 2000000), CountryCode = Code()[..3], CountryName = "Test" };
        var crew = new Maritime.Shared.Models.Crew.CrewMember { CrewId = Code(), FullName = "Pending crew", RankId = rank.Id, CountryId = country.Id,
            OnboardStatus = "PendingReview", IsOnboard = false };
        var handler = new MaritimeEdge.Services.Core.SyncConflictHandler(NullLogger<MaritimeEdge.Services.Core.SyncConflictHandler>.Instance);
        async Task Receive(string table, string key, object payload, string action) {
            await handler.HandleIncomingAsync(context, new Maritime.Shared.DTOs.Sync.SyncQueueItemDto {
                TableName = table, RecordKey = key, Payload = System.Text.Json.JsonSerializer.Serialize(payload),
                ActionType = action, OriginNode = "SHORE", SyncVersion = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            }, default);
            await context.SaveChangesAsync(); context.ChangeTracker.Clear();
        }
        await Receive("country", country.Id.ToString(), country, "SNAPSHOT");
        await Receive("rank", rank.Id.ToString(), rank, "SNAPSHOT");
        await Receive("crew_member", crew.Id.ToString(), crew, "UPDATE");
        var saved = await context.CrewMembers.SingleAsync(c => c.Id == crew.Id);
        Assert.Equal("PendingReview", saved.OnboardStatus); Assert.False(saved.IsOnboard);
        var controller = new MaritimeEdge.Controllers.Crew.CrewController(context,
            NullLogger<MaritimeEdge.Controllers.Crew.CrewController>.Instance, Moq.Mock.Of<AutoMapper.IMapper>());
        var response = Assert.IsType<OkObjectResult>(await controller.GetPendingCrew());
        var items = System.Text.Json.JsonSerializer.SerializeToElement(response.Value);
        Assert.Contains(items.EnumerateArray(), item => item.GetProperty("Id").GetGuid() == crew.Id);
    }

    private sealed class CaptureLogger : Microsoft.Extensions.Logging.ILogger<WorkItemConfigController>
    {
        public Exception? Error { get; private set; }
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel level) => true;
        public void Log<TState>(Microsoft.Extensions.Logging.LogLevel level, Microsoft.Extensions.Logging.EventId id, TState state, Exception? exception, Func<TState, Exception?, string> formatter) { if (exception != null) Error = exception; }
    }

    [Theory]
    [InlineData("DRY_DOCK")]
    [InlineData("ON_DEMAND")]
    [InlineData("VOYAGE")]
    public async Task EventMaintenance_DoesNotRequireIntervals_OrAutomaticallyCreateTasks(string category)
    {
        await using var context = database.CreateContext();
        var device = new EquipmentAsset { AssetCode = Code(), AssetName = "Event device", Category = "ENGINE" };
        context.EquipmentAssets.Add(device); await context.SaveChangesAsync();
        var schedules = new MaintenanceScheduleRepository(context);
        var logger = new CaptureLogger();
        var controller = new WorkItemConfigController(schedules, new EquipmentAssetRepository(context), context, logger);
        var dto = new CreateMaintenanceScheduleDto { ScheduleCode = Code(), ScheduleName = "Event work", EquipmentAssetId = device.Id,
            MaintenanceCategory = category, AutoGenerate = true, IntervalType = "RUNNING_HOURS" };
        Assert.IsType<CreatedAtActionResult>((await controller.Create(dto)).Result);
        var schedule = await context.MaintenanceSchedules.SingleAsync(x => x.ScheduleCode == dto.ScheduleCode);
        Assert.Equal(category, schedule.MaintenanceCategory);
        Assert.False(schedule.AutoGenerate); Assert.Null(schedule.IntervalHours); Assert.Null(schedule.IntervalDays);
        Assert.Null(schedule.NextDueDate); Assert.Null(schedule.NextDueRunningHours);
        Assert.False(await context.MaintenanceTasks.AnyAsync(t => t.ScheduleId == schedule.Id));
        Assert.DoesNotContain(await schedules.GetAutoGenerateSchedulesAsync(), x => x.Id == schedule.Id);
        var preview = Assert.IsType<OkObjectResult>((await controller.PreviewDueDates()).Result);
        Assert.DoesNotContain(Assert.IsType<List<SchedulePreviewDto>>(preview.Value), x => x.ScheduleId == schedule.Id);
        Assert.Equal(category, MaritimeEdge.Constants.MaintenanceCategories.TaskType(category, "CALENDAR"));
        dto.MaintenanceCategory = "PERIODIC"; dto.IntervalType = "CALENDAR"; dto.IntervalDays = 30; dto.AutoGenerate = false;
        Assert.True((await controller.Update(schedule.Id, dto)).Result is OkObjectResult, logger.Error?.ToString());
        Assert.NotNull(schedule.NextDueDate);
        Assert.False(schedule.AutoGenerate);
        Assert.Empty(context.ChangeTracker.Entries<MaintenanceTask>());
        dto.MaintenanceCategory = category; dto.AutoGenerate = true;
        Assert.True((await controller.Update(schedule.Id, dto)).Result is OkObjectResult, logger.Error?.ToString());
        Assert.Null(schedule.NextDueDate); Assert.Null(schedule.IntervalDays); Assert.False(schedule.AutoGenerate);
        Assert.False(await context.MaintenanceTasks.AnyAsync(t => t.ScheduleId == schedule.Id));
    }

    [Fact]
    public void CatalogueMutations_Return403_WhileStockOperationsRemainAvailable()
    {
        foreach (var name in new[] { "CreateCategory", "UpdateCategory", "DeleteCategory", "CreateItem", "UpdateItem", "DeleteItem", "UploadItemImage", "DeleteItemImage" })
            Assert.NotNull(typeof(MaterialController).GetMethod(name)!.GetCustomAttributes(typeof(ShoreManagedCatalogAttribute), true).SingleOrDefault());
        foreach (var name in new[] { "PreviewImport", "ImportReceipt" })
            Assert.NotNull(typeof(MaterialReceiptsController).GetMethod(name)!.GetCustomAttributes(typeof(ShoreManagedCatalogAttribute), true).SingleOrDefault());
        Assert.Empty(typeof(MaterialController).GetMethod("AdjustStock")!.GetCustomAttributes(typeof(ShoreManagedCatalogAttribute), true));
        var action = new ActionContext(new DefaultHttpContext(), new RouteData(), new ActionDescriptor());
        var executing = new ActionExecutingContext(action, [], new Dictionary<string, object?>(), new object());
        new ShoreManagedCatalogAttribute().OnActionExecuting(executing);
        Assert.Equal(403, Assert.IsType<ObjectResult>(executing.Result).StatusCode);
    }
}
