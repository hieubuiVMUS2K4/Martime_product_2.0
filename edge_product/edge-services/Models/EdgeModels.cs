using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;
using Maritime.Shared.Interfaces;

namespace MaritimeEdge.Models;

/// <summary>
/// Raw NMEA sentences for debugging and audit trail
/// </summary>
public class NmeaRawData
{
    [Key]
    public long Id { get; set; }
    
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    
    [Required]
    [MaxLength(10)]
    public string SentenceType { get; set; } = string.Empty; // GGA, RMC, VTG, etc.
    
    [Required]
    [MaxLength(512)]
    public string RawSentence { get; set; } = string.Empty;
    
    public bool ChecksumValid { get; set; }
    
    [MaxLength(50)]
    public string? DeviceSource { get; set; } // COM1, COM2, etc.
    
    public bool IsSynced { get; set; } = false;
}

/// <summary>
/// GPS/GNSS Position Data
/// </summary>
public class PositionData
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public DateTime Timestamp { get; set; }
    
    /// <summary>
    /// Latitude in decimal degrees (-90 to +90)
    /// </summary>
    public double Latitude { get; set; }
    
    /// <summary>
    /// Longitude in decimal degrees (-180 to +180)
    /// </summary>
    public double Longitude { get; set; }
    
    /// <summary>
    /// Altitude in meters above mean sea level
    /// </summary>
    public double? Altitude { get; set; }
    
    /// <summary>
    /// Speed over ground in knots
    /// </summary>
    public double? SpeedOverGround { get; set; }
    
    /// <summary>
    /// Course over ground in degrees true
    /// </summary>
    public double? CourseOverGround { get; set; }
    
    /// <summary>
    /// Magnetic variation in degrees
    /// </summary>
    public double? MagneticVariation { get; set; }
    
    /// <summary>
    /// 0=invalid, 1=GPS, 2=DGPS, 4=RTK Fixed, 5=RTK Float
    /// </summary>
    public int FixQuality { get; set; }
    
    /// <summary>
    /// Number of satellites used in fix
    /// </summary>
    public int SatellitesUsed { get; set; }
    
    /// <summary>
    /// Horizontal Dilution of Precision
    /// </summary>
    public double? Hdop { get; set; }
    
    [MaxLength(20)]
    public string Source { get; set; } = "GPS"; // GPS, DGPS, GLONASS, BeiDou
    
    public bool IsSynced { get; set; } = false;
    
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
    
    /// <summary>
    /// Maritime Mobile Service Identity (9 digits)
    /// </summary>
    [Required]
    [MaxLength(9)]
    public string Mmsi { get; set; } = string.Empty;
    
    /// <summary>
    /// AIS message type (1,2,3,5,18,19,21,24)
    /// </summary>
    public int MessageType { get; set; }
    
    /// <summary>
    /// 0=under way using engine, 1=at anchor, 5=moored, 15=undefined
    /// </summary>
    public int? NavigationStatus { get; set; }
    
    /// <summary>
    /// Rate of turn in degrees per minute
    /// </summary>
    public double? RateOfTurn { get; set; }
    
    public double? SpeedOverGround { get; set; }
    
    public bool? PositionAccuracy { get; set; } // true=high, false=low
    
    public double? Latitude { get; set; }
    
    public double? Longitude { get; set; }
    
    public double? CourseOverGround { get; set; }
    
    /// <summary>
    /// True heading in degrees
    /// </summary>
    public int? TrueHeading { get; set; }
    
    // Static data (from Message Type 5)
    [MaxLength(7)]
    public string? ImoNumber { get; set; }
    
    [MaxLength(7)]
    public string? CallSign { get; set; }
    
    [MaxLength(120)]
    public string? ShipName { get; set; }
    
    public int? ShipType { get; set; }
    
    public int? DimensionBow { get; set; }
    public int? DimensionStern { get; set; }
    public int? DimensionPort { get; set; }
    public int? DimensionStarboard { get; set; }
    
    public int? EtaMonth { get; set; }
    public int? EtaDay { get; set; }
    public int? EtaHour { get; set; }
    public int? EtaMinute { get; set; }
    
    /// <summary>
    /// Draught in meters
    /// </summary>
    public double? Draught { get; set; }
    
    [MaxLength(120)]
    public string? Destination { get; set; }
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Navigation data from gyro, log, depth sounder
/// </summary>
public class NavigationData
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public DateTime Timestamp { get; set; }
    
    /// <summary>
    /// True heading in degrees
    /// </summary>
    public double? HeadingTrue { get; set; }
    
    /// <summary>
    /// Magnetic heading in degrees
    /// </summary>
    public double? HeadingMagnetic { get; set; }
    
    /// <summary>
    /// Rate of turn in degrees per minute
    /// </summary>
    public double? RateOfTurn { get; set; }
    
    /// <summary>
    /// Pitch angle in degrees
    /// </summary>
    public double? Pitch { get; set; }
    
    /// <summary>
    /// Roll angle in degrees
    /// </summary>
    public double? Roll { get; set; }
    
    /// <summary>
    /// Speed through water in knots
    /// </summary>
    public double? SpeedThroughWater { get; set; }
    
    /// <summary>
    /// Water depth in meters
    /// </summary>
    public double? Depth { get; set; }
    
    /// <summary>
    /// Relative wind speed in knots
    /// </summary>
    public double? WindSpeedRelative { get; set; }
    
    /// <summary>
    /// Relative wind direction in degrees
    /// </summary>
    public double? WindDirectionRelative { get; set; }
    
    /// <summary>
    /// True wind speed in knots
    /// </summary>
    public double? WindSpeedTrue { get; set; }
    
    /// <summary>
    /// True wind direction in degrees
    /// </summary>
    public double? WindDirectionTrue { get; set; }
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

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
    public string EngineId { get; set; } = string.Empty; // MAIN_ENGINE, AUX_ENGINE_1, etc.
    
    public double? Rpm { get; set; }
    
    public double? LoadPercent { get; set; }
    
    public double? CoolantTemp { get; set; } // Celsius
    
    public double? ExhaustTemp { get; set; } // Celsius
    
    public double? LubeOilPressure { get; set; } // Bar
    
    public double? LubeOilTemp { get; set; } // Celsius
    
    public double? FuelPressure { get; set; } // Bar
    
    public double? FuelRate { get; set; } // Liters per hour
    
    public double? RunningHours { get; set; }
    
    public int? StartCount { get; set; }
    
    public int? AlarmStatus { get; set; } // Bitmap of active alarms
    
    public bool IsRunning { get; set; } = false;
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Fuel consumption data (IMO DCS compliance)
/// </summary>
public class FuelConsumption
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public DateTime Timestamp { get; set; }
    
    [Required]
    [MaxLength(20)]
    public string FuelType { get; set; } = string.Empty; // HFO, MGO, LNG, MDO
    
    public double ConsumedVolume { get; set; } // Liters
    
    public double ConsumedMass { get; set; } // Metric Tons
    
    [MaxLength(50)]
    public string? TankId { get; set; }
    
    public double? Density { get; set; } // kg/m³
    
    // IMO DCS fields
    public double? DistanceTraveled { get; set; } // Nautical miles
    
    public double? TimeUnderway { get; set; } // Hours
    
    public double? CargoWeight { get; set; } // Metric Tons
    
    public double? Co2Emissions { get; set; } // Metric Tons CO2

    // Phase 6: Voyage & Leg linking
    public Guid? VoyageId { get; set; }
    public Guid? VoyagePlanLegId { get; set; }

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("VoyagePlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? VoyagePlanLeg { get; set; }
    
    public bool IsSynced { get; set; } = false;
    
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
    public string TankId { get; set; } = string.Empty; // FO_1, FW_2, BALLAST_1
    
    [Required]
    [MaxLength(20)]
    public string TankType { get; set; } = string.Empty; // FUEL, FRESHWATER, BALLAST, LUBE_OIL
    
    public double LevelPercent { get; set; } // 0-100%
    
    public double? VolumeLiters { get; set; }
    
    public double? Temperature { get; set; } // Celsius
    
    public bool IsSynced { get; set; } = false;
    
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
    public string GeneratorId { get; set; } = string.Empty; // GEN_1, GEN_2, EMER_GEN
    
    public bool IsRunning { get; set; }
    
    public double? Voltage { get; set; } // Volts
    
    public double? Frequency { get; set; } // Hz
    
    public double? Current { get; set; } // Amperes
    
    public double? ActivePower { get; set; } // kW
    
    public double? PowerFactor { get; set; }
    
    public double? RunningHours { get; set; }
    
    public double? LoadPercent { get; set; }
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Environmental sensors data
/// </summary>
public class EnvironmentalData
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public DateTime Timestamp { get; set; }
    
    public double? AirTemperature { get; set; } // Celsius
    
    public double? BarometricPressure { get; set; } // hPa
    
    public double? Humidity { get; set; } // Percent
    
    public double? SeaTemperature { get; set; } // Celsius
    
    public double? WindSpeed { get; set; } // Knots
    
    public double? WindDirection { get; set; } // Degrees true
    
    public double? WaveHeight { get; set; } // Meters
    
    public double? Visibility { get; set; } // Nautical miles
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

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
    public string AlarmType { get; set; } = string.Empty; // FIRE, BILGE, ENGINE, NAVIGATION
    
    [MaxLength(50)]
    public string? AlarmCode { get; set; }
    
    [Required]
    [MaxLength(20)]
    public string Severity { get; set; } = string.Empty; // CRITICAL, WARNING, INFO
    
    [MaxLength(100)]
    public string? Location { get; set; } // ENGINE_ROOM, BRIDGE, etc.
    
    [MaxLength(500)]
    public string? Description { get; set; }
    
    public bool IsAcknowledged { get; set; } = false;
    
    public DateTime? AcknowledgedAt { get; set; }
    
    [MaxLength(100)]
    public string? AcknowledgedBy { get; set; }
    
    public bool IsResolved { get; set; } = false;
    
    public DateTime? ResolvedAt { get; set; }

    // Phase 6: Voyage & Leg linking
    public Guid? VoyageId { get; set; }
    public Guid? VoyagePlanLegId { get; set; }

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("VoyagePlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? VoyagePlanLeg { get; set; }
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Port Master Data - UN/LOCODE standard (ISO 3166 + location code)
/// Reference: https://unece.org/trade/cefact/unlocode-code-list-country-and-territory
/// </summary>
public class Port : ISyncableEntity
{
    [Key]
    public int Id { get; set; }
    
    /// <summary>
    /// UN/LOCODE (5 chars), e.g., "VNSGN", "SGSIN", "CNSHA"
    /// </summary>
    [Required]
    [MaxLength(5)]
    public string PortCode { get; set; } = string.Empty;
    
    /// <summary>
    /// Full port name, e.g., "Ho Chi Minh City", "Singapore"
    /// </summary>
    [Required]
    [MaxLength(150)]
    public string PortName { get; set; } = string.Empty;
    
    /// <summary>
    /// Country name
    /// </summary>
    [MaxLength(100)]
    public string? Country { get; set; }
    
    /// <summary>
    /// ISO 3166-1 alpha-2 country code, e.g., "VN", "SG"
    /// </summary>
    [MaxLength(2)]
    public string? CountryCode { get; set; }
    
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    
    /// <summary>
    /// IANA time zone, e.g., "Asia/Ho_Chi_Minh"
    /// </summary>
    [MaxLength(50)]
    public string? TimeZone { get; set; }
    
    public bool IsActive { get; set; } = true;

    public bool IsSynced { get; set; } = false;

    public long SyncVersion { get; set; }

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Port Call - Each port stop during a voyage (FAL Convention, SOLAS V/28)
/// Tracks arrival/departure at each port in sequence
/// </summary>
public class PortCall
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>FK to VoyageRecord</summary>
    public Guid VoyageId { get; set; }
    
    /// <summary>Optional FK to Port master data</summary>
    public int? PortId { get; set; }

    /// <summary>Phase 6: FK -> VoyagePlanLeg.Id (optional)</summary>
    public Guid? VoyagePlanLegId { get; set; }
    
    /// <summary>UN/LOCODE - stored for offline/flexibility</summary>
    [MaxLength(5)]
    public string? PortCode { get; set; }
    
    /// <summary>Port name - stored for offline/flexibility</summary>
    [Required]
    [MaxLength(150)]
    public string PortName { get; set; } = string.Empty;
    
    [MaxLength(100)]
    public string? Country { get; set; }
    
    /// <summary>DEPARTURE, ARRIVAL, TRANSIT, BUNKERING, DRYDOCK</summary>
    [Required]
    [MaxLength(20)]
    public string CallType { get; set; } = "ARRIVAL";
    
    /// <summary>Sequence order in the voyage (1, 2, 3...)</summary>
    public int Sequence { get; set; }
    
    public DateTime? ArrivalTime { get; set; }
    public DateTime? DepartureTime { get; set; }
    
    [MaxLength(50)]
    public string? BerthNumber { get; set; }
    
    public DateTime? PilotOnBoard { get; set; }
    public DateTime? PilotOffBoard { get; set; }
    
    /// <summary>Draft fore in meters</summary>
    public double? DraftFore { get; set; }
    
    /// <summary>Draft aft in meters</summary>
    public double? DraftAft { get; set; }
    
    /// <summary>Whether cargo operations completed at this port</summary>
    public bool CargoOpsCompleted { get; set; } = false;
    
    [MaxLength(500)]
    public string? Remarks { get; set; }
    
    public bool IsSynced { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
    
    // Navigation properties
    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }
    
    [ForeignKey("PortId")]
    public virtual Port? Port { get; set; }

    [ForeignKey("VoyagePlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? VoyagePlanLeg { get; set; }
}

/// <summary>
/// Voyage Crew Assignment - Links crew members to voyages (FAL Form 5, MLC 2006)
/// Tracks embark/disembark per voyage for sea service records
/// </summary>
public class VoyageCrewAssignment
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>FK to VoyageRecord</summary>
    public Guid VoyageId { get; set; }
    
    /// <summary>FK to CrewMember</summary>
    public Guid CrewMemberId { get; set; }
    
    /// <summary>Rank at time of voyage (snapshot)</summary>
    public int? RankId { get; set; }
    
    /// <summary>REGULAR, SUPERNUMERARY, OBSERVER, TRAINEE, RIDER</summary>
    [MaxLength(20)]
    public string Role { get; set; } = "REGULAR";
    
    /// <summary>Port where crew embarked (UN/LOCODE)</summary>
    [MaxLength(5)]
    public string? EmbarkPortCode { get; set; }
    
    [MaxLength(150)]
    public string? EmbarkPortName { get; set; }
    
    public DateTime? EmbarkDate { get; set; }
    
    /// <summary>Port where crew disembarked (UN/LOCODE)</summary>
    [MaxLength(5)]
    public string? DisembarkPortCode { get; set; }
    
    [MaxLength(150)]
    public string? DisembarkPortName { get; set; }
    
    public DateTime? DisembarkDate { get; set; }
    
    /// <summary>Watch schedule: 0000-0400, 0400-0800, 0800-1200, etc.</summary>
    [MaxLength(20)]
    public string? WatchSchedule { get; set; }
    
    /// <summary>ASSIGNED, ONBOARD, DISEMBARKED, CANCELLED</summary>
    [MaxLength(20)]
    public string Status { get; set; } = "ASSIGNED";
    
    [MaxLength(500)]
    public string? Remarks { get; set; }
    
    public bool IsSynced { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
    
    // Navigation properties
    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }
    
    [ForeignKey("CrewMemberId")]
    public virtual CrewMember? CrewMember { get; set; }
    
    [ForeignKey("RankId")]
    public virtual Rank? Rank { get; set; }
}

/// <summary>
/// Voyage records for reporting
/// Extended with vessel context (FAL Convention) and navigation properties
/// </summary>
public class VoyageRecord
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    [MaxLength(50)]
    public string VoyageNumber { get; set; } = string.Empty;
    
    // === Vessel Info Snapshot (FAL Convention) ===
    
    /// <summary>IMO Number (7 digits)</summary>
    [MaxLength(10)]
    public string? VesselIMO { get; set; }
    
    /// <summary>Vessel name at time of voyage</summary>
    [MaxLength(100)]
    public string? VesselName { get; set; }
    
    /// <summary>Flag state / nationality of ship</summary>
    [MaxLength(50)]
    public string? VesselFlag { get; set; }
    
    /// <summary>Call sign</summary>
    [MaxLength(20)]
    public string? CallSign { get; set; }
    
    // === Port Info (backward compatible + UN/LOCODE) ===
    
    [MaxLength(50)]
    public string? DeparturePort { get; set; }
    
    /// <summary>UN/LOCODE of departure port</summary>
    [MaxLength(5)]
    public string? DeparturePortCode { get; set; }
    
    public DateTime? DepartureTime { get; set; }
    
    [MaxLength(50)]
    public string? ArrivalPort { get; set; }
    
    /// <summary>UN/LOCODE of arrival port</summary>
    [MaxLength(5)]
    public string? ArrivalPortCode { get; set; }
    
    public DateTime? ArrivalTime { get; set; }
    
    /// <summary>Previous port visited (UN/LOCODE)</summary>
    [MaxLength(5)]
    public string? PreviousPortCode { get; set; }
    
    /// <summary>Previous port name</summary>
    [MaxLength(100)]
    public string? PreviousPortName { get; set; }
    
    // === Cargo & Performance ===
    
    [MaxLength(100)]
    public string? CargoType { get; set; }

    [MaxLength(40)]
    public string? CharterType { get; set; }

    public double? PlannedDistance { get; set; } // Nautical miles

    public double? PlannedDurationHours { get; set; }

    public double? PlannedAverageSpeed { get; set; } // Knots

    public double? PlannedFuelConsumption { get; set; } // Metric Tons

    public string? VoyageInstructions { get; set; }
    
    public double? CargoWeight { get; set; } // Metric Tons
    
    public double? DistanceTraveled { get; set; } // Nautical miles
    
    public double? FuelConsumed { get; set; } // Metric Tons
    
    public double? AverageSpeed { get; set; } // Knots
    
    [MaxLength(20)]
    public string VoyageStatus { get; set; } = "PLANNING"; // PLANNING, APPROVED, READY, UNDERWAY, ARRIVED, COMPLETED, CANCELLED

    public DateTime? ApprovedAt { get; set; }

    public DateTime? ReadyAt { get; set; }

    public DateTime? CommencedAt { get; set; }

    public DateTime? ArrivedAt { get; set; }

    public DateTime? CompletedAt { get; set; }

    public DateTime? CancelledAt { get; set; }

    // === Phase 2: Planning Summary ===

    public double? TotalEstimatedCost { get; set; }

    public double? TotalEstimatedRevenue { get; set; }

    public double? EstimatedProfitMargin { get; set; }

    // === Phase 4: Financial Actuals & Closing ===

    /// <summary>OPEN, PENDING_SETTLEMENT, SETTLED, CLOSED</summary>
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
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
    
    // === Navigation Properties ===
    
    [JsonIgnore]
    public virtual List<PortCall> PortCalls { get; set; } = new();
    
    [JsonIgnore]
    public virtual List<VoyageCrewAssignment> CrewAssignments { get; set; } = new();
    
    [JsonIgnore]
    public virtual List<VoyageLogEntry> LogEntries { get; set; } = new();
    
    [JsonIgnore]
    public virtual List<CargoOperation> CargoOperations { get; set; } = new();

    [JsonIgnore]
    public virtual List<VoyagePlanLeg> PlanLegs { get; set; } = new();

    [JsonIgnore]
    public virtual List<VoyageStatusHistory> StatusHistory { get; set; } = new();

    [JsonIgnore]
    public virtual List<VoyageCargoPlan> CargoPlans { get; set; } = new();

    [JsonIgnore]
    public virtual List<VoyageBunkerPlan> BunkerPlans { get; set; } = new();

    [JsonIgnore]
    public virtual List<VoyageCrewChangePlan> CrewChangePlans { get; set; } = new();

    [JsonIgnore]
    public virtual List<VoyageCostEstimate> CostEstimates { get; set; } = new();

    [JsonIgnore]
    public virtual List<VoyageRevenueEstimate> RevenueEstimates { get; set; } = new();

    // Phase 4: Financial
    [JsonIgnore]
    public virtual List<VoyageExpenseRequest> ExpenseRequests { get; set; } = new();

    [JsonIgnore]
    public virtual List<VoyageAdvancePayment> AdvancePayments { get; set; } = new();

    [JsonIgnore]
    public virtual List<VoyageDisbursement> Disbursements { get; set; } = new();

    [JsonIgnore]
    public virtual List<VoyageActualRevenue> ActualRevenues { get; set; } = new();

    [JsonIgnore]
    public virtual List<VoyageSettlement> Settlements { get; set; } = new();
}

public class VoyagePlanLeg : ISyncableEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid VoyageId { get; set; }

    public int Sequence { get; set; }

    [MaxLength(30)]
    public string LegType { get; set; } = "PASSAGE";

    [MaxLength(5)]
    public string? FromPortCode { get; set; }

    [MaxLength(100)]
    public string? FromPortName { get; set; }

    [MaxLength(5)]
    public string? ToPortCode { get; set; }

    [MaxLength(100)]
    public string? ToPortName { get; set; }

    public DateTime? PlannedDepartureTime { get; set; }

    public DateTime? PlannedArrivalTime { get; set; }

    public double? PlannedDistance { get; set; }

    public double? PlannedDurationHours { get; set; }

    public double? PlannedAverageSpeed { get; set; }

    [MaxLength(30)]
    public string? CargoActivity { get; set; }

    public bool CrewChangePlanned { get; set; }

    public bool BunkerSupplyPlanned { get; set; }

    /// <summary>Phase 2: Planned fuel consumption for this leg (MT)</summary>
    public double? PlannedFuelConsumption { get; set; }

    /// <summary>Phase 2: Weather routing guidance</summary>
    public string? WeatherRoutingNotes { get; set; }

    public string? Notes { get; set; }

    public bool IsSynced { get; set; } = false;

    public long SyncVersion { get; set; }

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }
}

