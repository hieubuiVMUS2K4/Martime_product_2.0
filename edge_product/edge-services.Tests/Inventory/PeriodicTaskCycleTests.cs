using System.Text.Json;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Repositories;
using MaritimeEdge.Services.Maintenance;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
using MaritimeEdge.Controllers.Maintenance;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace MaritimeEdge.Tests.Inventory;

public class PeriodicTaskCycleTests
{
    [Theory]
    [InlineData(100, "SCHEDULED")]
    [InlineData(150, "UPCOMING")]
    [InlineData(199, "UPCOMING")]
    [InlineData(200, "DUE")]
    [InlineData(211, "OVERDUE")]
    public void HourlyCycle_UsesWarningWindowBeforeActualDeadline(double hours, string expected)
    {
        var schedule = new MaintenanceSchedule { IntervalType = "RUNNING_HOURS", IntervalHours = 100,
            NextDueRunningHours = 200, DaysBeforeDue = 50, NextDueDate = DateTime.UtcNow.AddDays(-90) };
        Assert.Equal(expected, PeriodicTaskCycle.NextCycleStatus(schedule, hours, DateTime.UtcNow));
    }

    [Fact]
    public async Task CycleUpdate_RespectsCalendarTaskDeadlineExtendedByApproval()
    {
        await using var db = Database();
        var now = DateTime.UtcNow;
        var schedule = new MaintenanceSchedule { MaintenanceCategory = "PERIODIC", IntervalType = "CALENDAR",
            IntervalDays = 30, NextDueDate = now.AddDays(-1), AutoGenerate = true, DaysBeforeDue = 7 };
        var task = new MaintenanceTask { Status = "SCHEDULED", NextDueAt = now.AddDays(20) };
        Assert.False(await PeriodicTaskCycle.ReopenIfDueAsync(db, task, schedule, null, now));
        Assert.Equal("SCHEDULED", task.Status);
        Assert.Equal(now.AddDays(20), task.NextDueAt);
        Assert.Equal(now.AddDays(-1), schedule.NextDueDate);
    }

    [Fact]
    public async Task NewUpdater_OnlyChangesExistingCyclesAndPreservesConfigurationAndReports()
    {
        await using var db = Database();
        var now = DateTime.UtcNow;
        var asset = new EquipmentAsset { AssetCode = "ENGINE", AssetName = "Engine", CurrentRunningHours = 100 };
        var schedule = new MaintenanceSchedule { ScheduleCode = "CYCLE", ScheduleName = "Cycle", EquipmentAssetId = asset.Id,
            MaintenanceCategory = "PERIODIC", IntervalType = "RUNNING_HOURS", IntervalHours = 100,
            NextDueRunningHours = 200, NextDueDate = now.AddDays(-20), DaysBeforeDue = 50, AutoGenerate = true };
        var empty = new MaintenanceSchedule { ScheduleCode = "NO-TASK", ScheduleName = "No task", MaintenanceCategory = "PERIODIC",
            IntervalType = "CALENDAR", IntervalDays = 30, NextDueDate = now.AddDays(-30), AutoGenerate = true };
        var task = new MaintenanceTask { TaskId = "KEEP-ID", ScheduleId = schedule.Id, EquipmentAssetId = asset.Id,
            Status = "COMPLETED", CompletedAt = now, Notes = "Retained report" };
        var executing = new MaintenanceTask { TaskId = "EXECUTING", ScheduleId = schedule.Id, EquipmentAssetId = asset.Id,
            Status = "IN_PROGRESS", Notes = "Do not clear" };
        db.EquipmentAssets.Add(asset); db.MaintenanceSchedules.AddRange(schedule, empty); db.MaintenanceTasks.AddRange(task, executing);
        await db.SaveChangesAsync();
        var updater = new MaintenanceCycleUpdater(db);
        Assert.Equal(1, await updater.RefreshAsync(now));
        Assert.Equal("SCHEDULED", task.Status);
        Assert.Equal(2, await db.MaintenanceTasks.CountAsync());
        var report = (await db.MaintenanceHistories.SingleAsync()).ReportSnapshot;
        Assert.Contains("Retained report", report!);
        Assert.Equal("Do not clear", executing.Notes); Assert.Equal("IN_PROGRESS", executing.Status);
        Assert.Equal(0, await updater.RefreshAsync(now));
        asset.CurrentRunningHours = 150; await db.SaveChangesAsync();
        Assert.Equal(1, await updater.RefreshAsync(now, asset.Id)); Assert.Equal("UPCOMING", task.Status);
        asset.CurrentRunningHours = 200; await db.SaveChangesAsync();
        Assert.Equal(1, await updater.RefreshAsync(now, asset.Id)); Assert.Equal("DUE", task.Status);
        Assert.Single(await db.MaintenanceHistories.ToListAsync());
        Assert.Equal(report, (await db.MaintenanceHistories.SingleAsync()).ReportSnapshot);
        Assert.Equal(now.AddDays(-20), schedule.NextDueDate); Assert.Equal(50, schedule.DaysBeforeDue);
        Assert.Equal(now.AddDays(-30), empty.NextDueDate);
    }

