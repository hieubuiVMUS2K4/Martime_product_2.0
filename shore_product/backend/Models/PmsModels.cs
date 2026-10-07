using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ProductApi.Models;

// ============================================================
// PMS — EQUIPMENT ASSETS
// ============================================================

public class EquipmentAsset
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(50)]
    public string AssetCode { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string AssetName { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string Category { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Manufacturer { get; set; }

    [MaxLength(100)]
    public string? Model { get; set; }

    [MaxLength(100)]
    public string? SerialNumber { get; set; }

    public DateTime? InstallationDate { get; set; }

    public double? CurrentRunningHours { get; set; }

    public DateTime? LastRunningHoursUpdate { get; set; }

    [MaxLength(100)]
    public string? Location { get; set; }

    [MaxLength(20)]
    public string Criticality { get; set; } = "NORMAL";

    [MaxLength(50)]
    public string Status { get; set; } = "ACTIVE";

    [MaxLength(50)]
    public string? DefaultExecutorRole { get; set; }

    [MaxLength(50)]
    public string? ApproverRole { get; set; }

    public string? TechnicalSpecs { get; set; }

    public string? Notes { get; set; }

    /// <summary>Parent asset ID for hierarchical tree (null = root)</summary>
    public Guid? ParentId { get; set; }

    /// <summary>Vessel this asset belongs to (null = fleet-wide/unassigned)</summary>
    public Guid? VesselId { get; set; }

    [ForeignKey("ParentId")]
    [System.Text.Json.Serialization.JsonIgnore]
    public virtual EquipmentAsset? Parent { get; set; }

    public virtual ICollection<EquipmentAsset> Children { get; set; } = new List<EquipmentAsset>();

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// ============================================================
// PMS — EQUIPMENT GROUPS
// ============================================================

public class EquipmentGroup
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(50)]
    public string GroupCode { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string GroupName { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? Category { get; set; }

    [MaxLength(50)]
    public string? Department { get; set; }

    [MaxLength(50)]
    public string? PicRole { get; set; }

    public string? Description { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;


    /// <summary>Tàu sở hữu bản ghi — suy ra từ IMO của node gửi khi nhận đồng bộ.</summary>
    public Guid? VesselId { get; set; }

    public virtual ICollection<EquipmentGroupMember> Members { get; set; } = new List<EquipmentGroupMember>();
}

public class EquipmentGroupMember
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid GroupId { get; set; }

    [Required]
    public Guid AssetId { get; set; }

    public int SequenceOrder { get; set; } = 0;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public virtual EquipmentAsset Asset { get; set; } = null!;
    public virtual EquipmentGroup Group { get; set; } = null!;
}

// ============================================================
// PMS — MAINTENANCE SCHEDULES (template, syncs to Edge)
// ============================================================

public class MaintenanceSchedule
{
    [MaxLength(50)]
    public string? WorkCode { get; set; }
    public int? IntervalMonths { get; set; }
    public int? IntervalYears { get; set; }

    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(50)]
    public string ScheduleCode { get; set; } = string.Empty;

    public Guid? EquipmentGroupId { get; set; }
    public Guid? EquipmentAssetId { get; set; }

    [Required]
    [MaxLength(200)]
    public string ScheduleName { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string MaintenanceCategory { get; set; } = "PERIODIC";

    [Required]
    [MaxLength(20)]
    public string IntervalType { get; set; } = "CALENDAR";

    public int? IntervalHours { get; set; }

    public int? IntervalDays { get; set; }

    public int DaysBeforeDue { get; set; } = 7;

    public DateTime? LastExecutedAt { get; set; }

    public double? LastExecutedRunningHours { get; set; }

    public DateTime? NextDueDate { get; set; }

    public double? NextDueRunningHours { get; set; }

    [MaxLength(20)]
    public string Priority { get; set; } = "NORMAL";

    public double? EstimatedDurationHours { get; set; }

    public bool AutoGenerate { get; set; } = true;

    [MaxLength(50)]
    public string? AssignedToRole { get; set; }

    public string? Instructions { get; set; }

    public bool IsActive { get; set; } = true;

    /// <summary>Whether this schedule has been synced/pushed down to Edge</summary>
    public bool IsSynced { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;


    /// <summary>Tàu sở hữu bản ghi — suy ra từ IMO của node gửi khi nhận đồng bộ.</summary>
    public Guid? VesselId { get; set; }

    public virtual ICollection<ScheduleSparePart> SpareParts { get; set; } = new List<ScheduleSparePart>();
    public virtual ICollection<ScheduleChecklistTemplate> ChecklistTemplates { get; set; } = new List<ScheduleChecklistTemplate>();
}

public class ScheduleSparePart
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid ScheduleId { get; set; }

    /// <summary>FK → DANH MỤC vật tư material_items.Id (định mức phụ tùng theo loại).</summary>
    [Required]
    public Guid MaterialItemId { get; set; }

    [Required]
    [Range(0.001, 999999)]
    public double QuantityRequired { get; set; }

    public bool IsMandatory { get; set; } = true;

    [MaxLength(500)]
    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey("ScheduleId")]
    [System.Text.Json.Serialization.JsonIgnore]
    public virtual MaintenanceSchedule? Schedule { get; set; }
}

public class ScheduleChecklistTemplate
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid ScheduleId { get; set; }

    [Required]
    public int SequenceOrder { get; set; }

    [Required]
    [MaxLength(500)]
    public string CheckpointDescription { get; set; } = string.Empty;

    public bool RequiresReading { get; set; } = false;

    public double? NormalRangeMin { get; set; }
    public double? NormalRangeMax { get; set; }

    [MaxLength(20)]
    public string? Unit { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey("ScheduleId")]
    [System.Text.Json.Serialization.JsonIgnore]
    public virtual MaintenanceSchedule? Schedule { get; set; }
}

// ============================================================
// PMS — MAINTENANCE HISTORY (synced from Edge, read-only on shore)
// ============================================================

public class MaintenanceHistory
{
    [Column("report_snapshot")]
    public string? ReportSnapshot { get; set; }
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid ScheduleId { get; set; }

    public Guid? TaskId { get; set; }

    [Required]
    public DateTime ExecutedAt { get; set; }

    public double? ExecutedRunningHours { get; set; }

    [MaxLength(100)]
    public string? CompletedBy { get; set; }

    public double? ActualDurationHours { get; set; }

    public string? SparePartsUsed { get; set; }

    public decimal? TotalSparePartsCost { get; set; }

    public string? Notes { get; set; }

    [MaxLength(20)]
    public string? ConditionAfter { get; set; }

    public bool IsSynced { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHORE";
}
