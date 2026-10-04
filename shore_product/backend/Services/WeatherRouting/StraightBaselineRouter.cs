namespace ProductApi.Services.WeatherRouting;

public interface IStraightBaselineRouter
{
    RouteResult Build(LatLon start, LatLon goal, int samples = 64);
}

/// <summary>Eastbound-unwrapped baseline. Still may graze coast; A* is the sea-safe path.</summary>
public sealed class StraightBaselineRouter : IStraightBaselineRouter
{
    public RouteResult Build(LatLon start, LatLon goal, int samples = 64)
    {
        samples = Math.Clamp(samples, 2, 200);
        var goalLonU = GeoMath.UnwrapShortestLon(start.Lon, goal.Lon);
        var pts = new List<LatLon>(samples);
        for (var i = 0; i < samples; i++)
        {
            var t = samples == 1 ? 0.0 : (double)i / (samples - 1);
            var lonU = start.Lon + (goalLonU - start.Lon) * t;
            pts.Add(new LatLon(
                start.Lat + (goal.Lat - start.Lat) * t,
                GeoMath.WrapLon(lonU)));
        }

        var dist = GeoMath.PathLengthNm(pts);
        return new RouteResult
        {
            Found = true,
            Waypoints = pts,
            PathCost = dist,
            DistanceNm = dist,
            ExploredCells = 0,
            CellCount = pts.Count
        };
    }
}