public class VoyageStatusHistory : ISyncableEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid VoyageId { get; set; }

    [MaxLength(20)]
    public string? FromStatus { get; set; }

    [Required]
    [MaxLength(20)]
    public string ToStatus { get; set; } = string.Empty;

    [MaxLength(100)]
    public string ChangedBy { get; set; } = "system";

    public string? Notes { get; set; }

    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;

    public bool IsSynced { get; set; } = false;

    public long SyncVersion { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }
}

// ============================================================
// Phase 2: Voyage Planning Entities
// ============================================================

/// <summary>
/// Cargo loading/discharge plan per voyage leg or port.
/// </summary>
public class VoyageCargoPlan : ISyncableEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid VoyageId { get; set; }

    /// <summary>Optional link to the specific planning leg</summary>
    public Guid? PlanLegId { get; set; }

    public int Sequence { get; set; }

    /// <summary>LOADING, DISCHARGING, TRANSSHIPMENT</summary>
    [Required]
    [MaxLength(30)]
    public string OperationType { get; set; } = "LOADING";

    /// <summary>CONTAINER, BULK, OIL, GAS, GENERAL, CHEMICAL, REEFER</summary>
    [Required]
    [MaxLength(50)]
    public string CargoType { get; set; } = string.Empty;

    public string? CargoDescription { get; set; }

    public double PlannedQuantity { get; set; }

    /// <summary>MT, TEU, CBM</summary>
    [MaxLength(10)]
    public string Unit { get; set; } = "MT";

    /// <summary>Port where this cargo operation is planned</summary>
    [MaxLength(5)]
    public string? PortCode { get; set; }

    [MaxLength(150)]
    public string? PortName { get; set; }

    [MaxLength(200)]
    public string? ShipperName { get; set; }

    [MaxLength(200)]
    public string? ConsigneeName { get; set; }

    public string? SpecialRequirements { get; set; }

    public string? Notes { get; set; }

    public bool IsSynced { get; set; } = false;

    public long SyncVersion { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("PlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? PlanLeg { get; set; }
}

/// <summary>
/// Bunker (fuel) supply plan per voyage leg or port.
/// </summary>
public class VoyageBunkerPlan : ISyncableEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid VoyageId { get; set; }

    public Guid? PlanLegId { get; set; }

    public int Sequence { get; set; }

    /// <summary>HFO, VLSFO, MGO, MDO, LNG</summary>
    [Required]
    [MaxLength(20)]
    public string FuelType { get; set; } = "VLSFO";

    /// <summary>Metric Tons</summary>
    public double PlannedQuantity { get; set; }

    /// <summary>SUPPLY, TRANSFER, DELIVERY</summary>
    [MaxLength(20)]
    public string OperationType { get; set; } = "SUPPLY";

    [MaxLength(5)]
    public string? PortCode { get; set; }

    [MaxLength(150)]
    public string? PortName { get; set; }

    public double? EstimatedCostUsd { get; set; }

    [MaxLength(200)]
    public string? SupplierName { get; set; }

    public string? Notes { get; set; }

    public bool IsSynced { get; set; } = false;

    public long SyncVersion { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("PlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? PlanLeg { get; set; }
}

/// <summary>
/// Crew embark/disembark/rotation plan per voyage leg or port.
/// </summary>
public class VoyageCrewChangePlan : ISyncableEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid VoyageId { get; set; }

    public Guid? PlanLegId { get; set; }

    public int Sequence { get; set; }

    /// <summary>Optional — specific crew member if known at planning time</summary>
    public Guid? CrewMemberId { get; set; }

    /// <summary>Optional — target rank for the change</summary>
    public int? RankId { get; set; }

    /// <summary>EMBARK, DISEMBARK, ROTATION</summary>
    [Required]
    [MaxLength(20)]
    public string ChangeType { get; set; } = "ROTATION";

    [MaxLength(5)]
    public string? PortCode { get; set; }

    [MaxLength(150)]
    public string? PortName { get; set; }

    public DateTime? PlannedDate { get; set; }

    [MaxLength(200)]
    public string? ReplacementReason { get; set; }

    public string? Notes { get; set; }

    public bool IsSynced { get; set; } = false;

    public long SyncVersion { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("PlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? PlanLeg { get; set; }

    [ForeignKey("CrewMemberId")]
    [JsonIgnore]
    public virtual CrewMember? CrewMember { get; set; }

    [ForeignKey("RankId")]
    [JsonIgnore]
    public virtual Rank? Rank { get; set; }
}

/// <summary>
/// Itemized cost estimate for voyage financial planning.
/// </summary>
public class VoyageCostEstimate : ISyncableEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid VoyageId { get; set; }

    public int Sequence { get; set; }

    /// <summary>FUEL, PORT_CHARGES, CANAL_FEES, CREW, SUPPLIES, INSURANCE, BROKERAGE, MISC</summary>
    [Required]
    [MaxLength(30)]
    public string CostCategory { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Description { get; set; }

    public double EstimatedAmount { get; set; }

    [MaxLength(3)]
    public string Currency { get; set; } = "USD";

    public string? Notes { get; set; }

    public bool IsSynced { get; set; } = false;

    public long SyncVersion { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }
}

/// <summary>
/// Revenue estimate for voyage financial planning.
/// </summary>
public class VoyageRevenueEstimate : ISyncableEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid VoyageId { get; set; }

    public int Sequence { get; set; }

    /// <summary>FREIGHT, DEMURRAGE, DISPATCH, DEADFREIGHT, MISC</summary>
    [Required]
    [MaxLength(30)]
    public string RevenueCategory { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Description { get; set; }

    public double EstimatedAmount { get; set; }

    [MaxLength(3)]
    public string Currency { get; set; } = "USD";

    public string? Notes { get; set; }

    public bool IsSynced { get; set; } = false;

    public long SyncVersion { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }
}

/// <summary>
/// Engine start/stop event log — records each transition for shore-side timeline
/// </summary>
[Table("engine_events")]
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
    
    public double? Rpm { get; set; }
    public double? LoadPercent { get; set; }
    
    [MaxLength(50)]
    public string? TriggerSource { get; set; } // "ESP8266", "MODBUS", "MANUAL", "AUTO"
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

// ============================================================
// PHASE 4: VOYAGE FINANCIAL ENTITIES
// ============================================================

/// <summary>
/// Expense request (đề xuất chi phí) — initiated by ship or office, goes through approval.
/// Workflow: DRAFT → SUBMITTED → APPROVED → REJECTED / CANCELLED
/// </summary>
public class VoyageExpenseRequest : ISyncableEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid VoyageId { get; set; }

    [Required]
    [MaxLength(20)]
    public string RequestNumber { get; set; } = string.Empty;

    /// <summary>FUEL, PORT_CHARGES, CANAL_FEES, CREW, SUPPLIES, INSURANCE, BROKERAGE, MISC</summary>
    [Required]
    [MaxLength(30)]
    public string CostCategory { get; set; } = string.Empty;

    /// <summary>VESSEL, VOYAGE, GENERAL — cost allocation scope</summary>
    [Required]
    [MaxLength(20)]
    public string AllocationScope { get; set; } = "VOYAGE";

    [MaxLength(200)]
    public string? Description { get; set; }

    [Required]
    public double RequestedAmount { get; set; }

    [MaxLength(3)]
    public string Currency { get; set; } = "USD";

    public double ExchangeRate { get; set; } = 1.0;

    public double RequestedAmountUsd { get; set; }

    [MaxLength(200)]
    public string? VendorName { get; set; }

    [MaxLength(100)]
    public string? VendorReference { get; set; }

    [MaxLength(10)]
    public string? PortCode { get; set; }

    [MaxLength(100)]
    public string? PortName { get; set; }

    /// <summary>DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED</summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "DRAFT";

    [MaxLength(100)]
    public string? RequestedBy { get; set; }

    public DateTime? RequestedAt { get; set; }

    [MaxLength(100)]
    public string? ApprovedBy { get; set; }

    public DateTime? ApprovedAt { get; set; }

    public double? ApprovedAmount { get; set; }

    public double? ApprovedAmountUsd { get; set; }

    public string? ApprovalNotes { get; set; }

    public string? Notes { get; set; }

    public string? SupportingDocuments { get; set; }

    public bool IsSynced { get; set; } = false;

    public long SyncVersion { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }
}

/// <summary>
/// Advance payment (tạm ứng) — funds advanced before or during voyage.
/// </summary>
public class VoyageAdvancePayment : ISyncableEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid VoyageId { get; set; }

    [Required]
    [MaxLength(20)]
    public string AdvanceNumber { get; set; } = string.Empty;

    /// <summary>PORT_AGENT, BUNKER_SUPPLIER, CREW, OTHER</summary>
    [Required]
    [MaxLength(30)]
    public string AdvanceType { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Description { get; set; }

    [Required]
    public double Amount { get; set; }

    [MaxLength(3)]
    public string Currency { get; set; } = "USD";

    public double ExchangeRate { get; set; } = 1.0;

    public double AmountUsd { get; set; }

    [MaxLength(200)]
    public string? RecipientName { get; set; }

    [MaxLength(10)]
    public string? PortCode { get; set; }

    [MaxLength(100)]
    public string? PortName { get; set; }

    /// <summary>PENDING, PAID, SETTLED, CANCELLED</summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "PENDING";

    public DateTime? PaidAt { get; set; }

    [MaxLength(100)]
    public string? PaidBy { get; set; }

    [MaxLength(100)]
    public string? PaymentReference { get; set; }

    public double SettledAmount { get; set; }

    public double UnsettledBalance { get; set; }

    public string? Notes { get; set; }

    public bool IsSynced { get; set; } = false;

    public long SyncVersion { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }
}

/// <summary>
/// Disbursement (chi phí thực tế / thanh toán) — actual costs incurred and paid.
/// Can link to an expense request and/or advance payment for reconciliation.
/// </summary>
public class VoyageDisbursement : ISyncableEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid VoyageId { get; set; }

    public Guid? ExpenseRequestId { get; set; }

    public Guid? AdvancePaymentId { get; set; }

    [Required]
    [MaxLength(20)]
    public string DisbursementNumber { get; set; } = string.Empty;

    /// <summary>FUEL, PORT_CHARGES, CANAL_FEES, CREW, SUPPLIES, INSURANCE, BROKERAGE, MISC</summary>
    [Required]
    [MaxLength(30)]
    public string CostCategory { get; set; } = string.Empty;

    /// <summary>VESSEL, VOYAGE, GENERAL — cost allocation scope</summary>
    [Required]
    [MaxLength(20)]
    public string AllocationScope { get; set; } = "VOYAGE";

    [MaxLength(200)]
    public string? Description { get; set; }

    [Required]
    public double Amount { get; set; }

    [MaxLength(3)]
    public string Currency { get; set; } = "USD";

    public double ExchangeRate { get; set; } = 1.0;

    public double AmountUsd { get; set; }

    [MaxLength(200)]
    public string? VendorName { get; set; }

    [MaxLength(100)]
    public string? InvoiceNumber { get; set; }

    public DateTime? InvoiceDate { get; set; }

    public DateTime? DueDate { get; set; }

    [MaxLength(10)]
    public string? PortCode { get; set; }

    [MaxLength(100)]
    public string? PortName { get; set; }

    /// <summary>RECORDED, VERIFIED, PAID, DISPUTED</summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "RECORDED";

    [MaxLength(100)]
    public string? VerifiedBy { get; set; }

    public DateTime? VerifiedAt { get; set; }

    public DateTime? PaidAt { get; set; }

    [MaxLength(100)]
    public string? PaymentReference { get; set; }

    public string? Notes { get; set; }

    public string? SupportingDocuments { get; set; }

    public bool IsSynced { get; set; } = false;

    public long SyncVersion { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("ExpenseRequestId")]
    [JsonIgnore]
    public virtual VoyageExpenseRequest? ExpenseRequest { get; set; }

    [ForeignKey("AdvancePaymentId")]
    [JsonIgnore]
    public virtual VoyageAdvancePayment? AdvancePayment { get; set; }
}

/// <summary>
/// Actual revenue recorded for the voyage (doanh thu thực tế).
/// </summary>
public class VoyageActualRevenue : ISyncableEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid VoyageId { get; set; }

    [Required]
    [MaxLength(20)]
    public string RevenueNumber { get; set; } = string.Empty;

    /// <summary>FREIGHT, DEMURRAGE, DISPATCH, DEADFREIGHT, MISC</summary>
    [Required]
    [MaxLength(30)]
    public string RevenueCategory { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Description { get; set; }

    [Required]
    public double Amount { get; set; }

    [MaxLength(3)]
    public string Currency { get; set; } = "USD";

    public double ExchangeRate { get; set; } = 1.0;

    public double AmountUsd { get; set; }

    [MaxLength(200)]
    public string? PayerName { get; set; }

    [MaxLength(100)]
    public string? InvoiceNumber { get; set; }

    public DateTime? InvoiceDate { get; set; }

    /// <summary>INVOICED, RECEIVED, DISPUTED</summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "INVOICED";

    public DateTime? ReceivedAt { get; set; }

    [MaxLength(100)]
    public string? PaymentReference { get; set; }

    public string? Notes { get; set; }

    public bool IsSynced { get; set; } = false;

    public long SyncVersion { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }
}

/// <summary>
/// Voyage settlement / final account (quyết toán chuyến).
/// Aggregates expenses, advances, disbursements, revenues into a closing record.
/// </summary>
public class VoyageSettlement : ISyncableEntity
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid VoyageId { get; set; }

    [Required]
    [MaxLength(20)]
    public string SettlementNumber { get; set; } = string.Empty;

    /// <summary>DRAFT, SUBMITTED, REVIEWED, APPROVED, REJECTED</summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "DRAFT";

    public double TotalExpenseApproved { get; set; }

    public double TotalAdvanced { get; set; }

    public double TotalDisbursed { get; set; }

    public double TotalRevenue { get; set; }

    public double NetResult { get; set; }

    public double AdvanceBalance { get; set; }

    public double? FinalSettlementAmount { get; set; }

    public string? Summary { get; set; }

    [MaxLength(100)]
    public string? PreparedBy { get; set; }

    public DateTime? PreparedAt { get; set; }

    [MaxLength(100)]
    public string? ReviewedBy { get; set; }

    public DateTime? ReviewedAt { get; set; }

    [MaxLength(100)]
    public string? ApprovedBy { get; set; }

    public DateTime? ApprovedAt { get; set; }

    public string? ApprovalNotes { get; set; }

    public string? Notes { get; set; }

    public bool IsSynced { get; set; } = false;

    public long SyncVersion { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }
}

// ============================================================
// MOVED TO SHARED LIBRARY: Maritime.Shared
// The following types are now defined in the shared library and
// re-exported via SharedTypeAliases.cs:
//   - SyncActionType, SyncPriority, NetworkType, SyncQueue
//   - CrewMember, Certificate, CrewCertificate
//   - Country, Rank, RankCertificate, CountryCertificate
//   - TravelDocument, SeafarerDocument, EmploymentDocument, HealthDocument
//   - ServiceRecord
// ============================================================

// --- REMOVED DUPLICATE DEFINITIONS (formerly lines 791-1493) ---
// All crew/certificate/document/sync models are now in:
//   shared/Models/Crew/     → CrewMember, Certificate, CrewCertificate, etc.
//   shared/Models/Documents/ → TravelDocument, SeafarerDocument, etc.
//   shared/Models/Sync/     → SyncQueue, SyncActionType, SyncPriority, etc.
// Re-exported into MaritimeEdge.Models via SharedTypeAliases.cs

// NOTE: The VoyageCrewAssignment class references CrewMember from shared.
// The MaintenanceTask/User/Role classes that reference CrewMember will continue to work
// because SharedTypeAliases.cs maps the shared types into global scope.

