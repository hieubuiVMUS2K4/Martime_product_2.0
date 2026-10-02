using MaritimeEdge.Controllers.Inventory;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Repositories;
using Maritime.Shared.Models.Sync;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

[CollectionDefinition("PMS inventory", DisableParallelization = true)]
public class PmsCollection : ICollectionFixture<PmsDatabaseFixture> { }

public sealed class PmsDatabaseFixture : IAsyncLifetime
{
    private readonly DbContextOptions<EdgeDbContext> _options;

    public PmsDatabaseFixture()
    {
        var builder = new DbContextOptionsBuilder<EdgeDbContext>();
        var connection = Environment.GetEnvironmentVariable("PMS_TEST_CONNECTION_STRING");
        if (string.IsNullOrWhiteSpace(connection))
            builder.UseInMemoryDatabase("pms-tests-" + Guid.NewGuid());
        else
        {
            var parsed = new NpgsqlConnectionStringBuilder(connection);
            if (parsed.Database?.StartsWith("codex_pms_tests_", StringComparison.Ordinal) != true)
                throw new InvalidOperationException("PMS tests require a separate codex_pms_tests_* database.");
            builder.UseNpgsql(connection);
        }
        _options = builder.Options;
    }

    public EdgeDbContext CreateContext() => new(_options);

    public async Task InitializeAsync()
    {
        await using var context = CreateContext();
        await context.Database.EnsureCreatedAsync();
    }

    // Database lifecycle belongs to the test runner; never delete a caller's database.
    public Task DisposeAsync() => Task.CompletedTask;
}

public sealed class PmsPostgresFactAttribute : FactAttribute
{
    public PmsPostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("PMS_TEST_CONNECTION_STRING")))
            Skip = "Requires a separate PostgreSQL database via PMS_TEST_CONNECTION_STRING.";
    }
}

[Collection("PMS inventory")]
public class PmsRegressionTests(PmsDatabaseFixture database)
{
    private static string Code() => Guid.NewGuid().ToString("N");

    private static async Task<(MaterialCatalogItem Catalog, MaterialItem Ship, StoreLocation Location)>
        SeedMaterialAsync(EdgeDbContext context, decimal quantity = 0)
    {
        var category = new MaterialCategory { CategoryCode = Code(), Name = "Test category" };
        context.MaterialCategories.Add(category);
        await context.SaveChangesAsync();
        var catalog = new MaterialCatalogItem { ItemCode = Code(), Name = "Test spare", CategoryId = category.Id };
        var ship = new MaterialItem
        {
            ItemCode = catalog.ItemCode, MaterialItemCode = catalog.ItemCode, Name = catalog.Name,
            CategoryId = category.Id, OnHandQuantity = (double)quantity
        };
        var location = new StoreLocation { LocationCode = Code(), Name = "Test store" };
        context.MaterialCatalogItems.Add(catalog);
        context.MaterialItems.Add(ship);
        context.StoreLocations.Add(location);
        if (quantity > 0)
            context.InventoryStocks.Add(new InventoryStock
                { MaterialItemId = ship.Id, StoreLocationId = location.Id, Quantity = quantity });
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        return (catalog, ship, location);
    }

    private static StockReceipt Receipt(params StockReceiptItem[] items) => new()
    {
        ReceiptCode = Code(), Status = "Draft", Items = items.ToList()
    };

    private static StockReceiptItem Line(Guid? material, Guid? location, decimal quantity, string? code = null) => new()
    {
        MaterialItemId = material, StoreLocationId = location, QuantityReceived = quantity,
        ItemCode = code, ItemName = "Test spare"
    };

    [Fact]
    public async Task Adjust_RefreshesTotalIncludingUnchangedLocations()
    {
        await using var context = database.CreateContext();
        var (_, ship, location) = await SeedMaterialAsync(context, 10);
        var otherLocation = new StoreLocation { LocationCode = Code(), Name = "Other location" };
        context.StoreLocations.Add(otherLocation);
        context.InventoryStocks.Add(new InventoryStock
            { MaterialItemId = ship.Id, StoreLocationId = otherLocation.Id, Quantity = 4 });
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        Assert.IsType<OkObjectResult>(await new InventoryController(context).Adjust(new()
            { MaterialItemId = ship.Id, StoreLocationId = location.Id, AdjustQuantity = 2 }));
        await using var verify = database.CreateContext();
        Assert.Equal(16, (await verify.MaterialItems.FindAsync(ship.Id))!.OnHandQuantity);
        Assert.Equal(12, await verify.InventoryStocks.Where(s => s.MaterialItemId == ship.Id &&
            s.StoreLocationId == location.Id).Select(s => s.Quantity).SingleAsync());
    }

