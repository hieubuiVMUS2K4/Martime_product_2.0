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
