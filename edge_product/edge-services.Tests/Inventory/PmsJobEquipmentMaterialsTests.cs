using System.Text.Json;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Maintenance;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

[Collection("PMS inventory")]
public class PmsJobEquipmentMaterialsTests(PmsDatabaseFixture fixture)
{
    [PmsPostgresFact]
    public async Task JobReadsCatalogAssignmentsWithShipCodesUnitsAndAncestorLinksWithoutDuplicates()
    {
        await using var db = fixture.CreateContext();
        var code = Guid.NewGuid().ToString("N");
        var category = new MaterialCategory { CategoryCode = code, Name = "Parts" };
        var parent = new EquipmentAsset { AssetCode = code + "P", AssetName = "Parent", Category = "SYSTEM" };
        var child = new EquipmentAsset { AssetCode = code + "C", AssetName = "Oil tank", ParentId = parent.Id };
        var sibling = new EquipmentAsset { AssetCode = code + "S", AssetName = "Other tank", ParentId = parent.Id };
        var catalog = new MaterialCatalogItem { ItemCode = Guid.NewGuid().ToString(), Name = "Hydraulic oil", CategoryId = category.Id };
        var inherited = new MaterialCatalogItem { ItemCode = code + "I", Name = "Inherited spare", CategoryId = category.Id };
        var inactive = new MaterialCatalogItem { ItemCode = code + "X", Name = "Inactive", CategoryId = category.Id, IsActive = false };
        var unrelated = new MaterialCatalogItem { ItemCode = code + "U", Name = "Unrelated", CategoryId = category.Id };
        var ship = new MaterialItem { ItemCode = code + "OIL", MaterialItemCode = catalog.ItemCode, Name = "Ship oil", CategoryId = category.Id, Unit = "L" };
        var job = new MaintenanceSchedule { ScheduleCode = code, ScheduleName = "Oil maintenance", EquipmentAssetId = child.Id, AutoGenerate = false };
        PmsJobRules.PrepareForSave(job);
        db.AddRange(category, parent, child, sibling, catalog, inherited, inactive, unrelated, ship, job);
        await db.SaveChangesAsync();
        db.MaterialItemEquipments.AddRange(new() { MaterialItemId = catalog.Id, EquipmentAssetId = child.Id },
            new() { MaterialItemId = catalog.Id, EquipmentAssetId = parent.Id },
            new() { MaterialItemId = inherited.Id, EquipmentAssetId = parent.Id },
            new() { MaterialItemId = inactive.Id, EquipmentAssetId = child.Id },
            new() { MaterialItemId = unrelated.Id, EquipmentAssetId = sibling.Id });
        await db.SaveChangesAsync();
        async Task<JsonElement[]> Read()
        {
            var result = await new PmsJobService(db).DetailAsync(job.Id);
            return JsonSerializer.SerializeToElement(result, new JsonSerializerOptions(JsonSerializerDefaults.Web))
                .GetProperty("equipmentMaterials").EnumerateArray().ToArray();
        }
        var rows = await Read();
        Assert.Equal(2, rows.Length);
        var oil = Assert.Single(rows, r => r.GetProperty("id").GetGuid() == catalog.Id);
        Assert.NotEqual(ship.Id, oil.GetProperty("id").GetGuid());
        Assert.Equal(ship.ItemCode, oil.GetProperty("itemCode").GetString());
        Assert.Equal("L", oil.GetProperty("unit").GetString());
        Assert.Contains(rows, r => r.GetProperty("id").GetGuid() == inherited.Id);
        // Even malformed imported hierarchy data cannot create an infinite traversal.
        parent.ParentId = child.Id; await db.SaveChangesAsync();
        Assert.Equal(2, (await Read()).Length);
    }
}