    [Fact]
    public async Task Declare_MultipleLocationsAndRepeatedPair_StoresFinalBatchTotal()
    {
        await using var context = database.CreateContext();
        var (_, ship, first) = await SeedMaterialAsync(context, 10);
        var second = new StoreLocation { LocationCode = Code(), Name = "Second store" };
        context.StoreLocations.Add(second);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        Assert.IsType<OkObjectResult>(await new InventoryController(context).Declare(new()
        {
            Items = [
                new() { MaterialItemId = ship.Id, StoreLocationId = first.Id, Quantity = 12 },
                new() { MaterialItemId = ship.Id, StoreLocationId = second.Id, Quantity = 4 },
                new() { MaterialItemId = ship.Id, StoreLocationId = second.Id, Quantity = 7 }]
        }));
        await using var verify = database.CreateContext();
        Assert.Equal(19, (await verify.MaterialItems.FindAsync(ship.Id))!.OnHandQuantity);
        Assert.Equal(2, await verify.InventoryStocks.CountAsync(s => s.MaterialItemId == ship.Id));
    }

    [Fact]
    public async Task Declare_InvalidLocation_RejectsWholeBatch()
    {
        await using var context = database.CreateContext();
        var (_, ship, location) = await SeedMaterialAsync(context, 10);
        Assert.IsType<BadRequestObjectResult>(await new InventoryController(context).Declare(new()
        {
            Items = [new() { MaterialItemId = ship.Id, StoreLocationId = location.Id, Quantity = 12 },
                new() { MaterialItemId = ship.Id, StoreLocationId = Guid.NewGuid(), Quantity = 7 }]
        }));
        await using var verify = database.CreateContext();
        Assert.Equal(10, (await verify.MaterialItems.FindAsync(ship.Id))!.OnHandQuantity);
        Assert.Equal(10, await verify.InventoryStocks.Where(s => s.MaterialItemId == ship.Id)
            .Select(s => s.Quantity).SingleAsync());
    }

    [Fact]
    public async Task Complete_RepeatedLinesForSameNewStock_AddsOnceAndRepairsTotal()
    {
        await using var context = database.CreateContext();
        var (catalog, ship, location) = await SeedMaterialAsync(context);
        (await context.MaterialItems.FindAsync(ship.Id))!.OnHandQuantity = 999;
        var receipt = Receipt(Line(catalog.Id, location.Id, 2), Line(ship.Id, location.Id, 3));
        context.StockReceipts.Add(receipt);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        var controller = new StockReceiptController(context);
        Assert.IsType<OkObjectResult>(await controller.Complete(receipt.Id));
        Assert.IsType<BadRequestObjectResult>(await controller.Complete(receipt.Id));
        await using var verify = database.CreateContext();
        Assert.Equal(5, await verify.InventoryStocks.Where(s => s.MaterialItemId == ship.Id)
            .Select(s => s.Quantity).SingleAsync());
        Assert.Equal(5, (await verify.MaterialItems.FindAsync(ship.Id))!.OnHandQuantity);
    }

    [Fact]
    public async Task Complete_NewCatalogMaterialInRepeatedLines_CreatesOneShipItem()
    {
        await using var context = database.CreateContext();
        var (catalog, ship, location) = await SeedMaterialAsync(context);
        context.MaterialItems.Remove((await context.MaterialItems.FindAsync(ship.Id))!);
        var receipt = Receipt(Line(catalog.Id, location.Id, 2), Line(catalog.Id, location.Id, 3));
        context.StockReceipts.Add(receipt);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        Assert.IsType<OkObjectResult>(await new StockReceiptController(context).Complete(receipt.Id));
        await using var verify = database.CreateContext();
        var created = await verify.MaterialItems.SingleAsync(m => m.ItemCode == catalog.ItemCode);
        Assert.Equal(5, created.OnHandQuantity);
        Assert.Equal(5, await verify.InventoryStocks.Where(s => s.MaterialItemId == created.Id)
            .Select(s => s.Quantity).SingleAsync());
    }

