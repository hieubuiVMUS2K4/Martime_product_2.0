using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace MaritimeEdge.Models
{
    /// <summary>
    /// Represents a controlled document within the HSQE system (TL-01)
    /// </summary>
    public class HsqeDocument
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        [MaxLength(50)]
        public string DocumentCode { get; set; } = string.Empty; // e.g., TL-01, TL-01-01

        [Required]
        [MaxLength(200)]
        public string Title { get; set; } = string.Empty;

        [Required]
        [MaxLength(50)]
        public string Category { get; set; } = "PROCEDURE"; // SMS_HANDBOOK, PROCEDURE, FORM, EXTERNAL

        [Column(TypeName = "text")]
        public string Content { get; set; } = string.Empty;

        [Required]
        [MaxLength(20)]
        public string CurrentVersion { get; set; } = "Rev 1.0";

        [Required]
        [MaxLength(30)]
        public string Status { get; set; } = "Draft"; // Draft, Pending_DPA, Published, Obsolete

        [MaxLength(500)]
        public string? ObsoleteReason { get; set; }

        public bool IsControlled { get; set; } = true;

        [MaxLength(100)]
        public string WatermarkText { get; set; } = "TÀI LIỆU ĐƯỢC KIỂM SOÁT";

        [MaxLength(500)]
        public string? DigitalSignature { get; set; }

        [MaxLength(100)]
        public string? ApprovedBy { get; set; }

        public DateTime? ApprovedAt { get; set; }

        public int EditCount { get; set; } = 0;

        // Relations
        public virtual ICollection<HsqeDocumentRevision> Revisions { get; set; } = new List<HsqeDocumentRevision>();
        public virtual ICollection<HsqeDocumentSyncStatus> SyncStatuses { get; set; } = new List<HsqeDocumentSyncStatus>();

        // Sync Metadata
        public bool IsSynced { get; set; } = false;

        [MaxLength(50)]
        public string OriginNode { get; set; } = "SHIP_01";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Tracks revisions and historical content of controlled documents
    /// </summary>
    public class HsqeDocumentRevision
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        public Guid DocumentId { get; set; }

        [ForeignKey("DocumentId")]
        [JsonIgnore]
        public virtual HsqeDocument? Document { get; set; }

        [Required]
        [MaxLength(20)]
        public string Version { get; set; } = "Rev 1.0";

        [Required]
        [MaxLength(500)]
        public string ChangeSummary { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string ChangedBy { get; set; } = string.Empty;

        [Column(TypeName = "text")]
        public string ContentSnapshot { get; set; } = string.Empty;

        [Column(TypeName = "text")]
        public string? DiffContent { get; set; }

        // Sync Metadata
        public bool IsSynced { get; set; } = false;

        [MaxLength(50)]
        public string OriginNode { get; set; } = "SHIP_01";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Shipboard synchronization and acknowledgment status for controlled documents (TL-01-05)
    /// </summary>
    public class HsqeDocumentSyncStatus
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        public Guid DocumentId { get; set; }

        [ForeignKey("DocumentId")]
        [JsonIgnore]
        public virtual HsqeDocument? Document { get; set; }

        [Required]
        [MaxLength(100)]
        public string ShipName { get; set; } = string.Empty;

        public bool Received { get; set; } = false;

        public DateTime? ReceivedDate { get; set; }

        public bool Trained { get; set; } = false;

        public DateTime? TrainedDate { get; set; }

        [MaxLength(100)]
        public string? AcknowledgedBy { get; set; }

        // Sync Metadata
        public bool IsSynced { get; set; } = false;

        [MaxLength(50)]
        public string OriginNode { get; set; } = "SHIP_01";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Represents safety incident, accident, near-miss, or non-conformity report (TL-04)
    /// </summary>
    public class HsqeIncident
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        [MaxLength(50)]
        public string IncidentCode { get; set; } = string.Empty; // e.g., INC-2026-001

        [Required]
        [MaxLength(200)]
        public string Title { get; set; } = string.Empty;

        [Required]
        [MaxLength(50)]
        public string IncidentType { get; set; } = "Near-Miss"; // Accident, Incident, Near-Miss, Non-Conformity, PSC-Deficiency

        [Required]
        [MaxLength(100)]
        public string Vessel { get; set; } = "M/V Green Star";

        [Required]
        public DateTime OccurrenceDate { get; set; } = DateTime.UtcNow;

        [Required]
        [MaxLength(200)]
        public string Location { get; set; } = string.Empty;

        [Required]
        [MaxLength(30)]
        public string Severity { get; set; } = "Medium"; // Low, Medium, High, Critical

        [Required]
        [MaxLength(30)]
        public string Status { get; set; } = "Reported"; // Reported, Investigating, CAPA_Open, Closed

        [Required]
        [Column(TypeName = "text")]
        public string Description { get; set; } = string.Empty;

        [Column(TypeName = "text")]
        public string? ImmediateActions { get; set; }

        [Column(TypeName = "text")]
        public string? RootCause { get; set; }

        // 5 Whys Root Cause Analysis
        [MaxLength(300)]
        public string? Why1 { get; set; }
        [MaxLength(300)]
        public string? Why2 { get; set; }
        [MaxLength(300)]
        public string? Why3 { get; set; }
        [MaxLength(300)]
        public string? Why4 { get; set; }
        [MaxLength(300)]
        public string? Why5 { get; set; }

        // Relations
        public virtual ICollection<HsqeCapa> Capas { get; set; } = new List<HsqeCapa>();

        // Sync Metadata
        public bool IsSynced { get; set; } = false;

        [MaxLength(50)]
        public string OriginNode { get; set; } = "SHIP_01";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Corrective and Preventive Action (CAPA) tracking (TL-04-05)
    /// </summary>
    public class HsqeCapa
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        public Guid IncidentId { get; set; }

        [ForeignKey("IncidentId")]
        [JsonIgnore]
        public virtual HsqeIncident? Incident { get; set; }

        [Required]
        [MaxLength(50)]
        public string CapaCode { get; set; } = string.Empty;

        [Required]
        [MaxLength(30)]
        public string ActionType { get; set; } = "Corrective"; // Corrective, Preventive

        [Required]
        [Column(TypeName = "text")]
        public string Description { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string Assignee { get; set; } = string.Empty;

        [Required]
        public DateTime DueDate { get; set; }

        public bool Completed { get; set; } = false;

        public DateTime? CompletionDate { get; set; }

        [Column(TypeName = "text")]
        public string? VerificationDetails { get; set; }

        // Sync Metadata
        public bool IsSynced { get; set; } = false;

        [MaxLength(50)]
        public string OriginNode { get; set; } = "SHIP_01";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Job Safety Analysis / Risk Assessment (TL-24 / TL-32)
    /// </summary>
    public class HsqeRiskAssessment
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        [MaxLength(50)]
        public string AssessmentCode { get; set; } = string.Empty; // e.g., TL-24-01-01

        [Required]
        [MaxLength(200)]
        public string JobTitle { get; set; } = string.Empty;

        [Required]
        [MaxLength(50)]
        public string Department { get; set; } = "Engine"; // Deck, Engine, Galley

        [Required]
        [MaxLength(100)]
        public string Pic { get; set; } = string.Empty;

        [Required]
        public DateTime AssessmentDate { get; set; } = DateTime.UtcNow;

        [Required]
        [Column(TypeName = "text")]
        public string StepsJson { get; set; } = "[]"; // Serialized array of RiskSteps

        // Sync Metadata
        public bool IsSynced { get; set; } = false;

        [MaxLength(50)]
        public string OriginNode { get; set; } = "SHIP_01";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Dangerous Work Permit (Hot Work, Enclosed Space Entry, Aloft, Cold Work) (TL-13)
    /// </summary>
    public class HsqeWorkPermit
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        [MaxLength(50)]
        public string PermitCode { get; set; } = string.Empty; // e.g., TL-13-03-01

        [Required]
        [MaxLength(50)]
        public string PermitType { get; set; } = "Cold"; // Hot, Enclosed, Aloft, Cold

        [Required]
        [MaxLength(200)]
        public string Title { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string Vessel { get; set; } = "M/V Green Star";

        [Required]
        [MaxLength(200)]
        public string Location { get; set; } = string.Empty;

        [Required]
        [MaxLength(30)]
        public string Status { get; set; } = "Draft"; // Draft, PendingCheck, PendingIssue, Issued, Suspended, Closed

        public int DurationHours { get; set; } = 4;

        [Required]
        public DateTime StartTime { get; set; } = DateTime.UtcNow;

        public Guid? RiskAssessmentId { get; set; }

        [NotMapped]
        public bool IsEffective => Status == "Issued" && DateTime.UtcNow >= StartTime && DateTime.UtcNow < StartTime.AddHours(DurationHours);

        public DateTime? GasTestAt { get; set; }
        public string? GasTestDevice { get; set; }
        public string? GasTestBy { get; set; }

        // Gas Testing Safety Validation
        public double GasTestO2 { get; set; } = 0.0;
        public double GasTestLEL { get; set; } = 0.0;
        public double GasTestCO { get; set; } = 0.0;
        public double GasTestH2S { get; set; } = 0.0;

        [Required]
        [Column(TypeName = "text")]
        public string PrecautionsJson { get; set; } = "[]"; // Serialized checkboxes array

        public bool ChiefOfficerSigned { get; set; } = false;
        public bool CaptainApproved { get; set; } = false;

        /// <summary>
        /// JSON array of digital signature entries (PIN-verified)
        /// </summary>
        [Column(TypeName = "text")]
        public string DigitalSignatures { get; set; } = "[]";

        // Sync Metadata
        public bool IsSynced { get; set; } = false;

        [MaxLength(50)]
        public string OriginNode { get; set; } = "SHIP_01";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// File attachment for a controlled document (Document Library)
    /// </summary>
    public class HsqeDocumentAttachment
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        public Guid DocumentId { get; set; }

        [ForeignKey("DocumentId")]
        [JsonIgnore]
        public virtual HsqeDocument? Document { get; set; }

        [Required]
        [MaxLength(255)]
        public string FileName { get; set; } = string.Empty;

        public long FileSize { get; set; } = 0;

        [Required]
        [MaxLength(100)]
        public string FileType { get; set; } = string.Empty;

        [MaxLength(500)]
        public string? FilePath { get; set; }

        [Required]
        [MaxLength(100)]
        public string UploadedBy { get; set; } = string.Empty;

        // Sync Metadata
        public bool IsSynced { get; set; } = false;

        [MaxLength(50)]
        public string OriginNode { get; set; } = "SHIP_01";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Tracks who has read a controlled document (Read Logs / Acknowledgment)
    /// </summary>
    public class HsqeDocumentReadLog
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        public Guid DocumentId { get; set; }

        [ForeignKey("DocumentId")]
        [JsonIgnore]
        public virtual HsqeDocument? Document { get; set; }

        [MaxLength(100)]
        public string? UserId { get; set; }

        [Required]
        [MaxLength(100)]
        public string UserName { get; set; } = string.Empty;

        [MaxLength(100)]
        public string Rank { get; set; } = string.Empty;

        public DateTime ReadAt { get; set; } = DateTime.UtcNow;

        public bool Acknowledged { get; set; } = true;

        [MaxLength(500)]
        public string? Notes { get; set; }

        // Sync Metadata
        public bool IsSynced { get; set; } = false;

        [MaxLength(50)]
        public string OriginNode { get; set; } = "SHIP_01";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
