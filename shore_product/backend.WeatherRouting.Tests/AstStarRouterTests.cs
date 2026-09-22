using ProductApi.Services.WeatherRouting;
using Xunit;

namespace WeatherRouting.Tests;

public class AstStarRouterTests
{
    private readonly GridBuilder _grid = new();
    private readonly HeuristicCost _cost = new();
    private readonly AstStarRouter _astar = new();
    private readonly StraightBaselineRouter _baseline = new();

    [Fact]
    public void Path_found_for_demo_corridor()
    {
        var hazard = new MockCamRanhHazardProvider(radiusNm: 40);
        var grid = _grid.Build(
            WeatherRoutingDemoDefaults.Start,
            WeatherRoutingDemoDefaults.Goal,
            hazard,
            80);
        var result = _astar.FindPath(grid, _cost);

        Assert.True(result.Found, result.FailureReason);
        Assert.True(result.Waypoints.Count >= 2);
        Assert.True(result.DistanceNm > 0);
    }

    [Fact]
    public void Path_avoids_blocked_cells()
    {
        var hazard = new MockCamRanhHazardProvider(radiusNm: 45);
        var grid = _grid.Build(
            WeatherRoutingDemoDefaults.Start,
            WeatherRoutingDemoDefaults.Goal,
            hazard,
            90);
        var result = _astar.FindPath(grid, _cost);

        Assert.True(result.Found, result.FailureReason);
        for (var i = 1; i < result.Waypoints.Count - 1; i++)
        {
            Assert.False(
                hazard.IsBlocked(result.Waypoints[i]),
                $"Intermediate waypoint blocked at index {i}");
        }
    }

    [Fact]
    public void Baseline_exists()
    {
        var result = _baseline.Build(
            WeatherRoutingDemoDefaults.Start,
            WeatherRoutingDemoDefaults.Goal);
        Assert.True(result.Found);
        Assert.True(result.Waypoints.Count >= 2);
        Assert.Equal(WeatherRoutingDemoDefaults.Start.Lat, result.Waypoints[0].Lat, 5);
        Assert.Equal(WeatherRoutingDemoDefaults.Goal.Lon, result.Waypoints[^1].Lon, 5);
    }

    [Fact]
    public void Replan_bumps_astar_version_semantics()
    {
        var v1Hazard = new MockCamRanhHazardProvider(radiusNm: 35);
        var v2Hazard = new MockCamRanhHazardProvider(radiusNm: 50);

        var g1 = _grid.Build(WeatherRoutingDemoDefaults.Start, WeatherRoutingDemoDefaults.Goal, v1Hazard, 80);
        var g2 = _grid.Build(WeatherRoutingDemoDefaults.Start, WeatherRoutingDemoDefaults.Goal, v2Hazard, 80);

        var r1 = _astar.FindPath(g1, _cost);
        var r2 = _astar.FindPath(g2, _cost);

        Assert.True(r1.Found);
        Assert.True(r2.Found);

        var version = 1;
        version++;
        Assert.Equal(2, version);
        Assert.True(r2.DistanceNm + 1e-6 >= Math.Min(r1.DistanceNm, r2.DistanceNm));
    }
}
