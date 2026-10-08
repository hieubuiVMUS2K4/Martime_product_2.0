using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

public sealed class EdgePostgresFactAttribute : FactAttribute
{
    public EdgePostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("EDGE_MIGRATION_TEST_CONNECTION_STRING")))
            Skip = "Requires EDGE_MIGRATION_TEST_CONNECTION_STRING pointing at a disposable copy of the edge database.";
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
        var connection = Environment.GetEnvironmentVariable("EDGE_MIGRATION_TEST_CONNECTION_STRING")!;
        await using var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>().UseNpgsql(connection).Options);
        var migrations = db.GetService<IMigrationsAssembly>();
        var migration = migrations.CreateMigration(migrations.Migrations["20261008100000_MergeCrewMemberDocuments"], "Npgsql.EntityFrameworkCore.PostgreSQL");
        var generator = db.GetService<IMigrationsSqlGenerator>();
        async Task Run(IReadOnlyList<MigrationOperation> ops)
        {
            foreach (var command in generator.Generate(ops, db.Model)) await db.Database.ExecuteSqlRawAsync(command.CommandText);
        }
        async Task<List<string>> Tables() => await db.Database
            .SqlQueryRaw<string>("SELECT table_name AS \"Value\" FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%documents' AND table_name NOT LIKE 'hsqe%' AND table_name NOT LIKE 'sms%'")
            .ToListAsync();

        Assert.Equivalent(new[] { "travel_documents", "seafarer_documents", "employment_documents", "health_documents" }, await Tables());
        await Run(migration.UpOperations);
        Assert.Equal(["crew_member_documents"], await Tables());
        await Run(migration.DownOperations);
        Assert.Equivalent(new[] { "travel_documents", "seafarer_documents", "employment_documents", "health_documents" }, await Tables());
    }
}
