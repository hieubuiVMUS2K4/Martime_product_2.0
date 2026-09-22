using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ProductApi.Models.WeatherRouting;

/// <summary>
/// One computed route for a job (A* optimized or straight baseline).
/// Table: weather_routing_routes
/// </summary>
[Table("weather_routing_routes")]
public class WeatherRoutingRoute
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid JobId { get; set; }

    [ForeignKey(nameof(JobId))]
    public WeatherRoutingJob? Job { get; set; }

    /// <summary>astar | baseline</summary>
    [Required]
    [MaxLength(32)]
    public string Kind { get; set; } = WeatherRoutingRouteKind.AStar;

    /// <summary>Matches job.Version when produced.</summary>
    public int Version { get; set; } = 1;

    /// <summary>GeoJSON-ish waypoint list [{lat,lon}, ...] (jsonb).</summary>
    [Column(TypeName = "jsonb")]
    public string WaypointsJson { get; set; } = "[]";

    /// <summary>distanceNm, pathCost, cellCount, avoidedHazard (jsonb).</summary>
    [Column(TypeName = "jsonb")]
    public string MetricsJson { get; set; } = "{}";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public static class WeatherRoutingRouteKind
{
    public const string AStar = "astar";
    public const string Baseline = "baseline";
}
