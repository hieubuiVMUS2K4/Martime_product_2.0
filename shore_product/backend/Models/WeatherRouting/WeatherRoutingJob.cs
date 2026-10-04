using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ProductApi.Models.WeatherRouting;

/// <summary>
/// Đề 4 Phase 1 — weather routing job (A* + baseline).
/// Table: weather_routing_jobs
/// </summary>
[Table("weather_routing_jobs")]
public class WeatherRoutingJob
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Optional vessel (MEKONG demo may be null).</summary>
    public Guid? VesselId { get; set; }

    [Required]
    public double StartLat { get; set; }

    [Required]
    public double StartLon { get; set; }

    [Required]
    public double GoalLat { get; set; }

    [Required]
    public double GoalLon { get; set; }

    /// <summary>queued | running | completed | failed</summary>
    [Required]
    [MaxLength(32)]
    public string Status { get; set; } = WeatherRoutingJobStatus.Queued;

    /// <summary>Increments on each replan.</summary>
    public int Version { get; set; } = 1;

    /// <summary>Original create/replan request payload (jsonb).</summary>
    [Column(TypeName = "jsonb")]
    public string RequestJson { get; set; } = "{}";

    /// <summary>Hazards used for this run (jsonb) — Phase 1 MOCK Cam Ranh.</summary>
    [Column(TypeName = "jsonb")]
    public string HazardJson { get; set; } = "[]";

    /// <summary>Run metrics: grid size, explored cells, timings (jsonb).</summary>
    [Column(TypeName = "jsonb")]
    public string MetricsJson { get; set; } = "{}";

    /// <summary>Kế hoạch n chặng (chọn cảng tiếp nhiên liệu + nhiên liệu từng chặng) (jsonb).</summary>
    [Column(TypeName = "jsonb")]
    public string PlanJson { get; set; } = "{}";

    [MaxLength(2000)]
    public string? ErrorMessage { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }

    public ICollection<WeatherRoutingRoute> Routes { get; set; } = new List<WeatherRoutingRoute>();
}

public static class WeatherRoutingJobStatus
{
    public const string Queued = "queued";
    public const string Running = "running";
    public const string Completed = "completed";
    public const string Failed = "failed";
}
