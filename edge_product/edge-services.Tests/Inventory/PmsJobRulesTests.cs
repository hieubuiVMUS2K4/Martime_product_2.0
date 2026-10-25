using MaritimeEdge.Models;
using MaritimeEdge.Services.Maintenance;
using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

public class PmsJobRulesTests
{
    private static MaintenanceSchedule Job(string interval = "CALENDAR") => new()
    {
        ScheduleCode = "PUMP-3M", ScheduleName = "Fire pump maintenance", EquipmentAssetId = Guid.NewGuid(),
        IntervalType = interval, IntervalMonths = interval == "RUNNING_HOURS" ? null : 3,
        IntervalHours = interval == "CALENDAR" ? null : 1000, BaselineAt = new DateTime(2026, 7, 25, 0, 0, 0, DateTimeKind.Utc),
        BaselineRunningHours = 100, DaysBeforeDue = 7, WarningHours = 50, AutoGenerate = false
    };

    [Fact]
    public void SaveWithoutBaselineNeedsInformation_AndDoesNotInventExecution()
    {
        var job = Job(); job.BaselineAt = null;
        PmsJobRules.PrepareForSave(job);
        Assert.Equal(PmsJobRules.NeedsInformation, job.JobState); Assert.False(job.IsActive);
        Assert.Null(job.LastExecutedAt); Assert.Null(job.NextDueDate);
        job.BaselineAt = new DateTime(2026, 7, 25, 0, 0, 0, DateTimeKind.Utc);
        PmsJobRules.PrepareForSave(job);
        Assert.Equal(PmsJobRules.Active, job.JobState); Assert.True(job.IsActive);
        Assert.Equal(new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc), job.NextDueDate);
        Assert.Null(job.LastExecutedAt); Assert.False(job.AutoGenerate);
    }

    [Fact]
    public void SavingPausedJobDoesNotResumeIt_AndGroupJobsCannotBecomeActive()
    {
        var job = Job(); job.JobState = PmsJobRules.Paused;
        PmsJobRules.PrepareForSave(job); Assert.Equal(PmsJobRules.Paused, job.JobState); Assert.False(job.IsActive);
        job.JobState = null; job.EquipmentGroupId = Guid.NewGuid();
        PmsJobRules.PrepareForSave(job); Assert.Equal(PmsJobRules.NeedsInformation, job.JobState);
    }

    [Theory]
    [InlineData(1, "2026-02-28")]
    [InlineData(2, "2026-03-31")]
    public void CalendarUsesRealMonths(int months, string expected)
    {
        var job = Job(); job.BaselineAt = new DateTime(2026, 1, 31, 0, 0, 0, DateTimeKind.Utc); job.IntervalMonths = months;
        PmsJobRules.PrepareForSave(job);
        Assert.Equal(expected, job.NextDueDate!.Value.ToString("yyyy-MM-dd"));
    }

    [Fact]
    public void HybridRequiresBothBaselinesAndUsesSeparateWarningUnits()
    {
        var job = Job("HYBRID"); job.BaselineRunningHours = null;
        PmsJobRules.PrepareForSave(job); Assert.Equal(PmsJobRules.NeedsInformation, job.JobState);
        job.BaselineRunningHours = 100; job.AutoGenerate = true;
        PmsJobRules.PrepareForSave(job);
        var now = new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc);
        Assert.Equal("UPCOMING", PmsJobRules.DueState(job.NextDueDate, job.NextDueRunningHours, 1050, now, TimeZoneInfo.Utc, 7, 50));
        Assert.Equal("NOT_DUE", PmsJobRules.DueState(job.NextDueDate, job.NextDueRunningHours, 1049, now, TimeZoneInfo.Utc, 7, 50));
        Assert.True(PmsJobRules.CanAutoRelease(job, "UPCOMING"));
        job.ReleasePolicy = "ON_DUE"; Assert.False(PmsJobRules.CanAutoRelease(job, "UPCOMING"));
    }

    [Fact]
    public void CalendarDueUsesVesselDay_NotHostOrUtcDay()
    {
        var tz = TimeZoneInfo.CreateCustomTimeZone("Ship", TimeSpan.FromHours(7), "Ship", "Ship");
        var due = new DateTime(2026, 10, 24, 17, 0, 0, DateTimeKind.Utc);
        Assert.Equal("DUE", PmsJobRules.DueState(due, null, null, due.AddHours(1), tz, 7, 50));
        Assert.Equal("OVERDUE", PmsJobRules.DueState(due, null, null, due.AddDays(1), tz, 7, 50));
        Assert.Equal("NO_DEADLINE", PmsJobRules.DueState(null, 200, null, due, tz, 7, 50));
    }

    [Theory]
    [InlineData(199, "UPCOMING")]
    [InlineData(200, "DUE")]
    [InlineData(200.01, "OVERDUE")]
    public void RunningHoursNeverUseEstimatedDatesOrOverdueGrace(double counter, string expected) =>
        Assert.Equal(expected, PmsJobRules.DueState(null, 200, counter, DateTime.UtcNow, TimeZoneInfo.Utc, 7, 50));

    [Fact]
    public void ApprovalAdvancesBothHybridBaselinesFromApprovedSubmission_LeavesOrderUntouched()
    {
        var job = Job("HYBRID"); PmsJobRules.PrepareForSave(job);
        var key = PmsJobRules.CycleKey(job);
        PmsJobRules.PrepareForSave(job); Assert.Equal(key, PmsJobRules.CycleKey(job));
        var submitted = new DateTime(2026, 10, 23, 8, 0, 0, DateTimeKind.Utc);
        var order = new MaintenanceTask { ScheduleId = job.Id, PmsProtocolVersion = 2, CycleKey = key,
            Status = "COMPLETED", SubmittedAt = submitted, CompletedAt = submitted.AddDays(4), ActualRunningHours = 1075, Notes = "Retained report" };
        PmsJobRules.ApplyApprovedExecution(job, order);
        Assert.Equal(submitted.AddMonths(3), job.NextDueDate); Assert.Equal(2075d, job.NextDueRunningHours);
        Assert.Equal("COMPLETED", order.Status); Assert.Equal("Retained report", order.Notes);
        Assert.Equal(submitted.AddDays(4), order.CompletedAt); Assert.Equal(2L, job.NextCycleNumber);
        Assert.Throws<InvalidOperationException>(() => PmsJobRules.ApplyApprovedExecution(job, order));
    }

    [Theory]
    [InlineData("PENDING_APPROVAL")]
    [InlineData("CANCELLED")]
    [InlineData("RECTIFY")]
    public void UnapprovedOrdersCannotAdvanceJob(string status)
    {
        var job = Job(); PmsJobRules.PrepareForSave(job);
        var order = new MaintenanceTask { PmsProtocolVersion = 2, ScheduleId = job.Id, CycleKey = PmsJobRules.CycleKey(job), Status = status };
        Assert.Throws<InvalidOperationException>(() => PmsJobRules.ApplyApprovedExecution(job, order));
        Assert.Null(job.LastExecutedAt); Assert.Equal(1L, job.NextCycleNumber);
    }

    [Fact]
    public async Task LegacyWorkerCannotReopenOrArchiveProtocolTwoReports()
    {
        await using var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var job = Job(); job.AutoGenerate = true; PmsJobRules.PrepareForSave(job);
        var completed = new MaintenanceTask { TaskId = "WO-1", ScheduleId = job.Id, PmsProtocolVersion = 2,
            CycleKey = "PERIODIC:1", Status = "COMPLETED", CompletedAt = DateTime.UtcNow, Notes = "Signed report" };
        var next = new MaintenanceTask { TaskId = "WO-2", ScheduleId = job.Id, PmsProtocolVersion = 2,
            CycleKey = "PERIODIC:2", Status = "IN_PROGRESS" };
        db.AddRange(job, completed, next); await db.SaveChangesAsync();
        Assert.False(await PeriodicTaskCycle.ReopenIfDueAsync(db, completed, job, 50000, DateTime.UtcNow.AddYears(1), true));
        Assert.Equal(0, await new MaintenanceCycleUpdater(db).RefreshAsync(DateTime.UtcNow.AddYears(1)));
        await PeriodicTaskCycle.ConsolidateLegacyAsync(db);
        Assert.False(completed.IsDeleted); Assert.Equal("COMPLETED", completed.Status);
        Assert.Equal("Signed report", completed.Notes); Assert.Empty(await db.MaintenanceHistories.ToListAsync());
    }

    [Fact]
    public void FoundationMigrationIsAdditiveAndKeepsLegacyCycleKeysNull()
    {
        using var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>()
            .UseNpgsql("Host=127.0.0.1;Database=unused;Username=unused;Password=unused").Options);
        var sql = db.GetService<IMigrator>().GenerateScript("20261008100000_MergeCrewMemberDocuments",
            "20261025160000_AddPmsWorkOrderFoundation");
        Assert.Contains("cycle_key", sql); Assert.Contains("CREATE UNIQUE INDEX", sql);
        Assert.Contains("cycle_key IS NOT NULL", sql); Assert.Contains("job_snapshot", sql);
        Assert.DoesNotContain("UPDATE maintenance_tasks", sql);
        Assert.DoesNotContain("DELETE FROM", sql);
        Assert.DoesNotContain("DEFAULT", sql.Split("ALTER TABLE")[1]);
        var index = db.Model.FindEntityType(typeof(MaintenanceTask))!.GetIndexes()
            .Single(i => i.GetDatabaseName() == "ux_pms_work_order_cycle");
        Assert.True(index.IsUnique); Assert.Equal("cycle_key IS NOT NULL", index.GetFilter());
    }
}
