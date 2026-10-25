using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Npgsql;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

public sealed class EdgePostgresFactAttribute : FactAttribute
{
    public EdgePostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("EDGE_MIGRATION_TEST_CONNECTION_STRING")) &&
            string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("PMS_TEST_CONNECTION_STRING")))
            Skip = "Requires a disposable Edge copy or an isolated codex_pms_tests_* PostgreSQL database.";
    }
}

/// <summary>
/// Chạy migration gộp tài liệu trên một BẢN SAO cơ sở dữ liệu tàu (PostgreSQL thật, có dữ liệu):
/// Up thay 4 bảng cũ bằng crew_member_documents, Down trả lại 4 bảng cũ.
/// </summary>
public class MergeCrewMemberDocumentsMigrationTests
{
    [EdgePostgresFact]
    public async Task MergeDocumentsMigration_UpThenDown_OnRealEdgeSchema()
    {
        var connection = Environment.GetEnvironmentVariable("EDGE_MIGRATION_TEST_CONNECTION_STRING");
        var createFixture = string.IsNullOrWhiteSpace(connection);
        if (createFixture)
        {
            var builder = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("PMS_TEST_CONNECTION_STRING"));
            if (builder.Database?.StartsWith("codex_pms_tests_", StringComparison.Ordinal) != true)
                throw new InvalidOperationException("An isolated codex_pms_tests_* database is required.");
            builder.Database += "_documents_" + Guid.NewGuid().ToString("N")[..8];
            connection = builder.ConnectionString;
        }
        await using var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>().UseNpgsql(connection).Options);
        var migrations = db.GetService<IMigrationsAssembly>();
        var migration = migrations.CreateMigration(migrations.Migrations["20261008100000_MergeCrewMemberDocuments"], "Npgsql.EntityFrameworkCore.PostgreSQL");
        var generator = db.GetService<IMigrationsSqlGenerator>();
        async Task Run(IReadOnlyList<MigrationOperation> ops)
        {
            foreach (var command in generator.Generate(ops, db.Model)) await db.Database.ExecuteSqlRawAsync(command.CommandText);
        }
        async Task<List<string>> Tables() => await db.Database
            .SqlQueryRaw<string>("SELECT table_name AS \"Value\" FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('travel_documents','seafarer_documents','employment_documents','health_documents','crew_member_documents')")
            .ToListAsync();

        try
        {
            if (createFixture)
            {
                await db.Database.EnsureCreatedAsync();
                // Reconstruct the pre-migration tables against the actual current Edge schema.
                await Run(migration.DownOperations);
            }
            Assert.Equivalent(new[] { "travel_documents", "seafarer_documents", "employment_documents", "health_documents" }, await Tables());
            await Run(migration.UpOperations);
            Assert.Equal(["crew_member_documents"], await Tables());
            await Run(migration.DownOperations);
            Assert.Equivalent(new[] { "travel_documents", "seafarer_documents", "employment_documents", "health_documents" }, await Tables());
        }
        finally
        {
            if (createFixture) await db.Database.EnsureDeletedAsync();
        }
    }
}
