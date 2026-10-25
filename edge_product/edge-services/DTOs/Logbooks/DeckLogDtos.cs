using System;
using System.ComponentModel.DataAnnotations;

namespace MaritimeEdge.DTOs.Logbooks
{
    public class CreateDeckLogEntryDto
    {
        [Required]
        public DateTime LogDateTime { get; set; }

        [Required]
        [MaxLength(10)]
        public string WatchPeriod { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string OfficerOnWatch { get; set; } = string.Empty;

        [Required]
        [MaxLength(30)]
        public string EntryType { get; set; } = string.Empty;

        [Required]
        public string Description { get; set; } = string.Empty;

        public double? Latitude { get; set; }
        public double? Longitude { get; set; }
        public double? CourseOverGround { get; set; }
        public double? SpeedOverGround { get; set; }
        public double? Heading { get; set; }

        [MaxLength(20)]
        public string? WindDirection { get; set; }
        public double? WindSpeed { get; set; }
        
        [MaxLength(20)]
        public string? SeaState { get; set; }
        
        [MaxLength(30)]
        public string? Visibility { get; set; }
        
        public double? BarometricPressure { get; set; }
        public double? AirTemperature { get; set; }
        public double? SeaTemperature { get; set; }

        [MaxLength(50)]
        public string? DrillType { get; set; }
        public bool? DrillSuccessful { get; set; }

        public int? CrewOnBoard { get; set; }
        [MaxLength(200)]
        public string? CrewChanges { get; set; }

        [MaxLength(100)]
        public string? PortName { get; set; }
        public DateTime? PortArrivalTime { get; set; }
        public DateTime? PortDepartureTime { get; set; }

        [MaxLength(100)]
        public string? PilotName { get; set; }
        public DateTime? PilotOnBoard { get; set; }
        public DateTime? PilotOffBoard { get; set; }

        public string? Remarks { get; set; }
    }

    public class UpdateDeckLogEntryDto : CreateDeckLogEntryDto
    {
        // Inherits all fields from CreateDeckLogEntryDto
    }

    public class DeckLogEntryResponseDto
    {
        public Guid Id { get; set; }
        public DateTime LogDateTime { get; set; }
        public string WatchPeriod { get; set; } = string.Empty;
        public string OfficerOnWatch { get; set; } = string.Empty;
        public string EntryType { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }
        public double? CourseOverGround { get; set; }
        public double? SpeedOverGround { get; set; }
        public double? Heading { get; set; }
        
        public string? WindDirection { get; set; }
        public double? WindSpeed { get; set; }
        public string? SeaState { get; set; }
        public string? Visibility { get; set; }
        
        public double? BarometricPressure { get; set; }
        public double? AirTemperature { get; set; }
        public double? SeaTemperature { get; set; }
        
        public string? DrillType { get; set; }
        public bool? DrillSuccessful { get; set; }
        
        public int? CrewOnBoard { get; set; }
        public string? CrewChanges { get; set; }
        
        public string? PortName { get; set; }
        public DateTime? PortArrivalTime { get; set; }
        public DateTime? PortDepartureTime { get; set; }
        
        public string? PilotName { get; set; }
        public DateTime? PilotOnBoard { get; set; }
        public DateTime? PilotOffBoard { get; set; }
        
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

    public class SignDeckLogDto
    {
        [MaxLength(100)]
        public string MasterSignature { get; set; } = string.Empty;
        
        public DateTime SignedAt { get; set; }
    }
}
