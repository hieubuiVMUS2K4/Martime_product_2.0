using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ProductApi.Models;

/// <summary>
/// Maintenance task synced from Edge (read-only on Shore).
/// Mirrors Edge's MaintenanceTask model.
/// </summary>
public partial class MaintenanceTask
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(50)]
    public string TaskId { get; set; } = string.Empty;

    public int? TaskTypeId { get; set; }

    [MaxLength(100)]
    public string? EquipmentId { get; set; }

    [MaxLength(200)]
    public string? EquipmentName { get; set; }

    public Guid? EquipmentGroupId { get; set; }

    [MaxLength(200)]
    public string? EquipmentGroupName { get; set; }

    public Guid? EquipmentAssetId { get; set; }

    [MaxLength(200)]
    public string? EquipmentAssetName { get; set; }

    public Guid? ScheduleId { get; set; }

    [Required]
    [MaxLength(50)]
    public string TaskType { get; set; } = string.Empty;

    [Required]
    public string TaskDescription { get; set; } = string.Empty;

    public double? IntervalHours { get; set; }

    public int? IntervalDays { get; set; }

    public DateTime? LastDoneAt { get; set; }

    public DateTime NextDueAt { get; set; }

    public double? RunningHoursAtLastDone { get; set; }

    [MaxLength(20)]
    public string Priority { get; set; } = "NORMAL";

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "SCHEDULED";

    [MaxLength(100)]
    public string? AssignedTo { get; set; }

    [MaxLength(20)]
    public string? AssignedDepartment { get; set; }

    // Deferral
    public bool HasPendingDeferral { get; set; } = false;
    public int DeferralCount { get; set; } = 0;
    public DateTime? LastDeferredAt { get; set; }
    [MaxLength(50)]
    public string? LastDeferredBy { get; set; }

    // Execution
    public DateTime? StartedAt { get; set; }
    [MaxLength(50)]
    public string? StartedBy { get; set; }
    public double? ActualRunningHours { get; set; }
    public int? EstimatedDuration { get; set; }
    public int? ActualDuration { get; set; }

    // Report data
    public bool ChecklistCompleted { get; set; } = false;
    public int PhotosUploaded { get; set; } = 0;
    public int RequiredPhotos { get; set; } = 0;
    public string? Notes { get; set; }
    [MaxLength(4000)]
    public string? RequiredSpareParts { get; set; }
    [MaxLength(4000)]
    public string? SparePartsUsed { get; set; }

    // Submission
    public DateTime? SubmittedAt { get; set; }
    [MaxLength(50)]
    public string? SubmittedBy { get; set; }

    // Verification
    public DateTime? VerifiedAt { get; set; }
    [MaxLength(50)]
    public string? VerifiedBy { get; set; }
    [MaxLength(20)]
    public string? VerificationResult { get; set; }
    public string? VerificationNotes { get; set; }

    // Rectify
    public string? RejectionReason { get; set; }
    public int RejectionCount { get; set; } = 0;
    public DateTime? LastRejectedAt { get; set; }
    [MaxLength(50)]
    public string? LastRejectedBy { get; set; }
    [Column(TypeName = "jsonb")]
    public string? RejectionHistory { get; set; }

    // Completion
    public DateTime? CompletedAt { get; set; }
    [MaxLength(100)]
    public string? CompletedBy { get; set; }

    // Cancellation
    public DateTime? CancelledAt { get; set; }
    [MaxLength(50)]
    public string? CancelledBy { get; set; }
    public string? CancellationReason { get; set; }

    // CMS
    public bool IsCms { get; set; } = false;

    // Soft delete
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }

    // Vessel scope
    public Guid? VesselId { get; set; }

    // Audit
    public bool IsSynced { get; set; } = false;
    public DateTime? SyncedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = string.Empty;
}
