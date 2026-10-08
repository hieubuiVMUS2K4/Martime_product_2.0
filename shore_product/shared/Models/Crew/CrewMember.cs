using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;
using Maritime.Shared.Interfaces;
using Maritime.Shared.Models.Documents;

namespace Maritime.Shared.Models.Crew;

/// <summary>
/// Crew Members Management (SOLAS Chapter V, STCW, MLC 2006)
/// Shared between Edge and Shore — single source of truth for the crew entity schema.
/// </summary>
public class CrewMember : ISyncableEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(50)]
    public string CrewId { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string FullName { get; set; } = string.Empty;

    /// <summary>
    /// Foreign key to Ranks table
    /// </summary>
    public int? RankId { get; set; }

    [MaxLength(100)]
    public string? Department { get; set; }

    /// <summary>
    /// Foreign key to Countries table (replaces old Nationality string)
    /// </summary>
    public int? CountryId { get; set; }

    public DateTime? DateOfBirth { get; set; }

    public DateTime? JoinDate { get; set; }

    public DateTime? EmbarkDate { get; set; }

    public DateTime? DisembarkDate { get; set; }

    public DateTime? ContractEnd { get; set; }

    public bool IsOnboard { get; set; } = false;

    [MaxLength(500)]
    public string? EmergencyContact { get; set; }

    [MaxLength(200)]
    public string? EmailAddress { get; set; }

    [MaxLength(50)]
    public string? PhoneNumber { get; set; }

    [MaxLength(500)]
    public string? Address { get; set; }

    // ============================================
    // BIO-DATA FIELDS (STCW/MLC compliant)
    // ============================================

    [MaxLength(200)]
    public string? PlaceOfBirth { get; set; }

    [MaxLength(50)]
    public string? IdCardNumber { get; set; }

    [MaxLength(20)]
    public string? MaritalStatus { get; set; }

    public int? Height { get; set; }

    public decimal? Weight { get; set; }

    [MaxLength(5)]
    public string? BloodGroup { get; set; }

    [MaxLength(10)]
    public string? ClothingSize { get; set; }

    [MaxLength(10)]
    public string? ShoeSize { get; set; }

    [MaxLength(10)]
    public string? CateringSize { get; set; }

    public bool? IsSmoker { get; set; }

    public bool? IsCovidVaccinated { get; set; }

    [MaxLength(500)]
    public string? PhotoUrl { get; set; }

    // Next of Kin
    [MaxLength(200)]
    public string? NextOfKinName { get; set; }

    [MaxLength(50)]
    public string? NextOfKinRelation { get; set; }

    [MaxLength(50)]
    public string? NextOfKinPhone { get; set; }

    [MaxLength(500)]
    public string? NextOfKinAddress { get; set; }

    // Education
    [MaxLength(300)]
    public string? EducationInstitution { get; set; }

    [MaxLength(200)]
    public string? EducationCourse { get; set; }

    public int? EducationPeriodYears { get; set; }

    public int? EducationGraduationYear { get; set; }

    public string? Notes { get; set; }

    // ============================================
    // Crew Lifecycle Status
    // ============================================

    /// <summary>
    /// Crew profile lifecycle: Draft, Active, Inactive, Retired, Suspended
    /// </summary>
    [MaxLength(20)]
    public string Status { get; set; } = "Draft";

    public DateTime? StatusChangedAt { get; set; }

    [MaxLength(100)]
    public string? StatusChangedBy { get; set; }

    /// <summary>
    /// Pool status: Available, Assigned, OnLeave, Medical, Hold
    /// </summary>
    [MaxLength(20)]
    public string? PoolStatus { get; set; } = "Available";

    /// <summary>
    /// Foreign key to Vessels table.
    /// Set when crew is assigned to a vessel; null when on shore/pool.
    /// </summary>
    public Guid? VesselId { get; set; }

    /// <summary>
    /// Onboard review status for edge-side workflow: PendingReview, Approved, OnHold.
    /// Set to "PendingReview" when assigning crew to a vessel, synced to edge.
    /// </summary>
    [MaxLength(20)]
    public string? OnboardStatus { get; set; }

    public DateTime? OnboardStatusChangedAt { get; set; }

    [MaxLength(100)]
    public string? OnboardStatusChangedBy { get; set; }

    /// <summary>
    /// JSON checklist of sections reviewed by edge.
    /// e.g. {"personalInfo":true,"physicalDetails":false,...}
    /// </summary>
    public string? ReviewChecklist { get; set; }

    /// <summary>
    /// Message from edge to shore about missing/incomplete sections.
    /// </summary>
    public string? ReviewNotes { get; set; }

    /// <summary>
    /// JSON describing fields changed by edge.
    /// e.g. [{"field":"phoneNumber","oldValue":"+84...","newValue":"+84...","changedAt":"..."}]
    /// </summary>
    public string? EdgeChanges { get; set; }

    /// <summary>
    /// Whether shore has viewed/acknowledged the edge changes.
    /// </summary>
    public bool EdgeChangesViewed { get; set; } = false;

    // ============================================
    // ISyncableEntity implementation
    // ============================================
    public bool IsSynced { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHORE";

    public long SyncVersion { get; set; } = 0;

    // ============================================
    // Navigation properties
    // ============================================
    [ForeignKey("RankId")]
    public Rank? Rank { get; set; }

    [ForeignKey("CountryId")]
    public Country? Country { get; set; }

    [JsonIgnore]
    public List<CrewCertificate> Certificates { get; set; } = new();

    /// <summary>Tài liệu định danh + sức khoẻ (bảng chung crew_member_documents, phân nhóm theo Category).</summary>
    [JsonIgnore]
    public List<CrewMemberDocument> Documents { get; set; } = new();

    [JsonIgnore]
    public List<ServiceRecord> ServiceRecords { get; set; } = new();

    // ============================================
    // Legacy computed properties for backward compatibility
    // NOT stored in DB — computed from Certificates navigation collection
    // ============================================

    /// <summary>
    /// Helper: Get latest STCW/Competency certificate
    /// Single evaluation to avoid N+1 queries
    /// </summary>
    private CrewCertificate? GetLatestStcwCertificate() =>
        Certificates?
            .Where(c => c.Certificate?.Category == "COMPETENCY" 
                || c.Certificate?.CertificateCode?.StartsWith("STCW", StringComparison.OrdinalIgnoreCase) == true)
            .OrderByDescending(c => c.IssueDate)
            .FirstOrDefault();

    /// <summary>
    /// Helper: Get latest Medical certificate
    /// Single evaluation to avoid N+1 queries
    /// </summary>
    private CrewCertificate? GetLatestMedicalCertificate() =>
        Certificates?
            .Where(c => c.Certificate?.Category == "MEDICAL" 
                || c.Certificate?.CertificateCode?.Equals("MEDICAL", StringComparison.OrdinalIgnoreCase) == true)
            .OrderByDescending(c => c.IssueDate)
            .FirstOrDefault();

    [NotMapped]
    public string? CertificateNumber => GetLatestStcwCertificate()?.CertificateNumber;

    [NotMapped]
    public DateTime? CertificateExpiry => GetLatestStcwCertificate()?.ExpiryDate;

    [NotMapped]
    public DateTime? CertificateIssue => GetLatestStcwCertificate()?.IssueDate;

    [NotMapped]
    public DateTime? MedicalExpiry => GetLatestMedicalCertificate()?.ExpiryDate;

    [NotMapped]
    public DateTime? MedicalIssue => GetLatestMedicalCertificate()?.IssueDate;

    [NotMapped]
    public string? SeamanBookNumber { get; set; }
}
