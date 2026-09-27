using ProductApi.Services.WeatherRouting;
using Xunit;
using Xunit.Abstractions;

namespace WeatherRouting.Tests;

/// <summary>
/// D* Lite phải cho CÙNG chi phí tối ưu với A* chạy lại từ đầu trên cùng lưới — trước và sau khi
/// thời tiết thay đổi — và khi lập lại kế hoạch thì phải duyệt ít ô hơn.
/// </summary>
public class DStarLiteRouterTests
{
    private readonly ITestOutputHelper _out;
    public DStarLiteRouterTests(ITestOutputHelper output) => _out = output;

    private static readonly IHeuristicCost Cost = new WeatherFuelCost(new FuelModel(new FuelModelOptions()));

    public static IEnumerable<object[]> Voyages() =>
    [
        // Vũng Tàu → Tokyo (Biển Đông, bão di chuyển qua tuyến).
        ["VNVUT->JPTYO", 10.346, 107.0843, 35.45, 139.77],
        // Tanger Med → Colón (Đại Tây Dương).
        ["MAPTM->PAPCN", 35.8889, -5.5, 9.3545, -79.9019],
    ];

    [Theory]
    [MemberData(nameof(Voyages))]
    public void Matches_astar_before_and_after_weather_updates(
        string name, double aLat, double aLon, double bLat, double bLon)
    {
        var builder = new GridBuilder();
        var astar = new AstStarRouter();
        var start = new LatLon(aLat, aLon);
        var goal = new LatLon(bLat, bLon);

        var grid0 = builder.Build(start, goal, new ZoneHazardProvider(VoyageHazardPlanner.Generate(0)), 120);
        var dstar = new DStarLiteRouter(grid0, Cost);

        var init = dstar.Plan();
        var full0 = astar.FindPath(grid0, Cost);
        Assert.True(init.Route.Found, init.Route.FailureReason);
        Assert.True(full0.Found, full0.FailureReason);
        Assert.Equal(full0.PathCost, init.Route.PathCost, 6);
        _out.WriteLine($"{name} t0: D* {init.Expanded} ô, A* {full0.ExploredCells} ô, chi phí {init.Route.PathCost:F3} t");

        var totalIncremental = 0;
        var totalFull = 0;
        for (var step = 1; step <= 4; step++)
        {
            var grid = builder.Rebuild(grid0, new ZoneHazardProvider(VoyageHazardPlanner.Generate(step)));
            var inc = dstar.Replan(grid);
            var full = astar.FindPath(grid, Cost);

            Assert.Equal(full.Found, inc.Route.Found);
            if (full.Found)
                Assert.Equal(full.PathCost, inc.Route.PathCost, 6);

            totalIncremental += inc.Expanded;
            totalFull += full.ExploredCells;
            _out.WriteLine($"{name} t{step}: {inc.ChangedCells} ô đổi, D* {inc.Expanded} ô, A* từ đầu {full.ExploredCells} ô, chi phí {inc.Route.PathCost:F3} t");
        }

        // Không khẳng định D* luôn duyệt ít hơn ở đây: mỗi bước 24 h mọi cơn bão cùng di chuyển nên
        // 9–18% lưới thay đổi — D* Lite chỉ có lợi khi thay đổi ít và cục bộ (xem test dưới).
        _out.WriteLine($"{name}: tổng D* {totalIncremental} ô, A* {totalFull} ô");
    }

    [Fact]
    public void Local_weather_change_is_cheaper_than_full_replan()
    {
        var builder = new GridBuilder();
        var astar = new AstStarRouter();
        var zones0 = VoyageHazardPlanner.Generate(0).ToList();
        var grid0 = builder.Build(new LatLon(10.346, 107.0843), new LatLon(35.45, 139.77),
            new ZoneHazardProvider(zones0), 120);
        var dstar = new DStarLiteRouter(grid0, Cost);
        dstar.Plan();

        // Chỉ cơn bão ở Biển Đông (14°N 114.5°E) dịch 60 NM về tây bắc — thay đổi cục bộ gần tuyến.
        var zones1 = zones0
            .Select(z => z.Center == new LatLon(14.0, 114.5)
                ? z with { Center = new LatLon(14.7, 113.8) }
                : z)
            .ToList();
        var grid1 = builder.Rebuild(grid0, new ZoneHazardProvider(zones1));

        var inc = dstar.Replan(grid1);
        var full = astar.FindPath(grid1, Cost);

        _out.WriteLine($"Cục bộ: {inc.ChangedCells} ô đổi, D* {inc.Expanded} ô, A* từ đầu {full.ExploredCells} ô");
        Assert.Equal(full.PathCost, inc.Route.PathCost, 6);
        Assert.True(inc.Expanded < full.ExploredCells, $"D* {inc.Expanded} ô không ít hơn A* {full.ExploredCells} ô");
    }

    [Fact]
    public void Replan_without_changes_expands_nothing()
    {
        var builder = new GridBuilder();
        var hazards = new ZoneHazardProvider(VoyageHazardPlanner.Generate(0));
        var grid = builder.Build(new LatLon(10.346, 107.0843), new LatLon(35.45, 139.77), hazards, 100);
        var dstar = new DStarLiteRouter(grid, Cost);
        var first = dstar.Plan();

        var again = dstar.Replan(builder.Rebuild(grid, hazards));

        Assert.Equal(0, again.ChangedCells);
        Assert.Equal(0, again.Expanded);
        Assert.Equal(first.Route.PathCost, again.Route.PathCost, 9);
    }
}