/// <summary>
/// Maintenance Task Details - Bảng trung gian (N-N) giữa MaintenanceTask và TaskDetail
/// Lưu kết quả thực hiện từng chi tiết của task
/// </summary>
public class MaintenanceTaskDetail
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public Guid MaintenanceTaskId { get; set; } // Foreign key to MaintenanceTask
    
    [Required]
    public long TaskDetailId { get; set; } // Foreign key to TaskDetail
    
    [MaxLength(20)]
    public string Status { get; set; } = "PENDING"; // PENDING, COMPLETED, SKIPPED, FAILED
    
    public bool IsCompleted { get; set; } = false;
    
    public double? MeasuredValue { get; set; } // Giá trị đo được (nếu là measurement)
    
    public bool? CheckResult { get; set; } // true = OK, false = NG, null = chưa check
    
    public string? Notes { get; set; } // Ghi chú của thuyền viên
    
    [MaxLength(500)]
    public string? PhotoUrl { get; set; } // URL ảnh chụp
    
    [MaxLength(500)]
    public string? SignatureUrl { get; set; } // URL chữ ký
    
    [MaxLength(100)]
    public string? CompletedBy { get; set; } // Người thực hiện
    
    public DateTime? CompletedAt { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Maintenance Tasks (ISM Code - Planned Maintenance System)
/// Updated v2.0: Added workflow fields for Deferral & Rectify system
/// </summary>
public class MaintenanceTask
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    [MaxLength(50)]
    public string TaskId { get; set; } = string.Empty; // Unique task identifier
    
    // NOTE: Database schema has this as UUID, not int
    public int? TaskTypeId { get; set; } // Foreign key to TaskType (optional for backward compatibility)
    
    /// <summary>
    /// LEGACY: Individual equipment ID (nullable for group-based tasks)
    /// For backward compatibility with old tasks
    /// </summary>
    [MaxLength(100)]
    public string? EquipmentId { get; set; }
    
    /// <summary>
    /// LEGACY: Individual equipment name (nullable for group-based tasks)
    /// For backward compatibility with old tasks
    /// </summary>
    [MaxLength(200)]
    public string? EquipmentName { get; set; }
    
    /// <summary>
    /// NEW: Equipment Group ID for group-based tasks
    /// Preferred for new tasks (Work Order approach)
    /// </summary>
    public Guid? EquipmentGroupId { get; set; }
    
    /// <summary>
    /// NEW: Equipment Group Name (denormalized for display)
    /// Example: "All Generators", "Main Engine System"
    /// </summary>
    [MaxLength(200)]
    public string? EquipmentGroupName { get; set; }
    
    /// <summary>
    /// NEW: FK -> EquipmentAsset.Id for per-equipment tasks
    /// Set when the task targets a single asset (from per-equipment schedule)
    /// </summary>
    public Guid? EquipmentAssetId { get; set; }
    
    /// <summary>
    /// NEW: Equipment Asset Name (denormalized for display)
    /// </summary>
    [MaxLength(200)]
    public string? EquipmentAssetName { get; set; }
    
    /// <summary>
    /// NEW: Schedule ID - Links to the maintenance schedule that generated this task
    /// Null for manually created tasks, populated for auto-generated tasks
    /// </summary>
    public Guid? ScheduleId { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string TaskType { get; set; } = string.Empty; // RUNNING_HOURS, CALENDAR, CONDITION (legacy field)
    
    [Required]
    public string TaskDescription { get; set; } = string.Empty;
    
    public double? IntervalHours { get; set; } // Every 500 hours
    
    public int? IntervalDays { get; set; } // Every 30 days
    
    public DateTime? LastDoneAt { get; set; }
    
    public DateTime NextDueAt { get; set; }
    
    public double? RunningHoursAtLastDone { get; set; }
    
    [MaxLength(20)]
    public string Priority { get; set; } = "NORMAL"; // CRITICAL, HIGH, NORMAL, LOW
    
    /// <summary>
    /// Task Status - Updated v2.0
    /// SCHEDULED: Auto-generated, not yet due
    /// DUE: Ready for execution
    /// OVERDUE: Past due date
    /// IN_PROGRESS: Crew working on it
    /// PENDING_APPROVAL: Waiting for C/E/Master verification
    /// RECTIFY: Returned for correction (replaces REJECTED)
    /// COMPLETED: Approved and done
    /// CANCELLED: Task cancelled
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "SCHEDULED"; // SCHEDULED, DUE, OVERDUE, IN_PROGRESS, PENDING_APPROVAL, RECTIFY, COMPLETED, CANCELLED
    
    /// <summary>
    /// PIC (Person In Charge) - Crew ID assigned to this task
    /// For group tasks: Single PIC responsible for entire group
    /// </summary>
    [MaxLength(100)]
    public string? AssignedTo { get; set; }
    
    /// <summary>
    /// Department: ENGINE or DECK
    /// </summary>
    [MaxLength(20)]
    public string? AssignedDepartment { get; set; }
    
    // ============ DEFERRAL TRACKING ============
    
    /// <summary>
    /// True if there's a pending deferral request for this task
    /// </summary>
    public bool HasPendingDeferral { get; set; } = false;
    
    /// <summary>
    /// Number of times this task has been deferred
    /// </summary>
    public int DeferralCount { get; set; } = 0;
    
    public DateTime? LastDeferredAt { get; set; }
    
    [MaxLength(50)]
    public string? LastDeferredBy { get; set; }
    
    // ============ EXECUTION TRACKING ============
    
    public DateTime? StartedAt { get; set; } // When crew pressed "Start"
    
    [MaxLength(50)]
    public string? StartedBy { get; set; } // Crew ID who started
    
    /// <summary>
    /// Running hours at task start (for RH-based tasks)
    /// </summary>
    public double? ActualRunningHours { get; set; }
    
    /// <summary>
    /// Estimated duration in minutes (from template)
    /// </summary>
    public int? EstimatedDuration { get; set; }
    
    /// <summary>
    /// Actual duration in minutes
    /// </summary>
    public int? ActualDuration { get; set; }
    
    // ============ REPORT DATA ============
    
    /// <summary>
    /// Whether checklist is fully completed
    /// </summary>
    public bool ChecklistCompleted { get; set; } = false;
    
    /// <summary>
    /// Number of photos uploaded
    /// </summary>
    public int PhotosUploaded { get; set; } = 0;
    
    /// <summary>
    /// Required number of photos (from template)
    /// </summary>
    public int RequiredPhotos { get; set; } = 0;
    
    /// <summary>
    /// JSON array of completion photo URLs (base64 or file paths)
    /// Supports up to 5 compressed photos (~150KB each = ~1MB total, ~1.3MB as base64)
    /// </summary>
    [MaxLength(2000000)] // 2MB for safety margin with base64 encoding
    public string? CompletionPhotos { get; set; }
    
    public string? Notes { get; set; }
    
    /// <summary>
    /// Required spare parts from schedule config (JSON array)
    /// This is populated when task is auto-generated from schedule
    /// </summary>
    [MaxLength(4000)]
    public string? RequiredSpareParts { get; set; }
    
    /// <summary>
    /// Spare parts actually used when completing the task (JSON array)
    /// This is set by crew when they complete the task
    /// </summary>
    [MaxLength(4000)]
    public string? SparePartsUsed { get; set; }
    
    // ============ SUBMISSION ============
    
    public DateTime? SubmittedAt { get; set; } // When crew pressed "Submit"
    
    [MaxLength(50)]
    public string? SubmittedBy { get; set; }
    
    // ============ VERIFICATION (C/E/Master) ============
    
    public DateTime? VerifiedAt { get; set; }
    
    [MaxLength(50)]
    public string? VerifiedBy { get; set; } // C/E or Master crew ID
    
    /// <summary>
    /// APPROVED or REJECTED
    /// </summary>
    [MaxLength(20)]
    public string? VerificationResult { get; set; }
    
    /// <summary>
    /// Notes from verifier when approving
    /// </summary>
    public string? VerificationNotes { get; set; }
    
    // ============ RECTIFY (REJECTION) TRACKING ============
    
    /// <summary>
    /// Latest rejection reason
    /// </summary>
    public string? RejectionReason { get; set; }
    
    /// <summary>
    /// Number of times this task has been rejected
    /// </summary>
    public int RejectionCount { get; set; } = 0;
    
    public DateTime? LastRejectedAt { get; set; }
    
    [MaxLength(50)]
    public string? LastRejectedBy { get; set; }
    
    /// <summary>
    /// JSON array of rejection history: [{reason, by, at}]
    /// </summary>
    [Column(TypeName = "jsonb")]
    public string? RejectionHistory { get; set; }
    
    // ============ COMPLETION ============
    
    public DateTime? CompletedAt { get; set; }
    
    [MaxLength(100)]
    public string? CompletedBy { get; set; }
    
    // ============ CANCELLATION ============
    
    public DateTime? CancelledAt { get; set; }
    
    [MaxLength(50)]
    public string? CancelledBy { get; set; }
    
    public string? CancellationReason { get; set; }
    
    // ============ CMS (Class Survey) ============
    
    /// <summary>
    /// Is this a Class Maintenance Survey item?
    /// CMS items have special deferral rules
    /// </summary>
    public bool IsCms { get; set; } = false;
    
    // ============ LEGACY FIELDS (kept for backward compatibility) ============
    
    [MaxLength(50)]
    public string? ApprovedBy { get; set; } // Legacy - use VerifiedBy instead
    
    public DateTime? ApprovedAt { get; set; } // Legacy - use VerifiedAt instead
    
    // ============ SOFT DELETE ============
    
    /// <summary>
    /// Soft delete flag - True if task is logically deleted
    /// Deleted tasks are hidden from UI but retained for audit trail
    /// </summary>
    public bool IsDeleted { get; set; } = false;
    
    public DateTime? DeletedAt { get; set; }
    
    [MaxLength(50)]
    public string? DeletedBy { get; set; }
    
    public string? DeletionReason { get; set; }

    // ============ FORM REQUIREMENTS ============

    /// <summary>
    /// Inherited from schedule: task requires a Risk Assessment form (ĐGRR) to be filled
    /// </summary>
    public bool RequireRiskAssessment { get; set; } = false;

    /// <summary>
    /// Inherited from schedule: task requires an Inspection Report form (BBKT) to be filled
    /// </summary>
    public bool RequireInspectionReport { get; set; } = false;
    
    // ============ AUDIT ============
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime? SyncedAt { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
    
    // ============ NAVIGATION PROPERTIES ============
    
    public virtual EquipmentGroup? EquipmentGroup { get; set; }
    public virtual ICollection<TaskChecklistItem> ChecklistItems { get; set; } = new List<TaskChecklistItem>();
    public virtual ICollection<TaskDeferralRequest> DeferralRequests { get; set; } = new List<TaskDeferralRequest>();
    public virtual ICollection<TaskStatusHistory> StatusHistory { get; set; } = new List<TaskStatusHistory>();
}

/// <summary>
/// Task Deferral Request - Request to postpone a maintenance task
/// </summary>
public class TaskDeferralRequest
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// FK -> MaintenanceTask.Id
    /// </summary>
    [Required]
    public Guid TaskId { get; set; }
    
    // ============ REQUEST INFO ============
    
    [Required]
    [MaxLength(50)]
    public string RequestedBy { get; set; } = string.Empty; // Crew ID
    
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Reason for deferral (min 20 chars)
    /// </summary>
    [Required]
    public string Reason { get; set; } = string.Empty;
    
    // ============ DATE INFO ============
    
    public DateTime CurrentDueDate { get; set; }
    
    public DateTime ProposedDueDate { get; set; }
    
    /// <summary>
    /// Number of days to defer
    /// </summary>
    public int DeferralDays { get; set; }
    
    // ============ APPROVAL INFO ============
    
    /// <summary>
    /// PENDING, APPROVED, REJECTED
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "PENDING";
    
    [MaxLength(50)]
    public string? ReviewedBy { get; set; } // Master or C/E
    
    public DateTime? ReviewedAt { get; set; }
    
    public string? ReviewNotes { get; set; }
    
    // ============ METADATA ============
    
    /// <summary>
    /// LOW, NORMAL, HIGH
    /// </summary>
    [MaxLength(20)]
    public string Priority { get; set; } = "NORMAL";
    
    /// <summary>
    /// JSON array of attachment URLs
    /// </summary>
    [Column(TypeName = "jsonb")]
    public string? Attachments { get; set; }
    
    // ============ CMS SPECIFIC ============
    
    /// <summary>
    /// Is this for a CMS item?
    /// </summary>
    public bool IsCmsItem { get; set; } = false;
    
    /// <summary>
    /// Class Permission Letter URL (required if CMS && deferralDays > 90)
    /// </summary>
    [MaxLength(255)]
    public string? ClassPermissionLetter { get; set; }
    
    // ============ OVERDUE SPECIFIC ============
    
    /// <summary>
    /// Flag if this deferral is for an OVERDUE task (requires stricter validation)
    /// </summary>
    public bool IsOverdueDeferral { get; set; } = false;
    
    /// <summary>
    /// Root cause analysis (REQUIRED for OVERDUE deferrals)
    /// </summary>
    public string? RootCause { get; set; }
    
    /// <summary>
    /// Preventive measures (REQUIRED for OVERDUE deferrals)
    /// </summary>
    public string? PreventiveMeasures { get; set; }
    
    /// <summary>
    /// Task status at the time of deferral request (for audit)
    /// </summary>
    [MaxLength(20)]
    public string? TaskStatusAtRequest { get; set; }
    
    // ============ AUDIT ============
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
    
    public bool IsSynced { get; set; } = false;
    
    // Navigation
    public virtual MaintenanceTask Task { get; set; } = null!;
}

/// <summary>
/// Task Status History - Audit trail for all status changes
/// </summary>
public class TaskStatusHistory
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public Guid TaskId { get; set; }
    
    [MaxLength(20)]
    public string? FromStatus { get; set; }
    
    [Required]
    [MaxLength(20)]
    public string ToStatus { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(50)]
    public string ChangedBy { get; set; } = string.Empty;
    
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
    
    public string? Reason { get; set; }
    
    public string? Notes { get; set; }
    
    /// <summary>
    /// WEB or MOBILE
    /// </summary>
    [MaxLength(20)]
    public string? DeviceType { get; set; }
    
    [MaxLength(45)]
    public string? IpAddress { get; set; }
    
    public string? UserAgent { get; set; }
    
    // Navigation
    public virtual MaintenanceTask Task { get; set; } = null!;
}

/// <summary>
/// Task Checklist Items - Per-asset tracking within group-based maintenance tasks
/// Allows tracking completion, readings, and abnormalities for each asset in a group
/// </summary>
public class TaskChecklistItem
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// FK -> MaintenanceTask.TaskId
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string TaskId { get; set; } = string.Empty;
    
    /// <summary>
    /// FK -> EquipmentAsset.Id
    /// </summary>
    [Required]
    public Guid AssetId { get; set; }
    
    /// <summary>
    /// Asset code for quick reference (denormalized)
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string AssetCode { get; set; } = string.Empty;
    
    /// <summary>
    /// Asset name for display (denormalized)
    /// </summary>
    [Required]
    [MaxLength(200)]
    public string AssetName { get; set; } = string.Empty;
    
    /// <summary>
    /// Order in checklist (from EquipmentGroupMember.SequenceOrder or Template.SequenceOrder)
    /// </summary>
    public int SequenceOrder { get; set; } = 0;
    
    /// <summary>
    /// Checkpoint description (cloned from ScheduleChecklistTemplate)
    /// Example: "Check oil level", "Inspect filter condition"
    /// </summary>
    [MaxLength(500)]
    public string? CheckpointDescription { get; set; }
    
    /// <summary>
    /// Does this checkpoint require a reading value? (from template)
    /// </summary>
    public bool RequiresReading { get; set; } = false;
    
    /// <summary>
    /// Minimum value for normal range (from template)
    /// Example: Oil level min = 80%
    /// </summary>
    public double? NormalRangeMin { get; set; }
    
    /// <summary>
    /// Maximum value for normal range (from template)
    /// Example: Oil level max = 100%
    /// </summary>
    public double? NormalRangeMax { get; set; }
    
    /// <summary>
    /// Unit of measurement (from template)
    /// Example: "°C", "bar", "%", "rpm"
    /// </summary>
    [MaxLength(20)]
    public string? Unit { get; set; }
    
    /// <summary>
    /// Whether this asset's maintenance is completed
    /// </summary>
    public bool IsCompleted { get; set; } = false;
    
    /// <summary>
    /// When this item was completed
    /// </summary>
    public DateTime? CompletedAt { get; set; }
    
    /// <summary>
    /// Crew ID who completed this item
    /// </summary>
    [MaxLength(50)]
    public string? CompletedBy { get; set; }
    
    /// <summary>
    /// Reading value (e.g., pressure, temperature, voltage)
    /// Example: Fire extinguisher pressure = 12 bar
    /// </summary>
    public double? ReadingValue { get; set; }
    
    /// <summary>
    /// Specific remarks for this asset
    /// Example: "Cylinder #5 has dent, recommend replacement"
    /// </summary>
    public string? Remarks { get; set; }
    
    /// <summary>
    /// Flag for abnormal condition requiring attention
    /// Example: Fire extinguisher pressure below minimum
    /// </summary>
    public bool IsAbnormal { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation properties
    [System.Text.Json.Serialization.JsonIgnore]
    public virtual MaintenanceTask Task { get; set; } = null!;
    [System.Text.Json.Serialization.JsonIgnore]
    public virtual EquipmentAsset Asset { get; set; } = null!;
}

/// <summary>
/// Cargo Operations (Bill of Lading, Loading/Discharging)
/// </summary>
public class CargoOperation
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    [MaxLength(50)]
    public string OperationId { get; set; } = string.Empty;
    
    public Guid? VoyageId { get; set; } // Foreign key to VoyageRecord

    /// <summary>Phase 6: FK -> VoyagePlanLeg.Id (optional)</summary>
    public Guid? VoyagePlanLegId { get; set; }
    
    [Required]
    [MaxLength(20)]
    public string OperationType { get; set; } = string.Empty; // LOADING, DISCHARGING
    
    [Required]
    [MaxLength(100)]
    public string CargoType { get; set; } = string.Empty; // CONTAINER, BULK, OIL, GAS, GENERAL
    
    public string? CargoDescription { get; set; }
    
    public double Quantity { get; set; } // Tons or TEU
    
    [MaxLength(20)]
    public string Unit { get; set; } = "MT"; // MT (Metric Tons), TEU, CBM
    
    [MaxLength(100)]
    public string? LoadingPort { get; set; }
    
    [MaxLength(100)]
    public string? DischargePort { get; set; }
    
    public DateTime? LoadedAt { get; set; }
    
    public DateTime? DischargedAt { get; set; }
    
    [MaxLength(200)]
    public string? Shipper { get; set; }
    
    [MaxLength(200)]
    public string? Consignee { get; set; }
    
    [MaxLength(100)]
    public string? BillOfLading { get; set; } // B/L Number
    
    [MaxLength(500)]
    public string? SealNumbers { get; set; } // Container seals
    
    public string? SpecialRequirements { get; set; } // Reefer, Hazmat, Overweight
    
    [MaxLength(20)]
    public string Status { get; set; } = "PLANNED"; // PLANNED, LOADING, LOADED, DISCHARGING, DISCHARGED
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Watchkeeping Logs (SOLAS Chapter V/28, STCW Convention, MLC 2006)
/// </summary>
public class WatchkeepingLog
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public DateTime WatchDate { get; set; }
    
    [Required]
    [MaxLength(20)]
    public string WatchPeriod { get; set; } = string.Empty; // 00-04, 04-08, 08-12, 12-16, 16-20, 20-24
    
    [Required]
    [MaxLength(20)]
    public string WatchType { get; set; } = string.Empty; // NAVIGATION, ENGINE
    
    [Required]
    [MaxLength(100)]
    public string OfficerOnWatch { get; set; } = string.Empty;
    
    [MaxLength(100)]
    public string? ReliefOfficer { get; set; } // Officer taking over watch
    
    [MaxLength(100)]
    public string? Lookout { get; set; }
    
    // STCW Rest Hours Compliance (Mandatory)
    public double WorkHours { get; set; } = 4.0; // Hours worked this watch (default 4h watch)
    
    public double RestHoursLast24h { get; set; } // Minimum 10 hours in any 24-hour period
    
    public double RestHoursLast7Days { get; set; } // Minimum 77 hours in any 7-day period
    
    public bool RestHoursCompliant { get; set; } = true; // Auto-calculated compliance
    
    [MaxLength(500)]
    public string? RestHoursException { get; set; } // If non-compliant, reason must be recorded
    
    // Weather & Navigation Conditions
    public string? WeatherConditions { get; set; }
    
    [MaxLength(50)]
    public string? SeaState { get; set; } // 0-9 Douglas Sea Scale (Calm, Smooth, Slight, Moderate, Rough, Very Rough, High, Very High, Phenomenal)
    
    [MaxLength(50)]
    public string? Visibility { get; set; } // Good (>5nm), Moderate (2-5nm), Poor (0.5-2nm), Fog (<0.5nm)
    
    public double? CourseLogged { get; set; } // Degrees true
    
    public double? SpeedLogged { get; set; } // Knots
    
    public double? PositionLat { get; set; }
    
    public double? PositionLon { get; set; }
    
    public double? DistanceRun { get; set; } // Nautical miles during watch
    
    // Bridge Equipment Status
    [MaxLength(200)]
    public string? EngineStatus { get; set; }
    
    public bool RadarOperational { get; set; } = true;
    
    public bool ECDISOperational { get; set; } = true;
    
    public bool AISOperational { get; set; } = true;
    
    public bool GyroOperational { get; set; } = true;
    
    public bool AutopilotEngaged { get; set; } = false;
    
    [MaxLength(500)]
    public string? EquipmentDefects { get; set; } // Any navigation equipment failures
    
    // GMDSS Watch (SOLAS Chapter IV)
    public bool GMDSSWatchMaintained { get; set; } = true;
    
    [MaxLength(200)]
    public string? NavigationWarningsReceived { get; set; } // NAVTEX, SafetyNET messages
    
    // Watch Events & Handover
    public string? NotableEvents { get; set; } // Ships sighted, course alterations, weather changes
    
    [MaxLength(1000)]
    public string? HandoverNotes { get; set; } // Notes for relieving officer (mandatory at watch change)
    
    public bool HandoverChecklistCompleted { get; set; } = false;
    
    public DateTime? WatchStartTime { get; set; }
    
    public DateTime? WatchEndTime { get; set; }
    
    // Bridge Manning (STCW)
    public int BridgeManningLevel { get; set; } = 2; // Number of persons on bridge
    
    public bool LookoutPosted { get; set; } = true; // Mandatory during hours of darkness/restricted visibility
    
    // Fatigue Management (MLC 2006)
    [MaxLength(20)]
    public string? FatigueRiskLevel { get; set; } // LOW, MEDIUM, HIGH
    
    public bool FatigueAssessmentDone { get; set; } = false;
    
    [MaxLength(200)]
    public string? MasterSignature { get; set; }
    
    public DateTime? SignedAt { get; set; }

    // Phase 6: Voyage & Leg linking
    public Guid? VoyageId { get; set; }
    public Guid? VoyagePlanLegId { get; set; }

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("VoyagePlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? VoyagePlanLeg { get; set; }
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    // Soft Delete Support
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
    [MaxLength(100)]
    public string? DeletedBy { get; set; }
}

