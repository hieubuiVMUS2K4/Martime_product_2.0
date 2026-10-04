using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Maritime.Shared.Interfaces;

namespace ProductApi.Models
{
    /// <summary>
    /// Vessel - Extended model with full Ship Data fields for hybrid sync.
    /// Supports Edge → Shore sync for technical data and Shore → Edge for commercial data.
    /// </summary>
    public class Vessel
    {
        public Guid Id { get; set; }

        // ═══════════════════════════════════════════════════════════════
        // BASIC DATA - Primary fields (Edge Master)
        // ═══════════════════════════════════════════════════════════════

        [MaxLength(20)]
        public string IMO { get; set; } = string.Empty;

        [MaxLength(200)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(20)]
        public string CallSign { get; set; } = string.Empty;

        [MaxLength(200)]
        public string VesselType { get; set; } = string.Empty;

        public double GrossTonnage { get; set; }
        public double DeadWeight { get; set; }
        public DateTime BuildDate { get; set; }

        [MaxLength(100)]
        public string Flag { get; set; } = string.Empty;

        public bool IsActive { get; set; } = true;

        // ═══════════════════════════════════════════════════════════════
        // EXTENDED BASIC DATA - From Edge ShipData (Edge Master)
        // ═══════════════════════════════════════════════════════════════

        [MaxLength(50)]
        public string? OfficialNumber { get; set; }

        [MaxLength(200)]
        public string? PortOfRegistry { get; set; }

        [MaxLength(200)]
        public string? PreviousName { get; set; }

        [MaxLength(100)]
        public string? PreviousFlag { get; set; }

        [MaxLength(20)]
        public string? MmsiNumber { get; set; }

        [MaxLength(200)]
        public string? ClassNotation { get; set; }

        [MaxLength(50)]
        public string? ClassRegisterNumber { get; set; }

        [MaxLength(100)]
        public string? ShipyardCountry { get; set; }

        [MaxLength(200)]
        public string? ShipyardName { get; set; }

        [MaxLength(50)]
        public string? YardNo { get; set; }

        [MaxLength(50)]
        public string? CompanyImoNumber { get; set; }

        [MaxLength(50)]
        public string? SuezCanalIdNumber { get; set; }

        public DateTime? KeelLaidDate { get; set; }
        public int? YearBuilt { get; set; }
        public DateTime? DateOfRegistry { get; set; }

        [MaxLength(50)]
        public string? OwnerImoNumber { get; set; }

        [MaxLength(50)]
        public string? PanamaCanalIdNumber { get; set; }

        public int? MaxPersonsAllowedOB { get; set; }
        public double? ServiceSpeedKts { get; set; }

        /// <summary>Công suất máy chính tại tốc độ khai thác (kW) — dùng cho mô hình tiêu thụ nhiên liệu.</summary>
        public double? MainEnginePowerKw { get; set; }

        /// <summary>Sức chứa nhiên liệu tối đa (tấn).</summary>
        public double? FuelCapacityTons { get; set; }

        /// <summary>Tiêu thụ nhiên liệu tham chiếu (tấn/ngày) tại tốc độ khai thác.</summary>
        public double? FuelConsumptionTonsPerDay { get; set; }

        /// <summary>Tầm hoạt động trên một lượng nhiên liệu đầy (NM).</summary>
        public double? CruisingRangeNm { get; set; }

        [MaxLength(50)]
        public string? VrpNumber { get; set; }

        [MaxLength(50)]
        public string? VrpType { get; set; }

        public int? NoOfCrewSafeManning { get; set; }
        public int? MaxPassengersAllowedOB { get; set; }

        // ═══════════════════════════════════════════════════════════════
        // DIMENSIONS - Technical data (Edge Master)
        // ═══════════════════════════════════════════════════════════════

        public double? Loa { get; set; }
        public double? Lbp { get; set; }
        public double? BreadthMoulded { get; set; }
        public double? DepthMoulded { get; set; }
        public double? DraftMoulded { get; set; }
        public double? DraftScantling { get; set; }
        public double? DraftFullBallast { get; set; }
        public double? HMaxAirdraft { get; set; }
        public double? AirdraftReductionMastFouled { get; set; }
        public double? DDistance { get; set; }
        public double? BridgeToAft { get; set; }
        public double? BridgeToBow { get; set; }
        public double? BowToBulbousBow { get; set; }
        public double? ParallelBodyBallast { get; set; }
        public double? ParallelBodyLoaded { get; set; }
        public double? LightShip { get; set; }
        public bool BlockCoefficientNA { get; set; } = false;
        public double? BlockCoefficient { get; set; }
        public double? TpcAtSummerDraft { get; set; }
        public double? FreshWaterAllowanceFwa { get; set; }

