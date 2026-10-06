using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Maritime.Shared.Interfaces;

namespace ProductApi.Models;

// ============================================================
// SHORE DATABASE MODELS - OPTIMIZED FOR ESSENTIAL DATA ONLY
// Edge has full telemetry, Shore only needs business-critical data
// ============================================================

// Additional sensor mirrors are defined in SensorAndDeferralSyncModels.cs.

/// <summary>
/// GPS/GNSS Position Data
/// </summary>
public class PositionData
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public DateTime Timestamp { get; set; }
    
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double? SpeedOverGround { get; set; }
    public double? CourseOverGround { get; set; }
    
    [MaxLength(20)]
    public string Source { get; set; } = "GPS"; 
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// AIS (Automatic Identification System) Data
/// </summary>
public class AisData
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public DateTime Timestamp { get; set; }
    
    [Required]
    [MaxLength(9)]
    public string Mmsi { get; set; } = string.Empty;
    
    public double? SpeedOverGround { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public double? CourseOverGround { get; set; }
    
    [MaxLength(120)]
    public string? ShipName { get; set; }
    [MaxLength(120)]
    public string? Destination { get; set; }
    public int? EtaMonth { get; set; }
    public int? EtaDay { get; set; }
    public int? EtaHour { get; set; }
    public int? EtaMinute { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

// Additional sensor mirrors are defined in SensorAndDeferralSyncModels.cs.
// Shore gets navigation summary in NoonReport (once per day)

/// <summary>
/// Engine telemetry from Modbus RTU/TCP
/// </summary>
public class EngineData
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public DateTime Timestamp { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string EngineId { get; set; } = string.Empty; 
    
    public double? Rpm { get; set; }
    public double? LoadPercent { get; set; }
    public double? FuelRate { get; set; } 
    public double? RunningHours { get; set; }
    public int? AlarmStatus { get; set; }
    public bool IsRunning { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Fuel consumption data (IMO DCS compliance)
/// </summary>
public class FuelConsumptionData
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public DateTime Timestamp { get; set; }
    
    [Required]
    [MaxLength(20)]
    public string FuelType { get; set; } = string.Empty; 
    
    public double ConsumedVolume { get; set; } 
    public double ConsumedMass { get; set; } 
    
    [MaxLength(50)]
    public string? TankId { get; set; }
    
    public double? Density { get; set; } 
    public double? DistanceTraveled { get; set; } 
    public double? TimeUnderway { get; set; } 
    public double? CargoWeight { get; set; } 
    public double? Co2Emissions { get; set; } 
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Tank level monitoring
/// </summary>
public class TankLevel
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public DateTime Timestamp { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string TankId { get; set; } = string.Empty; 
    
    [Required]
    [MaxLength(20)]
    public string TankType { get; set; } = string.Empty; 
    
    public double LevelPercent { get; set; } 
    public double? VolumeLiters { get; set; }
    public double? Temperature { get; set; } 
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Generator status and performance
/// </summary>
public class GeneratorData
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public DateTime Timestamp { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string GeneratorId { get; set; } = string.Empty; 
    
    public bool IsRunning { get; set; }
    public double? RunningHours { get; set; }
    public double? LoadPercent { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

// Additional sensor mirrors are defined in SensorAndDeferralSyncModels.cs.
// Shore gets environmental summary in NoonReport (once per day)

/// <summary>
/// Safety alarms and alerts
/// </summary>
public class SafetyAlarm
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public DateTime Timestamp { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string AlarmType { get; set; } = string.Empty; 
    
    [MaxLength(50)]
    public string? AlarmCode { get; set; }
    
    [Required]
    [MaxLength(20)]
    public string Severity { get; set; } = string.Empty; 
    
    [MaxLength(100)]
    public string? Location { get; set; } 
    
    [MaxLength(500)]
    public string? Description { get; set; }
    
    public bool IsAcknowledged { get; set; } = false;
    public DateTime? AcknowledgedAt { get; set; }
    [MaxLength(100)]
    public string? AcknowledgedBy { get; set; }
    
    public bool IsResolved { get; set; } = false;
    public DateTime? ResolvedAt { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Engine start/stop event log synced from Edge for shore-side timeline display
/// </summary>
public class EngineEvent
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public DateTime Timestamp { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string EngineId { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(10)]
    public string EventType { get; set; } = string.Empty; // "START" or "STOP"
    
    public double? RpmAtEvent { get; set; }
    
    [MaxLength(50)]
    public string? TriggerSource { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Voyage records for reporting
/// </summary>
public class VoyageRecord : ISyncableEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    [MaxLength(50)]
    public string VoyageNumber { get; set; } = string.Empty;

    [MaxLength(10)]
    public string? VesselIMO { get; set; }

    [MaxLength(100)]
    public string? VesselName { get; set; }

    [MaxLength(50)]
    public string? VesselFlag { get; set; }

    [MaxLength(20)]
    public string? CallSign { get; set; }
    
    [MaxLength(50)]
    public string? DeparturePort { get; set; }

    [MaxLength(5)]
    public string? DeparturePortCode { get; set; }

    public DateTime? DepartureTime { get; set; }

    [MaxLength(50)]
    public string? ArrivalPort { get; set; }

    [MaxLength(5)]
    public string? ArrivalPortCode { get; set; }

    public DateTime? ArrivalTime { get; set; }

    [MaxLength(5)]
    public string? PreviousPortCode { get; set; }

    [MaxLength(100)]
    public string? PreviousPortName { get; set; }

    [MaxLength(100)]
    public string? CargoType { get; set; }

    [MaxLength(40)]
    public string? CharterType { get; set; }

    public double? PlannedDistance { get; set; }

    public double? PlannedDurationHours { get; set; }

    public double? PlannedAverageSpeed { get; set; }

    public double? PlannedFuelConsumption { get; set; }

    public string? VoyageInstructions { get; set; }

    public double? CargoWeight { get; set; } 
    public double? DistanceTraveled { get; set; } 
    public double? FuelConsumed { get; set; } 
    public double? AverageSpeed { get; set; } 
    
    [MaxLength(20)]
    public string VoyageStatus { get; set; } = "PLANNING"; 

    public DateTime? ApprovedAt { get; set; }
    public DateTime? ReadyAt { get; set; }
    public DateTime? CommencedAt { get; set; }
    public DateTime? ArrivedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime? CancelledAt { get; set; }

    public double? TotalEstimatedCost { get; set; }
    public double? TotalEstimatedRevenue { get; set; }
    public double? EstimatedProfitMargin { get; set; }

    [MaxLength(30)]
    public string FinancialStatus { get; set; } = "OPEN";

    public double? TotalActualCost { get; set; }
    public double? TotalActualRevenue { get; set; }
    public double? ActualProfitMargin { get; set; }
    public double? TotalAdvanced { get; set; }
    public double? TotalDisbursed { get; set; }
    public double? OutstandingBalance { get; set; }
    public DateTime? FinancialClosedAt { get; set; }

    [MaxLength(100)]
    public string? FinancialClosedBy { get; set; }

    public bool IsSynced { get; set; } = false;
    public long SyncVersion { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    public virtual List<PortCall> PortCalls { get; set; } = new();
    public virtual List<VoyagePlanLeg> PlanLegs { get; set; } = new();
    public virtual List<VoyageStatusHistory> StatusHistory { get; set; } = new();
    public virtual List<VoyageCrewAssignment> CrewAssignments { get; set; } = new();
    public virtual List<VoyageLogEntry> LogEntries { get; set; } = new();
    public virtual List<CargoOperation> CargoOperations { get; set; } = new();
    public virtual List<VoyageCargoPlan> CargoPlans { get; set; } = new();
    public virtual List<VoyageBunkerPlan> BunkerPlans { get; set; } = new();
    public virtual List<VoyageCrewChangePlan> CrewChangePlans { get; set; } = new();
    public virtual List<VoyageCostEstimate> CostEstimates { get; set; } = new();
    public virtual List<VoyageRevenueEstimate> RevenueEstimates { get; set; } = new();
    public virtual List<VoyageExpenseRequest> ExpenseRequests { get; set; } = new();
    public virtual List<VoyageAdvancePayment> AdvancePayments { get; set; } = new();
    public virtual List<VoyageDisbursement> Disbursements { get; set; } = new();
    public virtual List<VoyageActualRevenue> ActualRevenues { get; set; } = new();
    public virtual List<VoyageSettlement> Settlements { get; set; } = new();
}

// ============================================================
// MARITIME REPORTING SYSTEM (IMO/SOLAS/MARPOL Compliant)
// ============================================================

public class ReportType
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string TypeCode { get; set; } = string.Empty; 
    
    [Required]
    [MaxLength(100)]
    public string TypeName { get; set; } = string.Empty; 
    
    [MaxLength(50)]
    public string Category { get; set; } = string.Empty; 
    
    public string? Description { get; set; }
    [MaxLength(100)]
    public string? RegulationReference { get; set; }
    [MaxLength(30)]
    public string Frequency { get; set; } = "EVENT_BASED";
    public bool IsMandatory { get; set; } = false;
    public bool RequiresMasterSignature { get; set; } = false;
    public string? TemplateSchema { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class MaritimeReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    [MaxLength(50)]
    public string ReportNumber { get; set; } = string.Empty;
    
    [Required]
    public int ReportTypeId { get; set; }
    
    [Required]
    public DateTime ReportDateTime { get; set; }
    
    public Guid? VoyageId { get; set; }
    
    [Required]
    [MaxLength(30)]
    public string Status { get; set; } = "DRAFT";
    
    [MaxLength(100)]
    public string? PreparedBy { get; set; }
    [MaxLength(100)]
    public string? MasterSignature { get; set; }
    public DateTime? SignedAt { get; set; }
    
    [Required]
    public string ReportData { get; set; } = "{}";
    
    public string? Remarks { get; set; }
    public bool IsTransmitted { get; set; } = false;
    public DateTime? TransmittedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
    public DateTime? DeletedAt { get; set; }
    [MaxLength(100)]
    public string? DeletedBy { get; set; }
    public string? DeletedReason { get; set; }
}

public class NoonReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public Guid MaritimeReportId { get; set; }
    
    [Required]
    public DateTime ReportDate { get; set; }
    
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public double? CourseOverGround { get; set; }
    public double? SpeedOverGround { get; set; }
    public double? DistanceTraveled { get; set; }
    public double? DistanceToGo { get; set; }
    public DateTime? EstimatedTimeOfArrival { get; set; }
    
    [MaxLength(50)]
    public string? WeatherConditions { get; set; } 
    [MaxLength(20)]
    public string? SeaState { get; set; } 
    public double? AirTemperature { get; set; } 
    public double? SeaTemperature { get; set; } 
    public double? BarometricPressure { get; set; } 
    [MaxLength(20)]
    public string? WindDirection { get; set; } 
    public double? WindSpeed { get; set; } 
    [MaxLength(20)]
    public string? Visibility { get; set; } 
    
    public double? FuelOilConsumed { get; set; } 
    public double? DieselOilConsumed { get; set; } 
    public double? LubOilConsumed { get; set; } 
    public double? FreshWaterConsumed { get; set; } 
    
    public double? FuelOilROB { get; set; } 
    public double? DieselOilROB { get; set; } 
    public double? LubOilROB { get; set; } 
    public double? FreshWaterROB { get; set; } 
    
    [MaxLength(50)]
    public string? MainEngineRunningHours { get; set; }
    public double? MainEngineRPM { get; set; }
    public double? MainEnginePower { get; set; } 
    [MaxLength(50)]
    public string? AuxEngineRunningHours { get; set; }
    
    public double? CargoOnBoard { get; set; } 
    [MaxLength(100)]
    public string? CargoDescription { get; set; }
    
    public string? OperationalRemarks { get; set; }
    public string? MachineryRemarks { get; set; }
    public string? CargoRemarks { get; set; }
    public string? MaintenanceRemarks { get; set; }
    
    public int? CrewOnBoard { get; set; }
    public int? PassengersOnBoard { get; set; }
    [MaxLength(500)]
    public string? SafetyDrillsConducted { get; set; }
    [MaxLength(500)]
    public string? SafetyIncidents { get; set; }
    
    // ============ SNAPSHOT SUMMARIES (from edge at transmit time) ============
    
    /// <summary>JSON snapshot of PMS/Maintenance summary</summary>
    public string? MaintenanceSummaryJson { get; set; }
    
    /// <summary>JSON snapshot of Alarm summary</summary>
    public string? AlarmSummaryJson { get; set; }
    
    /// <summary>Number of crew certificates expiring within 30 days</summary>
    public int? CertificatesExpiringSoon { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class DepartureReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid MaritimeReportId { get; set; }

    public Guid? VoyageId { get; set; }

    [MaxLength(200)]
    public string? PortName { get; set; }
    [MaxLength(10)]
    public string? PortCode { get; set; }

    public DateTime? DepartureDateTime { get; set; }
    public DateTime? PilotOnBoardTime { get; set; }
    public DateTime? LastLineAshoreTime { get; set; }

    public double? DepartureLatitude { get; set; }
    public double? DepartureLongitude { get; set; }

    [MaxLength(100)]
    public string? NextPort { get; set; }
    [MaxLength(10)]
    public string? NextPortCode { get; set; }
    public DateTime? EstimatedTimeOfArrival { get; set; }
    public double? DistanceToNextPort { get; set; }

    public double? DraftForward { get; set; }
    public double? DraftAft { get; set; }
    public double? DraftMidship { get; set; }

    public double? FuelOilROB { get; set; }
    public double? DieselOilROB { get; set; }
    public double? LubOilROB { get; set; }
    public double? FreshWaterROB { get; set; }

    public double? CargoOnBoard { get; set; }
    [MaxLength(200)]
    public string? CargoDescription { get; set; }
    public int? CrewOnBoard { get; set; }
    public int? PassengersOnBoard { get; set; }

    public string? Remarks { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class ArrivalReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid MaritimeReportId { get; set; }

    public Guid? VoyageId { get; set; }

    [MaxLength(200)]
    public string? PortName { get; set; }
    [MaxLength(10)]
    public string? PortCode { get; set; }

    public DateTime? ArrivalDateTime { get; set; }
    public DateTime? PilotOnBoardTime { get; set; }
    public DateTime? FirstLineAshoreTime { get; set; }

    public double? ArrivalLatitude { get; set; }
    public double? ArrivalLongitude { get; set; }

    public double? VoyageDistance { get; set; }
    public double? VoyageDuration { get; set; }
    public double? AverageSpeed { get; set; }

    public double? DraftForward { get; set; }
    public double? DraftAft { get; set; }
    public double? DraftMidship { get; set; }

    public double? FuelOilROB { get; set; }
    public double? DieselOilROB { get; set; }
    public double? LubOilROB { get; set; }
    public double? FreshWaterROB { get; set; }

    public double? TotalFuelConsumed { get; set; }
    public double? TotalDieselConsumed { get; set; }

    public double? CargoOnBoard { get; set; }
    [MaxLength(200)]
    public string? CargoDescription { get; set; }
    public int? CrewOnBoard { get; set; }
    public int? PassengersOnBoard { get; set; }

    public string? Remarks { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Bunker Delivery Note Report - IMO DCS / MARPOL Annex VI compliance
/// Synced from Edge when transmitted
/// </summary>
public class BunkerReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid MaritimeReportId { get; set; }

    public DateTime BunkerDate { get; set; }

    [MaxLength(200)]
    public string? PortName { get; set; }
    [MaxLength(10)]
    public string? PortCode { get; set; }

    [MaxLength(200)]
    public string? SupplierName { get; set; }

    [MaxLength(50)]
    public string? BDNNumber { get; set; }

    [MaxLength(20)]
    public string? FuelType { get; set; }
    [MaxLength(50)]
    public string? FuelGrade { get; set; }

    public double? QuantityReceived { get; set; }
    public double? Density { get; set; }
    public double? SulphurContent { get; set; }
    public double? Viscosity { get; set; }
    public double? FlashPoint { get; set; }
    public double? ROBefore { get; set; }
    public double? ROBAfter { get; set; }

    [MaxLength(200)]
    public string? TanksLoaded { get; set; }
    [MaxLength(200)]
    public string? SealNumbers { get; set; }
    [MaxLength(100)]
    public string? ChiefEngineerSignature { get; set; }

    public string? Remarks { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Position Report - SOLAS Chapter V Regulation 19
/// Synced from Edge when transmitted
/// </summary>
public class PositionReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid MaritimeReportId { get; set; }

    public DateTime ReportDateTime { get; set; }

    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public double? CourseOverGround { get; set; }
    public double? SpeedOverGround { get; set; }

    [MaxLength(50)]
    public string? ReportReason { get; set; }

    [MaxLength(50)]
    public string? WeatherConditions { get; set; }
    [MaxLength(20)]
    public string? SeaState { get; set; }
    public double? WindSpeed { get; set; }
    [MaxLength(20)]
    public string? WindDirection { get; set; }

    public double? FuelOilROB { get; set; }
    public double? DieselOilROB { get; set; }

    [MaxLength(100)]
    public string? LastPort { get; set; }
    [MaxLength(200)]
    public string? NextPort { get; set; }
    public DateTime? ETA { get; set; }
    public double? DistanceToGo { get; set; }

    public double? CargoOnBoard { get; set; }
    public int? CrewOnBoard { get; set; }

    public string? Remarks { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