    [Fact]
    public async Task Complete_MissingLocation_LeavesReceiptAndInventoryUnchanged()
    {
        await using var context = database.CreateContext();
        var (_, ship, location) = await SeedMaterialAsync(context, 10);
        var receipt = Receipt(Line(ship.Id, location.Id, 2), Line(ship.Id, null, 3));
        context.StockReceipts.Add(receipt);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        Assert.IsType<BadRequestObjectResult>(await new StockReceiptController(context).Complete(receipt.Id));
        await using var verify = database.CreateContext();
        Assert.Equal("Draft", (await verify.StockReceipts.FindAsync(receipt.Id))!.Status);
        Assert.Equal(10, (await verify.MaterialItems.FindAsync(ship.Id))!.OnHandQuantity);
    }

    [Fact]
    public async Task Update_AllowsApprovalButRejectsCompletedBypass()
    {
        await using var context = database.CreateContext();
        var receipt = Receipt();
        context.StockReceipts.Add(receipt);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        var controller = new StockReceiptController(context);
        Assert.IsType<BadRequestObjectResult>(await controller.Update(receipt.Id, new() { Status = "Completed" }));
        Assert.IsType<OkObjectResult>(await controller.Update(receipt.Id, new() { Status = "Approved" }));
        Assert.IsType<BadRequestObjectResult>(await controller.Update(receipt.Id, new() { Status = "Draft" }));
    }

    [Fact]
    public async Task CompletedReceipt_CannotBeEditedReopenedOrDeleted()
    {
        await using var context = database.CreateContext();
        var (_, ship, location) = await SeedMaterialAsync(context);
        var receipt = Receipt(Line(ship.Id, location.Id, 2));
        context.StockReceipts.Add(receipt);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        var controller = new StockReceiptController(context);
        Assert.IsType<OkObjectResult>(await controller.Complete(receipt.Id));
        Assert.IsType<BadRequestObjectResult>(await controller.Update(receipt.Id, new() { Notes = "edit" }));
        Assert.IsType<BadRequestObjectResult>(await controller.Update(receipt.Id, new() { Status = "Draft" }));
        Assert.IsType<BadRequestObjectResult>(await controller.Delete(receipt.Id));
        await using var verify = database.CreateContext();
        var persisted = (await verify.StockReceipts.FindAsync(receipt.Id))!;
        Assert.True(persisted.IsActive);
        Assert.Equal("Completed", persisted.Status);
        Assert.Equal(2, (await verify.MaterialItems.FindAsync(ship.Id))!.OnHandQuantity);
    }

    [Fact]
    public async Task Update_ReplacesLinesInsteadOfRetainingDeletedItems()
    {
        await using var context = database.CreateContext();
        var receipt = Receipt(Line(null, null, 2));
        context.StockReceipts.Add(receipt);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        Assert.IsType<OkObjectResult>(await new StockReceiptController(context).Update(receipt.Id, new()
        {
            Items = [new() { ItemName = "Replacement", QuantityReceived = 4 }]
        }));
        await using var verify = database.CreateContext();
        var line = await verify.StockReceiptItems.SingleAsync(i => i.ReceiptId == receipt.Id);
        Assert.Equal("Replacement", line.ItemName);
        Assert.Equal(4, line.QuantityReceived);
    }

    [Fact]
    public async Task GroupQuery_IncludesMembershipAndLegacyColumnWithoutDuplicates()
    {
        await using var context = database.CreateContext();
        var group = new EquipmentGroup { GroupCode = Code(), GroupName = "Test group" };
        EquipmentAsset Asset(bool legacy = false, bool active = true) => new()
        {
            AssetCode = Code(), AssetName = "Test equipment", Category = "ENGINE",
            EquipmentGroupId = legacy ? group.Id : null, IsActive = active
        };
        var legacy = Asset(true);
        var member = Asset();
        var both = Asset(true);
        var inactive = Asset(active: false);
        context.EquipmentGroups.Add(group);
        context.EquipmentAssets.AddRange(legacy, member, both, inactive);
        context.EquipmentGroupMembers.AddRange(new[] { member, both, inactive }.Select(a =>
            new EquipmentGroupMember { AssetId = a.Id, GroupId = group.Id }));
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        var result = await new EquipmentAssetRepository(context).GetByGroupIdAsync(group.Id);
        Assert.Equal(3, result.Count);
        Assert.Equal(new[] { legacy.Id, member.Id, both.Id }.Order(), result.Select(a => a.Id).Order());
    }

