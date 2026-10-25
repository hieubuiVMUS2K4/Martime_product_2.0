using System;
using System.ComponentModel.DataAnnotations;

namespace MaritimeEdge.DTOs.Logbooks
{
    public class CreateEngineLogEntryDto
    {
        [Required]
        public DateTime LogDateTime { get; set; }

        [Required]
        [MaxLength(10)]
        public string WatchPeriod { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string EngineerOnWatch { get; set; } = string.Empty;

        [MaxLength(50)]
        public string? MainEngineStatus { get; set; }
        public double? MainEngineRPM { get; set; }
        public double? MainEngineLoad { get; set; }
        public double? MainEngineCoolantTemp { get; set; }
        public double? MainEngineExhaustTemp { get; set; }
        public double? MainEngineLubeOilPressure { get; set; }
        public double? MainEngineLubeOilTemp { get; set; }
        public double? MainEngineRunningHours { get; set; }

        public double? FuelOilConsumedME { get; set; }
        public double? FuelOilConsumedAE { get; set; }
        public double? FuelOilConsumedBoiler { get; set; }
        public double? LubeOilConsumed { get; set; }
        
        [MaxLength(10)]
        public string? FuelUnit { get; set; } = "MT";

        public bool? AuxEngine1Running { get; set; }
        public double? AuxEngine1RunningHours { get; set; }
        public double? AuxEngine1Load { get; set; }

        public bool? AuxEngine2Running { get; set; }
        public double? AuxEngine2RunningHours { get; set; }
        public double? AuxEngine2Load { get; set; }

        public bool? AuxEngine3Running { get; set; }
        public double? AuxEngine3RunningHours { get; set; }
        public double? AuxEngine3Load { get; set; }

        public bool? BoilerInOperation { get; set; }
        public double? BoilerPressure { get; set; }
        public double? BoilerWaterLevel { get; set; }

        public double? FuelOilROB { get; set; }
        [MaxLength(200)]
        public string? FuelOilTransfers { get; set; }

        public bool HasAlarms { get; set; } = false;
        [MaxLength(500)]
        public string? AlarmsDescription { get; set; }

        [MaxLength(500)]
        public string? MaintenanceActivities { get; set; }
        public string? Remarks { get; set; }
    }

    public class UpdateEngineLogEntryDto : CreateEngineLogEntryDto
    {
        // Inherits all fields from CreateEngineLogEntryDto
    }

    public class EngineLogEntryResponseDto
    {
        public Guid Id { get; set; }
        public DateTime LogDateTime { get; set; }
        public string WatchPeriod { get; set; } = string.Empty;
        public string EngineerOnWatch { get; set; } = string.Empty;
        
        public string? MainEngineStatus { get; set; }
        public double? MainEngineRPM { get; set; }
        public double? MainEngineLoad { get; set; }
        public double? MainEngineCoolantTemp { get; set; }
        public double? MainEngineExhaustTemp { get; set; }
        public double? MainEngineLubeOilPressure { get; set; }
        public double? MainEngineLubeOilTemp { get; set; }
        public double? MainEngineRunningHours { get; set; }
        
        public double? FuelOilConsumedME { get; set; }
        public double? FuelOilConsumedAE { get; set; }
        public double? FuelOilConsumedBoiler { get; set; }
        public double? LubeOilConsumed { get; set; }
        public string? FuelUnit { get; set; }
        
        public bool? AuxEngine1Running { get; set; }
        public double? AuxEngine1RunningHours { get; set; }
        public double? AuxEngine1Load { get; set; }
        
        public bool? AuxEngine2Running { get; set; }
        public double? AuxEngine2RunningHours { get; set; }
        public double? AuxEngine2Load { get; set; }
        
        public bool? AuxEngine3Running { get; set; }
        public double? AuxEngine3RunningHours { get; set; }
        public double? AuxEngine3Load { get; set; }
        
        public bool? BoilerInOperation { get; set; }
        public double? BoilerPressure { get; set; }
        public double? BoilerWaterLevel { get; set; }
        
        public double? FuelOilROB { get; set; }
        public string? FuelOilTransfers { get; set; }
        
        public bool HasAlarms { get; set; }
        public string? AlarmsDescription { get; set; }
        public string? MaintenanceActivities { get; set; }
        
        public string? ChiefEngineerRemarks { get; set; }
        public string? ChiefEngineerSignature { get; set; }
        public DateTime? SignedAt { get; set; }
        public string? Remarks { get; set; }
        
        public bool IsSynced { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public string OriginNode { get; set; } = string.Empty;

        public Guid? VoyageId { get; set; }
        public Guid? VoyagePlanLegId { get; set; }
    }

    public class SignEngineLogDto
    {
        [MaxLength(100)]
        public string ChiefEngineerSignature { get; set; } = string.Empty;
        
        public DateTime SignedAt { get; set; }
        
        public string? ChiefEngineerRemarks { get; set; }
    }
}
