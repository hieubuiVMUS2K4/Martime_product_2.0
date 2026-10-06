using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ProductApi.Models;

// Edge-owned mirrors. Local keys are mapped through SyncRecordIdentity.
public class NmeaRawData
{
    [Key]
    public long Id { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    [Required]
    [MaxLength(10)]
    public string SentenceType { get; set; } = string.Empty;
    [Required]
    [MaxLength(512)]
    public string RawSentence { get; set; } = string.Empty;
    public bool ChecksumValid { get; set; }
    [MaxLength(50)]
    public string? DeviceSource { get; set; }
    public bool IsSynced { get; set; } = false;

    // Ownership is resolved from the authenticated node, never the payload.
    public Guid VesselId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(50)]
    public string OriginNode { get; set; } = string.Empty;
}

public class NavigationData
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime Timestamp { get; set; }
    public double? HeadingTrue { get; set; }
    public double? HeadingMagnetic { get; set; }
    public double? RateOfTurn { get; set; }
    public double? Pitch { get; set; }
    public double? Roll { get; set; }
    public double? SpeedThroughWater { get; set; }
    public double? Depth { get; set; }
    public double? WindSpeedRelative { get; set; }
    public double? WindDirectionRelative { get; set; }
    public double? WindSpeedTrue { get; set; }
    public double? WindDirectionTrue { get; set; }
    public bool IsSynced { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    // Ownership is resolved from the authenticated node, never the payload.
    public Guid VesselId { get; set; }
}

public class EnvironmentalData
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime Timestamp { get; set; }
    public double? AirTemperature { get; set; }
    public double? BarometricPressure { get; set; }
    public double? Humidity { get; set; }
    public double? SeaTemperature { get; set; }
    public double? WindSpeed { get; set; }
    public double? WindDirection { get; set; }
    public double? WaveHeight { get; set; }
    public double? Visibility { get; set; }
    public bool IsSynced { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    // Ownership is resolved from the authenticated node, never the payload.
    public Guid VesselId { get; set; }
}

public class TaskDeferralRequest
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    [Required]
    public Guid TaskId { get; set; }
    [Required]
    [MaxLength(50)]
    public string RequestedBy { get; set; } = string.Empty;
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    [Required]
    public string Reason { get; set; } = string.Empty;
    public DateTime CurrentDueDate { get; set; }
    public DateTime ProposedDueDate { get; set; }
    public int DeferralDays { get; set; }
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "PENDING";
    [MaxLength(50)]
    public string? ReviewedBy { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewNotes { get; set; }
    [MaxLength(20)]
    public string Priority { get; set; } = "NORMAL";
    [Column(TypeName = "jsonb")]
    public string? Attachments { get; set; }
    public bool IsCmsItem { get; set; } = false;
    [MaxLength(255)]
    public string? ClassPermissionLetter { get; set; }
    public bool IsOverdueDeferral { get; set; } = false;
    public string? RootCause { get; set; }
    public string? PreventiveMeasures { get; set; }
    [MaxLength(20)]
    public string? TaskStatusAtRequest { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
    public bool IsSynced { get; set; } = false;
    public virtual MaintenanceTask Task { get; set; } = null!;

    // Ownership is resolved from the authenticated node, never the payload.
    public Guid VesselId { get; set; }
}
