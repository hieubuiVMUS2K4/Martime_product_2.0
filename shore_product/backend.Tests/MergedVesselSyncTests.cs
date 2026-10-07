using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using ProductApi.Services;
using Xunit;

namespace ProductApi.Tests;

public partial class SyncReliabilityTests
{
    [ShorePostgresFact]
    public async Task VesselParticulars_ShorePatchQueuesChangedFields_AndOldEdgeSnapshotCannotOverwriteThem()
    {
        await using var db = await Database(); var id = await BindNode(db, "MERGED-VESSEL");
        var vessel = await db.Vessels.SingleAsync(v => v.Id == id);
        var imo = vessel.IMO;
        var outbox = Outbox(db);
        var service = new VesselService(db, NullLogger<VesselService>.Instance, outbox);
        var patch = JsonSerializer.SerializeToElement(new { name = "Shore name", mmsiNumber = "123456789", callSign = "SHORE", imo = "must-not-change" });
        Assert.NotNull(await service.UpdateParticularsAsync(id, patch));
        db.ChangeTracker.Clear();
        var sent = Assert.Single((await outbox.GetPendingItemsAsync("MERGED-VESSEL", null, null, 50)).Items);
        Assert.Equal("ship_data", sent.TableName);
        using var payload = JsonDocument.Parse(sent.Payload);
        Assert.Equal(imo, payload.RootElement.GetProperty("ImoNumber").GetString());
        Assert.Equal("Shore name", payload.RootElement.GetProperty("ShipName").GetString());
        Assert.False(payload.RootElement.TryGetProperty("Flag", out _));
        var stream = Guid.NewGuid();
        var old = MirrorEvent("ship_data", id.ToString(), "MERGED-VESSEL", stream, 1,
            new { ImoNumber = imo, ShipName = "Old edge name", MmsiNumber = "000", Flag = "EDGE-FLAG" });
        old.Timestamp = DateTime.UtcNow.AddMinutes(-1);
        Assert.Equal(1, (await Inbox(db).ProcessBatchAsync([old])).Succeeded);
        db.ChangeTracker.Clear(); vessel = await db.Vessels.SingleAsync(v => v.Id == id);
        Assert.Equal("Shore name", vessel.Name); Assert.Equal("123456789", vessel.MmsiNumber); Assert.Equal("EDGE-FLAG", vessel.Flag);
        await outbox.AcknowledgeDeliveryAsync("MERGED-VESSEL", [sent.OutboxId]);
        var later = MirrorEvent("ship_data", id.ToString(), "MERGED-VESSEL", stream, 2,
            new { ImoNumber = imo, ShipName = "Later edge name" });
        later.Timestamp = DateTime.UtcNow.AddMinutes(1);
        Assert.Equal(1, (await Inbox(db).ProcessBatchAsync([later])).Succeeded);
        db.ChangeTracker.Clear(); vessel = await db.Vessels.SingleAsync(v => v.Id == id);
        Assert.Equal("Later edge name", vessel.Name); Assert.Equal("123456789", vessel.MmsiNumber); Assert.Equal(imo, vessel.IMO);
        await db.Database.EnsureDeletedAsync();
    }
}
