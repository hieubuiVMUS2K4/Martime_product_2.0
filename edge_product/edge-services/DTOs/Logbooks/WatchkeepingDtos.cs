using System;
using System.ComponentModel.DataAnnotations;

namespace MaritimeEdge.DTOs.Logbooks
{
    public class CreateWatchkeepingLogDto
    {
        [Required]
        public DateTime WatchDate { get; set; }

        [Required]
        [MaxLength(20)]
        public string WatchPeriod { get; set; } = string.Empty;

        [Required]
        [MaxLength(20)]
        public string WatchType { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string OfficerOnWatch { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? ReliefOfficer { get; set; }

        [MaxLength(100)]
        public string? Lookout { get; set; }

        // STCW Rest Hours Compliance (Mandatory)
        public double WorkHours { get; set; } = 4.0;
        
        public double RestHoursLast24h { get; set; }
        
        public double RestHoursLast7Days { get; set; }
        
        public bool RestHoursCompliant { get; set; } = true;
        
        [MaxLength(500)]
        public string? RestHoursException { get; set; }

        // Weather & Navigation
        public string? WeatherConditions { get; set; }
        
        [MaxLength(50)]
        public string? SeaState { get; set; }
        
        [MaxLength(50)]
        public string? Visibility { get; set; }

        public double? CourseLogged { get; set; }
        public double? SpeedLogged { get; set; }
        public double? PositionLat { get; set; }
        public double? PositionLon { get; set; }
        public double? DistanceRun { get; set; }

        // Bridge Equipment Status
        [MaxLength(200)]
        public string? EngineStatus { get; set; }
        
        public bool RadarOperational { get; set; } = true;
        public bool ECDISOperational { get; set; } = true;
        public bool AISOperational { get; set; } = true;
        public bool GyroOperational { get; set; } = true;
        public bool AutopilotEngaged { get; set; } = false;
        
        [MaxLength(500)]
        public string? EquipmentDefects { get; set; }

        // GMDSS Watch
        public bool GMDSSWatchMaintained { get; set; } = true;
        
        [MaxLength(200)]
        public string? NavigationWarningsReceived { get; set; }

        // Watch Events & Handover
        public string? NotableEvents { get; set; }
        
        [MaxLength(1000)]
        public string? HandoverNotes { get; set; }
        
        public bool HandoverChecklistCompleted { get; set; } = false;
        
        public DateTime? WatchStartTime { get; set; }
        public DateTime? WatchEndTime { get; set; }

        // Bridge Manning
        public int BridgeManningLevel { get; set; } = 2;
        public bool LookoutPosted { get; set; } = true;

        // Fatigue Management
        [MaxLength(20)]
        public string? FatigueRiskLevel { get; set; }
        
        public bool FatigueAssessmentDone { get; set; } = false;
    }

    public class UpdateWatchkeepingLogDto : CreateWatchkeepingLogDto
    {
    }

    public class WatchkeepingLogResponseDto
    {
        public Guid Id { get; set; }
        public DateTime WatchDate { get; set; }
        public string WatchPeriod { get; set; } = string.Empty;
        public string WatchType { get; set; } = string.Empty;
        public string OfficerOnWatch { get; set; } = string.Empty;
        public string? ReliefOfficer { get; set; }
        
        public string? Lookout { get; set; }
        
        // STCW Rest Hours
        public double WorkHours { get; set; }
        public double RestHoursLast24h { get; set; }
        public double RestHoursLast7Days { get; set; }
        public bool RestHoursCompliant { get; set; }
        public string? RestHoursException { get; set; }
        
        // Weather & Navigation
        public string? WeatherConditions { get; set; }
        public string? SeaState { get; set; }
        public string? Visibility { get; set; }
        
        public double? CourseLogged { get; set; }
        public double? SpeedLogged { get; set; }
        public double? PositionLat { get; set; }
        public double? PositionLon { get; set; }
        public double? DistanceRun { get; set; }
        
        // Bridge Equipment
        public string? EngineStatus { get; set; }
        public bool RadarOperational { get; set; }
        public bool ECDISOperational { get; set; }
        public bool AISOperational { get; set; }
        public bool GyroOperational { get; set; }
        public bool AutopilotEngaged { get; set; }
        public string? EquipmentDefects { get; set; }
        
        // GMDSS
        public bool GMDSSWatchMaintained { get; set; }
        public string? NavigationWarningsReceived { get; set; }
        
        // Watch Events & Handover
        public string? NotableEvents { get; set; }
        public string? HandoverNotes { get; set; }
        public bool HandoverChecklistCompleted { get; set; }
        public DateTime? WatchStartTime { get; set; }
        public DateTime? WatchEndTime { get; set; }
        
        // Bridge Manning
        public int BridgeManningLevel { get; set; }
        public bool LookoutPosted { get; set; }
        
        // Fatigue Management
        public string? FatigueRiskLevel { get; set; }
        public bool FatigueAssessmentDone { get; set; }
        
        public string? MasterSignature { get; set; }
        public DateTime? SignedAt { get; set; }
        
        public bool IsSynced { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public string OriginNode { get; set; } = string.Empty;

        public Guid? VoyageId { get; set; }
        public Guid? VoyagePlanLegId { get; set; }
    }

    public class SignWatchkeepingLogDto
    {
        [MaxLength(200)]
        public string MasterSignature { get; set; } = string.Empty;
        
        public DateTime SignedAt { get; set; }
    }
    
    /// <summary>
    /// DTO for Rest Hours compliance check
    /// </summary>
    public class RestHoursComplianceDto
    {
        public string OfficerName { get; set; } = string.Empty;
        public double RestHoursLast24h { get; set; }
        public double RestHoursLast7Days { get; set; }
        public bool IsCompliant24h { get; set; } // >= 10 hours
        public bool IsCompliant7Days { get; set; } // >= 77 hours
        public bool IsOverallCompliant { get; set; }
        public string? ComplianceMessage { get; set; }
    }
}
