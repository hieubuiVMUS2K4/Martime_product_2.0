using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Npgsql;
using ProductApi.Controllers.Materials;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

public sealed class ShorePostgresFactAttribute : FactAttribute
{
    public ShorePostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SHORE_PMS_TEST_CONNECTION_STRING")))
            Skip = "Requires an isolated codex_pms_tests_* PostgreSQL database.";
    }
}

public class MaterialCatalogImportTests
{
    private static AppDbContext Database()
    {
        var connection = Environment.GetEnvironmentVariable("SHORE_PMS_TEST_CONNECTION_STRING")!;
        if (new NpgsqlConnectionStringBuilder(connection).Database?.StartsWith("codex_pms_tests_", StringComparison.Ordinal) != true)
            throw new InvalidOperationException("Only isolated codex_pms_tests_* databases are permitted.");
        return new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection).Options);
    }

    private static string Code() => Guid.NewGuid().ToString("N");

    [ShorePostgresFact]
    public async Task Import_CreatesUpdatesAndEnqueuesCatalog_WithoutCreatingShipStock()
    {
        await using var context = Database();
        await context.Database.EnsureCreatedAsync();
        var category = new MaterialCategory { CategoryCode = Code(), Name = "Category" };
        context.MaterialCategories.Add(category);
        await context.SaveChangesAsync();
        var existing = new MaterialItem { ItemCode = Code(), Name = "Old", CategoryId = category.Id };
        context.MaterialItems.Add(existing);
        await context.SaveChangesAsync();
        var code = Code();
        var outbox = new SyncOutboxService(context, NullLogger<SyncOutboxService>.Instance, Mock.Of<ISyncFileStorageService>());
        var controller = new MaterialController(context, outbox);
        Assert.IsType<OkObjectResult>(await controller.ImportCatalog([
            new() { ItemCode = code, Name = "New", CategoryCode = category.CategoryCode, UnitPrice = 100 },
            new() { ItemCode = existing.ItemCode, Name = "Updated", CategoryCode = category.CategoryCode, UnitPrice = 200 }
        ]));
        context.ChangeTracker.Clear();
        var created = await context.MaterialItems.SingleAsync(i => i.ItemCode == code);
        Assert.Equal(100m, created.UnitPrice);
        Assert.Equal("Updated", (await context.MaterialItems.FindAsync(existing.Id))!.Name);
        Assert.Equal(2, await context.SyncOutbox.CountAsync(o => o.TableName == "material_item_catalog" && (o.RecordKey == created.Id.ToString() || o.RecordKey == existing.Id.ToString())));
        Assert.False(await context.MaterialItemShips.AnyAsync(i => i.MaterialItemCode == code));
    }

    [ShorePostgresFact]
    public async Task Import_InvalidRow_RejectsWholeBatch()
    {
        await using var context = Database();
        await context.Database.EnsureCreatedAsync();
        var category = new MaterialCategory { CategoryCode = Code(), Name = "Category" };
        context.MaterialCategories.Add(category);
        await context.SaveChangesAsync();
        var validCode = Code();
        var controller = new MaterialController(context);
        Assert.IsType<BadRequestObjectResult>(await controller.ImportCatalog([
            new() { ItemCode = validCode, Name = "Valid", CategoryCode = category.CategoryCode },
            new() { ItemCode = Code(), Name = "Invalid", CategoryCode = "missing", UnitPrice = -1 }
        ]));
        await context.SaveChangesAsync();
        Assert.False(await context.MaterialItems.AnyAsync(i => i.ItemCode == validCode));
    }

    [ShorePostgresFact]
    public async Task Import_OutboxFailure_RollsBackCatalogWrite()
    {
        await using var context = Database();
        await context.Database.EnsureCreatedAsync();
        var category = new MaterialCategory { CategoryCode = Code(), Name = "Category" };
        context.MaterialCategories.Add(category);
        await context.SaveChangesAsync();
        var outbox = new Mock<ISyncOutboxService>();
        outbox.Setup(o => o.EnqueueBatchAsync(It.IsAny<string>(), It.IsAny<List<(string TableName, string RecordKey, Maritime.Shared.Models.Sync.SyncActionType Action, object Payload)>>()))
            .ThrowsAsync(new InvalidOperationException("Outbox failed"));
        var code = Code();
        await Assert.ThrowsAsync<InvalidOperationException>(() => new MaterialController(context, outbox.Object).ImportCatalog([
            new() { ItemCode = code, Name = "New", CategoryCode = category.CategoryCode }
        ]));
        context.ChangeTracker.Clear();
        Assert.False(await context.MaterialItems.AnyAsync(i => i.ItemCode == code));
    }
}
