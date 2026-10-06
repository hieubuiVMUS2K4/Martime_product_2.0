using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

[Collection("PMS inventory")]
public class VesselMaterialSyncTests(PmsDatabaseFixture database)
{
    [Fact]
    public async Task ReportTypeSnapshot_IsAppliedAndCanBeUpdatedWithoutDuplicates()
    {
        await using var context = database.CreateContext();
        var handler = new SyncConflictHandler(NullLogger<SyncConflictHandler>.Instance);
        var reportType = new MaritimeEdge.Models.ReportType
        {
            Id = 987654, TypeCode = "SYNC_TEST", TypeName = "Initial name",
            Category = "OPERATIONAL", Frequency = "DAILY", IsActive = true,
            CreatedAt = DateTime.UtcNow
        };
        async Task Apply()
        {
            await handler.HandleIncomingAsync(context, new SyncQueueItemDto
            {
                TableName = "report_type", RecordKey = reportType.Id.ToString(),
                Payload = JsonSerializer.Serialize(reportType), ActionType = "SNAPSHOT", OriginNode = "SHORE"
            }, default);
            await context.SaveChangesAsync();
            context.ChangeTracker.Clear();
        }
        await Apply();
        reportType.TypeName = "Updated name";
        await Apply();
        var stored = await context.ReportTypes.Where(r => r.Id == reportType.Id).ToListAsync();
        Assert.Single(stored);
        Assert.Equal("Updated name", stored[0].TypeName);
        Assert.Equal("DAILY", stored[0].Frequency);
        context.ReportTypes.Remove(stored[0]);
        await context.SaveChangesAsync();
    }

    [Fact]
    public async Task MaterialViews_UseShipCodeAndPartNumber_AndDefinitionsDoNotUpload()
    {
        await using var context = database.CreateContext();
        var catalog = new MaritimeEdge.Models.MaterialCatalogItem { ItemCode = Guid.NewGuid().ToString("N"), Name = "Injector" };
        var ship = new MaritimeEdge.Models.MaterialItem { ItemCode = "SP-" + Guid.NewGuid().ToString("N")[..8], Name = "Injector", MaterialItemCode = catalog.ItemCode, PartNumber = "PN-8821-A" };
        var device = new MaritimeEdge.Models.EquipmentAsset { AssetCode = Guid.NewGuid().ToString("N"), AssetName = "Main Engine", Category = "ENGINE" };
        context.MaterialCatalogItems.Add(catalog); context.MaterialItems.Add(ship); context.EquipmentAssets.Add(device);
        context.MaterialItemEquipments.Add(new() { MaterialItemId = catalog.Id, EquipmentAssetId = device.Id });
        await context.SaveChangesAsync();
        Assert.False(await context.SyncQueue.AnyAsync(q => q.RecordKey == ship.Id.ToString() && q.TableName == "material_item"));
        Assert.False(await context.SyncQueue.AnyAsync(q => q.RecordKey == catalog.Id.ToString() && q.TableName == "material_catalog_item"));
        var controller = new MaritimeEdge.Controllers.Inventory.MaterialController(context, NullLogger<MaritimeEdge.Controllers.Inventory.MaterialController>.Instance);
        JsonElement Body(Microsoft.AspNetCore.Mvc.IActionResult result) => JsonSerializer.SerializeToElement(Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(result).Value);
        var linked = Body(await controller.GetMaterialsByEquipment(device.Id));
        Assert.Equal(ship.ItemCode, linked.EnumerateArray().Single(x => x.GetProperty("materialItemId").GetGuid() == catalog.Id).GetProperty("itemCode").GetString());
        var assigned = Body(await controller.GetAssignedEquipment()).EnumerateArray().Single(x => x.GetProperty("materialItemId").GetGuid() == ship.Id);
        Assert.Equal(device.AssetName, assigned.GetProperty("equipmentName").GetString());
        Assert.Equal(1, Body(await controller.GetEquipmentCounts()).EnumerateArray().Single(x => x.GetProperty("materialItemId").GetGuid() == ship.Id).GetProperty("count").GetInt32());
        Assert.Equal("PN-8821-A", (await context.MaterialItems.SingleAsync(x => x.Id == ship.Id)).PartNumber);
    }

