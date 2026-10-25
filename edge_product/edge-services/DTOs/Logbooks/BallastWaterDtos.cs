using System;
using System.ComponentModel.DataAnnotations;

namespace MaritimeEdge.DTOs.Logbooks
{
    public class CreateBallastWaterEntryDto
    {
        [Required]
        public DateTime OperationDateTime { get; set; }

        [Required]
        [MaxLength(5)]
        public string OperationCode { get; set; } = string.Empty;

        [Required]
        public string OperationDescription { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string BallastTank { get; set; } = string.Empty;

        [Required]
        public double Volume { get; set; }

        [Required]
        public double StartLatitude { get; set; }
        
        [Required]
        public double StartLongitude { get; set; }
        
        [Required]
        public DateTime StartDateTime { get; set; }

        public double? EndLatitude { get; set; }
        public double? EndLongitude { get; set; }
        public DateTime? EndDateTime { get; set; }

        public double? WaterDepth { get; set; }
        public double? DistanceFromLand { get; set; }
        public double? ExchangeVolumePercentage { get; set; }
        
        [MaxLength(30)]
        public string? ExchangeMethod { get; set; }

        public bool? TreatmentSystemUsed { get; set; }
        
        [MaxLength(200)]
        public string? TreatmentSystemType { get; set; }
        
        public bool? TreatmentSuccessful { get; set; }
        
        [MaxLength(500)]
        public string? TreatmentDetails { get; set; }
        
        [MaxLength(500)]
        public string? ExceptionalCircumstances { get; set; }

        public double? SalinityBeforeExchange { get; set; }
        public double? SalinityAfterExchange { get; set; }

        [MaxLength(100)]
        public string? PortName { get; set; }
        
        [MaxLength(200)]
        public string? ReceptionFacility { get; set; }
        
        [MaxLength(100)]
        public string? ReceiptNumber { get; set; }

        [Required]
        [MaxLength(100)]
        public string OfficerInCharge { get; set; } = string.Empty;

        public string? Remarks { get; set; }
    }

    public class UpdateBallastWaterEntryDto : CreateBallastWaterEntryDto
    {
    }

    public class BallastWaterEntryResponseDto
    {
        public Guid Id { get; set; }
        public DateTime OperationDateTime { get; set; }
        public string OperationCode { get; set; } = string.Empty;
        public string OperationDescription { get; set; } = string.Empty;
        public string BallastTank { get; set; } = string.Empty;
        public double Volume { get; set; }
        
        public double StartLatitude { get; set; }
        public double StartLongitude { get; set; }
        public DateTime StartDateTime { get; set; }
        
        public double? EndLatitude { get; set; }
        public double? EndLongitude { get; set; }
        public DateTime? EndDateTime { get; set; }
        
        public double? WaterDepth { get; set; }
        public double? DistanceFromLand { get; set; }
        public double? ExchangeVolumePercentage { get; set; }
        public string? ExchangeMethod { get; set; }
        
        public bool? TreatmentSystemUsed { get; set; }
        public string? TreatmentSystemType { get; set; }
        public bool? TreatmentSuccessful { get; set; }
        public string? TreatmentDetails { get; set; }
        public string? ExceptionalCircumstances { get; set; }
        
        public double? SalinityBeforeExchange { get; set; }
        public double? SalinityAfterExchange { get; set; }
        
        public string? PortName { get; set; }
        public string? ReceptionFacility { get; set; }
        public string? ReceiptNumber { get; set; }
        
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

    public class SignBallastWaterDto
    {
        [MaxLength(100)]
        public string MasterSignature { get; set; } = string.Empty;
        
        public DateTime SignedAt { get; set; }
    }
}