/// <summary>
/// Oil Record Book (MARPOL Annex I - Mandatory)
/// </summary>
public class OilRecordBook
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public DateTime EntryDate { get; set; }
    
    [Required]
    [MaxLength(10)]
    public string OperationCode { get; set; } = string.Empty; // ORB codes 1-44
    
    [Required]
    public string OperationDescription { get; set; } = string.Empty;
    
    public double? LocationLat { get; set; }
    
    public double? LocationLon { get; set; }
    
    public double? Quantity { get; set; } // Cubic meters or liters
    
    [MaxLength(20)]
    public string? QuantityUnit { get; set; } = "m³"; // m³, liters
    
    [MaxLength(50)]
    public string? TankFrom { get; set; }
    
    [MaxLength(50)]
    public string? TankTo { get; set; }
    
    [Required]
    [MaxLength(100)]
    public string OfficerInCharge { get; set; } = string.Empty;
    
    [MaxLength(200)]
    public string? MasterSignature { get; set; }
    
    public string? Remarks { get; set; }
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    // Phase 6: Voyage & Leg linking
    public Guid? VoyageId { get; set; }
    public Guid? VoyagePlanLegId { get; set; }

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("VoyagePlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? VoyagePlanLeg { get; set; }

    // Soft Delete Support
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
    [MaxLength(100)]
    public string? DeletedBy { get; set; }
}

