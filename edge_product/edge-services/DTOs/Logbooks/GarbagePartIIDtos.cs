using System;
using System.ComponentModel.DataAnnotations;

namespace MaritimeEdge.DTOs.Logbooks
{
    /// <summary>
    /// DTO for creating Garbage Record Part II entry
    /// Categories J-K (cargo residues only)
    /// </summary>
    public class CreateGarbagePartIIDto
    {
        [Required]
        public DateTime OperationDate { get; set; }

        [Required]
        public TimeSpan OperationTime { get; set; }

        /// <summary>
        /// Stop time for the operation (optional)
        /// </summary>
        public TimeSpan? OperationEndTime { get; set; }

        /// <summary>
        /// Category: J or K only
        /// J = Cargo residues (non-HME) - can discharge to sea under conditions
        /// K = Cargo residues (HME) - STRICTLY PROHIBITED to discharge to sea
        /// </summary>
        [Required]
        [MaxLength(5)]
        [RegularExpression("^[JK]$", ErrorMessage = "Category must be J or K for Part II")]
        public string Category { get; set; } = string.Empty;

        /// <summary>
        /// Position at start of discharge - MANDATORY
        /// </summary>
        [Required]
        [Range(-90, 90)]
        public double StartLatitude { get; set; }

        [Required]
        [Range(-180, 180)]
        public double StartLongitude { get; set; }

        /// <summary>
        /// Position at end of discharge - MANDATORY
        /// </summary>
        [Required]
        [Range(-90, 90)]
        public double EndLatitude { get; set; }

        [Required]
        [Range(-180, 180)]
        public double EndLongitude { get; set; }

        /// <summary>
        /// Estimated amount discharged into sea (m³)
        /// Only for Category J (non-HME)
        /// Category K MUST be 0 or null
        /// </summary>
        [Range(0, double.MaxValue)]
        public double? EstimatedAmountDischargedToSea { get; set; }

        /// <summary>
        /// Estimated amount discharged to reception facilities (m³)
        /// Mandatory for Category K
        /// </summary>
        [Range(0, double.MaxValue)]
        public double? EstimatedAmountToReceptionFacilities { get; set; }

        // Reception facility details
        [MaxLength(100)]
        public string? PortName { get; set; }

        [MaxLength(200)]
        public string? ReceptionFacilityName { get; set; }

        [MaxLength(100)]
        public string? ReceiptNumber { get; set; }

        /// <summary>
        /// Cargo description - type of cargo whose residues are being discharged
        /// </summary>
        [Required]
        [MaxLength(500)]
        public string CargoDescription { get; set; } = string.Empty;

        /// <summary>
        /// Hold numbers that were washed
        /// e.g., "Hold 1, 2, 3" or "All holds"
        /// </summary>
        [Required]
        [MaxLength(200)]
        public string HoldNumbersWashed { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string? Remarks { get; set; }

        [Required]
        [MaxLength(100)]
        public string OfficerInCharge { get; set; } = string.Empty;
    }

    public class UpdateGarbagePartIIDto : CreateGarbagePartIIDto
    {
    }

    /// <summary>
    /// Response DTO for Garbage Record Part II
    /// </summary>
    public class GarbagePartIIResponseDto
    {
        public Guid Id { get; set; }
        public DateTime OperationDate { get; set; }
        public TimeSpan OperationTime { get; set; }
        public TimeSpan? OperationEndTime { get; set; }
        public string Category { get; set; } = string.Empty;

        public double StartLatitude { get; set; }
        public double StartLongitude { get; set; }
        public double EndLatitude { get; set; }
        public double EndLongitude { get; set; }

        public double? EstimatedAmountDischargedToSea { get; set; }
        public double? EstimatedAmountToReceptionFacilities { get; set; }

        public string? PortName { get; set; }
        public string? ReceptionFacilityName { get; set; }
        public string? ReceiptNumber { get; set; }

        public string CargoDescription { get; set; } = string.Empty;
        public string HoldNumbersWashed { get; set; } = string.Empty;
        public string? Remarks { get; set; }

        public string OfficerInCharge { get; set; } = string.Empty;
        public string? MasterSignature { get; set; }
        public DateTime? SignedAt { get; set; }

        public bool IsSynced { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public string OriginNode { get; set; } = string.Empty;

        public Guid? VoyageId { get; set; }
        public Guid? VoyagePlanLegId { get; set; }
    }

    /// <summary>
    /// DTO for signing a Garbage Part II entry
    /// </summary>
    public class SignGarbagePartIIDto
    {
        [MaxLength(100)]
        public string MasterSignature { get; set; } = string.Empty;

        public DateTime SignedAt { get; set; }
    }
}
