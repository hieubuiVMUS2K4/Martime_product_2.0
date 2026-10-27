using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Npgsql;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

public class PmsWorkOrderMigrationTests
{
    [PmsPostgresFact]
    public async Task CancelledCycleMigrationPreservesLegacyAndBlocksLossyRollback()
    {
        var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("PMS_TEST_CONNECTION_STRING"));
        if (connection.Database?.StartsWith("codex_pms_tests_", StringComparison.Ordinal) != true) throw new InvalidOperationException("Test database required");
        connection.Database += "_resolution_" + Guid.NewGuid().ToString("N")[..8];
        await using var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>().UseNpgsql(connection.ConnectionString).Options);
        try
        {
            await db.Database.EnsureCreatedAsync();
            var migrations = db.GetService<IMigrationsAssembly>();
            var migration = migrations.CreateMigration(migrations.Migrations["20261027160000_AddPmsCancelledCycleResolution"], "Npgsql.EntityFrameworkCore.PostgreSQL");
            async Task Run(IReadOnlyList<MigrationOperation> operations)
            {
                foreach (var command in db.GetService<IMigrationsSqlGenerator>().Generate(operations, db.Model))
                    await db.Database.ExecuteSqlRawAsync(command.CommandText);
            }
            var job = new MaintenanceSchedule { ScheduleCode = "LEGACY-RESOLUTION", ScheduleName = "Existing Job", LastExecutedAt = DateTime.UtcNow };
            db.Add(job); await db.SaveChangesAsync();
            var last = job.LastExecutedAt;
            await Run(migration.DownOperations); await Run(migration.UpOperations); db.ChangeTracker.Clear();
            job = await db.MaintenanceSchedules.SingleAsync();
            Assert.Equal(last!.Value.Ticks / 10, job.LastExecutedAt!.Value.Ticks / 10);
            Assert.Null(job.CycleReleaseAttempt); Assert.Null(job.SkippedCycleAt); Assert.Null(job.SkippedCycleHours);
            job.CycleReleaseAttempt = 1; job.SkippedCycleHours = 300; await db.SaveChangesAsync();
            Assert.Contains("PMS cycle resolution data exists", (await Assert.ThrowsAsync<PostgresException>(() => Run(migration.DownOperations))).MessageText);
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [PmsPostgresFact]
    public async Task MigrationRoundTripPreservesLegacyReportAndRejectsDuplicateCycles()
    {
        var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("PMS_TEST_CONNECTION_STRING"));
        if (connection.Database?.StartsWith("codex_pms_tests_", StringComparison.Ordinal) != true)
            throw new InvalidOperationException("A disposable codex_pms_tests_* database is required.");
        connection.Database += "_wo_" + Guid.NewGuid().ToString("N")[..8];
        await using var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>().UseNpgsql(connection.ConnectionString).Options);
        try
        {
            await db.Database.EnsureCreatedAsync();
            var migrations = db.GetService<IMigrationsAssembly>();
            var migration = migrations.CreateMigration(migrations.Migrations["20261025160000_AddPmsWorkOrderFoundation"], "Npgsql.EntityFrameworkCore.PostgreSQL");
            var warnings = migrations.CreateMigration(migrations.Migrations["20261025170000_FreezeWorkOrderWarningWindows"], "Npgsql.EntityFrameworkCore.PostgreSQL");
            var workflow = migrations.CreateMigration(migrations.Migrations["20261025180000_AddPmsWorkOrderWorkflow"], "Npgsql.EntityFrameworkCore.PostgreSQL");
            var adHoc = migrations.CreateMigration(migrations.Migrations["20261026090000_AddPmsAdHocOrderDrafts"], "Npgsql.EntityFrameworkCore.PostgreSQL");
            async Task Run(IReadOnlyList<MigrationOperation> operations)
            {
                foreach (var command in db.GetService<IMigrationsSqlGenerator>().Generate(operations, db.Model))
                    await db.Database.ExecuteSqlRawAsync(command.CommandText);
            }
            var job = new MaintenanceSchedule { ScheduleCode = "LEGACY", ScheduleName = "Legacy definition" };
            var task = new MaintenanceTask { TaskId = "LEGACY-WO", ScheduleId = job.Id, Status = "COMPLETED", Notes = "Immutable legacy result" };
            db.AddRange(job, task); await db.SaveChangesAsync();
            await Run(adHoc.DownOperations);
            await Run(workflow.DownOperations);
            await Run(warnings.DownOperations);
            await Run(migration.DownOperations); // Reconstruct precisely the pre-foundation columns.
            await Run(migration.UpOperations);
            await Run(warnings.UpOperations);
            await Run(workflow.UpOperations);
            await Run(adHoc.UpOperations);
            db.ChangeTracker.Clear();
            var retained = await db.MaintenanceTasks.SingleAsync(t => t.Id == task.Id);
            Assert.Null(retained.PmsProtocolVersion); Assert.Null(retained.CycleKey);
            Assert.Equal("COMPLETED", retained.Status); Assert.Equal("Immutable legacy result", retained.Notes);
            db.MaintenanceTasks.Add(new MaintenanceTask { ScheduleId = job.Id, TaskId = "NEW-1", CycleKey = "PERIODIC:1", PmsProtocolVersion = 2 });
            await db.SaveChangesAsync();
            db.MaintenanceTasks.Add(new MaintenanceTask { ScheduleId = job.Id, TaskId = "NEW-2", CycleKey = "PERIODIC:1", PmsProtocolVersion = 2 });
            var error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            Assert.Equal(PostgresErrorCodes.UniqueViolation, Assert.IsType<PostgresException>(error.InnerException).SqlState);
            db.ChangeTracker.Clear();
            var rollback = await Assert.ThrowsAsync<PostgresException>(() => Run(migration.DownOperations));
            Assert.Contains("PMS rework data exists", rollback.MessageText);
            await Assert.ThrowsAsync<PostgresException>(() => Run(warnings.DownOperations));
            Assert.Equal(2, await db.MaintenanceTasks.CountAsync());
            var protocolOrder = await db.MaintenanceTasks.SingleAsync(t => t.TaskId == "NEW-1");
            var report = new PmsWorkOrderReport { WorkOrderId = protocolOrder.Id, JobId = job.Id, Revision = 1,
                SubmitCommandId = Guid.NewGuid(), SnapshotJson = "{}", ContentHash = "hash", CommandHash = "command",
                SubmittedByCrewId = "crew", SubmittedAt = DateTime.UtcNow };
            db.PmsWorkOrderReports.Add(report); await db.SaveChangesAsync();
            var workflowRollback = await Assert.ThrowsAsync<PostgresException>(() => Run(workflow.DownOperations));
            Assert.Contains("PMS workflow reports exist", workflowRollback.MessageText);
            Assert.Equal(report.SnapshotJson, (await db.PmsWorkOrderReports.AsNoTracking().SingleAsync()).SnapshotJson);
            protocolOrder.CreationCommandId = Guid.NewGuid(); protocolOrder.CreationCommandHash = "original-command";
            await db.SaveChangesAsync();
            var adHocRollback = await Assert.ThrowsAsync<PostgresException>(() => Run(adHoc.DownOperations));
            Assert.Contains("PMS ad-hoc data exists", adHocRollback.MessageText);
            db.MaintenanceTasks.Add(new() { TaskId = "DUPLICATE-COMMAND", OriginNode = protocolOrder.OriginNode,
                PmsProtocolVersion = 2, CreationCommandId = protocolOrder.CreationCommandId });
            var duplicateCommand = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
            Assert.Equal(PostgresErrorCodes.UniqueViolation, Assert.IsType<PostgresException>(duplicateCommand.InnerException).SqlState);
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }
}
