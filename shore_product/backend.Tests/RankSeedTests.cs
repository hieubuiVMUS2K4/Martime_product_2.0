using Maritime.Shared.Models.Crew;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using Xunit;

namespace ProductApi.Tests;

public partial class SyncReliabilityTests
{
    [ShorePostgresFact]
    public async Task RankSeed_PreservesCompanyRanksAndQueuesOnlyNewRanksOnce()
    {
        await using var db = await Database();
        try
        {
            var captain = new Rank { RankCode = "CAPT", RankName = "Company captain", SortOrder = 7 };
            var inactive = new Rank { RankCode = "AB", RankName = "Disabled rank", IsActive = false };
            db.Ranks.AddRange(captain, inactive);
            await db.SaveChangesAsync();
            var lastEvent = await db.SyncOutbox.MaxAsync(o => o.Id);

            Assert.Equal(23, await RankSeedData.SeedAsync(db));
            Assert.Equal(25, await db.Ranks.CountAsync());
            Assert.Equal("Company captain", (await db.Ranks.SingleAsync(r => r.Id == captain.Id)).RankName);
            Assert.Equal(7, captain.SortOrder);
            Assert.False((await db.Ranks.SingleAsync(r => r.Id == inactive.Id)).IsActive);
            var events = await db.SyncOutbox.Where(o => o.Id > lastEvent).ToListAsync();
            Assert.Equal(23, events.Count);
            Assert.All(events, e => { Assert.Equal("rank", e.TableName); Assert.Equal("*", e.TargetNode); });
            Assert.Equal(10, await db.Ranks.CountAsync(r => r.Department == "ENGINE"));
            Assert.Equal(3, await db.Ranks.CountAsync(r => r.Department == "CATERING"));
            var eventCount = await db.SyncOutbox.CountAsync();
            Assert.Equal(0, await RankSeedData.SeedAsync(db));
            Assert.Equal(eventCount, await db.SyncOutbox.CountAsync());
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [ShorePostgresFact]
    public async Task RankSeed_DoesNotDuplicateLegacyMaster()
    {
        await using var db = await Database();
        try
        {
            db.Ranks.Add(new Rank { RankCode = "MAST", RankName = "Master" });
            await db.SaveChangesAsync();
            Assert.Equal(24, await RankSeedData.SeedAsync(db));
            Assert.False(await db.Ranks.AnyAsync(r => r.RankCode == "CAPT"));
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }
}