        // Gross/Nett Tonnage variations
        public double? GrossTonnageInternational { get; set; }
        public double? GrossTonnageSuezCanal { get; set; }
        public double? GrossTonnagePanamaCanal { get; set; }
        public double? NettTonnageInternational { get; set; }
        public double? NettTonnageSuezCanal { get; set; }
        public double? NettTonnagePanamaCanal { get; set; }

        // For Tankers
        public double? ManifoldToWaterlineBallast { get; set; }
        public double? ManifoldToWaterlineLoaded { get; set; }
        public double? DeckToManifold { get; set; }
        public double? SternToManifold { get; set; }
        public double? ShipsideToManifold { get; set; }
        public double? BowToManifold { get; set; }
        public double? ManifoldToKeel { get; set; }
        public double? ManifoldToBridge { get; set; }
        public double? MaxLoadingRateShip { get; set; }
        public int? NumberOfLines { get; set; }
        public double? MaxAllowablePressurePsi { get; set; }

        [MaxLength(200)]
        public string? VentingSystemShip { get; set; }

        // ═══════════════════════════════════════════════════════════════
        // MACHINERY - Technical data (Edge Master)
        // ═══════════════════════════════════════════════════════════════

        // Anchor Chain
        public int? AnchorChainPort { get; set; }
        public int? AnchorChainStarboard { get; set; }
        public int? AnchorChainStern { get; set; }
        public bool AnchorChainSternNA { get; set; } = false;

        // N/A toggles
        public bool BowthrusterNA { get; set; } = false;
        public bool SternthrusterNA { get; set; } = false;
        public bool ShaftGeneratorNA { get; set; } = false;

        // Harbour/Emergency Generator
        [MaxLength(200)]
        public string? HarbourGeneratorMaker { get; set; }
        public double? HarbourGeneratorMaxPowerKW { get; set; }

        // Azimuth Engine
        public int? AzimuthEngFwdCount { get; set; }
        public double? AzimuthEngFwdMaxPowerKW { get; set; }
        public int? AzimuthEngAftCount { get; set; }
        public double? AzimuthEngAftMaxPowerKW { get; set; }

        // ═══════════════════════════════════════════════════════════════
        // SHIPOWNER - Commercial data (Shore Master)
        // ═══════════════════════════════════════════════════════════════

        [MaxLength(300)] public string? ShipownerName { get; set; }
        [MaxLength(300)] public string? ShipownerStreet { get; set; }
        [MaxLength(100)] public string? ShipownerCountry { get; set; }
        [MaxLength(20)] public string? ShipownerZip { get; set; }
        [MaxLength(100)] public string? ShipownerCity { get; set; }
        [MaxLength(50)] public string? ShipownerPhone { get; set; }
        [MaxLength(50)] public string? ShipownerFax { get; set; }
        [MaxLength(50)] public string? ShipownerTlx { get; set; }
        [MaxLength(200)] public string? ShipownerEmail { get; set; }
        [MaxLength(200)] public string? ShipownerContactPerson { get; set; }

        [MaxLength(300)] public string? ManagingOwnerName { get; set; }
        [MaxLength(300)] public string? ManagingOwnerStreet { get; set; }
        [MaxLength(100)] public string? ManagingOwnerCountry { get; set; }
        [MaxLength(20)] public string? ManagingOwnerZip { get; set; }
        [MaxLength(100)] public string? ManagingOwnerCity { get; set; }
        [MaxLength(50)] public string? ManagingOwnerPhone { get; set; }
        [MaxLength(50)] public string? ManagingOwnerFax { get; set; }
        [MaxLength(50)] public string? ManagingOwnerTlx { get; set; }
        [MaxLength(200)] public string? ManagingOwnerEmail { get; set; }
        [MaxLength(200)] public string? ManagingOwnerContactPerson { get; set; }

