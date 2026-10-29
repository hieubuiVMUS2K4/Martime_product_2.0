using System.Text.Json;
using MaritimeEdge.Controllers.Maintenance;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Maintenance;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

[Collection("PMS inventory")]
public class PmsImportEquipmentTests(PmsDatabaseFixture fixture)
{
    [PmsPostgresFact]
    public async Task CalendarBaselineImportsAtomicallyWithoutExecutionOrWorkOrders()
    {
        await using var db = fixture.CreateContext();
        var asset = new EquipmentAsset { AssetCode = Guid.NewGuid().ToString("N"), AssetName = "Pump", Category = "PUMP" };
        db.Add(asset); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        var baseline = new DateTime(2026, 1, 31, 2, 30, 0, DateTimeKind.Utc);
        var code = Guid.NewGuid().ToString("N");
        var request = new ImportPmsJobsDto { Rows = [new() { RowNumber = 9, AssetCode = asset.AssetCode, Code = code,
            Name = "Calendar job", IntervalMonths = 3, BaselineAt = baseline },
            new() { RowNumber = 10, AssetCode = asset.AssetCode, Code = code + "-hybrid", Name = "Hybrid job",
                IntervalType = "HYBRID", IntervalMonths = 3, IntervalHours = 100, BaselineAt = baseline }] };
        var service = new PmsJobService(db); var count = await db.MaintenanceSchedules.CountAsync(); var queue = await db.SyncQueue.CountAsync();
        Assert.True((await service.ImportAsync(request, 1, "NODE")).Valid);
        Assert.Equal(count, await db.MaintenanceSchedules.CountAsync()); Assert.Equal(queue, await db.SyncQueue.CountAsync());
        request.ValidateOnly = false;
        Assert.Equal(2, (await service.ImportAsync(request, 1, "NODE")).Imported);
        var job = await db.MaintenanceSchedules.SingleAsync(j => j.ScheduleCode == code);
        Assert.Equal(baseline, job.BaselineAt); Assert.Equal(baseline.AddMonths(3), job.NextDueDate);
        Assert.Equal("Import Excel", job.BaselineSource); Assert.False(job.AutoGenerate); Assert.Null(job.LastExecutedAt);
        Assert.False(await db.MaintenanceTasks.AnyAsync(t => t.ScheduleId == job.Id));
        Assert.False(await db.MaintenanceHistories.AnyAsync(h => h.ScheduleId == job.Id));
        var hybrid = await db.MaintenanceSchedules.SingleAsync(j => j.ScheduleCode == code + "-hybrid");
        Assert.Equal(baseline, hybrid.BaselineAt); Assert.Equal(PmsJobRules.NeedsInformation, hybrid.JobState);
        Assert.Null(hybrid.BaselineRunningHours); Assert.Null(hybrid.NextDueDate);
    }

    [PmsPostgresFact]
    public async Task ImportRejectsCalendarBaselineForHoursAndManualJobsAndUnspecifiedTimezone()
    {
        await using var db = fixture.CreateContext();
        var asset = new EquipmentAsset { AssetCode = Guid.NewGuid().ToString("N"), AssetName = "Pump", Category = "PUMP" };
        db.Add(asset); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        var before = await db.MaintenanceSchedules.CountAsync();
        var rows = new List<ImportPmsJobRow>();
        foreach (var category in new[] { "PERIODIC", "DRY_DOCK", "ON_DEMAND", "VOYAGE" })
            rows.Add(new() { RowNumber = rows.Count + 1, Code = Guid.NewGuid().ToString("N"), AssetCode = asset.AssetCode,
                Name = "Invalid baseline", Category = category, IntervalType = "RUNNING_HOURS", IntervalHours = 100, BaselineAt = DateTime.UtcNow });
        rows.Add(new() { RowNumber = 5, Code = Guid.NewGuid().ToString("N"), AssetCode = asset.AssetCode,
            Name = "Missing timezone", IntervalMonths = 1, BaselineAt = new DateTime(2026, 1, 1) });
        var result = await new PmsJobService(db).ImportAsync(new() { ValidateOnly = false, Rows = rows }, 1, "NODE");
        Assert.False(result.Valid); Assert.Equal(5, result.Errors.Count); Assert.Equal(0, result.Imported);
        Assert.Equal(before, await db.MaintenanceSchedules.CountAsync());
    }

    [Fact]
    public void TemplateEquipmentReferenceUsesJobImportPermission()
    {
        var grants = PermissionRegistry.Resolve("PmsJobs", "ImportEquipment");
        Assert.NotNull(grants);
        Assert.Contains("pms.jobs.import", grants);
        Assert.DoesNotContain("pms.work.view", grants);
    }

    [PmsPostgresFact]
    public async Task ReferenceIncludesAllEquipmentCodesAndParentStateWithoutModifyingRecords()
    {
        await using var db = fixture.CreateContext();
        var prefix = Guid.NewGuid().ToString("N");
        var group = new EquipmentAsset { AssetCode = prefix + "-G", AssetName = "Engine room", Category = "SYSTEM" };
        var active = new EquipmentAsset { AssetCode = prefix + "-A", AssetName = "Pump", Category = "PUMP", ParentId = group.Id };
        var inactive = new EquipmentAsset { AssetCode = prefix + "-I", AssetName = "Old pump", Category = "PUMP", IsActive = false };
        var retired = new EquipmentAsset { AssetCode = prefix + "-R", AssetName = "Retired pump", Category = "PUMP", Status = "DECOMMISSIONED" };
        db.AddRange(group, active, inactive, retired); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        var before = await db.SyncQueue.CountAsync();
        var controller = new PmsJobsController(new PmsJobService(db), db, Mock.Of<IEdgeRuntimeConfigService>());
        var response = Assert.IsType<OkObjectResult>(await controller.ImportEquipment(default));
        var items = JsonSerializer.SerializeToElement(response.Value, new JsonSerializerOptions(JsonSerializerDefaults.Web)).EnumerateArray()
            .Where(item => item.GetProperty("assetCode").GetString()!.StartsWith(prefix)).ToArray();
        Assert.Equal(4, items.Length);
        Assert.False(items.Single(item => item.GetProperty("assetCode").GetString() == inactive.AssetCode).GetProperty("isActive").GetBoolean());
        Assert.Equal(group.Id, items.Single(item => item.GetProperty("assetCode").GetString() == active.AssetCode).GetProperty("parentId").GetGuid());
        Assert.Equal("DECOMMISSIONED", items.Single(item => item.GetProperty("assetCode").GetString() == retired.AssetCode).GetProperty("status").GetString());
        Assert.Equal(before, await db.SyncQueue.CountAsync()); Assert.Empty(db.ChangeTracker.Entries());
    }
}
