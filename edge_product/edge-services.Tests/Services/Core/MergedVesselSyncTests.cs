using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using MaritimeEdge.Services.Core;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

public partial class SyncReliabilityTests
{
    [Fact]
    public async Task ShoreOwnedPorts_DoNotUploadOnSaveOrReconciliation()
    {
        var (services, sync) = Build(true, _ => throw new InvalidOperationException("No Shore-owned port may be uploaded"));
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>();
            db.Ports.Add(new() { PortCode = "TEST1", PortName = "Shore catalog" });
            await db.SaveChangesAsync();
            Assert.Empty(await db.SyncQueue.Where(q => q.TableName == "port").ToListAsync());
            await sync.ExecuteSyncAsync(default);
            Assert.Empty(await db.SyncQueue.Where(q => q.TableName == "port").ToListAsync());
        }
    }

    [Theory]
    [InlineData("ImoNumber")]
    [InlineData("imoNumber")]
    [InlineData("imo_number")]
    public async Task ShipDataPatch_OnlyUpdatesMatchingShipAndSuppliedFields(string imoField)
    {
        await using var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options) { SuppressSyncQueue = true };
        var ship = new ShipData { ImoNumber = "1234567", ShipName = "Local ship", CallSign = "KEEP" };
        db.ShipData.Add(ship); await db.SaveChangesAsync();
        var handler = new SyncConflictHandler(NullLogger<SyncConflictHandler>.Instance);
        var item = new SyncQueueItemDto { TableName = "ship_data", ActionType = "UPDATE", Payload = JsonSerializer.Serialize(new Dictionary<string, object?> { [imoField] = "7654321", ["ShipName"] = "Wrong ship" }) };
        await handler.HandleIncomingAsync(db, item, default); Assert.Equal("Local ship", ship.ShipName);
        item.Payload = JsonSerializer.Serialize(new Dictionary<string, object?> { [imoField] = ship.ImoNumber, ["ShipName"] = "Updated", ["Id"] = Guid.NewGuid(), ["IsSynced"] = false });
        var id = ship.Id; await handler.HandleIncomingAsync(db, item, default); await db.SaveChangesAsync();
        Assert.Equal("Updated", ship.ShipName); Assert.Equal("KEEP", ship.CallSign); Assert.Equal(id, ship.Id);
        Assert.Empty(await db.SyncQueue.ToListAsync());
    }
}
