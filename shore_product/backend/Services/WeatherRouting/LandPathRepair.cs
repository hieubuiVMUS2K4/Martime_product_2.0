namespace ProductApi.Services.WeatherRouting;

public static class LandPathRepair
{
    public static List<LatLon> Repair(IReadOnlyList<LatLon> input) => PathSanitizer.Sanitize(input);
}
