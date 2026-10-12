using AutoMapper;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Reporting;
using MaritimeEdge.Services.Voyage;
using MaritimeEdge.Tests.Inventory;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace MaritimeEdge.Tests.Services.Reporting;

[Collection("PMS inventory")]
public class ReportingTransactionTests(PmsDatabaseFixture database)
{
    private static ReportingService Service(EdgeDbContext db)
    {
        var voyage = new Mock<IVoyageContextService>();
        voyage.Setup(v => v.ResolveActiveVoyageAsync(It.IsAny<DateTime?>()))
            .ReturnsAsync(((Guid?)null, (Guid?)null));
        return new(db, NullLogger<ReportingService>.Instance,
            new MemoryCache(new MemoryCacheOptions()), Mock.Of<IHttpClientFactory>(),
            new ConfigurationBuilder().Build(), voyage.Object, Mock.Of<IMapper>(),
            Mock.Of<IEdgeRuntimeConfigService>());
    }

    private static async Task SeedReportType(EdgeDbContext db)
    {
        if (!await db.ReportTypes.AnyAsync(t => t.TypeCode == "NOON"))
        {
            db.ReportTypes.Add(new ReportType { TypeCode = "NOON", TypeName = "Noon report" });
            await db.SaveChangesAsync();
        }
    }

    private static CreateNoonReportDto Report(DateTime date) => new()
    {
        ReportDate = date, Latitude = 10, Longitude = 107,
        SpeedOverGround = 10, DistanceTraveled = 240,
        FuelOilConsumed = 10, FuelOilROB = 100,
    };

    [PmsPostgresFact]
    public async Task CreateNoon_ReusesOuterTransaction_AndCallerCanRollBackBothRows()
    {
        await using var db = database.CreateContext();
        await SeedReportType(db);
        await using var outer = await db.Database.BeginTransactionAsync();
        var result = await Service(db).CreateNoonReportAsync(Report(new DateTime(2040, 1, 1, 12, 0, 0, DateTimeKind.Utc)));

        Assert.True(result.Success, result.Error);
        Assert.Same(outer, db.Database.CurrentTransaction);
        Assert.True(await db.MaritimeReports.AnyAsync(r => r.Id == result.ReportId));
        Assert.True(await db.NoonReports.AnyAsync(r => r.MaritimeReportId == result.ReportId));

        // A service must not commit the transaction owned by the approval filter.
        await outer.RollbackAsync();
        await using var verification = database.CreateContext();
        Assert.False(await verification.MaritimeReports.AnyAsync(r => r.Id == result.ReportId));
        Assert.False(await verification.NoonReports.AnyAsync(r => r.MaritimeReportId == result.ReportId));
    }

    [PmsPostgresFact]
    public async Task CreateNoon_WithoutOuterTransaction_CommitsBothRows()
    {
        await using var db = database.CreateContext();
        await SeedReportType(db);
        var result = await Service(db).CreateNoonReportAsync(Report(new DateTime(2040, 1, 2, 12, 0, 0, DateTimeKind.Utc)));

        Assert.True(result.Success, result.Error);
        Assert.Null(db.Database.CurrentTransaction);
        await using var verification = database.CreateContext();
        Assert.True(await verification.MaritimeReports.AnyAsync(r => r.Id == result.ReportId));
        Assert.True(await verification.NoonReports.AnyAsync(r => r.MaritimeReportId == result.ReportId));
    }
}
