using System.Text.Json;
using MaritimeEdge.Controllers.Inventory;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Maintenance;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

[Collection("PMS inventory")]
public class InventoryHistoryMaterialTests(PmsDatabaseFixture fixture)
{
    [PmsPostgresFact]
    public async Task HistoryResolvesIdOnlyConsumptionAndPreservesLegacySnapshotNames()
    {
        await using var db = fixture.CreateContext();
        var code = Guid.NewGuid().ToString("N");
        var category = new MaterialCategory { CategoryCode = code, Name = "Parts" };
        var material = new MaterialItem { ItemCode = code, Name = "Hydraulic oil", CategoryId = category.Id, IsActive = false };
        db.AddRange(category, material); await db.SaveChangesAsync();
        var variants = new[] {
            JsonSerializer.Serialize(new[] { new { materialItemId = material.Id, quantity = 25 } }),
            JsonSerializer.Serialize(new[] { new { materialItemId = material.Id, materialCode = "OLD-CODE", materialName = "Old name", quantityUsed = 2 } }),
            JsonSerializer.Serialize(new[] { new { materialItemId = material.Id, code = "REPORT-CODE", name = "Report name", quantity = 3 } }),
            JsonSerializer.Serialize(new[] { new { materialItemId = Guid.NewGuid(), quantity = 4 } })
        };
        foreach (var json in variants)
            db.MaintenanceTasks.Add(new() { TaskId = Guid.NewGuid().ToString("N"), Status = "COMPLETED", SparePartsUsed = json, Notes = code });
        db.MaintenanceTasks.Add(new() { TaskId = Guid.NewGuid().ToString("N"), Status = "IN_PROGRESS", SparePartsUsed = variants[0], Notes = code });
        await db.SaveChangesAsync();
        var result = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(await new InventoryController(db).GetHistory(pageSize: 100)).Value,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var rows = result.GetProperty("items").EnumerateArray().Where(r => new[] { code, "OLD-CODE", "REPORT-CODE", "—" }.Contains(r.GetProperty("itemCode").GetString())).ToArray();
        Assert.Equal(4, rows.Length);
        Assert.All(rows, r => Assert.Equal("Tiêu hao vật tư bảo trì", r.GetProperty("note").GetString()));
        Assert.Contains(rows, r => r.GetProperty("itemCode").GetString() == code && r.GetProperty("itemName").GetString() == "Hydraulic oil" && r.GetProperty("quantity").GetDecimal() == 25);
        Assert.Contains(rows, r => r.GetProperty("itemCode").GetString() == "OLD-CODE" && r.GetProperty("itemName").GetString() == "Old name");
        Assert.Contains(rows, r => r.GetProperty("itemCode").GetString() == "REPORT-CODE" && r.GetProperty("itemName").GetString() == "Report name");
        Assert.Contains(rows, r => r.GetProperty("itemCode").GetString() == "—" && r.GetProperty("quantity").GetDecimal() == 4);
    }

    [PmsPostgresFact]
    public async Task JobDeletionEligibilityIncludesClosedAndCancelledWorkOrders()
    {
        await using var db = fixture.CreateContext();
        var code = Guid.NewGuid().ToString("N");
        var jobs = Enumerable.Range(0, 3).Select(i => new MaintenanceSchedule { ScheduleCode = code + i, ScheduleName = code + i }).ToArray();
        foreach (var job in jobs) PmsJobRules.PrepareForSave(job);
        db.AddRange(jobs); await db.SaveChangesAsync();
        db.MaintenanceTasks.AddRange(new MaintenanceTask { TaskId = code + "A", ScheduleId = jobs[1].Id, Status = "COMPLETED" },
            new MaintenanceTask { TaskId = code + "B", ScheduleId = jobs[2].Id, Status = "CANCELLED" });
        await db.SaveChangesAsync();
        var result = await new PmsJobService(db).ListAsync(new() { Name = code });
        Assert.True(result.Items.Single(j => j.Id == jobs[0].Id).CanDelete);
        Assert.False(result.Items.Single(j => j.Id == jobs[1].Id).CanDelete);
        Assert.False(result.Items.Single(j => j.Id == jobs[2].Id).CanDelete);
    }
}
