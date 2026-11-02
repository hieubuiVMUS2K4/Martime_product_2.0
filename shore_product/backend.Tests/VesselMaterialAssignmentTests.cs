using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using Npgsql;
using ProductApi.Controllers.Materials;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

public class VesselMaterialAssignmentTests
{
    private static AppDbContext Database()
    {
        var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("SHORE_PMS_TEST_CONNECTION_STRING"));
        if (connection.Database?.StartsWith("codex_pms_tests_", StringComparison.Ordinal) != true) throw new InvalidOperationException("Isolated database required");
        connection.Database += "_assignment_" + Guid.NewGuid().ToString("N")[..8];
        return new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection.ConnectionString).Options);
    }
    private static Vessel Vessel() => new() { IMO = Guid.NewGuid().ToString("N")[..7], Name = "Assignment test", BuildDate = DateTime.UtcNow };
    private static JsonElement Body(IActionResult result) => JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(result).Value);

    [ShorePostgresFact]
    public async Task AssigningSharedCatalog_PreservesMasterOtherVesselStockLinksAndIdentity()
    {
        await using var db = Database(); await db.Database.EnsureCreatedAsync();
        try
        {
            var a = Vessel(); var b = Vessel();
            var catalog = new MaterialItem { ItemCode = "COMPANY-FILTER", Name = "Company filter", UnitPrice = 20 };
            db.Vessels.AddRange(a, b); db.MaterialItems.Add(catalog); await db.SaveChangesAsync();
            var controller = new VesselMaterialsController(db, Mock.Of<ISyncOutboxService>());
            VesselMaterialDefinition Input(string shipCode) => new() { CatalogId = catalog.Id, ItemCode = shipCode, Name = "Forged name", Unit = "PCS", UnitCost = 30 };
            var aid = Body(await controller.Create(a.Id, Input("A-FILTER"))).GetProperty("Id").GetGuid();
            var bid = Body(await controller.Create(b.Id, Input("B-FILTER"))).GetProperty("Id").GetGuid();
            Assert.Equal(1, await db.MaterialItems.CountAsync());
            Assert.Equal(catalog.Id, Body(await controller.List(a.Id))[0].GetProperty("catalogId").GetGuid());
            var asset = new EquipmentAsset { AssetCode = "DEVICE", AssetName = "Device", VesselId = a.Id };
            db.EquipmentAssets.Add(asset); await db.SaveChangesAsync();
            db.MaterialItemEquipments.Add(new() { MaterialItemId = catalog.Id, EquipmentAssetId = asset.Id });
            var ship = await db.MaterialItemShips.SingleAsync(s => s.Id == aid); ship.OnHandQuantity = 15;
            await db.SaveChangesAsync();
            var update = Input("A-NEW-CODE"); update.UnitCost = 50; update.Notes = "Only vessel A";
            Assert.IsType<OkObjectResult>(await controller.Update(a.Id, aid, update));
            db.ChangeTracker.Clear();
            var master = await db.MaterialItems.SingleAsync();
            Assert.Equal("Company filter", master.Name); Assert.Equal(20, master.UnitPrice);
            ship = await db.MaterialItemShips.SingleAsync(s => s.Id == aid);
            Assert.Equal(15, ship.OnHandQuantity); Assert.Equal(catalog.ItemCode, ship.MaterialItemCode); Assert.Equal(50, ship.UnitCost);
            Assert.Equal(30, (await db.MaterialItemShips.SingleAsync(s => s.Id == bid)).UnitCost);
            Assert.Single(await db.MaterialItemEquipments.Where(l => l.MaterialItemId == catalog.Id && l.EquipmentAssetId == asset.Id).ToListAsync());
            var other = new MaterialItem { ItemCode = "OTHER", Name = "Other" }; db.MaterialItems.Add(other); await db.SaveChangesAsync();
            update.CatalogId = other.Id;
            Assert.IsType<ConflictObjectResult>(await controller.Update(a.Id, aid, update));
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [ShorePostgresFact]
    public async Task MissingInactiveConflictingAndDuplicateAssignments_AreRejectedWithoutCreatingCatalogs()
    {
        await using var db = Database(); await db.Database.EnsureCreatedAsync();
        try
        {
            var vessel = Vessel(); var active = new MaterialItem { ItemCode = "FILTER", Name = "Filter" };
            var inactive = new MaterialItem { ItemCode = "OLD", Name = "Old", IsActive = false };
            db.Vessels.Add(vessel); db.MaterialItems.AddRange(active, inactive); await db.SaveChangesAsync();
            var controller = new VesselMaterialsController(db, Mock.Of<ISyncOutboxService>());
            Assert.IsType<BadRequestObjectResult>(await controller.Create(vessel.Id, new() { ItemCode = "A", Name = "Free text", Unit = "PCS" }));
            Assert.IsType<BadRequestObjectResult>(await controller.Create(vessel.Id, new() { CatalogId = inactive.Id, ItemCode = "A", Unit = "PCS" }));
            Assert.IsType<BadRequestObjectResult>(await controller.Create(vessel.Id, new() { CatalogId = active.Id, MaterialItemCode = "WRONG", ItemCode = "A", Unit = "PCS" }));
            Assert.IsType<OkObjectResult>(await controller.Create(vessel.Id, new() { CatalogId = active.Id, ItemCode = "A", Unit = "PCS" }));
            Assert.IsType<ConflictObjectResult>(await controller.Create(vessel.Id, new() { MaterialItemCode = active.ItemCode, ItemCode = "OTHER-CODE", Unit = "PCS" }));
            Assert.Equal(2, await db.MaterialItems.CountAsync()); Assert.Equal(1, await db.MaterialItemShips.CountAsync());
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [ShorePostgresFact]
    public async Task ImportRequiresExistingCatalogCodes_AndRollsBackWholeBatch()
    {
        await using var db = Database(); await db.Database.EnsureCreatedAsync();
        try
        {
            var vessel = Vessel(); db.Vessels.Add(vessel);
            db.MaterialItems.AddRange(new() { ItemCode = "C1", Name = "One" }, new() { ItemCode = "C2", Name = "Two" }); await db.SaveChangesAsync();
            var controller = new VesselMaterialsController(db, Mock.Of<ISyncOutboxService>());
            VesselMaterialDefinition Row(string code, string ship) => new() { MaterialItemCode = code, ItemCode = ship, Unit = "PCS" };
            Assert.IsType<BadRequestObjectResult>(await controller.Import(vessel.Id, [Row("C1", "S1"), Row("UNKNOWN", "S2")]));
            Assert.Equal(0, await db.MaterialItemShips.CountAsync());
            Assert.IsType<BadRequestObjectResult>(await controller.Import(vessel.Id, [Row("C1", "S1"), Row("C1", "S2")]));
            Assert.IsType<OkObjectResult>(await controller.Import(vessel.Id, [Row("C1", "S1"), Row("C2", "S2")]));
            Assert.Equal(2, await db.MaterialItems.CountAsync()); Assert.Equal(2, await db.MaterialItemShips.CountAsync());
            Assert.IsType<ConflictObjectResult>(await controller.Import(vessel.Id, [Row("C1", "NEW")]));
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [ShorePostgresFact]
    public async Task SimultaneousAssignments_KeepOneLinkToTheCompanyCatalog()
    {
        await using var db = Database(); await db.Database.EnsureCreatedAsync();
        try
        {
            var vessel = Vessel(); var catalog = new MaterialItem { ItemCode = "SAME", Name = "Same" };
            db.Vessels.Add(vessel); db.MaterialItems.Add(catalog); await db.SaveChangesAsync();
            var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(db.Database.GetConnectionString()).Options;
            await using var one = new AppDbContext(options); await using var two = new AppDbContext(options);
            var results = await Task.WhenAll(new VesselMaterialsController(one, Mock.Of<ISyncOutboxService>()).Create(vessel.Id, new() { CatalogId = catalog.Id, ItemCode = "A", Unit = "PCS" }),
                new VesselMaterialsController(two, Mock.Of<ISyncOutboxService>()).Create(vessel.Id, new() { CatalogId = catalog.Id, ItemCode = "B", Unit = "PCS" }));
            Assert.Single(results.OfType<OkObjectResult>()); Assert.Single(results.OfType<ConflictObjectResult>());
            Assert.Equal(1, await db.MaterialItems.CountAsync()); Assert.Equal(1, await db.MaterialItemShips.CountAsync());
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }
}