        [MaxLength(300)] public string? OperatorName { get; set; }
        [MaxLength(300)] public string? OperatorStreet { get; set; }
        [MaxLength(100)] public string? OperatorCountry { get; set; }
        [MaxLength(20)] public string? OperatorZip { get; set; }
        [MaxLength(100)] public string? OperatorCity { get; set; }
        [MaxLength(50)] public string? OperatorPhone { get; set; }
        [MaxLength(50)] public string? OperatorFax { get; set; }
        [MaxLength(50)] public string? OperatorTlx { get; set; }
        [MaxLength(200)] public string? OperatorEmail { get; set; }
        [MaxLength(200)] public string? OperatorContactPerson { get; set; }

        // CSO, DPA, QI contacts
        [MaxLength(20)] public string? CsoTitle { get; set; }
        [MaxLength(100)] public string? CsoFirstName { get; set; }
        [MaxLength(100)] public string? CsoLastName { get; set; }
        [MaxLength(300)] public string? CsoStreet { get; set; }
        [MaxLength(100)] public string? CsoCountry { get; set; }
        [MaxLength(20)] public string? CsoZip { get; set; }
        [MaxLength(100)] public string? CsoCity { get; set; }
        [MaxLength(50)] public string? CsoPhone24h { get; set; }
        [MaxLength(50)] public string? CsoFax { get; set; }
        [MaxLength(50)] public string? CsoTlx { get; set; }
        [MaxLength(200)] public string? CsoEmail { get; set; }

        [MaxLength(20)] public string? DpaTitle { get; set; }
        [MaxLength(100)] public string? DpaFirstName { get; set; }
        [MaxLength(100)] public string? DpaLastName { get; set; }
        [MaxLength(300)] public string? DpaStreet { get; set; }
        [MaxLength(100)] public string? DpaCountry { get; set; }
        [MaxLength(20)] public string? DpaZip { get; set; }
        [MaxLength(100)] public string? DpaCity { get; set; }
        [MaxLength(50)] public string? DpaPhone24h { get; set; }
        [MaxLength(50)] public string? DpaFax { get; set; }
        [MaxLength(50)] public string? DpaTlx { get; set; }
        [MaxLength(200)] public string? DpaEmail { get; set; }

        [MaxLength(20)] public string? QiUsaTitle { get; set; }
        [MaxLength(100)] public string? QiUsaFirstName { get; set; }
        [MaxLength(100)] public string? QiUsaLastName { get; set; }
        [MaxLength(300)] public string? QiUsaStreet { get; set; }
        [MaxLength(100)] public string? QiUsaCountry { get; set; }
        [MaxLength(20)] public string? QiUsaZip { get; set; }
        [MaxLength(100)] public string? QiUsaCity { get; set; }
        [MaxLength(50)] public string? QiUsaPhone24h { get; set; }
        [MaxLength(50)] public string? QiUsaFax { get; set; }
        [MaxLength(50)] public string? QiUsaTlx { get; set; }
        [MaxLength(200)] public string? QiUsaEmail { get; set; }

        [MaxLength(20)] public string? QiPanamaTitle { get; set; }
        [MaxLength(100)] public string? QiPanamaFirstName { get; set; }
        [MaxLength(100)] public string? QiPanamaLastName { get; set; }
        [MaxLength(300)] public string? QiPanamaStreet { get; set; }
        [MaxLength(100)] public string? QiPanamaCountry { get; set; }
        [MaxLength(20)] public string? QiPanamaZip { get; set; }
        [MaxLength(100)] public string? QiPanamaCity { get; set; }
        [MaxLength(50)] public string? QiPanamaPhone24h { get; set; }
        [MaxLength(50)] public string? QiPanamaFax { get; set; }
        [MaxLength(50)] public string? QiPanamaTlx { get; set; }
        [MaxLength(200)] public string? QiPanamaEmail { get; set; }

        // ═══════════════════════════════════════════════════════════════
        // CHARTERER - Commercial data (Shore Master)
        // ═══════════════════════════════════════════════════════════════

        [MaxLength(300)] public string? ChartererName { get; set; }
        [MaxLength(300)] public string? ChartererStreet { get; set; }
        [MaxLength(100)] public string? ChartererCountry { get; set; }
        [MaxLength(20)] public string? ChartererZip { get; set; }
        [MaxLength(100)] public string? ChartererCity { get; set; }
        [MaxLength(50)] public string? ChartererPhone { get; set; }
        [MaxLength(50)] public string? ChartererFax { get; set; }
        [MaxLength(50)] public string? ChartererTlx { get; set; }
        [MaxLength(200)] public string? ChartererEmail { get; set; }
        [MaxLength(200)] public string? ChartererContactPerson { get; set; }