/// <summary>
/// Deck Log Book / Official Log Book (SOLAS Chapter V, Regulation 28)
/// Records all significant events occurring on board
/// </summary>
public class DeckLogBook
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public DateTime LogDateTime { get; set; }
    
    /// <summary>
    /// Watch period: 00-04, 04-08, 08-12, 12-16, 16-20, 20-24
    /// </summary>
    [Required]
    [MaxLength(10)]
    public string WatchPeriod { get; set; } = string.Empty;
    
    /// <summary>
    /// Officer Of the Watch (OOW)
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string OfficerOnWatch { get; set; } = string.Empty;
    
    /// <summary>
    /// Entry type: ROUTINE, NAVIGATION, WEATHER, SAFETY, DRILL, INCIDENT, PORT_OPS, CREW_CHANGE
    /// </summary>
    [Required]
    [MaxLength(30)]
    public string EntryType { get; set; } = string.Empty;
    
    /// <summary>
    /// Detailed description of the event/observation
    /// </summary>
    [Required]
    public string Description { get; set; } = string.Empty;
    
    // Position at time of entry
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    
    // Navigation details
    public double? CourseOverGround { get; set; }
    public double? SpeedOverGround { get; set; }
    public double? Heading { get; set; }
    
    // Weather conditions
    [MaxLength(20)]
    public string? WindDirection { get; set; }
    
    public double? WindSpeed { get; set; } // Knots
    
    [MaxLength(20)]
    public string? SeaState { get; set; } // Calm, Moderate, Rough, Very Rough
    
    [MaxLength(30)]
    public string? Visibility { get; set; } // Good, Moderate, Poor, Fog
    
    public double? BarometricPressure { get; set; }
    public double? AirTemperature { get; set; }
    public double? SeaTemperature { get; set; }
    
    // Safety drills
    [MaxLength(50)]
    public string? DrillType { get; set; } // Fire, Abandon Ship, Man Overboard, etc.
    
    public bool? DrillSuccessful { get; set; }
    
    // Crew information
    public int? CrewOnBoard { get; set; }
    
    [MaxLength(200)]
    public string? CrewChanges { get; set; } // Sign on/off details
    
    // Port operations
    [MaxLength(100)]
    public string? PortName { get; set; }
    
    public DateTime? PortArrivalTime { get; set; }
    public DateTime? PortDepartureTime { get; set; }
    
    [MaxLength(100)]
    public string? PilotName { get; set; }
    
    public DateTime? PilotOnBoard { get; set; }
    public DateTime? PilotOffBoard { get; set; }
    
    // Master's signature for important entries
    [MaxLength(100)]
    public string? MasterSignature { get; set; }
    
    public DateTime? SignedAt { get; set; }
    
    // Remarks
    public string? Remarks { get; set; }
    
    // Sync metadata
    public bool IsSynced { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    // Phase 6: Voyage & Leg linking
    public Guid? VoyageId { get; set; }
    public Guid? VoyagePlanLegId { get; set; }

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("VoyagePlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? VoyagePlanLeg { get; set; }

    // Soft Delete Support
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
    [MaxLength(100)]
    public string? DeletedBy { get; set; }
}

/// <summary>
/// Engine Log Book (ISM Code requirement)
/// Records engine room operations, fuel consumption, and maintenance
/// </summary>
public class EngineLogBook
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public DateTime LogDateTime { get; set; }
    
    /// <summary>
    /// Watch period: 00-04, 04-08, 08-12, 12-16, 16-20, 20-24
    /// </summary>
    [Required]
    [MaxLength(10)]
    public string WatchPeriod { get; set; } = string.Empty;
    
    /// <summary>
    /// Engineer on watch
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string EngineerOnWatch { get; set; } = string.Empty;
    
    // Main Engine parameters
    [MaxLength(50)]
    public string? MainEngineStatus { get; set; } // Running, Stopped, Standby
    
    public double? MainEngineRPM { get; set; }
    public double? MainEngineLoad { get; set; } // Percentage
    public double? MainEngineCoolantTemp { get; set; }
    public double? MainEngineExhaustTemp { get; set; }
    public double? MainEngineLubeOilPressure { get; set; }
    public double? MainEngineLubeOilTemp { get; set; }
    public double? MainEngineRunningHours { get; set; }
    
    // Fuel consumption
    public double? FuelOilConsumedME { get; set; } // Main Engine (MT or liters)
    public double? FuelOilConsumedAE { get; set; } // Auxiliary Engines
    public double? FuelOilConsumedBoiler { get; set; }
    public double? LubeOilConsumed { get; set; }
    public double? FreshWaterConsumed { get; set; }
    
    [MaxLength(10)]
    public string? FuelUnit { get; set; } = "MT"; // MT or liters
    
    // Auxiliary Engines (up to 3 generators)
    public bool? AuxEngine1Running { get; set; }
    public double? AuxEngine1RunningHours { get; set; }
    public double? AuxEngine1Load { get; set; }
    
    public bool? AuxEngine2Running { get; set; }
    public double? AuxEngine2RunningHours { get; set; }
    public double? AuxEngine2Load { get; set; }
    
    public bool? AuxEngine3Running { get; set; }
    public double? AuxEngine3RunningHours { get; set; }
    public double? AuxEngine3Load { get; set; }
    
    // Boiler
    public bool? BoilerInOperation { get; set; }
    public double? BoilerPressure { get; set; }
    public double? BoilerWaterLevel { get; set; }
    
    // Fuel Oil Tanks
    public double? FuelOilROB { get; set; } // Remaining On Board (MT)
    public double? LubOilROB { get; set; }
    public double? FreshWaterROB { get; set; }
    public double? SludgeROB { get; set; }
    public double? BilgeWaterROB { get; set; }
    
    [MaxLength(200)]
    public string? FuelOilTransfers { get; set; } // Tank to tank transfers
    
    // Alarms and abnormalities
    public bool HasAlarms { get; set; } = false;
    
    [MaxLength(500)]
    public string? AlarmsDescription { get; set; }
    
    // Maintenance activities during watch
    [MaxLength(500)]
    public string? MaintenanceActivities { get; set; }
    
    // Chief Engineer's remarks
    public string? ChiefEngineerRemarks { get; set; }
    
    [MaxLength(100)]
    public string? ChiefEngineerSignature { get; set; }
    
    public DateTime? SignedAt { get; set; }
    
    // General remarks
    public string? Remarks { get; set; }
    
    // Sync metadata
    public bool IsSynced { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    // Phase 6: Voyage & Leg linking
    public Guid? VoyageId { get; set; }
    public Guid? VoyagePlanLegId { get; set; }

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("VoyagePlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? VoyagePlanLeg { get; set; }

    // Soft Delete Support
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
    [MaxLength(100)]
    public string? DeletedBy { get; set; }
}

/// <summary>
/// Garbage Record Book (MARPOL Annex V)
/// Mandatory for ships ≥400 GT and all ships certified to carry ≥15 persons
/// </summary>
public class GarbageRecordBook
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public DateTime OperationDateTime { get; set; }
    
    /// <summary>
    /// Operation type (operation_type in DB):
    /// 1 - Discharge into the sea
    /// 2 - Discharge to reception facilities
    /// 3 - Incineration
    /// 4 - Accidental or other exceptional discharge
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string OperationCode { get; set; } = string.Empty;
    
    /// <summary>
    /// Garbage category (Annex V):
    /// A - Plastics, B - Food wastes, C - Domestic wastes, D - Cooking oil, E - Incinerator ashes
    /// F - Operational wastes, G - Cargo residues (non-HME), H - Cargo residues (HME)
    /// I - Animal carcasses, J - Fishing gear, K - E-waste
    /// </summary>
    [Required]
    [MaxLength(5)]
    public string GarbageCategory { get; set; } = string.Empty;
    
    [Required]
    public string Description { get; set; } = string.Empty;
    
    public double Quantity { get; set; }
    
    [MaxLength(10)]
    public string QuantityUnit { get; set; } = "m³";
    
    // Discharge to sea fields
    public bool DischargeToSea { get; set; } = false;
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public double? DistanceFromNearestLand { get; set; }
    
    // Discharge to reception facility fields
    public bool DischargeToReceptionFacility { get; set; } = false;
    
    [MaxLength(100)]
    public string? PortName { get; set; }
    
    [MaxLength(200)]
    public string? ReceptionFacility { get; set; }
    
    [MaxLength(100)]
    public string? ReceiptNumber { get; set; }
    
    public DateTime? ReceiptDate { get; set; }
    
    // Incineration fields
    public bool Incineration { get; set; } = false;
    
    [MaxLength(50)]
    public string? IncineratorType { get; set; }
    
    // Note: IncinerationStartTime, IncinerationEndTime, IncineratorDetails removed - not in DB schema
    public DateTime? IncinerationStartTime { get; set; }
    public DateTime? IncinerationEndTime { get; set; }
    
    [MaxLength(200)]
    public string? IncineratorDetails { get; set; }
    
    // Other processing
    public bool ComminutedOrGround { get; set; } = false;
    public bool RetainedOnBoard { get; set; } = false;
    
    [MaxLength(100)]
    public string? StorageLocation { get; set; }
    
    // Cargo residues
    [MaxLength(50)]
    public string? CargoResiduesCategory { get; set; }
    
    [MaxLength(20)]
    public string? CargoUnNumber { get; set; }
    
    public string? DischargeMethod { get; set; }
    
    public string? ExceptionalDischargeCircumstances { get; set; }
    
    // For accidental discharge
    [MaxLength(500)]
    public string? AccidentalDischargeReason { get; set; }
    
    [MaxLength(500)]
    public string? AccidentalDischargeMeasures { get; set; }
    
    // Officer in charge
    [Required]
    [MaxLength(100)]
    public string OfficerInCharge { get; set; } = string.Empty;
    
    // Master's signature
    [MaxLength(100)]
    public string? MasterSignature { get; set; }
    
    public DateTime? SignedAt { get; set; }
    
    // Remarks
    public string? Remarks { get; set; }
    
    // Sync metadata
    public bool IsSynced { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    // Phase 6: Voyage & Leg linking
    public Guid? VoyageId { get; set; }
    public Guid? VoyagePlanLegId { get; set; }

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("VoyagePlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? VoyagePlanLeg { get; set; }

    // Soft Delete Support
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
    [MaxLength(100)]
    public string? DeletedBy { get; set; }
}

/// <summary>
/// Garbage Record Book Part I (MARPOL Annex V)
/// Regular garbage categories A-I (excluding cargo residues J-K)
/// </summary>
public class GarbageRecordPartI
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public DateTime OperationDate { get; set; }
    
    [Required]
    public TimeSpan OperationTime { get; set; }
    
    /// <summary>
    /// Stop time for the operation (optional)
    /// </summary>
    public TimeSpan? OperationEndTime { get; set; }
    
    /// <summary>
    /// Garbage category (A-I only):
    /// A - Plastics
    /// B - Food wastes
    /// C - Domestic wastes (paper, rags, glass, etc.)
    /// D - Cooking oil
    /// E - Incinerator ashes
    /// F - Operational wastes
    /// G - Animal carcasses
    /// H - Fishing gear
    /// I - E-waste
    /// </summary>
    [Required]
    [MaxLength(5)]
    public string Category { get; set; } = string.Empty;
    
    [Required]
    public string Description { get; set; } = string.Empty;
    
    /// <summary>
    /// Estimated amount discharged into sea (m³)
    /// Only allowed for specific categories per MARPOL
    /// </summary>
    public double? EstimatedAmountDischargedToSea { get; set; }
    
    /// <summary>
    /// Estimated amount discharged to reception facilities (m³)
    /// </summary>
    public double? EstimatedAmountToReceptionFacilities { get; set; }
    
    /// <summary>
    /// Estimated amount incinerated (m³)
    /// </summary>
    public double? EstimatedAmountIncinerated { get; set; }
    
    // Position for discharge to sea
    public double? DischargeLatitude { get; set; }
    public double? DischargeLongitude { get; set; }
    
    // Port/Reception facility details
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
    
    // Exceptional/Accidental discharge
    [MaxLength(500)]
    public string? ExceptionalDischargeReason { get; set; }
    
    /// <summary>
    /// Water depth at discharge location (meters)
    /// Required for exceptional discharge documentation
    /// </summary>
    public double? WaterDepth { get; set; }
    
    public string? Remarks { get; set; }
    
    // Officer and signature
    [Required]
    [MaxLength(100)]
    public string OfficerInCharge { get; set; } = string.Empty;
    
    [MaxLength(100)]
    public string? MasterSignature { get; set; }
    
    public DateTime? SignedAt { get; set; }
    
    // Sync metadata
    public bool IsSynced { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    // Phase 6: Voyage & Leg linking
    public Guid? VoyageId { get; set; }
    public Guid? VoyagePlanLegId { get; set; }

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("VoyagePlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? VoyagePlanLeg { get; set; }
    
    // Soft Delete
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
    [MaxLength(100)]
    public string? DeletedBy { get; set; }
}

/// <summary>
/// Garbage Record Book Part II (MARPOL Annex V)
/// Cargo residues categories J-K only
/// </summary>
public class GarbageRecordPartII
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public DateTime OperationDate { get; set; }
    
    [Required]
    public TimeSpan OperationTime { get; set; }
    
    /// <summary>
    /// Stop time for the operation (optional)
    /// </summary>
    public TimeSpan? OperationEndTime { get; set; }
    
    /// <summary>
    /// Cargo residues category (J or K only):
    /// J - Cargo residues (non-HME) in wash water
    /// K - Cargo residues (HME) - STRICTLY PROHIBITED TO DISCHARGE TO SEA
    /// </summary>
    [Required]
    [MaxLength(5)]
    public string Category { get; set; } = string.Empty;
    
    /// <summary>
    /// Position at start of discharge
    /// </summary>
    [Required]
    public double StartLatitude { get; set; }
    
    [Required]
    public double StartLongitude { get; set; }
    
    /// <summary>
    /// Position at end of discharge
    /// </summary>
    [Required]
    public double EndLatitude { get; set; }
    
    [Required]
    public double EndLongitude { get; set; }
    
    /// <summary>
    /// Estimated amount discharged into sea (m³)
    /// Only for Category J (non-HME)
    /// Category K (HME) MUST NOT discharge to sea
    /// </summary>
    public double? EstimatedAmountDischargedToSea { get; set; }
    
    /// <summary>
    /// Estimated amount discharged to reception facilities (m³)
    /// Mandatory for Category K (HME)
    /// </summary>
    public double? EstimatedAmountToReceptionFacilities { get; set; }
    
    // Port/Reception facility details
    [MaxLength(100)]
    public string? PortName { get; set; }
    
    [MaxLength(200)]
    public string? ReceptionFacilityName { get; set; }
    
    [MaxLength(100)]
    public string? ReceiptNumber { get; set; }
    
    /// <summary>
    /// Cargo description and hold numbers washed
    /// </summary>
    [Required]
    public string CargoDescription { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(200)]
    public string HoldNumbersWashed { get; set; } = string.Empty;
    
    public string? Remarks { get; set; }
    
    // Officer and signature
    [Required]
    [MaxLength(100)]
    public string OfficerInCharge { get; set; } = string.Empty;
    
    [MaxLength(100)]
    public string? MasterSignature { get; set; }
    
    public DateTime? SignedAt { get; set; }
    
    // Sync metadata
    public bool IsSynced { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    // Phase 6: Voyage & Leg linking
    public Guid? VoyageId { get; set; }
    public Guid? VoyagePlanLegId { get; set; }

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("VoyagePlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? VoyagePlanLeg { get; set; }
    
    // Soft Delete
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
    [MaxLength(100)]
    public string? DeletedBy { get; set; }
}

/// <summary>
/// Ballast Water Record Book (BWM Convention)
/// Mandatory for all ships ≥400 GT
/// </summary>
public class BallastWaterRecordBook
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public DateTime OperationDateTime { get; set; }
    
    /// <summary>
    /// Operation code (BWM Convention):
    /// 1 - Ballast water uptake
    /// 2 - Ballast water circulation/exchange at sea
    /// 3 - Ballast water exchange - sequential method
    /// 4 - Ballast water exchange - flow-through method
    /// 5 - Ballast water discharge at sea
    /// 6 - Ballast water discharge to reception facility
    /// 7 - Accidental/exceptional uptake or discharge
    /// 8 - Ballast water management (treatment)
    /// 9 - Discharge of sediment
    /// </summary>
    [Required]
    [MaxLength(5)]
    public string OperationCode { get; set; } = string.Empty;
    
    [Required]
    public string OperationDescription { get; set; } = string.Empty;
    
    /// <summary>
    /// Ship's ballast tank identifier
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string BallastTank { get; set; } = string.Empty;
    
    /// <summary>
    /// Volume of ballast water (m³)
    /// </summary>
    public double Volume { get; set; }
    
    // Location at start of operation
    [Required]
    public double StartLatitude { get; set; }
    
    [Required]
    public double StartLongitude { get; set; }
    
    public DateTime StartDateTime { get; set; }
    
    // Location at end of operation
    public double? EndLatitude { get; set; }
    public double? EndLongitude { get; set; }
    public DateTime? EndDateTime { get; set; }
    
    // Water depth and distance from nearest land
    public double? WaterDepth { get; set; } // Meters
    public double? DistanceFromLand { get; set; } // Nautical miles
    
    // For exchange operations
    public double? ExchangeVolumePercentage { get; set; } // % of tank volume exchanged
    
    [MaxLength(30)]
    public string? ExchangeMethod { get; set; } // Sequential, Flow-through
    
    // For treatment system operations
    public bool? TreatmentSystemUsed { get; set; }
    
    [MaxLength(200)]
    public string? TreatmentSystemType { get; set; } // UV, Electrolysis, Filtration, etc.
    
    public bool? TreatmentSuccessful { get; set; }
    
    [MaxLength(500)]
    public string? TreatmentDetails { get; set; }
    
    // For accidental/exceptional operations
    [MaxLength(500)]
    public string? ExceptionalCircumstances { get; set; }
    
    // Salinity measurements (for exchange verification)
    public double? SalinityBeforeExchange { get; set; } // PPT (parts per thousand)
    public double? SalinityAfterExchange { get; set; }
    
    // Port facility details (if applicable)
    [MaxLength(100)]
    public string? PortName { get; set; }
    
    [MaxLength(200)]
    public string? ReceptionFacility { get; set; }
    
    [MaxLength(100)]
    public string? ReceiptNumber { get; set; }
    
    // Officer in charge
    [Required]
    [MaxLength(100)]
    public string OfficerInCharge { get; set; } = string.Empty;
    
    // Master's signature
    [MaxLength(100)]
    public string? MasterSignature { get; set; }
    
    public DateTime? SignedAt { get; set; }
    
    // Remarks
    public string? Remarks { get; set; }
    
    // Sync metadata
    public bool IsSynced { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    // Phase 6: Voyage & Leg linking
    public Guid? VoyageId { get; set; }
    public Guid? VoyagePlanLegId { get; set; }

    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("VoyagePlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? VoyagePlanLeg { get; set; }

    // Soft Delete Support
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
    [MaxLength(100)]
    public string? DeletedBy { get; set; }
}

/// <summary>
/// Material categories (hierarchical)
/// </summary>
public class MaterialCategory
{
    [Key]
    public long Id { get; set; }

    [Required]
    [MaxLength(50)]
    public string CategoryCode { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    /// <summary>
    /// Self-reference to parent category (nullable)
    /// </summary>
    public long? ParentCategoryId { get; set; }

    public bool IsActive { get; set; } = true;

    public bool IsSynced { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// DANH MỤC vật tư dùng chung (đồng bộ từ Shore xuống → bảng material_items).
/// Khớp schema shore catalog để sync sạch: chỉ mã, tên, loại, đơn giá.
/// </summary>
public class MaterialCatalogItem
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Mã vật tư (dùng chung, duy nhất).</summary>
    [Required]
    [MaxLength(50)]
    public string ItemCode { get; set; } = string.Empty;

    /// <summary>Tên vật tư.</summary>
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    /// <summary>FK -> MaterialCategory.Id</summary>
    public long CategoryId { get; set; }

    /// <summary>Đơn giá tham chiếu.</summary>
    public decimal? UnitPrice { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Vật tư trên tàu — bảng cũ material_items đổi tên thành material_item_ship.
/// Giữ nguyên các trường (số lượng, kho, tracking, tên/spec denormalized cho offline).
/// Thêm MaterialItemCode = FK trỏ danh mục material_items.ItemCode.
/// </summary>
public class MaterialItem
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Mã vật tư trên tàu (mã nội bộ của tàu).</summary>
    [Required]
    [MaxLength(50)]
    public string ItemCode { get; set; } = string.Empty;

    /// <summary>Tên vật tư (denormalized snapshot cho hoạt động offline).</summary>
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    /// <summary>Mã vật tư danh mục — FK trỏ material_items.ItemCode (loại vật tư trong danh mục chung).</summary>
    [MaxLength(50)]
    public string? MaterialItemCode { get; set; }

    /// <summary>FK -> MaterialCategory.Id</summary>
    public long CategoryId { get; set; }

    public string? Specification { get; set; }

    [MaxLength(20)]
    public string Unit { get; set; } = "PCS";

    public double OnHandQuantity { get; set; } = 0;

    public double? MinStock { get; set; }
    public double? MaxStock { get; set; }
    public double? ReorderLevel { get; set; }
    public double? ReorderQuantity { get; set; }

    [MaxLength(100)]
    public string? Location { get; set; }

    [MaxLength(100)]
    public string? Manufacturer { get; set; }

    [MaxLength(200)]
    public string? Supplier { get; set; }

    [MaxLength(100)]
    public string? PartNumber { get; set; }

    [MaxLength(50)]
    public string? Barcode { get; set; }

    public bool BatchTracked { get; set; } = false;
    public bool SerialTracked { get; set; } = false;
    public bool ExpiryRequired { get; set; } = false;

    public decimal? UnitCost { get; set; }

    [MaxLength(3)]
    public string? Currency { get; set; } = "USD";

    public string? Notes { get; set; }

    /// <summary>Image URL path (e.g. /uploads/materials/xxx.jpg)</summary>
    [MaxLength(500)]
    public string? ImageUrl { get; set; }

    public bool IsActive { get; set; } = true;

    public bool IsSynced { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

// ============================================================
// AUTHENTICATION & AUTHORIZATION
// ============================================================

/// <summary>
/// Role Management (Phân quyền)
/// </summary>
public class Role
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string RoleCode { get; set; } = string.Empty; // Mã quyền: ADMIN, CAPTAIN, ENGINEER, etc.
    
    [Required]
    [MaxLength(100)]
    public string RoleName { get; set; } = string.Empty; // Tên quyền: Quản trị viên, Thuyền trưởng, etc.
    
    public string? Description { get; set; }
    
    public bool IsActive { get; set; } = true;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// User Management (Tài khoản người dùng)
/// </summary>
public class User
{
    [Key]
    public long Id { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string Username { get; set; } = string.Empty; // Tham chiếu sang CrewId
    
    [Required]
    [MaxLength(255)]
    public string PasswordHash { get; set; } = string.Empty; // Password đã hash PBKDF2
    
    /// <summary>
    /// Salt dùng cho PBKDF2 hashing (Base64 encoded)
    /// </summary>
    [MaxLength(255)]
    public string? PasswordSalt { get; set; }
    
    [Required]
    public int RoleId { get; set; } // Tham chiếu sang bảng Role
    
    [MaxLength(50)]
    public string? CrewId { get; set; } // Foreign key tham chiếu sang CrewMember
    
    public bool IsActive { get; set; } = true;
    
    /// <summary>
    /// Số lần đăng nhập thất bại liên tiếp (reset khi login thành công)
    /// </summary>
    public int FailedLoginAttempts { get; set; } = 0;
    
    /// <summary>
    /// Tài khoản bị khóa đến thời điểm (null = không bị khóa)
    /// Theo NIST SP 800-63B: lockout sau 5 lần thất bại
    /// </summary>
    public DateTime? LockoutUntil { get; set; }
    
    /// <summary>
    /// Bắt buộc đổi mật khẩu lần đăng nhập tiếp theo
    /// (Khi admin reset password hoặc lần đầu đăng nhập)
    /// </summary>
    public bool MustChangePassword { get; set; } = true;
    
    /// <summary>
    /// Thời điểm đổi mật khẩu gần nhất
    /// </summary>
    public DateTime? PasswordChangedAt { get; set; }
    
    public DateTime? LastLoginAt { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime? UpdatedAt { get; set; }

    // Navigation property
    public Role? Role { get; set; }
}

// ============================================================
// MARITIME REPORTING SYSTEM (IMO/SOLAS/MARPOL Compliant)
// ============================================================

/// <summary>
/// Report Types - Danh mục các loại báo cáo hàng hải
/// IMO compliant report categories
/// </summary>
public class ReportType
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string TypeCode { get; set; } = string.Empty; // NOON, DEPARTURE, ARRIVAL, BUNKER, POSITION, etc.
    
    [Required]
    [MaxLength(100)]
    public string TypeName { get; set; } = string.Empty; // Noon Report, Departure Report, etc.
    
    [MaxLength(50)]
    public string Category { get; set; } = string.Empty; // OPERATIONAL, COMPLIANCE, ENVIRONMENTAL, SAFETY
    
    public string? Description { get; set; }
    
    /// <summary>
    /// IMO regulation reference (SOLAS V, MARPOL Annex VI, etc.)
    /// </summary>
    [MaxLength(100)]
    public string? RegulationReference { get; set; }
    
    /// <summary>
    /// Reporting frequency (DAILY, VOYAGE, MONTHLY, QUARTERLY, ANNUAL, EVENT_BASED)
    /// </summary>
    [MaxLength(30)]
    public string Frequency { get; set; } = "EVENT_BASED";
    
    /// <summary>
    /// Is this report type mandatory by regulation?
    /// </summary>
    public bool IsMandatory { get; set; } = false;
    
    /// <summary>
    /// Requires master signature?
    /// </summary>
    public bool RequiresMasterSignature { get; set; } = false;
    
    /// <summary>
    /// Template JSON schema for validation
    /// </summary>
    public string? TemplateSchema { get; set; }
    
    public bool IsActive { get; set; } = true;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Maritime Reports - Bảng chính lưu trữ tất cả báo cáo
/// Polymorphic pattern: một bảng cho tất cả loại báo cáo
/// </summary>
public class MaritimeReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// Unique report number (auto-generated: RPT-YYYYMMDD-NNNN)
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string ReportNumber { get; set; } = string.Empty;
    
    /// <summary>
    /// FK -> ReportType.Id
    /// </summary>
    [Required]
    public int ReportTypeId { get; set; }
    
    /// <summary>
    /// Report datetime (UTC)
    /// </summary>
    [Required]
    public DateTime ReportDateTime { get; set; }
    
    /// <summary>
    /// FK -> VoyageRecord.Id (nullable for non-voyage reports)
    /// </summary>
    public Guid? VoyageId { get; set; }

    /// <summary>
    /// Phase 6: FK -> VoyagePlanLeg.Id (optional, for leg-level reports)
    /// </summary>
    public Guid? VoyagePlanLegId { get; set; }
    
    /// <summary>
    /// Report status: DRAFT, SUBMITTED, APPROVED, REJECTED, TRANSMITTED
    /// </summary>
    [Required]
    [MaxLength(30)]
    public string Status { get; set; } = "DRAFT";
    
    /// <summary>
    /// Prepared by (crew name or username)
    /// </summary>
    [MaxLength(100)]
    public string? PreparedBy { get; set; }
    
    /// <summary>
    /// Master signature (digital signature or name)
    /// </summary>
    [MaxLength(100)]
    public string? MasterSignature { get; set; }
    
    /// <summary>
    /// Signature timestamp
    /// </summary>
    public DateTime? SignedAt { get; set; }
    
    /// <summary>
    /// Report data in JSON format (flexible schema)
    /// Contains all report-specific fields
    /// </summary>
    [Required]
    public string ReportData { get; set; } = "{}";
    
    /// <summary>
    /// Additional remarks/notes
    /// </summary>
    public string? Remarks { get; set; }
    
    /// <summary>
    /// Has been transmitted to shore?
    /// </summary>
    public bool IsTransmitted { get; set; } = false;
    
    /// <summary>
    /// Transmission timestamp
    /// </summary>
    public DateTime? TransmittedAt { get; set; }
    
    /// <summary>
    /// Local sync status
    /// </summary>
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime? UpdatedAt { get; set; }
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    // Soft Delete Support (IMO 3-year retention requirement)
    public DateTime? DeletedAt { get; set; }
    
    [MaxLength(100)]
    public string? DeletedBy { get; set; }
    
    public string? DeletedReason { get; set; }
}

/// <summary>
/// Report Workflow History - Audit trail for compliance
/// Tracks all status transitions for accountability
/// </summary>
public class ReportWorkflowHistory
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    public Guid MaritimeReportId { get; set; }
    
    [Required]
    [MaxLength(20)]
    public string FromStatus { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(20)]
    public string ToStatus { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(100)]
    public string ChangedBy { get; set; } = string.Empty;
    
    [Required]
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
    
    public string? Remarks { get; set; }
    
    [MaxLength(50)]
    public string? IpAddress { get; set; }
    
    [MaxLength(200)]
    public string? UserAgent { get; set; }
}

/// <summary>
/// Noon Report Daily - Báo cáo giữa trưa hàng ngày (IMO standard)
/// Most important daily operational report
/// Extended with crew/safety data for comprehensive reporting
/// </summary>
public class NoonReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// FK -> MaritimeReport.Id (parent report)
    /// </summary>
    [Required]
    public Guid MaritimeReportId { get; set; }
    
    /// <summary>
    /// Report date (local ship time)
    /// </summary>
    [Required]
    public DateTime ReportDate { get; set; }
    
    // ============ POSITION DATA ============
    
    /// <summary>
    /// Noon position - Latitude
    /// </summary>
    [Range(-90, 90)]
    public double? Latitude { get; set; }
    
    /// <summary>
    /// Noon position - Longitude
    /// </summary>
    [Range(-180, 180)]
    public double? Longitude { get; set; }
    
    /// <summary>
    /// Course Over Ground (degrees true)
    /// </summary>
    [Range(0, 360)]
    public double? CourseOverGround { get; set; }
    
    /// <summary>
    /// Speed Over Ground (knots)
    /// </summary>
    [Range(0, 50)]
    public double? SpeedOverGround { get; set; }
    
    /// <summary>
    /// Distance traveled in last 24h (nautical miles)
    /// </summary>
    [Range(0, 1000)]
    public double? DistanceTraveled { get; set; }
    
    /// <summary>
    /// Distance to go to next port (nautical miles)
    /// </summary>
    public double? DistanceToGo { get; set; }
    
    /// <summary>
    /// Estimated Time of Arrival
    /// </summary>
    public DateTime? EstimatedTimeOfArrival { get; set; }
    
    // ============ WEATHER DATA ============
    
    [MaxLength(50)]
    public string? WeatherConditions { get; set; } // FAIR, CLOUDY, RAIN, STORM
    
    [MaxLength(20)]
    public string? SeaState { get; set; } // CALM, MODERATE, ROUGH, VERY_ROUGH
    
    [Range(-50, 50)]
    public double? AirTemperature { get; set; } // Celsius
    
    [Range(-50, 50)]
    public double? SeaTemperature { get; set; } // Celsius
    
    [Range(900, 1100)]
    public double? BarometricPressure { get; set; } // hPa
    
    [MaxLength(20)]
    public string? WindDirection { get; set; } // N, NE, E, SE, S, SW, W, NW
    
    [Range(0, 100)]
    public double? WindSpeed { get; set; } // knots
    
    [MaxLength(20)]
    public string? Visibility { get; set; } // GOOD, MODERATE, POOR, FOG
    
    // ============ FUEL DATA ============
    
    // Fuel consumption (last 24h)
    public double? FuelOilConsumed { get; set; } // MT (Metric Tons)
    public double? DieselOilConsumed { get; set; } // MT
    public double? LubOilConsumed { get; set; } // Liters
    public double? FreshWaterConsumed { get; set; } // Tons
    
    // Fuel remaining on board (ROB)
    public double? FuelOilROB { get; set; } // MT
    public double? DieselOilROB { get; set; } // MT
    public double? LubOilROB { get; set; } // Liters
    public double? FreshWaterROB { get; set; } // Tons
    
    // ============ ENGINE DATA ============
    
    [MaxLength(50)]
    public string? MainEngineRunningHours { get; set; }
    public double? MainEngineRPM { get; set; }
    public double? MainEnginePower { get; set; } // kW
    
    [MaxLength(50)]
    public string? AuxEngineRunningHours { get; set; }
    
    // ============ CARGO DATA ============
    
    public double? CargoOnBoard { get; set; } // MT
    [MaxLength(100)]
    public string? CargoDescription { get; set; }
    
    // ============ CREW STATUS ============
    
    /// <summary>Number of crew on board</summary>
    public int? CrewOnBoard { get; set; }
    
    /// <summary>Number of passengers on board</summary>
    public int? PassengersOnBoard { get; set; }
    
    // ============ SAFETY DATA ============
    
    /// <summary>Safety drills conducted today</summary>
    [MaxLength(500)]
    public string? SafetyDrillsConducted { get; set; }
    
    /// <summary>Any safety incidents or near-misses</summary>
    [MaxLength(500)]
    public string? SafetyIncidents { get; set; }
    
    // ============ REMARKS ============
    
    public string? OperationalRemarks { get; set; }
    public string? MachineryRemarks { get; set; }
    public string? CargoRemarks { get; set; }
    
    /// <summary>Maintenance notes for the day</summary>
    public string? MaintenanceRemarks { get; set; }
    
    // ============ SNAPSHOT SUMMARIES (populated at transmit time) ============
    
    /// <summary>JSON snapshot of PMS/Maintenance summary at time of report</summary>
    public string? MaintenanceSummaryJson { get; set; }
    
    /// <summary>JSON snapshot of Alarm summary at time of report</summary>
    public string? AlarmSummaryJson { get; set; }
    
    /// <summary>Number of crew certificates expiring within 30 days</summary>
    public int? CertificatesExpiringSoon { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation property
    [ForeignKey(nameof(MaritimeReportId))]
    public virtual MaritimeReport? MaritimeReport { get; set; }
}

/// <summary>
/// Departure Report - Báo cáo rời cảng (SOLAS Chapter V)
/// </summary>
public class DepartureReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// FK -> MaritimeReport.Id
    /// </summary>
    [Required]
    public Guid MaritimeReportId { get; set; }
    
    /// <summary>
    /// FK -> VoyageRecord.Id
    /// </summary>
    public Guid? VoyageId { get; set; }
    
    [Required]
    [MaxLength(100)]
    public string PortName { get; set; } = string.Empty;
    
    /// <summary>
    /// UN/LOCODE (e.g., SGSIN for Singapore)
    /// </summary>
    [MaxLength(10)]
    public string? PortCode { get; set; }
    
    [Required]
    public DateTime DepartureDateTime { get; set; }
    
    /// <summary>
    /// Pilot on board time
    /// </summary>
    public DateTime? PilotOnBoardTime { get; set; }
    
    /// <summary>
    /// Last line ashore time
    /// </summary>
    public DateTime? LastLineAshoreTime { get; set; }
    
    /// <summary>
    /// Departure position - Latitude
    /// </summary>
    public double? DepartureLatitude { get; set; }
    
    /// <summary>
    /// Departure position - Longitude
    /// </summary>
    public double? DepartureLongitude { get; set; }
    
    [MaxLength(100)]
    public string? NextPort { get; set; }
    
    [MaxLength(10)]
    public string? NextPortCode { get; set; }
    
    public DateTime? EstimatedTimeOfArrival { get; set; }
    
    public double? DistanceToNextPort { get; set; } // Nautical miles
    
    // Draft readings (vessel draft in meters)
    public double? DraftForward { get; set; }
    public double? DraftAft { get; set; }
    public double? DraftMidship { get; set; }
    
    // Bunker quantities at departure (ROB)
    public double? FuelOilROB { get; set; } // MT
    public double? DieselOilROB { get; set; } // MT
    public double? LubOilROB { get; set; } // Liters
    public double? FreshWaterROB { get; set; } // Tons
    
    // Cargo
    public double? CargoOnBoard { get; set; } // MT
    [MaxLength(200)]
    public string? CargoDescription { get; set; }
    
    public int? CrewOnBoard { get; set; }
    public int? PassengersOnBoard { get; set; }
    
    public string? Remarks { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation property
    [ForeignKey(nameof(MaritimeReportId))]
    public virtual MaritimeReport? MaritimeReport { get; set; }
}

/// <summary>
/// Arrival Report - Báo cáo đến cảng (SOLAS Chapter V)
/// </summary>
public class ArrivalReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// FK -> MaritimeReport.Id
    /// </summary>
    [Required]
    public Guid MaritimeReportId { get; set; }
    
    /// <summary>
    /// FK -> VoyageRecord.Id
    /// </summary>
    public Guid? VoyageId { get; set; }
    
    [Required]
    [MaxLength(100)]
    public string PortName { get; set; } = string.Empty;
    
    [MaxLength(10)]
    public string? PortCode { get; set; }
    
    [Required]
    public DateTime ArrivalDateTime { get; set; }
    
    /// <summary>
    /// Pilot on board time
    /// </summary>
    public DateTime? PilotOnBoardTime { get; set; }
    
    /// <summary>
    /// First line ashore time (mooring completion)
    /// </summary>
    public DateTime? FirstLineAshoreTime { get; set; }
    
    /// <summary>
    /// Arrival position - Latitude
    /// </summary>
    public double? ArrivalLatitude { get; set; }
    
    /// <summary>
    /// Arrival position - Longitude
    /// </summary>
    public double? ArrivalLongitude { get; set; }
    
    /// <summary>
    /// Total voyage distance (nautical miles)
    /// </summary>
    public double? VoyageDistance { get; set; }
    
    /// <summary>
    /// Voyage duration (hours)
    /// </summary>
    public double? VoyageDuration { get; set; }
    
    /// <summary>
    /// Average speed during voyage (knots)
    /// </summary>
    public double? AverageSpeed { get; set; }
    
    // Draft readings on arrival
    public double? DraftForward { get; set; }
    public double? DraftAft { get; set; }
    public double? DraftMidship { get; set; }
    
    // Bunker ROB on arrival
    public double? FuelOilROB { get; set; }
    public double? DieselOilROB { get; set; }
    public double? LubOilROB { get; set; }
    public double? FreshWaterROB { get; set; }
    
    // Total fuel consumed during voyage
    public double? TotalFuelConsumed { get; set; }
    public double? TotalDieselConsumed { get; set; }
    
    // Cargo
    public double? CargoOnBoard { get; set; }
    [MaxLength(200)]
    public string? CargoDescription { get; set; }
    
    public int? CrewOnBoard { get; set; }
    public int? PassengersOnBoard { get; set; }
    
    public string? Remarks { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation property
    [ForeignKey(nameof(MaritimeReportId))]
    public virtual MaritimeReport? MaritimeReport { get; set; }
}

/// <summary>
/// Bunker Delivery Note Report - Báo cáo nhận nhiên liệu
/// IMO DCS / MARPOL Annex VI compliance
/// </summary>
public class BunkerReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// FK -> MaritimeReport.Id
    /// </summary>
    [Required]
    public Guid MaritimeReportId { get; set; }
    
    [Required]
    public DateTime BunkerDate { get; set; }
    
    [Required]
    [MaxLength(100)]
    public string PortName { get; set; } = string.Empty;
    
    [MaxLength(10)]
    public string? PortCode { get; set; }
    
    /// <summary>
    /// Bunker supplier name
    /// </summary>
    [Required]
    [MaxLength(200)]
    public string SupplierName { get; set; } = string.Empty;
    
    /// <summary>
    /// Bunker Delivery Note (BDN) number
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string BDNNumber { get; set; } = string.Empty;
    
    /// <summary>
    /// Fuel type (HFO, MGO, LSFO, etc.)
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string FuelType { get; set; } = string.Empty;
    
    /// <summary>
    /// Fuel grade (ISO 8217)
    /// </summary>
    [MaxLength(50)]
    public string? FuelGrade { get; set; }
    
    /// <summary>
    /// Quantity received (MT)
    /// </summary>
    [Required]
    [Range(0, 10000)]
    public double QuantityReceived { get; set; }
    
    /// <summary>
    /// Density at 15°C (kg/m³)
    /// </summary>
    public double? Density { get; set; }
    
    /// <summary>
    /// Sulphur content (% m/m) - MARPOL compliance
    /// </summary>
    [Range(0, 5)]
    public double? SulphurContent { get; set; }
    
    /// <summary>
    /// Viscosity (cSt)
    /// </summary>
    public double? Viscosity { get; set; }
    
    /// <summary>
    /// Flash point (°C)
    /// </summary>
    public double? FlashPoint { get; set; }
    
    /// <summary>
    /// ROB before bunkering (MT)
    /// </summary>
    public double? ROBefore { get; set; }
    
    /// <summary>
    /// ROB after bunkering (MT)
    /// </summary>
    public double? ROBAfter { get; set; }
    
    /// <summary>
    /// Tank(s) where fuel was loaded
    /// </summary>
    [MaxLength(200)]
    public string? TanksLoaded { get; set; }
    
    /// <summary>
    /// Seal numbers (if applicable)
    /// </summary>
    [MaxLength(200)]
    public string? SealNumbers { get; set; }
    
    /// <summary>
    /// Chief Engineer signature/name
    /// </summary>
    [MaxLength(100)]
    public string? ChiefEngineerSignature { get; set; }
    
    public string? Remarks { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation property
    [ForeignKey(nameof(MaritimeReportId))]
    public virtual MaritimeReport? MaritimeReport { get; set; }
}

/// <summary>
/// Position Report - Báo cáo vị trí (SOLAS Chapter V Regulation 19)
/// For vessels in special areas or upon request
/// </summary>
public class PositionReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// FK -> MaritimeReport.Id
    /// </summary>
    [Required]
    public Guid MaritimeReportId { get; set; }
    
    [Required]
    public DateTime ReportDateTime { get; set; }
    
    [Required]
    [Range(-90, 90)]
    public double Latitude { get; set; }
    
    [Required]
    [Range(-180, 180)]
    public double Longitude { get; set; }
    
    [Range(0, 360)]
    public double? CourseOverGround { get; set; }
    
    [Range(0, 50)]
    public double? SpeedOverGround { get; set; }
    
    /// <summary>
    /// Report reason: ROUTINE, EMERGENCY, REQUEST, SPECIAL_AREA
    /// </summary>
    [MaxLength(50)]
    public string ReportReason { get; set; } = "ROUTINE";
    
    [MaxLength(100)]
    public string? LastPort { get; set; }
    
    [MaxLength(100)]
    public string? NextPort { get; set; }
    
    public DateTime? ETA { get; set; }
    
    public double? CargoOnBoard { get; set; }
    
    public int? CrewOnBoard { get; set; }
    
    public string? Remarks { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation property
    [ForeignKey(nameof(MaritimeReportId))]
    public virtual MaritimeReport? MaritimeReport { get; set; }
}

/// <summary>
/// Report Attachments - File đính kèm báo cáo
/// Supporting documents, photos, certificates, etc.
/// </summary>
public class ReportAttachment
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// FK -> MaritimeReport.Id
    /// </summary>
    [Required]
    public Guid MaritimeReportId { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string FileName { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(100)]
    public string FileType { get; set; } = string.Empty; // PDF, IMAGE, EXCEL, etc.
    
    [MaxLength(50)]
    public string? MimeType { get; set; }
    
    /// <summary>
    /// File size in bytes
    /// </summary>
    public long FileSize { get; set; }
    
    /// <summary>
    /// File storage path or blob reference
    /// </summary>
    [Required]
    public string FilePath { get; set; } = string.Empty;
    
    /// <summary>
    /// Attachment description
    /// </summary>
    [MaxLength(500)]
    public string? Description { get; set; }
    
    /// <summary>
    /// Uploaded by (crew name)
    /// </summary>
    [MaxLength(100)]
    public string? UploadedBy { get; set; }
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Report Distribution - Danh sách phân phối báo cáo
/// Track who should receive each report
/// </summary>
public class ReportDistribution
{
    [Key]
    public long Id { get; set; }
    
    /// <summary>
    /// FK -> ReportType.Id
    /// </summary>
    [Required]
    public int ReportTypeId { get; set; }
    
    /// <summary>
    /// Recipient type: SHORE_OFFICE, OWNER, CHARTERER, PORT_AUTHORITY, CLASS_SOCIETY
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string RecipientType { get; set; } = string.Empty;
    
    /// <summary>
    /// Recipient name/organization
    /// </summary>
    [Required]
    [MaxLength(200)]
    public string RecipientName { get; set; } = string.Empty;
    
    /// <summary>
    /// Email address(es) - can be multiple, comma-separated
    /// </summary>
    [MaxLength(500)]
    public string? EmailAddresses { get; set; }
    
    /// <summary>
    /// Fax number (legacy but still used in maritime)
    /// </summary>
    [MaxLength(50)]
    public string? FaxNumber { get; set; }
    
    /// <summary>
    /// Delivery method: EMAIL, FAX, PORTAL, API
    /// </summary>
    [MaxLength(30)]
    public string DeliveryMethod { get; set; } = "EMAIL";
    
    public bool IsActive { get; set; } = true;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Report Transmission Log - Nhật ký gửi báo cáo
/// Track all report transmissions to shore
/// </summary>
public class ReportTransmissionLog
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// FK -> MaritimeReport.Id
    /// </summary>
    [Required]
    public Guid MaritimeReportId { get; set; }
    
    [Required]
    public DateTime TransmissionDateTime { get; set; }
    
    /// <summary>
    /// Transmission method: EMAIL, VSAT, INMARSAT, API, MANUAL
    /// </summary>
    [Required]
    [MaxLength(30)]
    public string TransmissionMethod { get; set; } = string.Empty;
    
    /// <summary>
    /// Recipients (comma-separated emails or identifiers)
    /// </summary>
    [MaxLength(1000)]
    public string? Recipients { get; set; }
    
    /// <summary>
    /// Transmission status: SUCCESS, FAILED, PENDING, PARTIAL
    /// </summary>
    [Required]
    [MaxLength(30)]
    public string Status { get; set; } = "PENDING";
    
    /// <summary>
    /// Error message if transmission failed
    /// </summary>
    public string? ErrorMessage { get; set; }
    
    /// <summary>
    /// Number of retry attempts
    /// </summary>
    public int RetryCount { get; set; } = 0;
    
    /// <summary>
    /// Transmission confirmation number (if available)
    /// </summary>
    [MaxLength(100)]
    public string? ConfirmationNumber { get; set; }

    // Stable receipts required before marking the complete report delivered.
    public string? SyncEventIdsJson { get; set; }

    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Report Amendment - Bản sửa đổi báo cáo
/// ISM Code compliant amendment tracking for APPROVED/TRANSMITTED reports
/// Original reports must NEVER be modified after approval
/// </summary>
public class ReportAmendment
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// FK -> MaritimeReport.Id (original report being amended)
    /// </summary>
    [Required]
    public Guid OriginalReportId { get; set; }
    
    /// <summary>
    /// Amendment number (sequential: 1, 2, 3...)
    /// </summary>
    [Required]
    public int AmendmentNumber { get; set; }
    
    /// <summary>
    /// Reason for amendment
    /// </summary>
    [Required]
    public string AmendmentReason { get; set; } = string.Empty;
    
    /// <summary>
    /// Fields being corrected (JSON format)
    /// Example: { "fuelOilConsumed": { "old": 45.5, "new": 47.2 }, "latitude": { "old": 0, "new": 14.5 } }
    /// </summary>
    [Required]
    public string CorrectedFields { get; set; } = string.Empty;
    
    /// <summary>
    /// Full amended report data (JSON)
    /// Complete snapshot of corrected report
    /// </summary>
    public string? AmendedReportData { get; set; }
    
    /// <summary>
    /// Who created the amendment
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string AmendedBy { get; set; } = string.Empty;
    
    /// <summary>
    /// Amendment status: DRAFT, SUBMITTED, APPROVED, REJECTED
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "DRAFT";
    
    /// <summary>
    /// Master signature for approval
    /// </summary>
    [MaxLength(100)]
    public string? MasterSignature { get; set; }
    
    /// <summary>
    /// When Master signed the amendment
    /// </summary>
    public DateTime? SignedAt { get; set; }
    
    /// <summary>
    /// Is this amendment transmitted to shore?
    /// </summary>
    public bool IsTransmitted { get; set; } = false;
    
    /// <summary>
    /// When transmitted
    /// </summary>
    public DateTime? TransmittedAt { get; set; }
    
    /// <summary>
    /// Additional remarks about the amendment
    /// </summary>
    public string? Remarks { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    public DateTime? UpdatedAt { get; set; }
}

/// <summary>
/// Weekly Performance Report - Báo cáo hiệu suất tuần
/// Aggregate of daily Noon Reports for weekly analysis
/// </summary>
public class WeeklyPerformanceReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    [MaxLength(50)]
    public string ReportNumber { get; set; } = string.Empty;
    
    [Required]
    public int WeekNumber { get; set; }
    
    [Required]
    public int Year { get; set; }
    
    [Required]
    public DateTime WeekStartDate { get; set; }
    
    [Required]
    public DateTime WeekEndDate { get; set; }
    
    public Guid? VoyageId { get; set; }
    
    // Performance Metrics
    public double TotalDistance { get; set; }
    public double AverageSpeed { get; set; }
    public double TotalSteamingHours { get; set; }
    public double TotalPortHours { get; set; }
    
    // Fuel Consumption
    public double TotalFuelOilConsumed { get; set; }
    public double TotalDieselOilConsumed { get; set; }
    public double AverageFuelPerDay { get; set; }
    public double FuelEfficiency { get; set; }
    public double FuelOilROB { get; set; }
    public double DieselOilROB { get; set; }
    
    // Maintenance & Operations
    public int TotalMaintenanceTasksCompleted { get; set; }
    public double TotalMaintenanceHours { get; set; }
    public int CriticalIssues { get; set; }
    public int SafetyIncidents { get; set; }
    
    // Cargo & Operations
    public int PortCalls { get; set; }
    public double TotalCargoLoaded { get; set; }
    public double TotalCargoDischarged { get; set; }
    
    // Metadata
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "DRAFT";
    
    [MaxLength(100)]
    public string? PreparedBy { get; set; }
    
    [MaxLength(100)]
    public string? MasterSignature { get; set; }
    
    public DateTime? SignedAt { get; set; }
    public string? Remarks { get; set; }
    public bool IsTransmitted { get; set; } = false;
    public DateTime? TransmittedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}

/// <summary>
/// Monthly Summary Report - Báo cáo tổng hợp tháng
/// Comprehensive monthly operations summary
/// </summary>
public class MonthlySummaryReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    [Required]
    [MaxLength(50)]
    public string ReportNumber { get; set; } = string.Empty;
    
    [Required]
    public int Month { get; set; }
    
    [Required]
    public int Year { get; set; }
    
    [Required]
    public DateTime MonthStartDate { get; set; }
    
    [Required]
    public DateTime MonthEndDate { get; set; }
    
    // Performance Metrics
    public double TotalDistance { get; set; }
    public double AverageSpeed { get; set; }
    public double TotalSteamingDays { get; set; }
    public double TotalPortDays { get; set; }
    public int VoyagesCompleted { get; set; }
    
    // Fuel Consumption
    public double TotalFuelOilConsumed { get; set; }
    public double TotalDieselOilConsumed { get; set; }
    public double? TotalFuelCost { get; set; }
    public double AverageFuelPerDay { get; set; }
    public double FuelEfficiency { get; set; }
    public int TotalBunkerOperations { get; set; }
    public double TotalFuelBunkered { get; set; }
    
    // Maintenance & Safety
    public int TotalMaintenanceCompleted { get; set; }
    public double TotalMaintenanceHours { get; set; }
    public int OverdueMaintenanceTasks { get; set; }
    public int SafetyDrillsConducted { get; set; }
    public int SafetyIncidents { get; set; }
    public int NearMissIncidents { get; set; }
    
    // Port Operations
    public int TotalPortCalls { get; set; }
    
    [MaxLength(1000)]
    public string? PortsVisited { get; set; }
    
    // Cargo Operations
    public double TotalCargoLoaded { get; set; }
    public double TotalCargoDischarged { get; set; }
    public double AverageCargoOnBoard { get; set; }
    
    // Compliance & Reporting
    public int TotalReportsSubmitted { get; set; }
    public int NoonReportsSubmitted { get; set; }
    public int DepartureReportsSubmitted { get; set; }
    public int ArrivalReportsSubmitted { get; set; }
    
    // Metadata
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "DRAFT";
    
    [MaxLength(100)]
    public string? PreparedBy { get; set; }
    
    [MaxLength(100)]
    public string? MasterSignature { get; set; }
    
    public DateTime? SignedAt { get; set; }
    public string? Remarks { get; set; }
    public bool IsTransmitted { get; set; } = false;
    public DateTime? TransmittedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}

// ============================================================
// MAINTENANCE PLANNING SYSTEM (PMS - Planned Maintenance System)
// ============================================================

/// <summary>
/// Equipment Assets - Thiết bị trên tàu cần bảo dưỡng
/// Master catalog of all equipment/machinery on vessel
/// </summary>
public class EquipmentAsset
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// Unique asset code (e.g., ME-01, AE-02, PUMP-01)
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string AssetCode { get; set; } = string.Empty;
    
    /// <summary>
    /// Asset name (e.g., "Main Engine", "Auxiliary Engine #1")
    /// </summary>
    [Required]
    [MaxLength(200)]
    public string AssetName { get; set; } = string.Empty;
    
    /// <summary>
    /// Category: ENGINE, GENERATOR, PUMP, COMPRESSOR, SEPARATOR, BOILER, DECK_MACHINERY, NAVIGATION, SAFETY, ELECTRICAL, HVAC
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string Category { get; set; } = string.Empty;
    
    /// <summary>
    /// Manufacturer
    /// </summary>
    [MaxLength(200)]
    public string? Manufacturer { get; set; }
    
    /// <summary>
    /// Model number
    /// </summary>
    [MaxLength(100)]
    public string? Model { get; set; }
    
    /// <summary>
    /// Serial number
    /// </summary>
    [MaxLength(100)]
    public string? SerialNumber { get; set; }
    
    /// <summary>
    /// Installation date
    /// </summary>
    public DateTime? InstallationDate { get; set; }
    
    /// <summary>
    /// Current running hours (auto-updated from telemetry)
    /// </summary>
    public double? CurrentRunningHours { get; set; }
    
    /// <summary>
    /// Last running hours update timestamp
    /// </summary>
    public DateTime? LastRunningHoursUpdate { get; set; }
    
    /// <summary>
    /// Equipment group ID (for group task assignments)
    /// </summary>
    public Guid? EquipmentGroupId { get; set; }
    
    /// <summary>
    /// Location on vessel (e.g., "Engine Room", "Deck", "Bridge")
    /// </summary>
    [MaxLength(100)]
    public string? Location { get; set; }
    
    /// <summary>
    /// Equipment criticality: CRITICAL, HIGH, NORMAL, LOW
    /// </summary>
    [MaxLength(20)]
    public string Criticality { get; set; } = "NORMAL";
    
    /// <summary>
    /// Equipment status: ACTIVE (in operation), STANDBY (spare/backup), UNDER_MAINTENANCE (being serviced), DECOMMISSIONED (retired), IN_STORAGE (stored)
    /// </summary>
    [MaxLength(50)]
    public string Status { get; set; } = "ACTIVE";
    
    /// <summary>
    /// Default executor role for tasks on this asset (optional)
    /// Examples: "2/E" (Second Engineer), "3/E" (Third Engineer), "E/O" (Electrical Officer), "Bosun"
    /// Used for auto-assignment when schedule doesn't specify AssignedToCrewId or AssignedToRole
    /// </summary>
    [MaxLength(50)]
    public string? DefaultExecutorRole { get; set; }
    
    /// <summary>
    /// Default approver role for tasks on this asset (optional)
    /// Examples: "C/E" (Chief Engineer), "C/O" (Chief Officer)
    /// </summary>
    [MaxLength(50)]
    public string? ApproverRole { get; set; }
    
    /// <summary>
    /// Technical specifications (JSON)
    /// </summary>
    public string? TechnicalSpecs { get; set; }
    
    /// <summary>
    /// Additional notes
    /// </summary>
    public string? Notes { get; set; }
    
    /// <summary>
    /// Parent asset ID for hierarchical tree structure.
    /// Null = root node (top-level system/equipment).
    /// Example hierarchy:
    ///   [L1] Hệ thống Động lực  (parentId = null)
    ///     [L2] Main Engine       (parentId = L1.Id)
    ///       [L3] Cylinder Unit   (parentId = L2.Id)
    ///         [L4] Cylinder Head (parentId = L3.Id)
    /// </summary>
    public Guid? ParentId { get; set; }

    /// <summary>Navigation: parent asset</summary>
    public virtual EquipmentAsset? Parent { get; set; }

    /// <summary>Navigation: child assets (components/parts)</summary>
    public virtual ICollection<EquipmentAsset> Children { get; set; } = new List<EquipmentAsset>();

    public bool IsActive { get; set; } = true;
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Maintenance Schedules - Kế hoạch bảo dưỡng định kỳ
/// Defines when and how equipment should be maintained
/// System will auto-generate MaintenanceTasks from these schedules
/// </summary>
public class MaintenanceSchedule
{
    [MaxLength(50)]
    public string? WorkCode { get; set; }

    public int? IntervalMonths { get; set; }
    public int? IntervalYears { get; set; }

    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// Unique schedule code (e.g., ME-OIL-CHANGE, AE-FILTER-REPLACE)
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string ScheduleCode { get; set; } = string.Empty;
    
    /// <summary>
    /// FK -> EquipmentGroup.Id (group-based schedule)
    /// Nullable: set when schedule targets an entire group
    /// Must have either EquipmentGroupId OR EquipmentAssetId
    /// </summary>
    public Guid? EquipmentGroupId { get; set; }
    
    /// <summary>
    /// FK -> EquipmentAsset.Id (per-equipment schedule)
    /// Nullable: set when schedule targets a single asset
    /// Must have either EquipmentGroupId OR EquipmentAssetId
    /// </summary>
    public Guid? EquipmentAssetId { get; set; }
    
    /// <summary>
    /// Schedule name (e.g., "Main Engine Oil Change")
    /// </summary>
    [Required]
    [MaxLength(200)]
    public string ScheduleName { get; set; } = string.Empty;
    
    /// <summary>
    /// Maintenance category: PERIODIC (recurring, triggered by counter) or AD_HOC (one-time, immediate)
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string MaintenanceCategory { get; set; } = "PERIODIC";
    
    /// <summary>
    /// Interval type: RUNNING_HOURS, CALENDAR, HYBRID
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string IntervalType { get; set; } = "CALENDAR";
    
    /// <summary>
    /// Running hours interval (e.g., 500 hours)
    /// </summary>
    public int? IntervalHours { get; set; }
    
    /// <summary>
    /// Calendar interval in days (e.g., 30 days)
    /// </summary>
    public int? IntervalDays { get; set; }
    
    /// <summary>
    /// Auto-generate task X days before due (default: 7)
    /// </summary>
    public int DaysBeforeDue { get; set; } = 7;
    
    /// <summary>
    /// Last execution date
    /// </summary>
    public DateTime? LastExecutedAt { get; set; }
    
    /// <summary>
    /// Running hours at last execution
    /// </summary>
    public double? LastExecutedRunningHours { get; set; }
    
    /// <summary>
    /// Next due date
    /// </summary>
    public DateTime? NextDueDate { get; set; }
    
    /// <summary>
    /// Running hours at next due
    /// </summary>
    public double? NextDueRunningHours { get; set; }
    
    /// <summary>
    /// Priority: CRITICAL, HIGH, NORMAL, LOW
    /// </summary>
    [MaxLength(20)]
    public string Priority { get; set; } = "NORMAL";
    
    /// <summary>
    /// Estimated duration in hours
    /// </summary>
    public double? EstimatedDurationHours { get; set; }
    
    /// <summary>
    /// Enable auto-task generation?
    /// </summary>
    public bool AutoGenerate { get; set; } = true;
    
    /// <summary>
    /// Assigned crew ID (optional override for auto-generated tasks)
    /// If set, auto-generated tasks will use this crew ID
    /// </summary>
    [MaxLength(50)]
    public string? AssignedToCrewId { get; set; }
    
    /// <summary>
    /// Assigned role (optional, used when AssignedToCrewId is null)
    /// Examples: "2/E", "3/E", "E/O", "Bosun"
    /// </summary>
    [MaxLength(50)]
    public string? AssignedToRole { get; set; }
    
    /// <summary>
    /// Additional instructions
    /// </summary>
    public string? Instructions { get; set; }

    /// <summary>
    /// Whether crew must fill the Risk Assessment form (ĐGRR) before task can be completed
    /// </summary>
    public bool RequireRiskAssessment { get; set; } = false;

    /// <summary>
    /// Whether crew must fill the Inspection Report form (BBKT) before task can be completed
    /// </summary>
    public bool RequireInspectionReport { get; set; } = false;
    
    public bool IsActive { get; set; } = true;
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Task Risk Assessment Form (Biểu mẫu Đánh giá Rủi ro - ĐGRR)
/// </summary>
[Table("task_risk_assessments", Schema = "public")]
public class TaskRiskAssessment
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>FK → MaintenanceTask.TaskId (string code)</summary>
    [Required]
    [MaxLength(100)]
    public string TaskId { get; set; } = string.Empty;

    // ── Section I: Thông tin chung ──
    [MaxLength(200)]
    public string? JobName { get; set; }
    [MaxLength(200)]
    public string? EquipmentName { get; set; }
    [MaxLength(200)]
    public string? Location { get; set; }
    public DateTime? AssessmentDate { get; set; }
    [MaxLength(500)]
    public string? Personnel { get; set; }
    [MaxLength(50)]
    public string? RaNumber { get; set; }  // e.g. "001/RA/PMS"

    // ── Section II: Nhận diện mối nguy ──
    public bool HazardMechanical { get; set; }       // Cơ học
    public bool HazardElectrical { get; set; }       // Điện
    public bool HazardChemical { get; set; }         // Hóa chất
    public bool HazardEnvironmental { get; set; }    // Môi trường (không gian kín, trên cao, nhiệt độ cao)
    public string? HazardNotes { get; set; }

    // ── Section III: Đánh giá rủi ro trước biện pháp ──
    /// <summary>Severity (Hậu quả): LOW / MEDIUM / HIGH / CRITICAL</summary>
    [MaxLength(20)]
    public string? InitialSeverity { get; set; }
    /// <summary>Likelihood (Khả năng xảy ra): LOW / MEDIUM / HIGH</summary>
    [MaxLength(20)]
    public string? InitialLikelihood { get; set; }
    /// <summary>Risk Level = Severity × Likelihood: LOW / MEDIUM / HIGH</summary>
    [MaxLength(20)]
    public string? InitialRiskLevel { get; set; }

    // ── Section IV: Biện pháp kiểm soát ──
    [Column("control_loto")]
    public bool ControlLOTO { get; set; }            // Lockout/Tagout
    [Column("control_ptw")]
    public bool ControlPTW { get; set; }             // Permit to Work
    [Column("control_ppe")]
    public bool ControlPPE { get; set; }             // PPE
    public bool ControlVentilation { get; set; }     // Thông gió, chiếu sáng
    public string? ControlNotes { get; set; }

    // ── Section V: Rủi ro dư thừa ──
    [MaxLength(20)]
    public string? ResidualSeverity { get; set; }
    [MaxLength(20)]
    public string? ResidualLikelihood { get; set; }
    [MaxLength(20)]
    public string? ResidualRiskLevel { get; set; }
    public string? ResidualRiskNotes { get; set; }
    /// <summary>False if residual risk still HIGH → work must stop</summary>
    public bool IsApprovedToProceed { get; set; } = true;

    // ── Section VI: Phê duyệt ──
    [MaxLength(100)]
    public string? WorkerSignature { get; set; }
    [MaxLength(100)]
    public string? SupervisorSignature { get; set; }
    [MaxLength(100)]
    public string? ChiefEngineerApproval { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(50)]
    public string? CreatedBy { get; set; }
}

/// <summary>
/// Task Inspection Report Form (Biên bản Bảo trì - BBKT)
/// </summary>
[Table("task_inspection_reports", Schema = "public")]
public class TaskInspectionReport
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>FK → MaintenanceTask.TaskId (string code)</summary>
    [Required]
    [MaxLength(100)]
    public string TaskId { get; set; } = string.Empty;

    // ── Section I: Thông tin chung ──
    [MaxLength(200)]
    public string? ShipName { get; set; }
    [MaxLength(200)]
    public string? EquipmentName { get; set; }
    [MaxLength(50)]
    public string? EquipmentCode { get; set; }
    /// <summary>DAILY / WEEKLY / MONTHLY / ANNUAL / RUNNING_HOURS</summary>
    [MaxLength(30)]
    public string? MaintenanceType { get; set; }
    public DateTime? MaintenanceDate { get; set; }

    // ── Section II: Nội dung công việc ──
    /// <summary>JSON array: [{seq, description, status: "GOOD"|"BAD"|"REPLACED", notes}]</summary>
    public string? JobItemsJson { get; set; }

    // ── Section III: Kết luận ──
    /// <summary>NORMAL / MONITOR / NEEDS_REPAIR</summary>
    [MaxLength(30)]
    public string? PostMaintenanceStatus { get; set; }
    public string? Recommendations { get; set; }

    // ── Section IV: Xác nhận ──
    [MaxLength(100)]
    public string? OperatorSignature { get; set; }
    [MaxLength(100)]
    public string? ChiefEngineerSignature { get; set; }

    /// <summary>Overall: PASS / FAIL</summary>
    [MaxLength(10)]
    public string? OverallResult { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(50)]
    public string? CreatedBy { get; set; }
}

/// <summary>
/// Schedule Spare Parts - Vật tư cần thiết cho từng lịch bảo dưỡng
/// Links maintenance schedules to required spare parts
/// Used for auto-deduction when task is completed
/// </summary>
public class ScheduleSparePart
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// FK -> MaintenanceSchedule.Id
    /// </summary>
    [Required]
    public Guid ScheduleId { get; set; }
    
    /// <summary>
    /// FK -> MaterialItem.Id
    /// </summary>
    [Required]
    public Guid MaterialItemId { get; set; }
    
    /// <summary>
    /// Quantity required per execution
    /// </summary>
    [Required]
    [Range(0.001, 999999)]
    public double QuantityRequired { get; set; }
    
    /// <summary>
    /// Is this spare part mandatory or optional?
    /// </summary>
    public bool IsMandatory { get; set; } = true;
    
    /// <summary>
    /// Notes about this spare part requirement
    /// </summary>
    [MaxLength(500)]
    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Cờ đồng bộ — bộ chặn SaveChanges chỉ xếp hàng entity có thuộc tính này.</summary>
    public bool IsSynced { get; set; } = false;
}

/// <summary>
/// Material-Equipment Link - Liên kết vật tư với thiết bị
/// M:N bridge between MaterialItem and EquipmentAsset
/// </summary>
public class MaterialItemEquipment
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// FK -> MaterialItem.Id
    [Required]
    public Guid MaterialItemId { get; set; }

    /// FK -> EquipmentAsset.Id
    [Required]
    public Guid EquipmentAssetId { get; set; }

    /// Notes about this link
    [MaxLength(500)]
    public string? Notes { get; set; }

    /// Required quantity for this material on the equipment.
    public double QuantityRequired { get; set; } = 1;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Schedule Checklist Templates - Mẫu checklist cho schedule
/// Defines checkpoint structure that will be replicated for each asset in task
/// </summary>
public class ScheduleChecklistTemplate
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// FK -> MaintenanceSchedule.Id
    /// </summary>
    [Required]
    public Guid ScheduleId { get; set; }
    
    /// <summary>
    /// Display order (1, 2, 3...)
    /// </summary>
    [Required]
    public int SequenceOrder { get; set; }
    
    /// <summary>
    /// Checkpoint description (e.g., "Check oil level", "Measure temperature")
    /// </summary>
    [Required]
    [MaxLength(500)]
    public string CheckpointDescription { get; set; } = string.Empty;
    
    /// <summary>
    /// Does this checkpoint require a reading value?
    /// </summary>
    public bool RequiresReading { get; set; } = false;
    
    /// <summary>
    /// Minimum value for normal range (if applicable)
    /// </summary>
    public double? NormalRangeMin { get; set; }
    
    /// <summary>
    /// Maximum value for normal range (if applicable)
    /// </summary>
    public double? NormalRangeMax { get; set; }
    
    /// <summary>
    /// Unit of measurement (e.g., "°C", "bar", "rpm")
    /// </summary>
    [MaxLength(20)]
    public string? Unit { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    // Navigation property
    [System.Text.Json.Serialization.JsonIgnore]
    /// <summary>Cờ đồng bộ — bộ chặn SaveChanges chỉ xếp hàng entity có thuộc tính này.</summary>
    public bool IsSynced { get; set; } = false;

    public virtual MaintenanceSchedule? Schedule { get; set; }
}

/// <summary>
/// Maintenance History - Lịch sử thực hiện bảo dưỡng
/// Audit trail of all maintenance executions with spare parts used
/// </summary>
public class MaintenanceHistory
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// FK -> MaintenanceSchedule.Id
    /// </summary>
    [Required]
    public Guid ScheduleId { get; set; }
    
    /// <summary>
    /// FK -> MaintenanceTask.Id
    /// </summary>
    [Required]
    public Guid TaskId { get; set; }
    
    /// <summary>
    /// Execution date
    /// </summary>
    [Required]
    public DateTime ExecutedAt { get; set; }
    
    /// <summary>
    /// Running hours at execution
    /// </summary>
    public double? ExecutedRunningHours { get; set; }
    
    /// <summary>
    /// Who completed the task
    /// </summary>
    [MaxLength(100)]
    public string? CompletedBy { get; set; }
    
    /// <summary>
    /// Actual duration in hours
    /// </summary>
    public double? ActualDurationHours { get; set; }
    
    /// <summary>
    /// Spare parts used (JSON array)
    /// Format: [{ "materialItemId": "...", "materialCode": "...", "materialName": "...", "quantity": 2 }]
    /// </summary>
    public string? SparePartsUsed { get; set; }
    
    /// <summary>
    /// Total spare parts cost
    /// </summary>
    public decimal? TotalSparePartsCost { get; set; }
    
    /// <summary>
    /// Execution notes
    /// </summary>
    public string? Notes { get; set; }
    
    /// <summary>
    /// Equipment condition after maintenance: EXCELLENT, GOOD, FAIR, POOR
    /// </summary>
    [MaxLength(20)]
    public string? ConditionAfter { get; set; }
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Equipment Groups - Nhóm thiết bị
/// For group task assignments (e.g., "All Fire Extinguishers", "All Safety Equipment")
/// </summary>
public class EquipmentGroup
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// Unique group code (e.g., FIRE-EXT, LIFE-BOAT, PUMP-ALL)
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string GroupCode { get; set; } = string.Empty;
    
    /// <summary>
    /// Group name (e.g., "All Fire Extinguishers", "All Life Boats")
    /// </summary>
    [Required]
    [MaxLength(200)]
    public string GroupName { get; set; } = string.Empty;
    
    /// <summary>
    /// Category (same as EquipmentAsset.Category)
    /// </summary>
    [MaxLength(50)]
    public string? Category { get; set; }
    
    /// <summary>
    /// Department responsible for this group: ENGINE, DECK, NAVIGATION, MANAGEMENT
    /// Used for department-based task filtering and assignment
    /// </summary>
    [MaxLength(50)]
    public string? Department { get; set; }
    
    /// <summary>
    /// Person In Charge role for this equipment group
    /// Examples: "2/E" (Main Engine group), "3/E" (Generators), "C/O" (Deck), "E/O" (Electrical)
    /// </summary>
    [MaxLength(50)]
    public string? PicRole { get; set; }
    
    /// <summary>
    /// Specific crew ID override for PIC (optional)
    /// If set, this specific crew member is PIC regardless of role
    /// </summary>
    [MaxLength(50)]
    public string? PicCrewId { get; set; }
    
    /// <summary>
    /// Description
    /// </summary>
    public string? Description { get; set; }
    
    public bool IsActive { get; set; } = true;
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
}

/// <summary>
/// Equipment Group Members - Thành viên của nhóm thiết bị
/// Many-to-many relationship between EquipmentGroup and EquipmentAsset
/// </summary>
public class EquipmentGroupMember
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// FK -> EquipmentGroup.Id
    /// </summary>
    [Required]
    public Guid GroupId { get; set; }
    
    /// <summary>
    /// FK -> EquipmentAsset.Id
    /// </summary>
    [Required]
    public Guid AssetId { get; set; }
    
    /// <summary>
    /// Sequence order in group (for checklist display)
    /// </summary>
    public int SequenceOrder { get; set; } = 0;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Cờ đồng bộ — bộ chặn SaveChanges chỉ xếp hàng entity có thuộc tính này.</summary>
    public bool IsSynced { get; set; } = false;

    // Navigation properties
    public virtual EquipmentAsset Asset { get; set; } = null!;
    public virtual EquipmentGroup Group { get; set; } = null!;
}

/// <summary>
/// Voyage Log Entry - Nhật ký Hành trình (SOLAS Chapter V, Reg 28)
/// Ghi nhận các sự kiện hành trình: xuất/nhập cảng, vị trí, hoa tiêu, etc.
/// </summary>
public class VoyageLogEntry
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// Link to VoyageRecord (optional - for grouping entries by voyage)
    /// </summary>
    public Guid? VoyageId { get; set; }

    /// <summary>Phase 6: FK -> VoyagePlanLeg.Id (optional)</summary>
    public Guid? VoyagePlanLegId { get; set; }
    
    // === Event Info ===
    
    /// <summary>
    /// Event Type: DEP, ARR, NOON, COSP, EOSP, PILOT_ON, PILOT_OFF, ANCHOR_DROP, ANCHOR_UP, DRIFT, DEVIATION
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string EventType { get; set; } = string.Empty;
    
    /// <summary>
    /// Event DateTime in UTC
    /// </summary>
    [Required]
    public DateTime EventDateTime { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Event DateTime in Local Time
    /// </summary>
    public DateTime? EventDateTimeLocal { get; set; }
    
    /// <summary>
    /// Time Zone offset, e.g., "UTC+7", "UTC-5"
    /// </summary>
    [MaxLength(10)]
    public string? TimeZone { get; set; }
    
    // === Position ===
    
    /// <summary>
    /// Latitude in decimal degrees (-90 to 90)
    /// </summary>
    public double Latitude { get; set; }
    
    /// <summary>
    /// Longitude in decimal degrees (-180 to 180)
    /// </summary>
    public double Longitude { get; set; }
    
    // === Port Info (for DEP/ARR events) ===
    
    /// <summary>
    /// Port Name, e.g., "Ho Chi Minh City", "Singapore"
    /// </summary>
    [MaxLength(100)]
    public string? PortName { get; set; }
    
    /// <summary>
    /// UN/LOCODE (5 chars), e.g., "VNSGN" (Saigon), "SGSIN" (Singapore)
    /// </summary>
    [MaxLength(10)]
    public string? PortLocode { get; set; }
    
    /// <summary>
    /// Country name
    /// </summary>
    [MaxLength(50)]
    public string? PortCountry { get; set; }
    
    /// <summary>
    /// Berth/Terminal number, e.g., "Berth 5", "Terminal A"
    /// </summary>
    [MaxLength(50)]
    public string? BerthNumber { get; set; }
    
    // === Distance & Navigation ===
    
    /// <summary>
    /// Distance to next port/destination (Nautical Miles)
    /// </summary>
    public double? DistanceToGo { get; set; }
    
    /// <summary>
    /// Distance from last logged position (Nautical Miles)
    /// </summary>
    public double? DistanceFromLast { get; set; }
    
    /// <summary>
    /// Total voyage distance so far (Nautical Miles)
    /// </summary>
    public double? TotalVoyageDistance { get; set; }
    
    /// <summary>
    /// Course Over Ground (degrees, 0-360)
    /// </summary>
    public double? CourseOverGround { get; set; }
    
    /// <summary>
    /// Speed Over Ground (Knots)
    /// </summary>
    public double? SpeedOverGround { get; set; }
    
    // === Pilot Info (for PILOT_ON/PILOT_OFF events) ===
    
    /// <summary>
    /// Pilot's name
    /// </summary>
    [MaxLength(100)]
    public string? PilotName { get; set; }
    
    /// <summary>
    /// Pilot station name, e.g., "Vung Tau Pilot Station"
    /// </summary>
    [MaxLength(100)]
    public string? PilotStation { get; set; }
    
    // === Officer & Signature ===
    
    /// <summary>
    /// Officer on Watch who made this entry
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string OfficerOnWatch { get; set; } = string.Empty;
    
    /// <summary>
    /// Master's signature (base64 or confirmation string)
    /// </summary>
    public string? MasterSignature { get; set; }
    
    /// <summary>
    /// When the Master signed this entry
    /// </summary>
    public DateTime? SignedAt { get; set; }
    
    // === Remarks ===
    
    /// <summary>
    /// Additional notes/remarks
    /// </summary>
    [MaxLength(1000)]
    public string? Remarks { get; set; }
    
    // === System Fields ===
    
    public bool IsSynced { get; set; } = false;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";
    
    // Navigation property
    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }

    [ForeignKey("VoyagePlanLegId")]
    [JsonIgnore]
    public virtual VoyagePlanLeg? VoyagePlanLeg { get; set; }
}

// =============================================
// ABSTRACT LOG — Nhật ký vắn tắt (Voyage Performance Summary)
// =============================================

/// <summary>
/// Abstract Log header — one per voyage (Sheet SUM).
/// Contains admin info, time summary, fuel reconciliation.
/// </summary>
public class AbstractLogVoyage
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>FK → VoyageRecord</summary>
    public Guid VoyageId { get; set; }

    // ── Admin & Vessel ──
    [MaxLength(50)]
    public string VoyageNumber { get; set; } = string.Empty;
    [MaxLength(200)]
    public string ShipName { get; set; } = string.Empty;
    [MaxLength(20)]
    public string? IMONumber { get; set; }
    [MaxLength(200)]
    public string? MasterName { get; set; }
    [MaxLength(200)]
    public string? ChiefEngineerName { get; set; }
    public DateTime? ReportDate { get; set; }
    public DateTime? DateOfLastDocking { get; set; }
    [MaxLength(50)]
    public string? PropellerPitch { get; set; }

    // ── Time Summary ──
    public DateTime? CommencementTime { get; set; }
    public DateTime? CompletionTime { get; set; }
    /// <summary>Grand total in hours</summary>
    public double? GrandTotalHours { get; set; }

    // ── Fuel ROB Reconciliation (Statement of FO, LO & FW) ──
    // FO
    public double? FoRobPrevious { get; set; }
    public double? FoReceived { get; set; }
    public double? FoConsumedTotal { get; set; }
    public double? FoRobCurrent { get; set; }
    // DO
    public double? DoRobPrevious { get; set; }
    public double? DoReceived { get; set; }
    public double? DoConsumedTotal { get; set; }
    public double? DoRobCurrent { get; set; }
    // Cylinder Oil
    public double? CylOilRobPrevious { get; set; }
    public double? CylOilReceived { get; set; }
    public double? CylOilConsumed { get; set; }
    public double? CylOilRobCurrent { get; set; }
    // System Oil
    public double? SysOilRobPrevious { get; set; }
    public double? SysOilReceived { get; set; }
    public double? SysOilConsumed { get; set; }
    public double? SysOilRobCurrent { get; set; }
    // Generator Oil
    public double? GenOilRobPrevious { get; set; }
    public double? GenOilReceived { get; set; }
    public double? GenOilConsumed { get; set; }
    public double? GenOilRobCurrent { get; set; }
    // Fresh Water
    public double? FwRobPrevious { get; set; }
    public double? FwProduced { get; set; }
    public double? FwConsumed { get; set; }
    public double? FwRobCurrent { get; set; }

    // ── Remarks ──
    public string? Remarks { get; set; }

    // ── Signature ──
    [MaxLength(200)]
    public string? MasterSignature { get; set; }
    public DateTime? MasterSignedAt { get; set; }
    [MaxLength(200)]
    public string? ChiefEngineerSignature { get; set; }
    public DateTime? ChiefEngineerSignedAt { get; set; }

    // ── Status ──
    [MaxLength(20)]
    public string Status { get; set; } = "DRAFT"; // DRAFT, FINALIZED

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [ForeignKey("VoyageId")]
    [JsonIgnore]
    public virtual VoyageRecord? Voyage { get; set; }
    public virtual ICollection<AbstractLogLeg> Legs { get; set; } = new List<AbstractLogLeg>();
}

/// <summary>
/// Abstract Log leg — one per direction (Sheet OUT / HOME).
/// Contains departure/arrival info, totals for the leg.
/// </summary>
public class AbstractLogLeg
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid AbstractLogVoyageId { get; set; }

    /// <summary>Leg number (1, 2, 3, …) — sequential within the voyage</summary>
    public int LegNumber { get; set; } = 1;
    public int Sequence { get; set; } = 1;

    /// <summary>Optional leg label, e.g. "Hai Phong → Singapore"</summary>
    [MaxLength(200)]
    public string? LegLabel { get; set; }

    // ── Departure ──
    [MaxLength(200)]
    public string? DeparturePort { get; set; }
    public DateTime? DepartureTime { get; set; }
    public double? DepartureDraftFore { get; set; }
    public double? DepartureDraftAft { get; set; }
    public double? DepartureDraftMean { get; set; }

    // ── Arrival ──
    [MaxLength(200)]
    public string? ArrivalPort { get; set; }
    public DateTime? ArrivalTime { get; set; }
    public double? ArrivalDraftFore { get; set; }
    public double? ArrivalDraftAft { get; set; }
    public double? ArrivalDraftMean { get; set; }

    // ── Hours Totals ──
    public double? HoursPropelling { get; set; }
    public double? HoursUnderWay { get; set; }
    public double? HoursDrifting { get; set; }
    public double? HoursAnchor { get; set; }
    public double? HoursPort { get; set; }

    // ── Distance Totals ──
    public double? DistanceProp { get; set; }
    public double? DistanceLog { get; set; }
    public double? DistanceOG { get; set; }

    // ── Speed Averages ──
    public double? SpeedLog { get; set; }
    public double? SpeedOG { get; set; }

    // ── Cargo ──
    [MaxLength(200)]
    public string? CargoType { get; set; }
    public double? CargoQuantity { get; set; }
    /// <summary>LADEN, BALLAST, PART_LADEN</summary>
    [MaxLength(20)]
    public string? LoadCondition { get; set; }

    // ── Performance ──
    public double? SlipPercent { get; set; }
    public double? ShaftRevolutions { get; set; }

    // ── Leg FOC Totals (by equipment × fuel type) ──
    // M/E
    public double? MeFocHsfo { get; set; }
    public double? MeFocVlsfo { get; set; }
    public double? MeFocLsmgo { get; set; }
    // D/E
    public double? DeFocHsfo { get; set; }
    public double? DeFocVlsfo { get; set; }
    public double? DeFocLsmgo { get; set; }
    // Boiler
    public double? BoilerFocHsfo { get; set; }
    public double? BoilerFocVlsfo { get; set; }
    public double? BoilerFocLsmgo { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [ForeignKey("AbstractLogVoyageId")]
    [JsonIgnore]
    public virtual AbstractLogVoyage? AbstractLogVoyage { get; set; }
    public virtual ICollection<AbstractLogDailyEntry> DailyEntries { get; set; } = new List<AbstractLogDailyEntry>();
}

/// <summary>
/// Abstract Log daily entry — one row per day per leg.
/// Contains noon position, weather, time breakdown, distance, FOC matrix.
/// </summary>
public class AbstractLogDailyEntry
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid AbstractLogLegId { get; set; }
    public int DayNumber { get; set; } = 1;

    // ── Date & Position ──
    public DateTime EntryDate { get; set; }
    public double? NoonLatitude { get; set; }
    public double? NoonLongitude { get; set; }

    // ── Wind ──
    [MaxLength(20)]
    public string? WindDirectionTrue { get; set; }
    [MaxLength(20)]
    public string? WindDirectionRelative { get; set; }
    public int? WindForceBeaufort { get; set; }
    [MaxLength(20)]
    public string? SeaState { get; set; }

    // ── Hours Breakdown ──
    public double? HoursUnderWay { get; set; }
    public double? HoursPropelling { get; set; }
    public double? HoursDrifting { get; set; }
    public double? HoursAnchor { get; set; }
    public double? HoursPort { get; set; }
    /// <summary>Time zone change: positive = advance, negative = retard</summary>
    public double? TimeZoneChange { get; set; }

    // ── Distance ──
    public double? DistanceEngine { get; set; }
    public double? DistanceLog { get; set; }
    public double? DistanceOG { get; set; }

    // ── Speed ──
    public double? SpeedLog { get; set; }
    public double? SpeedOG { get; set; }

    // ── Performance ──
    public double? SlipPercent { get; set; }
    public double? AvgRPM { get; set; }

    // ── FOC During Propelling (H.P) ──
    public double? HpMeHsfo { get; set; }
    public double? HpMeVlsfo { get; set; }
    public double? HpMeLsmgo { get; set; }
    public double? HpDeHsfo { get; set; }
    public double? HpDeVlsfo { get; set; }
    public double? HpDeLsmgo { get; set; }
    public double? HpBoilerHsfo { get; set; }
    public double? HpBoilerVlsfo { get; set; }
    public double? HpBoilerLsmgo { get; set; }

    // ── FOC During Detention/Drifting ──
    public double? DtMeHsfo { get; set; }
    public double? DtMeVlsfo { get; set; }
    public double? DtMeLsmgo { get; set; }
    public double? DtDeHsfo { get; set; }
    public double? DtDeVlsfo { get; set; }
    public double? DtDeLsmgo { get; set; }
    public double? DtBoilerHsfo { get; set; }
    public double? DtBoilerVlsfo { get; set; }
    public double? DtBoilerLsmgo { get; set; }

    // ── FOC In Port ──
    public double? PortMeHsfo { get; set; }
    public double? PortMeVlsfo { get; set; }
    public double? PortMeLsmgo { get; set; }
    public double? PortDeHsfo { get; set; }
    public double? PortDeVlsfo { get; set; }
    public double? PortDeLsmgo { get; set; }
    public double? PortBoilerHsfo { get; set; }
    public double? PortBoilerVlsfo { get; set; }
    public double? PortBoilerLsmgo { get; set; }

    // ── Lub Oil & Fresh Water (daily) ──
    public double? CylOilConsumed { get; set; }
    public double? SysOilConsumed { get; set; }
    public double? FwProduced { get; set; }
    public double? FwConsumed { get; set; }

    // ── Remarks ──
    public string? Remarks { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [ForeignKey("AbstractLogLegId")]
    [JsonIgnore]
    public virtual AbstractLogLeg? AbstractLogLeg { get; set; }
}

// ============================================================
// INVENTORY - STORE LOCATIONS (Danh mục vị trí kho)
// ============================================================

/// <summary>
/// Store Locations - Vị trí kho trên tàu
/// Hierarchical structure: Ship → Store → Sub-store (Areas)
/// </summary>
public class StoreLocation
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Location code (e.g., "KHO-01", "AREA-A1")</summary>
    [Required]
    [MaxLength(50)]
    public string LocationCode { get; set; } = string.Empty;

    /// <summary>Location name</summary>
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    /// <summary>Description</summary>
    [MaxLength(500)]
    public string? Description { get; set; }

    /// <summary>Parent location ID for hierarchy (null = root/top-level store)</summary>
    public Guid? ParentId { get; set; }

    /// <summary>Physical address or deck/compartment info</summary>
    [MaxLength(300)]
    public string? Address { get; set; }

    /// <summary>Manager / person in charge</summary>
    [MaxLength(100)]
    public string? ManagerName { get; set; }

    /// <summary>Contact phone</summary>
    [MaxLength(50)]
    public string? Phone { get; set; }

    /// <summary>Contact email</summary>
    [MaxLength(100)]
    public string? Email { get; set; }

    public bool IsActive { get; set; } = true;
    public bool IsSynced { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    /// <summary>Navigation: parent location</summary>
    public virtual StoreLocation? Parent { get; set; }

    /// <summary>Navigation: child locations</summary>
    public virtual ICollection<StoreLocation> Children { get; set; } = new List<StoreLocation>();
}

// ============================================================
// MATERIAL REQUESTS (Yêu cầu vật tư)
// ============================================================

/// <summary>
/// Material Request header - Phiếu yêu cầu vật tư
/// </summary>
public class MaterialRequest
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(50)]
    public string RequestCode { get; set; } = string.Empty;

    /// <summary>Tàu (vessel name)</summary>
    [MaxLength(150)]
    public string? VesselName { get; set; }

    /// <summary>Voyage liên kết</summary>
    public Guid? VoyageId { get; set; }

    /// <summary>Tên voyage (snapshot)</summary>
    [MaxLength(150)]
    public string? VoyageName { get; set; }

    /// <summary>Urgency: Normal, Urgent, Critical</summary>
    [Required]
    [MaxLength(20)]
    public string Urgency { get; set; } = "Normal";

    /// <summary>Ngày cần vật tư</summary>
    public DateTime NeededDate { get; set; } = DateTime.UtcNow;

    /// <summary>Ngày yêu cầu</summary>
    public DateTime RequestDate { get; set; } = DateTime.UtcNow;

    /// <summary>Người yêu cầu</summary>
    [MaxLength(100)]
    public string? RequestedBy { get; set; }

    public string? Notes { get; set; }

    /// <summary>File đính kèm (JSON array of file names/paths)</summary>
    public string? Attachments { get; set; }

    /// <summary>Status: Draft, Submitted, Approved, Rejected, Completed</summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "Draft";

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    /// <summary>Cờ đồng bộ — bộ chặn SaveChanges chỉ xếp hàng entity có thuộc tính này.</summary>
    public bool IsSynced { get; set; } = false;

    public virtual ICollection<MaterialRequestItem> Items { get; set; } = new List<MaterialRequestItem>();
}

/// <summary>
/// Material Request line item - Chi tiết yêu cầu vật tư
/// </summary>
public class MaterialRequestItem
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int RequestId { get; set; }

    /// <summary>Thiết bị liên quan (optional)</summary>
    public Guid? EquipmentAssetId { get; set; }

    /// <summary>Vật tư yêu cầu (optional - có thể nhập tay)</summary>
    public Guid? MaterialItemId { get; set; }

    [Required]
    [MaxLength(200)]
    public string ItemName { get; set; } = string.Empty;

    public string? Description { get; set; }

    [MaxLength(20)]
    public string Unit { get; set; } = "PCS";

    /// <summary>Số lượng tồn kho tại thời điểm yêu cầu (snapshot)</summary>
    public decimal QuantityOnHand { get; set; } = 0;

    /// <summary>Số lượng yêu cầu</summary>
    [Required]
    public decimal QuantityRequested { get; set; }

    public string? Note { get; set; }

    // Navigation
    /// <summary>Cờ đồng bộ — bộ chặn SaveChanges chỉ xếp hàng entity có thuộc tính này.</summary>
    public bool IsSynced { get; set; } = false;

    public virtual MaterialRequest Request { get; set; } = null!;
}

// ============================================================
// STOCK RECEIPTS (Phiếu nhập kho)
// ============================================================

/// <summary>
/// Stock Receipt header - Phiếu nhập kho
/// </summary>
public class StockReceipt
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(50)]
    public string ReceiptCode { get; set; } = string.Empty;

    /// <summary>Tàu (vessel name)</summary>
    [MaxLength(150)]
    public string? VesselName { get; set; }

    /// <summary>Voyage liên kết</summary>
    public Guid? VoyageId { get; set; }

    /// <summary>Tên voyage (snapshot)</summary>
    [MaxLength(150)]
    public string? VoyageName { get; set; }

    [MaxLength(50)]
    public string? SupplierCode { get; set; }

    [MaxLength(200)]
    public string? SupplierName { get; set; }

    /// <summary>Ngày nhận hàng</summary>
    public DateTime ReceivedDate { get; set; } = DateTime.UtcNow;

    /// <summary>Ngày nhập kho</summary>
    public DateTime ReceiptDate { get; set; } = DateTime.UtcNow;

    [MaxLength(100)]
    public string? CreatedBy { get; set; }

    public string? Notes { get; set; }

    /// <summary>File đính kèm (JSON array of file names/paths)</summary>
    public string? Attachments { get; set; }

    /// <summary>Liên kết yêu cầu vật tư gốc (optional)</summary>
    public int? MaterialRequestId { get; set; }

    /// <summary>Status: Draft, Approved, Completed</summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "Draft";

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    // Navigation
    public virtual MaterialRequest? MaterialRequest { get; set; }
    /// <summary>Cờ đồng bộ — bộ chặn SaveChanges chỉ xếp hàng entity có thuộc tính này.</summary>
    public bool IsSynced { get; set; } = false;

    public virtual ICollection<StockReceiptItem> Items { get; set; } = new List<StockReceiptItem>();
}