    [Fact]
    public async Task UnknownShoreTable_IsRejected_InsteadOfSilentlyAcknowledged()
    {
        await using var context = database.CreateContext();
        var handler = new SyncConflictHandler(NullLogger<SyncConflictHandler>.Instance);
        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.HandleIncomingAsync(context,
            new() { TableName = "future_unknown_material_table", RecordKey = Guid.NewGuid().ToString(), Payload = "{}", ActionType = "UPDATE" }, default));
    }

    [PmsPostgresFact]
    public async Task Migration_RemovesOnlyLegacyCategoryConstraints_PreservingRows()
    {
        await using var context = database.CreateContext();
        await context.Database.ExecuteSqlRawAsync("""
            ALTER TABLE material_items ADD CONSTRAINT codex_legacy_catalog_category FOREIGN KEY (category_id) REFERENCES material_categories(id) NOT VALID;
            ALTER TABLE material_item_ship ADD CONSTRAINT codex_legacy_ship_category FOREIGN KEY (category_id) REFERENCES material_categories(id) NOT VALID;
            """);
        var before = await context.MaterialItems.CountAsync();
        var migration = new MaritimeEdge.Data.Migrations.RemoveMaterialDefinitionCategoryRequirement();
        foreach (var operation in migration.UpOperations.Cast<Microsoft.EntityFrameworkCore.Migrations.Operations.SqlOperation>())
            await context.Database.ExecuteSqlRawAsync(operation.Sql);
        Assert.Equal(before, await context.MaterialItems.CountAsync());
        Assert.Equal(0, await context.Database.SqlQueryRaw<int>("SELECT count(*)::int AS \"Value\" FROM pg_constraint WHERE conname IN ('codex_legacy_catalog_category', 'codex_legacy_ship_category')").SingleAsync());
    }

    [Fact]
    public async Task ApplyDefinition_IsIdempotent_PreservesStock_AndIgnoresOldRetries()
    {
        await using var context = database.CreateContext();
        var handler = new SyncConflictHandler(NullLogger<SyncConflictHandler>.Instance);
        var row = new VesselMaterialDefinition { Id = Guid.NewGuid(), CatalogId = Guid.NewGuid(), VesselId = Guid.NewGuid(),
            ItemCode = Guid.NewGuid().ToString("N"), MaterialItemCode = Guid.NewGuid().ToString("N"), Name = "Filter", Unit = "PCS", UpdatedAt = DateTime.UtcNow };
        SyncQueueItemDto Item() => new() { TableName = "vessel_material_definition", RecordKey = row.Id.ToString(), Payload = JsonSerializer.Serialize(row), ActionType = "UPDATE", OriginNode = "SHORE" };
        var old = Item();
        await handler.HandleIncomingAsync(context, old, default); await context.SaveChangesAsync();
        Assert.DoesNotContain(context.Model.FindEntityType(typeof(MaritimeEdge.Models.MaterialItem))!.GetForeignKeys(), fk => fk.PrincipalEntityType.ClrType == typeof(MaritimeEdge.Models.MaterialCategory));
        var stock = await context.MaterialItems.SingleAsync(s => s.Id == row.Id);
        stock.OnHandQuantity = 12; stock.MinStock = 4; stock.IsSynced = false;
        var equipment = new MaritimeEdge.Models.EquipmentAsset { AssetCode = Guid.NewGuid().ToString("N"), AssetName = "Test", Category = "PUMP" };
        context.EquipmentAssets.Add(equipment);
        await context.SaveChangesAsync();
        context.MaterialItemEquipments.Add(new() { MaterialItemId = row.CatalogId, EquipmentAssetId = equipment.Id, Notes = "Assigned on Edge" });
        await context.SaveChangesAsync();
        row.EquipmentLinks = []; // An old Shore snapshot must not clear an Edge assignment.
        row.Name = "Updated"; row.UpdatedAt = row.UpdatedAt.AddMinutes(1);
        await handler.HandleIncomingAsync(context, Item(), default); await context.SaveChangesAsync();
        await handler.HandleIncomingAsync(context, old, default); await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        stock = await context.MaterialItems.SingleAsync(s => s.Id == row.Id);
        Assert.Equal("Updated", stock.Name); Assert.Equal(12, stock.OnHandQuantity); Assert.Equal(4, stock.MinStock); Assert.False(stock.IsSynced);
        Assert.Equal(equipment.Id, (await context.MaterialItemEquipments.SingleAsync(l => l.MaterialItemId == row.CatalogId)).EquipmentAssetId);
        row.EquipmentLinks = null; row.UpdatedAt = DateTime.UtcNow.AddMinutes(1);
        await handler.HandleIncomingAsync(context, Item(), default); await context.SaveChangesAsync();
        Assert.True(await context.MaterialItemEquipments.AnyAsync(l => l.MaterialItemId == row.CatalogId && l.EquipmentAssetId == equipment.Id));
        row.IsActive = false; row.UpdatedAt = row.UpdatedAt.AddMinutes(1);
        await handler.HandleIncomingAsync(context, Item(), default); await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        Assert.False((await context.MaterialItems.SingleAsync(s => s.Id == row.Id)).IsActive);
        Assert.Equal(12, (await context.MaterialItems.SingleAsync(s => s.Id == row.Id)).OnHandQuantity);
        Assert.Single(await context.MaterialCatalogItems.Where(c => c.Id == row.CatalogId).ToListAsync());
    }
}