        [MaxLength(300)] public string? BareboatChartererName { get; set; }
        [MaxLength(300)] public string? BareboatChartererStreet { get; set; }
        [MaxLength(100)] public string? BareboatChartererCountry { get; set; }
        [MaxLength(20)] public string? BareboatChartererZip { get; set; }
        [MaxLength(100)] public string? BareboatChartererCity { get; set; }
        [MaxLength(50)] public string? BareboatChartererPhone { get; set; }
        [MaxLength(50)] public string? BareboatChartererFax { get; set; }
        [MaxLength(50)] public string? BareboatChartererTlx { get; set; }
        [MaxLength(200)] public string? BareboatChartererEmail { get; set; }
        [MaxLength(200)] public string? BareboatChartererContactPerson { get; set; }

        // ═══════════════════════════════════════════════════════════════
        // CLASS / FLAG STATE - Technical data (Edge Master)
        // ═══════════════════════════════════════════════════════════════

        [MaxLength(300)] public string? ClassSocietyName { get; set; }
        [MaxLength(300)] public string? ClassSocietyStreet { get; set; }
        [MaxLength(100)] public string? ClassSocietyCountry { get; set; }
        [MaxLength(20)] public string? ClassSocietyZip { get; set; }
        [MaxLength(100)] public string? ClassSocietyCity { get; set; }
        [MaxLength(50)] public string? ClassSocietyPhone { get; set; }
        [MaxLength(50)] public string? ClassSocietyFax { get; set; }
        [MaxLength(50)] public string? ClassSocietyTlx { get; set; }
        [MaxLength(200)] public string? ClassSocietyEmail { get; set; }
        [MaxLength(200)] public string? ClassSocietyContactPerson { get; set; }

        [MaxLength(300)] public string? FlagStateName { get; set; }
        [MaxLength(300)] public string? FlagStateStreet { get; set; }
        [MaxLength(100)] public string? FlagStateCountry { get; set; }
        [MaxLength(20)] public string? FlagStateZip { get; set; }
        [MaxLength(100)] public string? FlagStateCity { get; set; }
        [MaxLength(50)] public string? FlagStatePhone { get; set; }
        [MaxLength(50)] public string? FlagStateFax { get; set; }
        [MaxLength(50)] public string? FlagStateTlx { get; set; }
        [MaxLength(200)] public string? FlagStateEmail { get; set; }
        [MaxLength(200)] public string? FlagStateContactPerson { get; set; }

        // ═══════════════════════════════════════════════════════════════
        // INSURANCE - Commercial data (Shore Master)
        // ═══════════════════════════════════════════════════════════════

        [MaxLength(300)] public string? PiClubName { get; set; }
        [MaxLength(300)] public string? PiClubStreet { get; set; }
        [MaxLength(100)] public string? PiClubCountry { get; set; }
        [MaxLength(20)] public string? PiClubZip { get; set; }
        [MaxLength(100)] public string? PiClubCity { get; set; }
        [MaxLength(50)] public string? PiClubPhone { get; set; }
        [MaxLength(50)] public string? PiClubFax { get; set; }
        [MaxLength(50)] public string? PiClubTlx { get; set; }
        [MaxLength(200)] public string? PiClubEmail { get; set; }
        [MaxLength(200)] public string? PiClubContactPerson { get; set; }

        [MaxLength(300)] public string? HmClubName { get; set; }
        [MaxLength(300)] public string? HmClubStreet { get; set; }
        [MaxLength(100)] public string? HmClubCountry { get; set; }
        [MaxLength(20)] public string? HmClubZip { get; set; }
        [MaxLength(100)] public string? HmClubCity { get; set; }
        [MaxLength(50)] public string? HmClubPhone { get; set; }
        [MaxLength(50)] public string? HmClubFax { get; set; }
        [MaxLength(50)] public string? HmClubTlx { get; set; }
        [MaxLength(200)] public string? HmClubEmail { get; set; }
        [MaxLength(200)] public string? HmClubContactPerson { get; set; }

        // ═══════════════════════════════════════════════════════════════
        // RADIO COMMUNICATION - Technical data (Edge Master)
        // ═══════════════════════════════════════════════════════════════