    [Fact]
    public async Task MaterialEquipmentLink_QueuesCreateUpdateDeleteWithCorrectKeys()
    {
        await using var context = database.CreateContext();
        var (catalog, _, _) = await SeedMaterialAsync(context);
        var asset = new EquipmentAsset { AssetCode = Code(), AssetName = "Test", Category = "ENGINE" };
        context.EquipmentAssets.Add(asset);
        var link = new MaterialItemEquipment { MaterialItemId = catalog.Id, EquipmentAssetId = asset.Id };
        context.MaterialItemEquipments.Add(link);
        await context.SaveChangesAsync();
        link.QuantityRequired = 4;
        link.Notes = "Updated";
        await context.SaveChangesAsync();
        context.MaterialItemEquipments.Remove(link);
        await context.SaveChangesAsync();
        await using var verify = database.CreateContext();
        var queue = await verify.SyncQueue.Where(q => q.TableName == "material_item_equipment" &&
            q.RecordKey == link.Id.ToString()).ToListAsync();
        Assert.Equal(3, queue.Count);
        Assert.Contains(queue, q => q.ActionType == SyncActionType.CREATE && q.Payload.Contains(catalog.Id.ToString()));
        Assert.Contains(queue, q => q.ActionType == SyncActionType.UPDATE && q.Payload.Contains("QuantityRequired"));
        Assert.Contains(queue, q => q.ActionType == SyncActionType.DELETE && q.Payload == "{}");
    }

    [PmsPostgresFact]
    public async Task InventoryConstraints_RejectOrphansAndNegativeValues()
    {
        await using var seed = database.CreateContext();
        var (_, ship, location) = await SeedMaterialAsync(seed);
        var invalidStocks = new[]
        {
            new InventoryStock { MaterialItemId = Guid.NewGuid(), StoreLocationId = location.Id },
            new InventoryStock { MaterialItemId = ship.Id, StoreLocationId = Guid.NewGuid() },
            new InventoryStock { MaterialItemId = ship.Id, StoreLocationId = location.Id, Quantity = -1 },
            new InventoryStock { MaterialItemId = ship.Id, StoreLocationId = location.Id, UnitCost = -1 }
        };
        for (var i = 0; i < invalidStocks.Length; i++)
        {
            await using var context = database.CreateContext();
            context.InventoryStocks.Add(invalidStocks[i]);
            var error = await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
            Assert.Equal(i < 2 ? "23503" : "23514", Assert.IsType<PostgresException>(error.InnerException).SqlState);
        }
    }

    [PmsPostgresFact]
    public async Task LinkConstraints_RejectDuplicateMembershipAndOrphanEquipment()
    {
        await using var seed = database.CreateContext();
        var (catalog, _, _) = await SeedMaterialAsync(seed);
        var group = new EquipmentGroup { GroupCode = Code(), GroupName = "Constraint group" };
        var asset = new EquipmentAsset { AssetCode = Code(), AssetName = "Constraint asset", Category = "ENGINE" };
        seed.EquipmentGroups.Add(group);
        seed.EquipmentAssets.Add(asset);
        seed.EquipmentGroupMembers.Add(new() { GroupId = group.Id, AssetId = asset.Id });
        seed.MaterialItemEquipments.Add(new() { MaterialItemId = catalog.Id, EquipmentAssetId = asset.Id });
        await seed.SaveChangesAsync();

        await using (var context = database.CreateContext())
        {
            context.EquipmentGroupMembers.Add(new() { GroupId = group.Id, AssetId = asset.Id });
            var error = await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
            Assert.Equal("23505", Assert.IsType<PostgresException>(error.InnerException).SqlState);
        }
        await using (var context = database.CreateContext())
        {
            context.MaterialItemEquipments.Add(new() { MaterialItemId = catalog.Id, EquipmentAssetId = asset.Id });
            var error = await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
            Assert.Equal("23505", Assert.IsType<PostgresException>(error.InnerException).SqlState);
        }
        await using (var context = database.CreateContext())
        {
            context.MaterialItemEquipments.Add(new() { MaterialItemId = catalog.Id, EquipmentAssetId = Guid.NewGuid() });
            var error = await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
            Assert.Equal("23503", Assert.IsType<PostgresException>(error.InnerException).SqlState);
        }
    }

