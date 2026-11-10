using System.Text.Json;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Maintenance;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

public partial class PmsWorkOrderWorkflowTests
{
    [Fact]
    public void TouchPermissionsBindOnlyReadAndExecutionOperations()
    {
        var module = Assert.Single(PermissionRegistry.Data.Modules.Where(m => m.Code == "pms.execute"));
        Assert.Equal(new[] { "view", "execute" }, module.Actions);
        foreach (var action in new[] { "List", "Search", "Detail", "References", "Settings", "EquipmentTree", "Report" })
            Assert.Contains("pms.execute.view", PermissionRegistry.Resolve("PmsWorkOrders", action)!);
        foreach (var action in new[] { "Start", "Save", "Submit", "MaterialOptions" })
            Assert.Contains("pms.execute.execute", PermissionRegistry.Resolve("PmsWorkOrders", action)!);
        foreach (var action in new[] { "Assign", "Approve", "Return", "Cancel", "CreateAdHoc", "IssueDraft", "DeleteDraft" })
            Assert.DoesNotContain(PermissionRegistry.Resolve("PmsWorkOrders", action)!, grant => grant.StartsWith("pms.execute."));
    }

    private static async Task SetTouchGrants(MaritimeEdge.Data.EdgeDbContext db, User user, bool execute)
    {
        var rank = await db.CrewMembers.Where(c => c.CrewId == user.CrewId).Select(c => c.RankId).SingleAsync();
        var config = await db.RankPermissionConfigs.SingleAsync(c => c.RankId == rank);
        config.GrantsJson = JsonSerializer.Serialize(execute
            ? new[] { "pms.execute.access", "pms.execute.execute" }
            : new[] { "pms.execute.access" });
        await db.SaveChangesAsync();
    }

    [PmsPostgresFact]
    public async Task TouchOnlyGrantCanStartSaveAndSubmitAnAssignedOrder()
    {
        var setup = await Seed();
        await using var db = fixture.CreateContext();
        await SetTouchGrants(db, setup.Worker, true);
        var workflow = Service(db);
        var started = await workflow.StartAsync(setup.Order.Id, new(setup.Order.Version), setup.Worker.Id, "WEB");
        var results = await Results(db, setup, started);
        var saved = await workflow.SaveAsync(started.Id, results, setup.Worker.Id, "WEB");
        results.ExpectedVersion = saved.Version;
        var submitted = await workflow.SubmitAsync(saved.Id, results, setup.Worker.Id, "WEB");
        Assert.Equal("PENDING_APPROVAL", submitted.Status);
        var grants = (await new RankPermissionService(db).GetAsync(setup.Worker.Id)).Grants.ToHashSet();
        Assert.False(PermissionRegistry.Allows(grants, "pms.work.execute"));
        Assert.False(PermissionRegistry.Allows(grants, "pms.work.approve"));
    }

    [PmsPostgresFact]
    public async Task TouchViewOnlyAndUnassignedUsersCannotStartOrders()
    {
        var setup = await Seed();
        await using var db = fixture.CreateContext();
        await SetTouchGrants(db, setup.Worker, false);
        await SetTouchGrants(db, setup.Outsider, true);
        var workflow = Service(db);
        var viewOnly = await Assert.ThrowsAsync<PmsRequestException>(() => workflow.StartAsync(setup.Order.Id, new(setup.Order.Version), setup.Worker.Id, "WEB"));
        var outsider = await Assert.ThrowsAsync<PmsRequestException>(() => workflow.StartAsync(setup.Order.Id, new(setup.Order.Version), setup.Outsider.Id, "WEB"));
        Assert.Equal(403, viewOnly.Status);
        Assert.Equal(403, outsider.Status);
    }

    [PmsPostgresFact]
    public async Task MultipleEquipmentSelectionIncludesDescendantsAndRejectsInvalidIds()
    {
        var first = await Seed();
        var second = await Seed();
        await using var db = fixture.CreateContext();
        var parent = new EquipmentAsset { AssetCode = Guid.NewGuid().ToString("N"), AssetName = "Touch equipment group", Category = "ENGINE" };
        db.EquipmentAssets.Add(parent);
        var asset = await db.EquipmentAssets.SingleAsync(a => a.Id == first.AssetId);
        asset.ParentId = parent.Id;
        await db.SaveChangesAsync();
        var reader = new PmsWorkOrderReadService(db, Config());
        var page = await reader.ListAsync(new() { EquipmentAssetIds = $"{parent.Id},{second.AssetId},{first.AssetId}" });
        Assert.Equal(2, page.Total);
        Assert.Contains(page.Items, order => order.Id == first.Order.Id);
        Assert.Contains(page.Items, order => order.Id == second.Order.Id);
        var invalid = await Assert.ThrowsAsync<PmsRequestException>(() => reader.ListAsync(new() { EquipmentAssetIds = "bad-id" }));
        Assert.Equal(400, invalid.Status);
    }
}
