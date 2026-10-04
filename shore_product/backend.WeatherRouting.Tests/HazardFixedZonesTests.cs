using ProductApi.Services.WeatherRouting;
using Xunit;

namespace WeatherRouting.Tests;

/// <summary>
/// Kiểm chứng tập thiên tai cố định bằng land mask thật: tâm vùng không nằm trên đất và
/// quanh vùng còn biển để tàu vòng qua (không bịt kín eo hẹp).
/// </summary>
public class HazardFixedZonesTests
{
    /// <summary>Đối chứng: land mask phải nhận ra đất, nếu không hai test dưới qua vô nghĩa.</summary>
    [Fact]
    public void Land_mask_detects_known_land()
    {
        LandMask.EnsureLoaded();
        Assert.True(LandMask.IsBlockedLand(new LatLon(48.85, 2.35)));   // Paris
        Assert.True(LandMask.IsBlockedLand(new LatLon(65.0, -20.0)));   // Iceland — toạ độ cũ bị loại
    }

    [Fact]
    public void Every_zone_center_is_on_water()
    {
        LandMask.EnsureLoaded();
        Assert.Null(LandMask.LoadError);

        var onLand = DemoHazardGenerator.FixedZones()
            .Where(z => LandMask.IsBlockedLand(z.Center))
            .Select(z => $"{z.Name} ({z.Center.Lat}, {z.Center.Lon})")
            .ToList();

        Assert.True(onLand.Count == 0, "Tâm vùng nằm trên đất: " + string.Join("; ", onLand));
    }

    [Fact]
    public void Every_zone_leaves_room_to_pass()
    {
        LandMask.EnsureLoaded();
        Assert.Null(LandMask.LoadError);

        // Cùng ngưỡng với RandomOceanPoint: ít nhất 5/8 hướng còn biển ở khoảng cách R + 80 NM.
        var blocked = DemoHazardGenerator.FixedZones()
            .Select(z => (z, open: OpenDirections(z.Center, z.RadiusNm)))
            .Where(x => x.open < 5)
            .Select(x => $"{x.z.Name} ({x.z.Center.Lat}, {x.z.Center.Lon}) mở {x.open}/8")
            .ToList();

        Assert.True(blocked.Count == 0, "Vùng bịt lối đi: " + string.Join("; ", blocked));
    }

    [Fact]
    public void Every_hazard_type_is_used()
    {
        var used = DemoHazardGenerator.FixedZones().Select(z => z.Type).ToHashSet();
        var missing = HazardCatalog.All.Select(t => t.Type).Where(t => !used.Contains(t)).ToList();

        Assert.True(missing.Count == 0, "Thiếu loại thiên tai: " + string.Join(", ", missing));
    }

    [Fact]
    public void Planner_uses_fixed_zones()
    {
        Assert.Equal(DemoHazardGenerator.FixedZoneCount, VoyageHazardPlanner.Generate().Count);
    }

    [Fact]
    public void Weather_step_zero_is_the_base_map()
    {
        var baseZones = VoyageHazardPlanner.Generate();
        var step0 = VoyageHazardPlanner.Generate(0);

        Assert.Equal(baseZones.Select(z => (z.Center, z.RadiusNm)), step0.Select(z => (z.Center, z.RadiusNm)));
    }

    [Fact]
    public void Weather_steps_move_storms_deterministically_and_stay_on_water()
    {
        LandMask.EnsureLoaded();
        var baseZones = VoyageHazardPlanner.Generate(0);

        for (var step = 1; step <= 5; step++)
        {
            var a = VoyageHazardPlanner.Generate(step);
            var b = VoyageHazardPlanner.Generate(step);

            // Tất định: cùng bước ⇒ cùng tập vùng (bản đồ và tuyến phải khớp nhau).
            Assert.Equal(a.Select(z => (z.Id, z.Center, z.RadiusNm)), b.Select(z => (z.Id, z.Center, z.RadiusNm)));

            // Vùng trôi vào đất liền đã bị bỏ.
            Assert.DoesNotContain(a, z => LandMask.IsBlockedLand(z.Center));

            // Bão thật sự di chuyển: ít nhất một cơn bão đã dịch khỏi vị trí gốc hơn 100 NM.
            var moved = a.Count(z => z.Type is "TYPHOON" or "HURRICANE" or "TROPICAL_STORM" &&
                baseZones.Any(o => z.Id.StartsWith(o.Id + "-t") && GeoMath.HaversineNm(o.Center, z.Center) > 100));
            Assert.True(moved > 0, $"Bước {step}: không cơn bão nào di chuyển.");
        }
    }

    private static int OpenDirections(LatLon p, double radiusNm)
    {
        var d = radiusNm + 80.0;
        var cosLat = Math.Max(0.15, Math.Cos(p.Lat * Math.PI / 180.0));
        var open = 0;

        for (var k = 0; k < 8; k++)
        {
            var ang = k * Math.PI / 4.0;
            var probe = new LatLon(
                Math.Clamp(p.Lat + Math.Cos(ang) * d / 60.0, -70.0, 75.0),
                GeoMath.WrapLon(p.Lon + Math.Sin(ang) * d / (60.0 * cosLat)));

            if (!LandMask.IsBlockedLand(probe)) open++;
        }

        return open;
    }
}