    [PmsPostgresFact]
    public async Task ReceiptAndFormConstraints_RejectMissingLocationAndTaskCode()
    {
        await using (var context = database.CreateContext())
        {
            context.StockReceipts.Add(Receipt(Line(null, Guid.NewGuid(), 1)));
            var error = await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
            Assert.Equal("23503", Assert.IsType<PostgresException>(error.InnerException).SqlState);
        }
        await using (var context = database.CreateContext())
        {
            context.TaskRiskAssessments.Add(new() { TaskId = Code() });
            var error = await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
            Assert.Equal("23503", Assert.IsType<PostgresException>(error.InnerException).SqlState);
        }
        await using (var context = database.CreateContext())
        {
            context.TaskInspectionReports.Add(new() { TaskId = Code() });
            var error = await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
            Assert.Equal("23503", Assert.IsType<PostgresException>(error.InnerException).SqlState);
        }
    }

    [PmsPostgresFact]
    public async Task Complete_UnresolvableLaterLine_DoesNotPersistEarlierLineOrSyncQueue()
    {
        await using var context = database.CreateContext();
        var (catalog, ship, location) = await SeedMaterialAsync(context);
        context.MaterialItems.Remove((await context.MaterialItems.FindAsync(ship.Id))!);
        var receipt = Receipt(Line(catalog.Id, location.Id, 2), Line(null, location.Id, 3));
        context.StockReceipts.Add(receipt);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();
        var beforeQueue = await context.SyncQueue.CountAsync();
        Assert.IsType<BadRequestObjectResult>(await new StockReceiptController(context).Complete(receipt.Id));
        await using var verify = database.CreateContext();
        Assert.Equal("Draft", (await verify.StockReceipts.FindAsync(receipt.Id))!.Status);
        Assert.False(await verify.MaterialItems.AnyAsync(m => m.ItemCode == catalog.ItemCode));
        Assert.False(await verify.InventoryStocks.AnyAsync(s => s.StoreLocationId == location.Id));
        Assert.Equal(beforeQueue, await verify.SyncQueue.CountAsync());
    }

    [PmsPostgresFact]
    public async Task Complete_ConcurrentCalls_PostsReceiptOnlyOnce()
    {
        await using var seed = database.CreateContext();
        var (_, ship, location) = await SeedMaterialAsync(seed);
        var receipt = Receipt(Line(ship.Id, location.Id, 2));
        seed.StockReceipts.Add(receipt);
        await seed.SaveChangesAsync();
        await using var first = database.CreateContext();
        await using var second = database.CreateContext();
        var results = await Task.WhenAll(new StockReceiptController(first).Complete(receipt.Id),
            new StockReceiptController(second).Complete(receipt.Id));
        Assert.Single(results.OfType<OkObjectResult>());
        Assert.Single(results.OfType<BadRequestObjectResult>());
        await using var verify = database.CreateContext();
        Assert.Equal(2, await verify.InventoryStocks.Where(s => s.MaterialItemId == ship.Id)
            .Select(s => s.Quantity).SingleAsync());
    }

    [PmsPostgresFact]
    public async Task Complete_ConcurrentReceiptsForSameStock_PreservesBothQuantities()
    {
        await using var seed = database.CreateContext();
        var (_, ship, location) = await SeedMaterialAsync(seed);
        var receiptA = Receipt(Line(ship.Id, location.Id, 2));
        var receiptB = Receipt(Line(ship.Id, location.Id, 3));
        seed.StockReceipts.AddRange(receiptA, receiptB);
        await seed.SaveChangesAsync();
        await using var first = database.CreateContext();
        await using var second = database.CreateContext();
        var results = await Task.WhenAll(new StockReceiptController(first).Complete(receiptA.Id),
            new StockReceiptController(second).Complete(receiptB.Id));
        Assert.All(results, result => Assert.IsType<OkObjectResult>(result));
        await using var verify = database.CreateContext();
        Assert.Equal(5, await verify.InventoryStocks.Where(s => s.MaterialItemId == ship.Id)
            .Select(s => s.Quantity).SingleAsync());
        Assert.Equal(5, (await verify.MaterialItems.FindAsync(ship.Id))!.OnHandQuantity);
    }
}
