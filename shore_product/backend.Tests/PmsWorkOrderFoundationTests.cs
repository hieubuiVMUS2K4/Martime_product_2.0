using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ProductApi.Data;
using ProductApi.Models;
using Xunit;

namespace ProductApi.Tests;

public class PmsWorkOrderFoundationTests
{
    [Theory]
    [InlineData("20261025160000_AddPmsWorkOrderFoundation")]
    [InlineData("20261025170000_FreezeWorkOrderWarningWindows")]
    [InlineData("20261025180000_AddPmsWorkOrderWorkflow")]
    [InlineData("20261026090000_AddPmsAdHocOrderDrafts")]
    public void ReworkMigrationsTargetTheExistingPhysicalWorkOrderTable(string id)
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=127.0.0.1;Database=unused;Username=unused;Password=unused").Options);
        var table = db.Model.FindEntityType(typeof(MaintenanceTask))!.GetTableName();
        Assert.Equal("MaintenanceTasks", table);
        var assembly = db.GetService<IMigrationsAssembly>();
        var migration = assembly.CreateMigration(assembly.Migrations[id], "Npgsql.EntityFrameworkCore.PostgreSQL");
        var sql = string.Join("\n", db.GetService<IMigrationsSqlGenerator>().Generate(migration.UpOperations, db.Model).Select(c => c.CommandText));
        Assert.Contains("public.\"" + table + "\"", sql);
        Assert.DoesNotContain("public.maintenance_tasks", sql);
    }
    [Fact]
    public void MirrorPreservesProtocolIdentityDeadlinesAndSnapshot()
    {
        var task = new MaintenanceTask { PmsProtocolVersion = 2, WorkOrderCode = "WO-2026-000001", CycleKey = "PERIODIC:1", JobVersion = 3,
            JobSnapshot = "{\"version\":2}", WorkOrderDueHours = 1200, DueState = "UPCOMING", ReportRevision = 2,
            WorkOrderWarningDays = 7, WorkOrderWarningHours = 50, WorkflowVersion = 8,
            SupportingCrewIds = "[\"PIC-2\"]", ExecutionActors = "[{\"userId\":12,\"crewId\":\"PIC\"}]", ExecutionStartedHours = 1000 };
        var result = JsonSerializer.Deserialize<MaintenanceTask>(JsonSerializer.Serialize(task))!;
        Assert.Equal(2, result.PmsProtocolVersion); Assert.Equal(task.CycleKey, result.CycleKey);
        Assert.Equal(task.WorkOrderCode, result.WorkOrderCode);
        Assert.Equal(task.JobSnapshot, result.JobSnapshot); Assert.Equal(1200d, result.WorkOrderDueHours);
        Assert.Null(result.WorkOrderDueAt); Assert.Equal(2, result.ReportRevision);
        Assert.Equal(7, result.WorkOrderWarningDays); Assert.Equal(50d, result.WorkOrderWarningHours);
        Assert.Equal(8, result.WorkflowVersion); Assert.Equal(task.SupportingCrewIds, result.SupportingCrewIds);
        Assert.Equal(task.ExecutionActors, result.ExecutionActors); Assert.Equal(1000d, result.ExecutionStartedHours);
        var job = JsonSerializer.Deserialize<MaintenanceSchedule>(JsonSerializer.Serialize(new MaintenanceSchedule
        { ResponsibleRankId = 12, BaselineRunningHours = 100, WarningHours = 50, JobState = "NEEDS_INFORMATION", NextCycleNumber = 2,
            CycleReleaseAttempt = 2, SkippedCycleAt = DateTime.UtcNow, SkippedCycleHours = 1200 }))!;
        Assert.Equal(12, job.ResponsibleRankId); Assert.Equal(50d, job.WarningHours); Assert.Equal(2L, job.NextCycleNumber);
        Assert.Equal(2, job.CycleReleaseAttempt); Assert.NotNull(job.SkippedCycleAt); Assert.Equal(1200d, job.SkippedCycleHours);
    }

    [Fact]
    public void ShoreMigrationUsesExistingPascalCaseIdentityColumnsAndVesselScope()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=127.0.0.1;Database=unused;Username=unused;Password=unused").Options);
        var migrations = db.GetService<IMigrationsAssembly>();
        var migration = migrations.CreateMigration(migrations.Migrations["20261025160000_AddPmsWorkOrderFoundation"], "Npgsql.EntityFrameworkCore.PostgreSQL");
        var sql = string.Join("\n", db.GetService<IMigrationsSqlGenerator>().Generate(migration.UpOperations, db.Model).Select(c => c.CommandText));
        Assert.Contains("\"VesselId\", \"ScheduleId\", cycle_key", sql);
        Assert.Contains("cycle_key IS NOT NULL", sql); Assert.DoesNotContain("DELETE FROM", sql);
        var index = db.Model.FindEntityType(typeof(MaintenanceTask))!.GetIndexes()
            .Single(i => i.GetDatabaseName() == "ux_pms_work_order_cycle");
        Assert.Equal(new[] { "VesselId", "ScheduleId", "CycleKey" }, index.Properties.Select(p => p.Name));
        Assert.True(index.IsUnique);
    }

    [Fact]
    public void WorkflowMirrorSupportsReportsWithoutJobAndPreservesSignedContent()
    {
        var original = new PmsWorkOrderReport { WorkOrderId = Guid.NewGuid(), Revision = 2, SnapshotJson = "{\"schemaVersion\":2}",
            ContentHash = "frozen-hash", SubmittedAt = DateTime.UtcNow, DueHours = 1000, ExecutedRunningHours = 1001,
            DurationMinutes = 90, Decision = "APPROVED", ApprovalEvidenceJson = "{\"actionId\":\"signed-action\"}" };
        var report = JsonSerializer.Deserialize<PmsWorkOrderReport>(JsonSerializer.Serialize(original))!;
        Assert.Null(report.JobId); Assert.Equal(original.SnapshotJson, report.SnapshotJson);
        Assert.Equal(original.ApprovalEvidenceJson, report.ApprovalEvidenceJson); Assert.Equal(1001d, report.ExecutedRunningHours);
        Assert.Equal(90, report.DurationMinutes); Assert.Null(report.DueAt);
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=127.0.0.1;Database=unused;Username=unused;Password=unused").Options);
        var migrations = db.GetService<IMigrationsAssembly>();
        var migration = migrations.CreateMigration(migrations.Migrations["20261025180000_AddPmsWorkOrderWorkflow"], "Npgsql.EntityFrameworkCore.PostgreSQL");
        var sql = string.Join("\n", db.GetService<IMigrationsSqlGenerator>().Generate(migration.UpOperations, db.Model).Select(c => c.CommandText));
        Assert.Contains("REFERENCES public.\"MaintenanceTasks\" (\"Id\")", sql);
        Assert.Contains("REFERENCES public.maintenance_schedules (\"Id\")", sql);
        Assert.Contains("ux_pms_report_command", sql); Assert.Contains("ux_pms_material_posting", sql);
        Assert.True(db.Model.FindEntityType(typeof(PmsWorkOrderReport))!.FindProperty(nameof(PmsWorkOrderReport.JobId))!.IsNullable);
    }

    [Fact]
    public void AdHocCreationIdentityIsScopedByVesselAndOrigin_AndRetainedInMirror()
    {
        var task = new MaintenanceTask { CreationCommandId = Guid.NewGuid(), CreationCommandHash = "original-command",
            CreatedByUserId = 123, WorkOrderInstructions = "Inspect impeller", PmsProtocolVersion = 2 };
        var copy = JsonSerializer.Deserialize<MaintenanceTask>(JsonSerializer.Serialize(task))!;
        Assert.Equal(task.CreationCommandId, copy.CreationCommandId); Assert.Equal(task.CreationCommandHash, copy.CreationCommandHash);
        Assert.Equal(123L, copy.CreatedByUserId); Assert.Equal(task.WorkOrderInstructions, copy.WorkOrderInstructions);
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=127.0.0.1;Database=unused;Username=unused;Password=unused").Options);
        var migrations = db.GetService<IMigrationsAssembly>();
        var migration = migrations.CreateMigration(migrations.Migrations["20261026090000_AddPmsAdHocOrderDrafts"], "Npgsql.EntityFrameworkCore.PostgreSQL");
        var sql = string.Join("\n", db.GetService<IMigrationsSqlGenerator>().Generate(migration.UpOperations, db.Model).Select(c => c.CommandText));
        Assert.Contains("\"VesselId\", \"OriginNode\", creation_command_id", sql);
        var index = db.Model.FindEntityType(typeof(MaintenanceTask))!.GetIndexes().Single(i => i.GetDatabaseName() == "ux_pms_work_order_creation");
        Assert.True(index.IsUnique); Assert.Equal(new[] { "VesselId", "OriginNode", "CreationCommandId" }, index.Properties.Select(p => p.Name));
    }
}