        [MaxLength(50)] public string? InmarsatTelex1 { get; set; }
        [MaxLength(50)] public string? InmarsatTelex2 { get; set; }
        [MaxLength(50)] public string? InmarsatPhone1 { get; set; }
        [MaxLength(50)] public string? InmarsatPhone2 { get; set; }
        [MaxLength(50)] public string? InmarsatFax1 { get; set; }
        [MaxLength(50)] public string? InmarsatFax2 { get; set; }
        [MaxLength(200)] public string? EmailAddress1 { get; set; }
        [MaxLength(200)] public string? EmailAddress2 { get; set; }
        [MaxLength(50)] public string? GsmPhone { get; set; }

        public bool SeaAreaA1 { get; set; } = false;
        public bool SeaAreaA2 { get; set; } = false;
        public bool SeaAreaA3 { get; set; } = false;
        public bool SeaAreaA4 { get; set; } = false;

        public bool DscHF { get; set; } = false;
        public bool DscMF { get; set; } = false;
        public bool DscVHF { get; set; } = false;
        public bool RadiotelephoneHF { get; set; } = false;
        public bool RadiotelephoneMF { get; set; } = false;
        public bool RadiotelephoneVHF { get; set; } = false;
        public bool RadiotelegraphHF { get; set; } = false;
        public bool RadiotelegraphMF { get; set; } = false;
        public bool RadiotelegraphVHF { get; set; } = false;
        public bool Navtex { get; set; } = false;
        public bool Ais { get; set; } = false;
        public bool SartTransponder { get; set; } = false;
        public bool Radiotelex { get; set; } = false;

        [MaxLength(500)] public string? OtherRadioEquipment { get; set; }

        [MaxLength(50)] public string? EpirbNumber { get; set; }
        [MaxLength(50)] public string? EpirbOperatingSystem { get; set; }
        [MaxLength(100)] public string? EpirbMaker { get; set; }
        [MaxLength(100)] public string? EpirbModel { get; set; }
        [MaxLength(50)] public string? EpirbFrequency { get; set; }

        // ═══════════════════════════════════════════════════════════════
        // TANKS & CARGO - Technical data (Edge Master)
        // ═══════════════════════════════════════════════════════════════

        public double? HfoCbm { get; set; }
        public double? MdoCbm { get; set; }
        public double? LubOilCbm { get; set; }
        public double? SludgeCbm { get; set; }
        public double? BilgeWaterCbm { get; set; }
        public double? SewageCbm { get; set; }
        public double? FreshWaterCbm { get; set; }
        public double? BallastWaterCbm { get; set; }
        public int? NoOfBallastTanks { get; set; }

        public int? TeuTotal { get; set; }
        public int? TeuOnDeck { get; set; }
        public int? TeuUnderDeck { get; set; }
        public double? GrainCbm { get; set; }
        public double? BalesCbm { get; set; }
        public int? NoOfCargoHolds { get; set; }
        public int? NoOfHatches { get; set; }

        // ═══════════════════════════════════════════════════════════════
        // HYBRID SYNC METADATA
        // ═══════════════════════════════════════════════════════════════

        /// <summary>Last time Edge synced technical data to Shore</summary>
        public DateTime? LastEdgeSyncAt { get; set; }

        /// <summary>Last time Shore updated commercial data (needs sync back to Edge)</summary>
        public DateTime? LastShoreSyncAt { get; set; }

        /// <summary>Tracks which fields were last updated by Shore vs Edge (JSON format)</summary>
        public string? FieldOwnership { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // ═══════════════════════════════════════════════════════════════
        // NAVIGATION PROPERTIES
        // ═══════════════════════════════════════════════════════════════

        public List<VesselPosition> Positions { get; set; } = new();
        public List<FuelConsumption> FuelRecords { get; set; } = new();
        public List<PortCall> PortCalls { get; set; } = new();
        public List<VesselAlert> Alerts { get; set; } = new();
    }

    public class VesselPosition
    {
        public Guid Id { get; set; }
        public Guid VesselId { get; set; }
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public double? Speed { get; set; } // Knots
        public double? Course { get; set; } // Degrees
        public DateTime Timestamp { get; set; }
        public string Source { get; set; } = "GPS"; // "GPS", "AIS", "Manual"
        
        public Vessel Vessel { get; set; } = null!;
    }

