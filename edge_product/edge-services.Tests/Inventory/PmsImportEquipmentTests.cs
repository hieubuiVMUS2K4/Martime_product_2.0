using System.Text.Json;
using MaritimeEdge.Controllers.Maintenance;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Maintenance;
using MaritimeEdge.Repositories;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

[Collection("PMS inventory")]
public class PmsImportEquipmentTests(PmsDatabaseFixture fixture)
{
    [Fact]
    public async Task LargeEquipmentImportKeepsSyncPayloadsFlatAndTreeVisible()
    {
        await using var db = fixture.CreateContext();
        var prefix = Guid.NewGuid().ToString("N");
        var group = new EquipmentGroup { GroupCode = prefix, GroupName = "Import test group" };
        db.EquipmentGroups.Add(group);
        await db.SaveChangesAsync();
        var repository = new EquipmentAssetRepository(db);
        var completion = new MaintenanceCompletionService(db, Mock.Of<IMaintenanceScheduleRepository>(), repository,
            NullLogger<MaintenanceCompletionService>.Instance);
        var controller = new EquipmentAssetController(repository, db,
            NullLogger<EquipmentAssetController>.Instance, completion);
        var rows = new List<ImportEquipmentAssetDto>
        {
            new() { AssetCode = prefix, AssetName = "System", Category = "SYSTEM" }
        };
        rows.AddRange(Enumerable.Range(1, 752).Select(i => new ImportEquipmentAssetDto
        {
            AssetCode = $"{prefix}-{i}", AssetName = $"Equipment {i}", Category = "PUMP", ParentAssetCode = prefix,
            EquipmentGroupCode = prefix
        }));

        var timer = System.Diagnostics.Stopwatch.StartNew();
        var result = Assert.IsType<OkObjectResult>((await controller.BulkImport(rows)).Result);
        Console.WriteLine($"753-equipment import completed in {timer.ElapsedMilliseconds} ms");
        var response = JsonSerializer.SerializeToElement(result.Value);
        Assert.True(response.GetProperty("success").GetBoolean());
        Assert.Equal(753, response.GetProperty("imported").GetInt32());
        var imported = await db.EquipmentAssets.Where(a => a.AssetCode.StartsWith(prefix)).ToListAsync();
        Assert.Equal(753, imported.Count);
        var root = imported.Single(a => a.AssetCode == prefix);
        Assert.Equal(752, root.Children.Count);
        var members = await db.EquipmentGroupMembers.Where(m => m.GroupId == group.Id).ToListAsync();
        Assert.Equal(752, members.Count);
        foreach (var member in members)
        {
            var payload = db.BuildSyncPayload(member);
            Assert.DoesNotContain("\"Asset\"", payload);
            Assert.DoesNotContain("\"Group\"", payload);
        }
        foreach (var asset in imported)
        {
            var payload = db.BuildSyncPayload(asset);
            Assert.True(payload.Length < 3000, $"Equipment payload grew to {payload.Length} bytes");
            var document = JsonSerializer.Deserialize<EquipmentAsset>(payload)!;
            Assert.Equal(asset.Id, document.Id);
            Assert.Equal(asset.ParentId, document.ParentId);
            Assert.Equal(asset.AssetCode, document.AssetCode);
            Assert.DoesNotContain("\"Children\"", payload);
            Assert.DoesNotContain("\"Parent\"", payload);
        }
        db.ChangeTracker.Clear();
        var tree = Assert.IsType<OkObjectResult>((await controller.GetTree()).Result);
        Assert.Equal(753, Assert.IsType<List<EquipmentAssetDto>>(tree.Value).Count(a => a.AssetCode.StartsWith(prefix)));
    }

    [PmsPostgresFact]
    public async Task LargeJobImportValidatesAndPersistsAllRows()
    {
        await using var db = fixture.CreateContext();
        var prefix = Guid.NewGuid().ToString("N");
        var asset = new EquipmentAsset { AssetCode = prefix, AssetName = "Import pump", Category = "PUMP" };
        db.Add(asset);
        await db.SaveChangesAsync();
        var request = new ImportPmsJobsDto
        {
            Rows = Enumerable.Range(1, 700).Select(i => new ImportPmsJobRow
            {
                RowNumber = i, Code = $"{prefix}-{i}", Name = $"Imported job {i}",
                AssetCode = prefix, IntervalMonths = 3,
                BaselineAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
            }).ToList()
        };
        var service = new PmsJobService(db);
        Assert.True((await service.ImportAsync(request, 1, "NODE")).Valid);
        request.ValidateOnly = false;
        var timer = System.Diagnostics.Stopwatch.StartNew();
        var result = await service.ImportAsync(request, 1, "NODE");
        Console.WriteLine($"700-job import completed in {timer.ElapsedMilliseconds} ms");
        Assert.True(result.Valid);
        Assert.Equal(700, result.Imported);
        db.ChangeTracker.Clear();
        Assert.Equal(700, await db.MaintenanceSchedules.CountAsync(j => j.ScheduleCode.StartsWith(prefix)));
        Assert.False(await db.MaintenanceTasks.AnyAsync(t => t.EquipmentAssetId == asset.Id));
    }

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
