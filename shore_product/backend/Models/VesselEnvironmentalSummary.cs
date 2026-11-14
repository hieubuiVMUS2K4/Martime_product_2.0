using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace ProductApi.Models;

[Table("vessel_environmental_summaries")]
[PrimaryKey(nameof(VesselId), nameof(ReportingYear))]
public class VesselEnvironmentalSummary
{
    public Guid VesselId { get; set; }
    public int ReportingYear { get; set; }
    [MaxLength(1)] public string? CiiRating { get; set; }
    public double? AttainedCii { get; set; }
    public double? AttainedEexi { get; set; }
    [MaxLength(100)] public string MrvStatus { get; set; } = "DRAFT";
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    [MaxLength(200)] public string Source { get; set; } = "";
    [MaxLength(1000)] public string Notes { get; set; } = "";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
