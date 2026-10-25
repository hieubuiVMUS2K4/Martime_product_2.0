using System;
using System.ComponentModel.DataAnnotations;

namespace MaritimeEdge.DTOs.Logbooks
{
    public class CreateOilRecordEntryDto
    {
        [Required]
        public DateTime EntryDate { get; set; }

        [Required]
        [MaxLength(10)]
        public string OperationCode { get; set; } = string.Empty;

        [Required]
        public string OperationDescription { get; set; } = string.Empty;

        public double? LocationLat { get; set; }
        public double? LocationLon { get; set; }

        public double? Quantity { get; set; }
        
        [MaxLength(20)]
        public string? QuantityUnit { get; set; } = "m³";

        [MaxLength(50)]
        public string? TankFrom { get; set; }
        
        [MaxLength(50)]
        public string? TankTo { get; set; }

        [Required]
        [MaxLength(100)]
        public string OfficerInCharge { get; set; } = string.Empty;

        public string? Remarks { get; set; }
    }

    public class UpdateOilRecordEntryDto : CreateOilRecordEntryDto
    {
    }

    public class OilRecordEntryResponseDto
    {
        public Guid Id { get; set; }
        public DateTime EntryDate { get; set; }
        public string OperationCode { get; set; } = string.Empty;
        public string OperationDescription { get; set; } = string.Empty;
        
        public double? LocationLat { get; set; }
        public double? LocationLon { get; set; }
        
        public double? Quantity { get; set; }
        public string? QuantityUnit { get; set; }
        
        public string? TankFrom { get; set; }
        public string? TankTo { get; set; }
        
        public string OfficerInCharge { get; set; } = string.Empty;
        public string? MasterSignature { get; set; }
        public string? Remarks { get; set; }
        
        public bool IsSynced { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public string OriginNode { get; set; } = string.Empty;

        public Guid? VoyageId { get; set; }
        public Guid? VoyagePlanLegId { get; set; }
    }

    public class SignOilRecordDto
    {
        [MaxLength(200)]
        public string MasterSignature { get; set; } = string.Empty;
    }
}