/// <summary>
/// Stock Receipt line item - Chi tiết phiếu nhập kho
/// </summary>
public class StockReceiptItem
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int ReceiptId { get; set; }

    /// <summary>Vị trí kho nhập vào</summary>
    public Guid? StoreLocationId { get; set; }

    /// <summary>Vật tư</summary>
    public Guid? MaterialItemId { get; set; }

    [MaxLength(50)]
    public string? ItemCode { get; set; }

    [Required]
    [MaxLength(200)]
    public string ItemName { get; set; } = string.Empty;

    public string? Description { get; set; }

    [MaxLength(20)]
    public string Unit { get; set; } = "PCS";

    /// <summary>Số lượng yêu cầu nhập</summary>
    public decimal QuantityRequested { get; set; } = 0;

    /// <summary>Số lượng thực nhập</summary>
    [Required]
    public decimal QuantityReceived { get; set; }

    /// <summary>Đơn giá</summary>
    public decimal? UnitCost { get; set; }

    [MaxLength(3)]
    public string? Currency { get; set; } = "USD";

    public string? Note { get; set; }

    // Navigation
    /// <summary>Cờ đồng bộ — bộ chặn SaveChanges chỉ xếp hàng entity có thuộc tính này.</summary>
    public bool IsSynced { get; set; } = false;

    public virtual StockReceipt Receipt { get; set; } = null!;
}

// ============================================================
// INVENTORY STOCK (Tồn kho - M:N bridge MaterialItem ↔ StoreLocation)
// ============================================================

/// <summary>
/// Inventory Stock - Tồn kho theo vị trí
/// Tracks quantity & value of each material at each store location
/// </summary>
public class InventoryStock
{
    [Key]
    public int Id { get; set; }

    [Required]
    public Guid MaterialItemId { get; set; }

    [Required]
    public Guid StoreLocationId { get; set; }

    /// <summary>Số lượng tồn</summary>
    public decimal Quantity { get; set; } = 0;

    /// <summary>Đơn giá USD</summary>
    public decimal UnitCost { get; set; } = 0;

    public DateTime? LastReceiptDate { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(50)]
    public string OriginNode { get; set; } = "SHIP_01";

    /// <summary>Cờ đồng bộ — bộ chặn SaveChanges chỉ xếp hàng entity có thuộc tính này.</summary>
    public bool IsSynced { get; set; } = false;
}
