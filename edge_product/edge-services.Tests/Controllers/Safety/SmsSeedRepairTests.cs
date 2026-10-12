using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace MaritimeEdge.Tests.Controllers.Safety;

public class SmsSeedRepairTests
{
    private static EdgeDbContext Database() => new(
        new DbContextOptionsBuilder<EdgeDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options)
        { SuppressSyncQueue = true };

    [Fact]
    public async Task DefaultSeed_FillsMissingTopics_WithoutRecreatingShorePolicies()
    {
        await using var db = Database();
        db.IsmElements.Add(new IsmElement { Id = 1, ChapterName = "Company topic" });
        await db.SaveChangesAsync();
        await SmsSeedData.SeedAsync(db);
        await SmsSeedData.SeedAsync(db);
        Assert.Equal(16, await db.IsmElements.CountAsync());
        Assert.Equal("Company topic", (await db.IsmElements.FindAsync(1))!.ChapterName);
        Assert.Empty(await db.SmsProcedures.ToListAsync());
        Assert.Empty(await db.SmsFormTemplates.ToListAsync());
    }

    [Fact]
    public async Task ExplicitSampleSeed_RepairsPartialData_AndPreservesCompanyContent()
    {
        await using var db = Database();
        var existing = new SmsProcedure
        {
            ProcedureCode = "SOP-01-01", IsmElementId = 1, Title = "Company policy",
            Content = "Approved company content", Version = "Rev 7"
        };
        db.SmsProcedures.Add(existing);
        await db.SaveChangesAsync();
        await SmsSeedData.SeedAsync(db, includeSampleProcedures: true);
        var count = await db.SmsProcedures.CountAsync();
        var forms = await db.SmsFormTemplates.CountAsync();
        Assert.True(count > 1);
        Assert.Equal(existing.Id, (await db.SmsFormTemplates.SingleAsync(f => f.FormCode == "BM-01")).SmsProcedureId);
        await SmsSeedData.SeedAsync(db, includeSampleProcedures: true);
        Assert.Equal(count, await db.SmsProcedures.CountAsync());
        Assert.Equal(forms, await db.SmsFormTemplates.CountAsync());
        Assert.Equal("Approved company content", existing.Content);
        Assert.Equal("Rev 7", existing.Version);
        Assert.Empty(await db.SyncQueue.ToListAsync());
    }
}
