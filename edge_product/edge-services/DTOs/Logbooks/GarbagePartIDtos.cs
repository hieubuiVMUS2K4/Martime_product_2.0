using System;
using System.ComponentModel.DataAnnotations;

namespace MaritimeEdge.DTOs.Logbooks
{
    /// <summary>
    /// DTO for creating Garbage Record Part I entry
    /// Categories A-I (regular garbage, excluding cargo residues J-K)
    /// </summary>
    public class CreateGarbagePartIDto
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
        /// Category: A, B, C, D, E, F, G, H, or I
        /// A=Plastics, B=Food, C=Domestic, D=Cooking Oil, E=Ashes,
        /// F=Operational, G=Animal carcasses, H=Fishing gear, I=E-waste
        /// </summary>
        [Required]
        [MaxLength(5)]
        [RegularExpression("^[A-I]$", ErrorMessage = "Category must be A-I for Part I")]
        public string Category { get; set; } = string.Empty;

        [Required]
        [MaxLength(500)]
        public string Description { get; set; } = string.Empty;

        /// <summary>
        /// Estimated amount discharged into sea (m³)
        /// Validation: Some categories prohibited from sea discharge
        /// </summary>
        [Range(0, double.MaxValue)]
        public double? EstimatedAmountDischargedToSea { get; set; }

        /// <summary>
        /// Estimated amount discharged to reception facilities (m³)
        /// </summary>
        [Range(0, double.MaxValue)]
        public double? EstimatedAmountToReceptionFacilities { get; set; }

        /// <summary>
        /// Estimated amount incinerated (m³)
        /// </summary>
        [Range(0, double.MaxValue)]
        public double? EstimatedAmountIncinerated { get; set; }

        // Position for sea discharge
        [Range(-90, 90)]
        public double? DischargeLatitude { get; set; }

        [Range(-180, 180)]
        public double? DischargeLongitude { get; set; }

        // Reception facility details
        [MaxLength(100)]
        public string? PortName { get; set; }

        [MaxLength(200)]
        public string? ReceptionFacilityName { get; set; }

        [MaxLength(100)]
        public string? ReceiptNumber { get; set; }

        // Incineration details
        public DateTime? IncinerationStartTime { get; set; }
        public DateTime? IncinerationEndTime { get; set; }

        [MaxLength(200)]
        public string? IncineratorDetails { get; set; }

        // Exceptional discharge
        [MaxLength(500)]
        public string? ExceptionalDischargeReason { get; set; }

        /// <summary>
        /// Water depth at discharge location (meters)
        /// Required for exceptional discharge documentation
        /// </summary>
        [Range(0, double.MaxValue)]
        public double? WaterDepth { get; set; }

        [MaxLength(1000)]
        public string? Remarks { get; set; }

        [Required]
        [MaxLength(100)]
        public string OfficerInCharge { get; set; } = string.Empty;
    }

    public class UpdateGarbagePartIDto : CreateGarbagePartIDto
    {
    }

    /// <summary>
    /// Response DTO for Garbage Record Part I
    /// </summary>
    public class GarbagePartIResponseDto
    {
        public Guid Id { get; set; }
        public DateTime OperationDate { get; set; }
        public TimeSpan OperationTime { get; set; }
        public TimeSpan? OperationEndTime { get; set; }
        public string Category { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;

        public double? EstimatedAmountDischargedToSea { get; set; }
        public double? EstimatedAmountToReceptionFacilities { get; set; }
        public double? EstimatedAmountIncinerated { get; set; }

        public double? DischargeLatitude { get; set; }
        public double? DischargeLongitude { get; set; }

        public string? PortName { get; set; }
        public string? ReceptionFacilityName { get; set; }
        public string? ReceiptNumber { get; set; }

        public DateTime? IncinerationStartTime { get; set; }
        public DateTime? IncinerationEndTime { get; set; }
        public string? IncineratorDetails { get; set; }

        public string? ExceptionalDischargeReason { get; set; }
        public double? WaterDepth { get; set; }
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
    /// DTO for signing a Garbage Part I entry
    /// </summary>
    public class SignGarbagePartIDto
    {
        [Required]
        [MaxLength(100)]
        public string MasterSignature { get; set; } = string.Empty;

        [Required]
        public DateTime SignedAt { get; set; }
    }
}
