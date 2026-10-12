using Maritime.Shared.DTOs.Crew;
using Maritime.Shared.Models.Documents;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using ProductApi.Services.Crew;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

/// <summary>
/// Tài liệu định danh + sức khoẻ gộp vào một bảng crew_member_documents (phân nhóm theo Category).
/// Kiểm: lưu đúng nhóm, đọc theo nhóm, gửi xuống ĐÚNG tàu của thuyền viên qua gói crew_member_document.
/// </summary>
public partial class SyncReliabilityTests
{
    private static CrewService CrewSvc(ProductApi.Data.AppDbContext db) => new(db, NullLogger<CrewService>.Instance, Outbox(db));

    [ShorePostgresFact]
    public async Task CrewDocument_AddUpdateDelete_GoesOnlyToTheCrewsShip()
    {
        await using var db = await Database();
        var vesselA = await BindNode(db, "edge-a"); await BindNode(db, "edge-b");
        var crew = await Crew(db, vesselA, "A");
        var svc = CrewSvc(db);

        var added = await svc.AddCrewDocumentAsync(crew.Id, new CreateIdentityDocumentDto { Category = "travel", DocumentType = "passport", DocumentNumber = "P-1" });
        await svc.UpdateCrewDocumentAsync(crew.Id, added.Id, new CreateIdentityDocumentDto { Category = "travel", DocumentType = "passport", DocumentNumber = "P-2" });
        Assert.True(await svc.DeleteCrewDocumentAsync(crew.Id, added.Id, "travel"));

        var rows = await db.SyncOutbox.Where(o => o.TableName == CrewMemberDocument.SyncTable).ToListAsync();
        Assert.NotEmpty(rows);
        Assert.All(rows, o => Assert.Equal("edge-a", o.TargetNode));
        Assert.Empty(await db.CrewMemberDocuments.ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task CrewDocument_IsStoredInOneTable_ByCategory_AndHealthHasNoCountry()
    {
        await using var db = await Database();
        var crew = await Crew(db, null, "POOL");
        db.Countries.Add(new Maritime.Shared.Models.Crew.Country { CountryCode = "VN", CountryName = "Vietnam" });
        await db.SaveChangesAsync();
        var countryId = await db.Countries.Select(c => c.Id).FirstAsync();
        var svc = CrewSvc(db);

        foreach (var category in CrewDocumentCategory.All)
            await svc.AddCrewDocumentAsync(crew.Id, new CreateIdentityDocumentDto { Category = category, DocumentType = "t", DocumentNumber = category, CountryId = countryId });

        Assert.Equal(4, await db.CrewMemberDocuments.CountAsync());
        Assert.Null((await db.CrewMemberDocuments.SingleAsync(d => d.Category == CrewDocumentCategory.Health)).CountryId);
        Assert.Equal(countryId, (await db.CrewMemberDocuments.SingleAsync(d => d.Category == CrewDocumentCategory.Travel)).CountryId);
        Assert.Equal(["seafarer"], (await svc.GetCrewDocumentsAsync(crew.Id, "SEAFARER")).Select(d => d.DocumentNumber));
        Assert.Empty(await svc.GetCrewDocumentsAsync(crew.Id, "certificate"));
        // Thuyền viên danh bạ chung (chưa thuộc tàu): không gửi đi đâu
        Assert.Empty(await db.SyncOutbox.Where(o => o.TableName == CrewMemberDocument.SyncTable).ToListAsync());
        await Assert.ThrowsAsync<ArgumentException>(() => svc.AddCrewDocumentAsync(crew.Id, new CreateIdentityDocumentDto { Category = "unknown", DocumentType = "t", DocumentNumber = "x" }));
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task MergeDocumentsMigration_ReplacesTheFourOldTables_AndCanBeRolledBack()
    {
        await using var db = await Database();
        var migrations = db.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrationsAssembly>();
        var migration = migrations.CreateMigration(migrations.Migrations["20261008100000_MergeCrewMemberDocuments"], "Npgsql.EntityFrameworkCore.PostgreSQL");
        var generator = db.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrationsSqlGenerator>();
        async Task Run(IReadOnlyList<Microsoft.EntityFrameworkCore.Migrations.Operations.MigrationOperation> ops)
        {
            foreach (var command in generator.Generate(ops, db.Model)) await db.Database.ExecuteSqlRawAsync(command.CommandText);
        }
        async Task<List<string>> Tables() => await db.Database
            .SqlQueryRaw<string>("SELECT table_name AS \"Value\" FROM information_schema.tables WHERE table_name LIKE '%documents' AND table_schema = 'public'")
            .ToListAsync();

        // Đưa CSDL về trạng thái trước migration: 4 bảng cũ, chưa có bảng gộp.
        await Run(migration.DownOperations);
        Assert.Equivalent(new[] { "travel_documents", "seafarer_documents", "employment_documents", "health_documents" }, await Tables());

        await Run(migration.UpOperations);
        Assert.Equal(["crew_member_documents"], await Tables());
        await db.Database.EnsureDeletedAsync();
    }
}
