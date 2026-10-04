namespace ProductApi.Services.WeatherRouting;

public interface IHeuristicCost
{
    double StepCost(RoutingGrid grid, GridCell from, GridCell to);
    double Heuristic(RoutingGrid grid, GridCell from, GridCell goal);
}

/// <summary>Octile distance on grid + haversine-scaled step costs.</summary>
public sealed class HeuristicCost : IHeuristicCost
{
    public double StepCost(RoutingGrid grid, GridCell from, GridCell to)
    {
        var a = grid.CellToLatLon(from);
        var b = grid.CellToLatLon(to);
        return GeoMath.HaversineNm(a, b);
    }

    public double Heuristic(RoutingGrid grid, GridCell from, GridCell goal)
    {
        // Admissible: straight-line NM between cell centers.
        return GeoMath.HaversineNm(grid.CellToLatLon(from), grid.CellToLatLon(goal));
    }
}
