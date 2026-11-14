using System.ComponentModel.DataAnnotations;
using MaritimeEdge.DTOs;
using MaritimeEdge.Services.Maintenance;
using MaritimeEdge.Services.Reporting;
using Xunit;

namespace MaritimeEdge.Tests;

public class DemoReportSeedTests
{
    private static List<DemoReportSeedCommand.Entry> Plan() => DemoReportSeedCommand.BuildPlan(new DateTime(2026, 8, 16), 90, "reports-20261114");

    [Fact]
    public void HasAllTypesAndStableUniqueKeys()
    {
        var p = Plan();
        Assert.Equal(167, p.Count);
        Assert.Equal(90, p.Count(e => e.Type == "NOON"));
        Assert.Equal(36, p.Count(e => e.Type == "POSITION"));
        Assert.Equal(18, p.Count(e => e.Type == "DEPARTURE"));
        Assert.Equal(18, p.Count(e => e.Type == "ARRIVAL"));
        Assert.Equal(5, p.Count(e => e.Type == "BUNKER"));
        Assert.Equal(p.Count, p.Select(e => e.Key).Distinct().Count());
        Assert.Equal(p.Select(e => e.Key), Plan().Select(e => e.Key));
        Assert.Equal(5, p.Select(e => e.Target).Distinct().Count());
        Assert.All(p, e => Assert.Equal(DateTimeKind.Utc, e.Date.Kind));
        Assert.All(p, e => Assert.DoesNotContain("demo", System.Text.Json.JsonSerializer.Serialize(e.Payload), StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void PayloadsPassDtoAndBusinessValidation()
    {
        foreach (var e in Plan())
        {
            Validator.ValidateObject(e.Payload, new(e.Payload), true);
            var result = e.Payload switch {
                CreateNoonReportDto n => MaritimeValidationService.ValidateNoonReport(n),
                CreateDepartureReportDto d => MaritimeValidationService.ValidateDepartureReport(d),
                CreateBunkerReportDto b => MaritimeValidationService.ValidateBunkerReport(b),
                _ => (true, new List<string>(), new List<string>())
            };
            Assert.True(result.Item1, string.Join(";", result.Item2));
        }
    }

    [Fact]
    public void FuelLedgerBalancesAcrossBunkeringAndNoons()
    {
        double fo = 1100;
        foreach (var e in Plan())
        {
            if (e.Payload is CreateBunkerReportDto b)
            {
                Assert.Equal(fo, b.ROBBefore!.Value, 2);
                fo += b.QuantityReceived;
                Assert.Equal(fo, b.ROBAfter!.Value, 2);
            }
            if (e.Payload is CreateNoonReportDto n)
            {
                fo = Math.Round(fo - n.FuelOilConsumed!.Value, 2);
                Assert.Equal(fo, n.FuelOilROB!.Value, 2);
                Assert.InRange(fo, 0, 1710);
                Assert.True(n.DieselOilROB >= 0 && n.LubOilROB >= 0 && n.FreshWaterROB >= 0);
                Assert.Equal(n.SpeedOverGround!.Value * 24, n.DistanceTraveled!.Value, 1);
            }
        }
    }

    [Theory]
    [InlineData(0, "batch")]
    [InlineData(367, "batch")]
    [InlineData(90, "unsafe:batch")]
    public void RejectsInvalidPlan(int days, string batch) => Assert.Throws<ArgumentException>(() => DemoReportSeedCommand.BuildPlan(DateTime.UtcNow, days, batch));
}
