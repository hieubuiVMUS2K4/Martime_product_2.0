using System;
using System.ComponentModel.DataAnnotations;

namespace MaritimeEdge.DTOs.Logbooks
{
    public class CreateGarbageRecordEntryDto
    {
        [Required]
        public DateTime OperationDateTime { get; set; }

        [Required]
        [MaxLength(5)]
        public string OperationCode { get; set; } = string.Empty;

        [Required]
        [MaxLength(20)]
        public string GarbageCategory { get; set; } = string.Empty;

        [Required]
        public string Description { get; set; } = string.Empty;

        [Required]
        public double Quantity { get; set; }

        [MaxLength(10)]
        public string QuantityUnit { get; set; } = "m³";

        public double? Latitude { get; set; }
        public double? Longitude { get; set; }

        [MaxLength(100)]
        public string? PortName { get; set; }
        
        [MaxLength(200)]
        public string? ReceptionFacility { get; set; }
        
        [MaxLength(100)]
        public string? ReceiptNumber { get; set; }

        public DateTime? IncinerationStartTime { get; set; }
        public DateTime? IncinerationEndTime { get; set; }
        
        [MaxLength(200)]
        public string? IncineratorDetails { get; set; }

        [MaxLength(500)]
        public string? AccidentalDischargeReason { get; set; }
        
        [MaxLength(500)]
        public string? AccidentalDischargeMeasures { get; set; }

        [Required]
        [MaxLength(100)]
        public string OfficerInCharge { get; set; } = string.Empty;

        public string? Remarks { get; set; }
    }

    public class UpdateGarbageRecordEntryDto : CreateGarbageRecordEntryDto
    {
    }

    public class GarbageRecordEntryResponseDto
    {
        public Guid Id { get; set; }
        public DateTime OperationDateTime { get; set; }
        public string OperationCode { get; set; } = string.Empty;
        public string GarbageCategory { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public double Quantity { get; set; }
        public string QuantityUnit { get; set; } = string.Empty;
        
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }
        
        public string? PortName { get; set; }
        public string? ReceptionFacility { get; set; }
        public string? ReceiptNumber { get; set; }
        
        public DateTime? IncinerationStartTime { get; set; }
        public DateTime? IncinerationEndTime { get; set; }
        public string? IncineratorDetails { get; set; }
        
        public string? AccidentalDischargeReason { get; set; }
        public string? AccidentalDischargeMeasures { get; set; }
        
        public string OfficerInCharge { get; set; } = string.Empty;
        public string? MasterSignature { get; set; }
        public DateTime? SignedAt { get; set; }
        public string? Remarks { get; set; }
        
        public bool IsSynced { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public string OriginNode { get; set; } = string.Empty;

        public Guid? VoyageId { get; set; }
        public Guid? VoyagePlanLegId { get; set; }
    }

    public class SignGarbageRecordDto
    {
        [MaxLength(100)]
        public string MasterSignature { get; set; } = string.Empty;
        
        public DateTime SignedAt { get; set; }
    }
}