    [Fact]
    public void ReportMigration_GeneratesPostgresColumnWithoutDatabaseConnection()
    {
        using var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>()
            .UseNpgsql("Host=localhost;Database=migration_check;Username=unused;Password=unused").Options);
        var sql = db.GetService<IMigrator>().GenerateScript("20261006110000_AddRankPermissionConfigs",
            "20261006220000_AddMaintenanceReportSnapshot");
        Assert.Contains("report_snapshot", sql);
        Assert.Contains("maintenance_histories", sql);
    }

    [Fact]
    public async Task History_RemainsVisibleAfterReopeningAndCannotExposeAnotherTaskReport()
    {
        await using var db = Database();
        var task = new MaintenanceTask { TaskId = "SAME-JOB", Status = "DUE" };
        var another = new MaintenanceTask { TaskId = "OTHER-JOB", Status = "DUE" };
        var record = new MaintenanceHistory { TaskId = task.Id, ScheduleId = Guid.NewGuid(),
            Notes = "Previous execution", ReportSnapshot = "{\"task\":{\"taskId\":\"SAME-JOB\",\"status\":\"COMPLETED\"}}" };
        db.MaintenanceTasks.AddRange(task, another); db.MaintenanceHistories.Add(record); await db.SaveChangesAsync();
        var controller = new MaintenanceHistoryController(db);
        var result = Assert.IsType<OkObjectResult>(await controller.GetAllExecutions());
        var data = JsonSerializer.SerializeToElement(result.Value, new JsonSerializerOptions(JsonSerializerDefaults.Web)).GetProperty("data");
        Assert.Single(data.EnumerateArray());
        Assert.Equal("COMPLETED", data[0].GetProperty("status").GetString());
        Assert.Equal(task.Id.ToString(), data[0].GetProperty("originalTaskId").GetString());
        Assert.IsType<NotFoundResult>(await controller.GetReport(another.Id, record.Id));
        Assert.IsType<OkObjectResult>(await controller.GetReport(task.Id, record.Id));
    }

    private static EdgeDbContext Database() => new(new DbContextOptionsBuilder<EdgeDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options) { SuppressSyncQueue = true };

    [Fact]
    public async Task TwoCycles_KeepTaskIdentityAndFreezeReportsBeforeReset()
    {
        await using var db = Database();
        var now = new DateTime(2026, 10, 1, 10, 0, 0, DateTimeKind.Utc);
        var asset = new EquipmentAsset { AssetCode = "ME", AssetName = "Main engine", Category = "ENGINE", CurrentRunningHours = 100 };
        var schedule = new MaintenanceSchedule { ScheduleCode = "CHECK", ScheduleName = "Check engine", EquipmentAssetId = asset.Id,
            MaintenanceCategory = "PERIODIC", IntervalType = "CALENDAR", IntervalDays = 30, IsActive = true, AutoGenerate = true };
        var task = new MaintenanceTask { TaskId = "STABLE-CODE", ScheduleId = schedule.Id, EquipmentAssetId = asset.Id,
            TaskType = "PERIODIC", Status = "COMPLETED", CompletedAt = now, CompletedBy = "PIC", VerifiedBy = "MASTER",
            VerifiedAt = now, Notes = "First cycle", CompletionPhotos = "[\"first.jpg\"]", ChecklistCompleted = true };
        var checklist = new TaskChecklistItem { TaskId = task.TaskId, AssetId = asset.Id, AssetCode = "ME", AssetName = "Engine",
            CheckpointDescription = "Pressure", IsCompleted = true, ReadingValue = 12, IsAbnormal = true, Remarks = "First reading" };
        db.EquipmentAssets.Add(asset); db.MaintenanceSchedules.Add(schedule); db.MaintenanceTasks.Add(task);
        db.TaskChecklistItems.Add(checklist); db.TaskRiskAssessments.Add(new() { TaskId = task.TaskId, JobName = "First assessment" });
        await db.SaveChangesAsync();
        var service = new MaintenanceCompletionService(db, new MaintenanceScheduleRepository(db),
            Mock.Of<IEquipmentAssetRepository>(), NullLogger<MaintenanceCompletionService>.Instance);
        await service.PostApprovalScheduleUpdateAsync(task);
        await db.SaveChangesAsync();
        Assert.Single(await db.MaintenanceTasks.ToListAsync());
        Assert.Equal("SCHEDULED", task.Status);
        Assert.Equal(now.AddDays(30), task.NextDueAt);
        Assert.True(await PeriodicTaskCycle.ReopenIfDueAsync(db, task, schedule, 100, now.AddDays(29)));
        Assert.Equal("UPCOMING", task.Status);
        Assert.Null(task.Notes);
        Assert.True(await PeriodicTaskCycle.ReopenIfDueAsync(db, task, schedule, 100, now.AddDays(30)));
        await db.SaveChangesAsync();
        Assert.Equal("STABLE-CODE", task.TaskId);
        Assert.Equal("DUE", task.Status); Assert.Null(task.CompletedAt); Assert.Null(task.VerifiedBy);
        Assert.Null(task.CompletionPhotos); Assert.False(checklist.IsCompleted); Assert.False(checklist.IsAbnormal);
        Assert.Null(checklist.ReadingValue); Assert.Empty(await db.TaskRiskAssessments.ToListAsync());
        var firstSnapshot = (await db.MaintenanceHistories.SingleAsync()).ReportSnapshot!;
        var first = JsonSerializer.Deserialize<JsonElement>(firstSnapshot);
        Assert.Equal("COMPLETED", first.GetProperty("task").GetProperty("status").GetString());
        Assert.Equal("First cycle", first.GetProperty("task").GetProperty("notes").GetString());
        Assert.Equal(12, first.GetProperty("checklist")[0].GetProperty("readingValue").GetDouble());
        Assert.Equal("First assessment", first.GetProperty("riskAssessment").GetProperty("jobName").GetString());
        task.Status = "COMPLETED"; task.CompletedAt = now.AddDays(30); task.Notes = "Second cycle";
        task.VerifiedBy = "MASTER"; checklist.IsCompleted = true; checklist.ReadingValue = 15;
        await service.PostApprovalScheduleUpdateAsync(task); await db.SaveChangesAsync();
        Assert.Single(await db.MaintenanceTasks.ToListAsync());
        Assert.Equal(2, await db.MaintenanceHistories.CountAsync());
        Assert.Equal(firstSnapshot, (await db.MaintenanceHistories.OrderBy(h => h.ExecutedAt).FirstAsync()).ReportSnapshot);
        Assert.Equal(now.AddDays(60), task.NextDueAt);
    }

    [Theory]
    [InlineData("RUNNING_HOURS", 199, false)]
    [InlineData("RUNNING_HOURS", 200, true)]
    [InlineData("RUNNING_HOURS", 220, true)]
    [InlineData("HYBRID", 200, true)]
    public void RunningHours_UseActualCounterInsteadOfEstimatedDate(string type, double hours, bool expected)
    {
        var schedule = new MaintenanceSchedule { IntervalType = type, NextDueRunningHours = 200,
            NextDueDate = DateTime.UtcNow.AddDays(-10), LastExecutedAt = DateTime.UtcNow,
            IntervalDays = 30 };
        Assert.Equal(expected, PeriodicTaskCycle.IsDue(schedule, hours, DateTime.UtcNow));
    }

    [Theory]
    [InlineData(1, 0)]
    [InlineData(0, 1)]
    public void Calendar_UsesMonthAndYearDeadlines(int months, int years)
    {
        var due = new DateTime(2027, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var schedule = new MaintenanceSchedule { IntervalType = "CALENDAR", IntervalMonths = months,
            IntervalYears = years, NextDueDate = due };
        Assert.False(PeriodicTaskCycle.IsDue(schedule, null, due.AddDays(-1)));
        Assert.True(PeriodicTaskCycle.IsDue(schedule, null, due));
    }

    [Fact]
    public async Task LegacyCycles_AreArchivedWithoutDeletingReportsOrOtherEquipment()
    {
        await using var db = Database();
        var schedule = new MaintenanceSchedule { ScheduleCode = "CHECK", ScheduleName = "Check", MaintenanceCategory = "PERIODIC" };
        var assetId = Guid.NewGuid();
        var old = new MaintenanceTask { TaskId = "OLD", ScheduleId = schedule.Id, EquipmentAssetId = assetId,
            Status = "COMPLETED", Notes = "Legacy report", CompletedAt = DateTime.UtcNow.AddDays(-30) };
        var current = new MaintenanceTask { TaskId = "CURRENT", ScheduleId = schedule.Id, EquipmentAssetId = assetId, Status = "SCHEDULED" };
        var other = new MaintenanceTask { TaskId = "OTHER", ScheduleId = schedule.Id, EquipmentAssetId = Guid.NewGuid(), Status = "COMPLETED" };
        db.MaintenanceSchedules.Add(schedule); db.MaintenanceTasks.AddRange(old, current, other); await db.SaveChangesAsync();
        await PeriodicTaskCycle.ConsolidateLegacyAsync(db);
        Assert.True(old.IsDeleted); Assert.False(current.IsDeleted); Assert.False(other.IsDeleted);
        Assert.Equal("Legacy report", JsonSerializer.Deserialize<JsonElement>((await db.MaintenanceHistories.SingleAsync()).ReportSnapshot!)
            .GetProperty("task").GetProperty("notes").GetString());
        await PeriodicTaskCycle.ConsolidateLegacyAsync(db);
        Assert.Single(await db.MaintenanceHistories.ToListAsync());
    }

    [Fact]
    public async Task NonPeriodicAndInactiveSchedules_DoNotReopenCompletedTasks()
    {
        await using var db = Database();
        var task = new MaintenanceTask { TaskId = "EVENT", Status = "COMPLETED" };
        var schedule = new MaintenanceSchedule { MaintenanceCategory = "ON_DEMAND", NextDueDate = DateTime.UtcNow.AddDays(-1), AutoGenerate = true };
        Assert.False(await PeriodicTaskCycle.ReopenIfDueAsync(db, task, schedule, 100, DateTime.UtcNow));
        schedule.MaintenanceCategory = "PERIODIC"; schedule.IsActive = false;
        Assert.False(await PeriodicTaskCycle.ReopenIfDueAsync(db, task, schedule, 100, DateTime.UtcNow));
        Assert.Equal("COMPLETED", task.Status);
    }
}
