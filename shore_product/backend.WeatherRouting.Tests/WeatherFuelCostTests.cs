using ProductApi.Services.WeatherRouting;
using Xunit;

namespace WeatherRouting.Tests;

/// <summary>Giờ hải hành dọc polyline — căn cứ để hiệu chỉnh bảng kế hoạch chặng theo sóng gió.</summary>
public class WeatherFuelCostTests
{
    private static readonly FuelModel Fuel = new(new FuelModelOptions());

    [Fact]
    public void Calm_sea_hours_equal_distance_over_speed()
    {
        var pts = new List<LatLon> { new(0, 0), new(0, 5), new(2, 8) };

        var (hours, calm) = WeatherFuelCost.PolylineSailingHours(pts, NoHazardProvider.Instance, Fuel);

        Assert.Equal(GeoMath.PathLengthNm(pts) / Fuel.Options.ServiceSpeedKts, calm, 6);
        Assert.Equal(calm, hours, 6);
    }

    [Fact]
    public void Passing_through_storm_rim_takes_longer()
    {
        var storm = new HazardZone("t", "TYPHOON", "test", new LatLon(0, 5), 100, "Red", "TEST");
        var hazards = new ZoneHazardProvider(new[] { storm });
        // Đi qua vành ảnh hưởng (ngoài bán kính 100 NM nhưng trong 2.5 lần bán kính).
        var pts = new List<LatLon> { new(3, 0), new(3, 10) };

        var (hours, calm) = WeatherFuelCost.PolylineSailingHours(pts, hazards, Fuel);

        Assert.True(hours > calm * 1.001, $"hours={hours:F2} calm={calm:F2}");
    }
}