    public class FuelConsumption
    {
        public Guid Id { get; set; }
        public Guid VesselId { get; set; }
        public DateTime ReportDate { get; set; }
        public double FuelConsumed { get; set; } // MT (Metric Tons)
        public string FuelType { get; set; } = "MGO"; // "MGO", "HFO", "LNG"
        public double DistanceTraveled { get; set; } // Nautical miles
        public double AverageSpeed { get; set; } // Knots
        public double FuelEfficiency { get; set; } // MT per nautical mile
        
        public Vessel Vessel { get; set; } = null!;
    }

    public class Port : ISyncableEntity
    {
        public int Id { get; set; }

        [Required]
        [MaxLength(5)]
        public string PortCode { get; set; } = string.Empty;

        [Required]
        [MaxLength(150)]
        public string PortName { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? Country { get; set; }

        [MaxLength(2)]
        public string? CountryCode { get; set; }

        public double? Latitude { get; set; }
        public double? Longitude { get; set; }

        [MaxLength(50)]
        public string? TimeZone { get; set; }

        public bool IsActive { get; set; } = true;
        public bool IsSynced { get; set; }
        public long SyncVersion { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string OriginNode { get; set; } = "SHIP_01";
    }

    public class PortCall : ISyncableEntity
    {
        public Guid Id { get; set; }
        public Guid? VesselId { get; set; }
        public Guid? VoyageId { get; set; }
        public int? PortId { get; set; }
        public Guid? VoyagePlanLegId { get; set; }
        public string PortCode { get; set; } = string.Empty; // UN/LOCODE
        public string PortName { get; set; } = string.Empty;
        public string? Country { get; set; }
        public string CallType { get; set; } = "ARRIVAL";
        public int Sequence { get; set; }
        public DateTime? ArrivalTime { get; set; }
        public DateTime? DepartureTime { get; set; }
        public string? BerthNumber { get; set; }
        public DateTime? PilotOnBoard { get; set; }
        public DateTime? PilotOffBoard { get; set; }
        public double? DraftFore { get; set; }
        public double? DraftAft { get; set; }
        public bool CargoOpsCompleted { get; set; }
        public string? Remarks { get; set; }
        public decimal PortFees { get; set; }
        public decimal? CargoQuantity { get; set; }
        public string CargoType { get; set; } = string.Empty;
        public string Purpose { get; set; } = string.Empty; // "Loading", "Discharge", "Bunker"
        public bool IsSynced { get; set; }
        public long SyncVersion { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string OriginNode { get; set; } = "SHIP_01";
        
        [ForeignKey(nameof(VesselId))]
        public Vessel? Vessel { get; set; }

        [ForeignKey(nameof(VoyageId))]
        public VoyageRecord? Voyage { get; set; }

        [ForeignKey(nameof(PortId))]
        public Port? Port { get; set; }

        [ForeignKey(nameof(VoyagePlanLegId))]
        public VoyagePlanLeg? VoyagePlanLeg { get; set; }
    }

    public class VesselAlert
    {
        public Guid Id { get; set; }
        public Guid VesselId { get; set; }
        public string AlertType { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string Severity { get; set; } = "INFO";
        public DateTime Timestamp { get; set; }
        public bool IsAcknowledged { get; set; } = false;
        public DateTime? AcknowledgedAt { get; set; }
        public string? AcknowledgedBy { get; set; }
        public string Data { get; set; } = "{}"; // JSON data
        
        public Vessel Vessel { get; set; } = null!;
    }

    /// <summary>
    /// Vessel Certificate - SOLAS/ISM/MARPOL vessel-level certificates.
    /// Renamed from Certificate to avoid conflict with shared crew Certificate.
    /// </summary>
    public class VesselCertificate
    {
        public Guid Id { get; set; }
        public Guid VesselId { get; set; }
        public string CertificateType { get; set; } = string.Empty; // "SAFETY", "SECURITY", "POLLUTION"
        public string CertificateName { get; set; } = string.Empty;
        public string IssuingAuthority { get; set; } = string.Empty;
        public DateTime IssueDate { get; set; }
        public DateTime ExpiryDate { get; set; }
        public string CertificateNumber { get; set; } = string.Empty;
        public bool IsValid { get; set; } = true;
        public string? DocumentPath { get; set; }
        
        public Vessel Vessel { get; set; } = null!;
    }
}
