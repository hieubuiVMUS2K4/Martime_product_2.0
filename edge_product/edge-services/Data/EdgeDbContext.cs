using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Models;
using MaritimeEdge.Models.Inventory;
using Maritime.Shared.Models.Sync;

namespace MaritimeEdge.Data;

/// <summary>
/// PostgreSQL Database Context for Maritime Edge Server
/// Stores all sensor data, telemetry, and sync queue for offline operation
/// Uses EF Core Code-First Migrations
/// </summary>
public class EdgeDbContext : DbContext
{
    public EdgeDbContext(DbContextOptions<EdgeDbContext> options) : base(options)
    {
    }

    // NMEA & Position Data
    public DbSet<NmeaRawData> NmeaRawData { get; set; } = null!;
    public DbSet<PositionData> PositionData { get; set; } = null!;
    public DbSet<AisData> AisData { get; set; } = null!;
    public DbSet<NavigationData> NavigationData { get; set; } = null!;

    // Engine & Machinery
    public DbSet<EngineData> EngineData { get; set; } = null!;
    public DbSet<GeneratorData> GeneratorData { get; set; } = null!;
    public DbSet<TankLevel> TankLevels { get; set; } = null!;

    // Fuel & Environmental
    public DbSet<FuelConsumption> FuelConsumption { get; set; } = null!;
    public DbSet<EnvironmentalData> EnvironmentalData { get; set; } = null!;

    // Safety & Voyages
    public DbSet<SafetyAlarm> SafetyAlarms { get; set; } = null!;
    public DbSet<EngineEvent> EngineEvents { get; set; } = null!;
    public DbSet<VoyageRecord> VoyageRecords { get; set; } = null!;
    public DbSet<VoyagePlanLeg> VoyagePlanLegs { get; set; } = null!;
    public DbSet<VoyageStatusHistory> VoyageStatusHistories { get; set; } = null!;
    public DbSet<VoyageCargoPlan> VoyageCargoPlans { get; set; } = null!;
    public DbSet<VoyageBunkerPlan> VoyageBunkerPlans { get; set; } = null!;
    public DbSet<VoyageCrewChangePlan> VoyageCrewChangePlans { get; set; } = null!;
    public DbSet<VoyageCostEstimate> VoyageCostEstimates { get; set; } = null!;
    public DbSet<VoyageRevenueEstimate> VoyageRevenueEstimates { get; set; } = null!;

    // Phase 4: Financial
    public DbSet<VoyageExpenseRequest> VoyageExpenseRequests { get; set; } = null!;
    public DbSet<VoyageAdvancePayment> VoyageAdvancePayments { get; set; } = null!;
    public DbSet<VoyageDisbursement> VoyageDisbursements { get; set; } = null!;
    public DbSet<VoyageActualRevenue> VoyageActualRevenues { get; set; } = null!;
    public DbSet<VoyageSettlement> VoyageSettlements { get; set; } = null!;

    // Sync Queue & State
    public DbSet<SyncQueue> SyncQueue { get; set; } = null!;
    public DbSet<SyncState> SyncState { get; set; } = null!;
    public DbSet<SyncFileManifest> SyncFileManifests { get; set; } = null!;
    public DbSet<SyncFileTransferRequest> SyncFileTransferRequests { get; set; } = null!;
    public DbSet<SyncFileChunkSession> SyncFileChunkSessions { get; set; } = null!;

    // Critical Operational Tables (SOLAS/ISM/MARPOL)
    public DbSet<CrewMember> CrewMembers { get; set; } = null!;
    public DbSet<Certificate> Certificates { get; set; } = null!;
    public DbSet<CrewCertificate> CrewCertificates { get; set; } = null!;
    public DbSet<Country> Countries { get; set; } = null!;
    public DbSet<Rank> Ranks { get; set; } = null!;
    public DbSet<RankCertificate> RankCertificates { get; set; } = null!;
    public DbSet<CountryCertificate> CountryCertificates { get; set; } = null!;
    public DbSet<TravelDocument> TravelDocuments { get; set; } = null!;
    public DbSet<SeafarerDocument> SeafarerDocuments { get; set; } = null!;
    public DbSet<EmploymentDocument> EmploymentDocuments { get; set; } = null!;
    public DbSet<HealthDocument> HealthDocuments { get; set; } = null!;
    public DbSet<ServiceRecord> ServiceRecords { get; set; } = null!;
    public DbSet<CrewLogbookEntry> CrewLogbookEntries { get; set; } = null!;
    public DbSet<MaintenanceTask> MaintenanceTasks { get; set; } = null!;
    public DbSet<TaskChecklistItem> TaskChecklistItems { get; set; } = null!;
    public DbSet<MaintenanceTaskDetail> MaintenanceTaskDetails { get; set; } = null!;
    public DbSet<CargoOperation> CargoOperations { get; set; } = null!;
    public DbSet<WatchkeepingLog> WatchkeepingLogs { get; set; } = null!;
    public DbSet<OilRecordBook> OilRecordBooks { get; set; } = null!;
    
    // Additional Logbooks (SOLAS/MARPOL/BWM Convention)
    public DbSet<DeckLogBook> DeckLogBooks { get; set; } = null!;
    public DbSet<EngineLogBook> EngineLogBooks { get; set; } = null!;
    public DbSet<GarbageRecordBook> GarbageRecordBooks { get; set; } = null!;
    public DbSet<GarbageRecordPartI> GarbageRecordPartIs { get; set; } = null!;
    public DbSet<GarbageRecordPartII> GarbageRecordPartIIs { get; set; } = null!;
    public DbSet<BallastWaterRecordBook> BallastWaterRecordBooks { get; set; } = null!;

    // Inventory & Materials
    public DbSet<MaterialCategory> MaterialCategories { get; set; } = null!;
    public DbSet<MaterialItem> MaterialItems { get; set; } = null!;
    public DbSet<MaterialCatalogItem> MaterialCatalogItems { get; set; } = null!;
    public DbSet<MaterialReceipt> MaterialReceipts { get; set; } = null!;
    public DbSet<MaterialReceiptItem> MaterialReceiptItems { get; set; } = null!;
    public DbSet<StoreLocation> StoreLocations { get; set; } = null!;
    public DbSet<MaterialRequest> MaterialRequests { get; set; } = null!;
    public DbSet<MaterialRequestItem> MaterialRequestItems { get; set; } = null!;
    public DbSet<StockReceipt> StockReceipts { get; set; } = null!;
    public DbSet<StockReceiptItem> StockReceiptItems { get; set; } = null!;
    public DbSet<InventoryStock> InventoryStocks { get; set; } = null!;

    // Fuel Analytics (IMO DCS / EU MRV / CII Compliance)
    public DbSet<FuelAnalyticsSummary> FuelAnalyticsSummaries { get; set; } = null!;
    public DbSet<FuelEfficiencyAlert> FuelEfficiencyAlerts { get; set; } = null!;

    // Authentication & Authorization
    public DbSet<Role> Roles { get; set; } = null!;
    public DbSet<User> Users { get; set; } = null!;
    public DbSet<UserSession> UserSessions { get; set; } = null!;
    public DbSet<LoginAttempt> LoginAttempts { get; set; } = null!;

    // System Logging (ISM Code / IMO MSC.428)
    public DbSet<SystemLog> SystemLogs { get; set; } = null!;

    // Maritime Reporting System (IMO/SOLAS/MARPOL Compliance)
    public DbSet<ReportType> ReportTypes { get; set; } = null!;
    public DbSet<MaritimeReport> MaritimeReports { get; set; } = null!;
    public DbSet<NoonReport> NoonReports { get; set; } = null!;
    public DbSet<DepartureReport> DepartureReports { get; set; } = null!;
    public DbSet<ArrivalReport> ArrivalReports { get; set; } = null!;
    public DbSet<BunkerReport> BunkerReports { get; set; } = null!;
    public DbSet<PositionReport> PositionReports { get; set; } = null!;
    public DbSet<ReportAttachment> ReportAttachments { get; set; } = null!;
    public DbSet<ReportDistribution> ReportDistributions { get; set; } = null!;
    public DbSet<ReportTransmissionLog> ReportTransmissionLogs { get; set; } = null!;
    public DbSet<ReportWorkflowHistory> ReportWorkflowHistories { get; set; } = null!;
    public DbSet<ReportAmendment> ReportAmendments { get; set; } = null!;
    public DbSet<WeeklyPerformanceReport> WeeklyPerformanceReports { get; set; } = null!;
    public DbSet<MonthlySummaryReport> MonthlySummaryReports { get; set; } = null!;

    // Maintenance Planning System (PMS)
    public DbSet<EquipmentAsset> EquipmentAssets { get; set; } = null!;
    public DbSet<MaintenanceSchedule> MaintenanceSchedules { get; set; } = null!;
    public DbSet<ScheduleSparePart> ScheduleSpareParts { get; set; } = null!;
    public DbSet<MaterialItemEquipment> MaterialItemEquipments { get; set; } = null!;
    public DbSet<ScheduleChecklistTemplate> ScheduleChecklistTemplates { get; set; } = null!;
    public DbSet<MaintenanceHistory> MaintenanceHistories { get; set; } = null!;
    public DbSet<EquipmentGroup> EquipmentGroups { get; set; } = null!;
    public DbSet<EquipmentGroupMember> EquipmentGroupMembers { get; set; } = null!;
    
    // PMS Workflow v2.0 - Deferral & Status History
    public DbSet<TaskDeferralRequest> TaskDeferralRequests { get; set; } = null!;
    public DbSet<TaskStatusHistory> TaskStatusHistories { get; set; } = null!;
    public DbSet<TaskRiskAssessment> TaskRiskAssessments { get; set; } = null!;
    public DbSet<TaskInspectionReport> TaskInspectionReports { get; set; } = null!;

    // Voyage Log - Nhật ký Hành trình (SOLAS Chapter V)
    public DbSet<VoyageLogEntry> VoyageLogEntries { get; set; } = null!;

    // Voyage Context - Port Master Data, Port Calls, Crew Assignments (FAL/MLC/SOLAS)
    public DbSet<Port> Ports { get; set; } = null!;
    public DbSet<PortCall> PortCalls { get; set; } = null!;
    public DbSet<VoyageCrewAssignment> VoyageCrewAssignments { get; set; } = null!;

    // Abstract Log - Nhật ký vắn tắt (Voyage Performance Summary)
    public DbSet<AbstractLogVoyage> AbstractLogVoyages { get; set; } = null!;
    public DbSet<AbstractLogLeg> AbstractLogLegs { get; set; } = null!;
    public DbSet<AbstractLogDailyEntry> AbstractLogDailyEntries { get; set; } = null!;

    // Drill Training Management (SOLAS/ISPS Compliance)
    public DbSet<DrillType> DrillTypes { get; set; } = null!;
    public DbSet<DrillSchedule> DrillSchedules { get; set; } = null!;
    public DbSet<DrillLog> DrillLogs { get; set; } = null!;

    // Ship's Data - Quản lý thông tin tàu (IMO, SOLAS, MARPOL)
    public DbSet<ShipData> ShipData { get; set; } = null!;
    public DbSet<ShipMainEngine> ShipMainEngines { get; set; } = null!;
    public DbSet<ShipAuxiliaryEngine> ShipAuxiliaryEngines { get; set; } = null!;
    public DbSet<ShipPropeller> ShipPropellers { get; set; } = null!;
    public DbSet<ShipBowthruster> ShipBowthrusters { get; set; } = null!;
    public DbSet<ShipSternthruster> ShipSternthrusters { get; set; } = null!;
    public DbSet<ShipRudder> ShipRudders { get; set; } = null!;
    public DbSet<ShipShaftGenerator> ShipShaftGenerators { get; set; } = null!;
    public DbSet<ShipBoiler> ShipBoilers { get; set; } = null!;
    public DbSet<ShipLoadLine> ShipLoadLines { get; set; } = null!;
    public DbSet<ShipPilotCardData> ShipPilotCardData { get; set; } = null!;

    // HSQE Safety, Quality & Environmental Management (ISM/SOLAS Compliance)
    public DbSet<HsqeDocument> HsqeDocuments { get; set; } = null!;
    public DbSet<HsqeDocumentRevision> HsqeDocumentRevisions { get; set; } = null!;
    public DbSet<HsqeDocumentSyncStatus> HsqeDocumentSyncStatuses { get; set; } = null!;
    public DbSet<HsqeIncident> HsqeIncidents { get; set; } = null!;
    public DbSet<HsqeCapa> HsqeCapas { get; set; } = null!;
    public DbSet<HsqeRiskAssessment> HsqeRiskAssessments { get; set; } = null!;
    public DbSet<HsqeWorkPermit> HsqeWorkPermits { get; set; } = null!;
    public DbSet<HsqeDocumentAttachment> HsqeDocumentAttachments { get; set; } = null!;
    public DbSet<HsqeDocumentReadLog> HsqeDocumentReadLogs { get; set; } = null!;

    // SMS Document Management System Rebuild
    public DbSet<IsmElement> IsmElements { get; set; } = null!;
    public DbSet<SmsProcedure> SmsProcedures { get; set; } = null!;
    public DbSet<SmsProcedureAcknowledge> SmsProcedureAcknowledgements { get; set; } = null!;
    public DbSet<SmsFormTemplate> SmsFormTemplates { get; set; } = null!;
    public DbSet<SmsFilledRecord> SmsFilledRecords { get; set; } = null!;

    // Vessel Provisioning v3 — Managed Mode config source of truth
    public DbSet<EdgeProvisioningProfile> EdgeProvisioningProfiles { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // PostgreSQL specific configurations
        modelBuilder.HasDefaultSchema("public");

        // ========== DATETIME UTC CONVERSION ==========
        // Apply UTC conversion for all DateTime and DateTime? properties
        // This fixes: "Cannot write DateTime with Kind=Unspecified to PostgreSQL type 'timestamp with time zone'"
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entityType.GetProperties())
            {
                if (property.ClrType == typeof(DateTime))
                {
                    property.SetValueConverter(
                        new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<DateTime, DateTime>(
                            v => v.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(v, DateTimeKind.Utc) : v.ToUniversalTime(),
                            v => DateTime.SpecifyKind(v, DateTimeKind.Utc)));
                }
                else if (property.ClrType == typeof(DateTime?))
                {
                    property.SetValueConverter(
                        new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<DateTime?, DateTime?>(
                            v => v.HasValue 
                                ? (v.Value.Kind == DateTimeKind.Unspecified 
                                    ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) 
                                    : v.Value.ToUniversalTime()) 
                                : v,
                            v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v));
                }
            }
        }

        // Configure naming convention to snake_case
        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            // Convert table names to snake_case
            entity.SetTableName(ToSnakeCase(entity.GetTableName() ?? entity.ClrType.Name));

            // Convert column names to snake_case (respect explicit [Column] attribute)
            foreach (var property in entity.GetProperties())
            {
                var member = property.PropertyInfo ?? (System.Reflection.MemberInfo?)property.FieldInfo;
                var colAttr = member?.GetCustomAttributes(typeof(System.ComponentModel.DataAnnotations.Schema.ColumnAttribute), true)
                                    .OfType<System.ComponentModel.DataAnnotations.Schema.ColumnAttribute>()
                                    .FirstOrDefault();
                if (colAttr?.Name != null)
                    property.SetColumnName(colAttr.Name);
                else
                    property.SetColumnName(ToSnakeCase(property.Name));
            }

            // Convert keys to snake_case
            foreach (var key in entity.GetKeys())
            {
                key.SetName(ToSnakeCase(key.GetName() ?? ""));
            }

            // Convert foreign keys to snake_case
            foreach (var foreignKey in entity.GetForeignKeys())
            {
                foreignKey.SetConstraintName(ToSnakeCase(foreignKey.GetConstraintName() ?? ""));
            }

            // Convert indexes to snake_case (names are already set)
            foreach (var index in entity.GetIndexes())
            {
                if (index.Name != null && !index.Name.StartsWith("idx_"))
                {
                    index.SetDatabaseName(ToSnakeCase(index.Name));
                }
            }
        }

        // ========== POSITION DATA ==========
        modelBuilder.Entity<PositionData>(entity =>
        {
            entity.ToTable("position_data");
            
            // Precision for coordinates (PostgreSQL supports high precision)
            entity.Property(e => e.Latitude)
                .HasColumnType("decimal(10,7)")
                .HasComment("Latitude in decimal degrees (-90 to +90)");
            
            entity.Property(e => e.Longitude)
                .HasColumnType("decimal(10,7)")
                .HasComment("Longitude in decimal degrees (-180 to +180)");
            
            entity.Property(e => e.Altitude)
                .HasColumnType("decimal(8,2)")
                .HasComment("Altitude in meters above MSL");
            
            entity.Property(e => e.SpeedOverGround)
                .HasColumnType("decimal(5,2)")
                .HasComment("Speed in knots");
            
            entity.Property(e => e.CourseOverGround)
                .HasColumnType("decimal(5,2)")
                .HasComment("Course in degrees true");
            
            entity.Property(e => e.Hdop)
                .HasColumnType("decimal(4,2)");
            
            entity.HasIndex(e => e.Timestamp)
                .HasDatabaseName("idx_position_timestamp")
                .IsDescending();
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_position_synced")
                .HasFilter("is_synced = false");
            
            entity.HasIndex(e => new { e.Timestamp, e.IsSynced })
                .HasDatabaseName("idx_position_timestamp_synced");
        });

        // ========== AIS DATA ==========
        modelBuilder.Entity<AisData>(entity =>
        {
            entity.ToTable("ais_data");
            
            entity.Property(e => e.SpeedOverGround)
                .HasColumnType("decimal(5,2)");
            
            entity.Property(e => e.Latitude)
                .HasColumnType("decimal(10,7)");
            
            entity.Property(e => e.Longitude)
                .HasColumnType("decimal(10,7)");
            
            entity.Property(e => e.CourseOverGround)
                .HasColumnType("decimal(5,2)");
            
            entity.Property(e => e.RateOfTurn)
                .HasColumnType("decimal(6,2)");
            
            entity.Property(e => e.Draught)
                .HasColumnType("decimal(4,2)");
            
            entity.HasIndex(e => new { e.Mmsi, e.Timestamp })
                .HasDatabaseName("idx_ais_mmsi_timestamp");
            
            entity.HasIndex(e => e.MessageType)
                .HasDatabaseName("idx_ais_message_type");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_ais_synced")
                .HasFilter("is_synced = false");
        });

        // ========== NMEA RAW DATA ==========
        modelBuilder.Entity<NmeaRawData>(entity =>
        {
            entity.ToTable("nmea_raw_data");
            
            entity.HasIndex(e => e.Timestamp)
                .HasDatabaseName("idx_nmea_timestamp")
                .IsDescending();
            
            entity.HasIndex(e => e.SentenceType)
                .HasDatabaseName("idx_nmea_sentence_type");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_nmea_synced")
                .HasFilter("is_synced = false");
        });

        // ========== NAVIGATION DATA ==========
        modelBuilder.Entity<NavigationData>(entity =>
        {
            entity.ToTable("navigation_data");
            
            entity.Property(e => e.HeadingTrue).HasColumnType("decimal(5,2)");
            entity.Property(e => e.HeadingMagnetic).HasColumnType("decimal(5,2)");
            entity.Property(e => e.RateOfTurn).HasColumnType("decimal(6,2)");
            entity.Property(e => e.Pitch).HasColumnType("decimal(5,2)");
            entity.Property(e => e.Roll).HasColumnType("decimal(5,2)");
            entity.Property(e => e.SpeedThroughWater).HasColumnType("decimal(5,2)");
            entity.Property(e => e.Depth).HasColumnType("decimal(8,2)");
            entity.Property(e => e.WindSpeedRelative).HasColumnType("decimal(5,2)");
            entity.Property(e => e.WindDirectionRelative).HasColumnType("decimal(5,2)");
            entity.Property(e => e.WindSpeedTrue).HasColumnType("decimal(5,2)");
            entity.Property(e => e.WindDirectionTrue).HasColumnType("decimal(5,2)");
            
            entity.HasIndex(e => e.Timestamp)
                .HasDatabaseName("idx_navigation_timestamp")
                .IsDescending();
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_navigation_synced")
                .HasFilter("is_synced = false");
        });

        // ========== ENGINE DATA ==========
        modelBuilder.Entity<EngineData>(entity =>
        {
            entity.ToTable("engine_data");
            
            entity.Property(e => e.Rpm).HasColumnType("decimal(6,2)");
            entity.Property(e => e.LoadPercent).HasColumnType("decimal(5,2)");
            entity.Property(e => e.CoolantTemp).HasColumnType("decimal(5,2)");
            entity.Property(e => e.ExhaustTemp).HasColumnType("decimal(6,2)");
            entity.Property(e => e.LubeOilPressure).HasColumnType("decimal(5,2)");
            entity.Property(e => e.LubeOilTemp).HasColumnType("decimal(5,2)");
            entity.Property(e => e.FuelPressure).HasColumnType("decimal(5,2)");
            entity.Property(e => e.FuelRate).HasColumnType("decimal(8,2)");
            entity.Property(e => e.RunningHours).HasColumnType("decimal(10,2)");
            
            entity.HasIndex(e => new { e.EngineId, e.Timestamp })
                .HasDatabaseName("idx_engine_id_timestamp");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_engine_synced")
                .HasFilter("is_synced = false");
            
            entity.HasIndex(e => e.AlarmStatus)
                .HasDatabaseName("idx_engine_alarm_status")
                .HasFilter("alarm_status > 0");
        });

        // ========== GENERATOR DATA ==========
        modelBuilder.Entity<GeneratorData>(entity =>
        {
            entity.ToTable("generator_data");
            
            entity.Property(e => e.Voltage).HasColumnType("decimal(6,2)");
            entity.Property(e => e.Frequency).HasColumnType("decimal(5,2)");
            entity.Property(e => e.Current).HasColumnType("decimal(8,2)");
            entity.Property(e => e.ActivePower).HasColumnType("decimal(8,2)");
            entity.Property(e => e.PowerFactor).HasColumnType("decimal(4,3)");
            entity.Property(e => e.RunningHours).HasColumnType("decimal(10,2)");
            entity.Property(e => e.LoadPercent).HasColumnType("decimal(5,2)");
            
            entity.HasIndex(e => new { e.GeneratorId, e.Timestamp })
                .HasDatabaseName("idx_generator_id_timestamp");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_generator_synced")
                .HasFilter("is_synced = false");
        });

        // ========== TANK LEVELS ==========
        modelBuilder.Entity<TankLevel>(entity =>
        {
            entity.ToTable("tank_levels");
            
            entity.Property(e => e.LevelPercent).HasColumnType("decimal(5,2)");
            entity.Property(e => e.VolumeLiters).HasColumnType("decimal(10,2)");
            entity.Property(e => e.Temperature).HasColumnType("decimal(5,2)");
            
            entity.HasIndex(e => new { e.TankId, e.Timestamp })
                .HasDatabaseName("idx_tank_id_timestamp");
            
            entity.HasIndex(e => e.TankType)
                .HasDatabaseName("idx_tank_type");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_tank_synced")
                .HasFilter("is_synced = false");
        });

        // ========== FUEL CONSUMPTION ==========
        modelBuilder.Entity<FuelConsumption>(entity =>
        {
            entity.ToTable("fuel_consumption");
            
            entity.Property(e => e.ConsumedVolume).HasColumnType("decimal(10,3)");
            entity.Property(e => e.ConsumedMass).HasColumnType("decimal(10,3)");
            entity.Property(e => e.Density).HasColumnType("decimal(6,2)");
            entity.Property(e => e.DistanceTraveled).HasColumnType("decimal(10,2)");
            entity.Property(e => e.TimeUnderway).HasColumnType("decimal(8,2)");
            entity.Property(e => e.CargoWeight).HasColumnType("decimal(12,3)");
            entity.Property(e => e.Co2Emissions).HasColumnType("decimal(10,3)");
            
            entity.HasIndex(e => e.Timestamp)
                .HasDatabaseName("idx_fuel_timestamp")
                .IsDescending();
            
            entity.HasIndex(e => e.FuelType)
                .HasDatabaseName("idx_fuel_type");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_fuel_synced")
                .HasFilter("is_synced = false");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_fuel_voyage_id");

            entity.HasIndex(e => e.VoyagePlanLegId)
                .HasDatabaseName("idx_fuel_leg_id");
        });

        // ========== ENVIRONMENTAL DATA ==========
        modelBuilder.Entity<EnvironmentalData>(entity =>
        {
            entity.ToTable("environmental_data");
            
            entity.Property(e => e.AirTemperature).HasColumnType("decimal(5,2)");
            entity.Property(e => e.BarometricPressure).HasColumnType("decimal(7,2)");
            entity.Property(e => e.Humidity).HasColumnType("decimal(5,2)");
            entity.Property(e => e.SeaTemperature).HasColumnType("decimal(5,2)");
            entity.Property(e => e.WindSpeed).HasColumnType("decimal(5,2)");
            entity.Property(e => e.WindDirection).HasColumnType("decimal(5,2)");
            entity.Property(e => e.WaveHeight).HasColumnType("decimal(5,2)");
            entity.Property(e => e.Visibility).HasColumnType("decimal(5,2)");
            
            entity.HasIndex(e => e.Timestamp)
                .HasDatabaseName("idx_environmental_timestamp")
                .IsDescending();
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_environmental_synced")
                .HasFilter("is_synced = false");
        });

        // ========== SAFETY ALARMS ==========
        modelBuilder.Entity<SafetyAlarm>(entity =>
        {
            entity.ToTable("safety_alarms");
            
            entity.HasIndex(e => e.Timestamp)
                .HasDatabaseName("idx_alarm_timestamp")
                .IsDescending();
            
            entity.HasIndex(e => new { e.IsResolved, e.Severity })
                .HasDatabaseName("idx_alarm_unresolved_severity")
                .HasFilter("is_resolved = false");
            
            entity.HasIndex(e => e.AlarmType)
                .HasDatabaseName("idx_alarm_type");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_alarm_synced")
                .HasFilter("is_synced = false");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_alarm_voyage_id");

            entity.HasIndex(e => e.VoyagePlanLegId)
                .HasDatabaseName("idx_alarm_leg_id");
        });

        // ========== VOYAGE RECORDS ==========
        modelBuilder.Entity<VoyageRecord>(entity =>
        {
            entity.ToTable("voyage_records");
            
            entity.Property(e => e.CargoWeight).HasColumnType("decimal(12,3)");
            entity.Property(e => e.PlannedDistance).HasColumnType("decimal(10,2)");
            entity.Property(e => e.PlannedDurationHours).HasColumnType("decimal(10,2)");
            entity.Property(e => e.PlannedAverageSpeed).HasColumnType("decimal(5,2)");
            entity.Property(e => e.PlannedFuelConsumption).HasColumnType("decimal(10,3)");
            entity.Property(e => e.DistanceTraveled).HasColumnType("decimal(10,2)");
            entity.Property(e => e.FuelConsumed).HasColumnType("decimal(10,3)");
            entity.Property(e => e.AverageSpeed).HasColumnType("decimal(5,2)");
            
            entity.HasIndex(e => e.VoyageNumber)
                .IsUnique()
                .HasDatabaseName("idx_voyage_number_unique");
            
            entity.HasIndex(e => e.VoyageStatus)
                .HasDatabaseName("idx_voyage_status");

            entity.HasIndex(e => e.CharterType)
                .HasDatabaseName("idx_voyage_charter_type");
            
            entity.HasIndex(e => e.DepartureTime)
                .HasDatabaseName("idx_voyage_departure")
                .IsDescending();
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_voyage_synced")
                .HasFilter("is_synced = false");
            
            entity.HasIndex(e => e.VesselIMO)
                .HasDatabaseName("idx_voyage_vessel_imo");
            
            entity.HasIndex(e => e.DeparturePortCode)
                .HasDatabaseName("idx_voyage_dep_port_code");
            
            entity.HasIndex(e => e.ArrivalPortCode)
                .HasDatabaseName("idx_voyage_arr_port_code");
            
            // Relationships
            entity.HasMany(e => e.PortCalls)
                .WithOne(e => e.Voyage)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);
            
            entity.HasMany(e => e.CrewAssignments)
                .WithOne(e => e.Voyage)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);
            
            entity.HasMany(e => e.LogEntries)
                .WithOne(e => e.Voyage)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.SetNull);
            
            entity.HasMany(e => e.CargoOperations)
                .WithOne()
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasMany(e => e.PlanLegs)
                .WithOne(e => e.Voyage)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(e => e.StatusHistory)
                .WithOne(e => e.Voyage)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VoyagePlanLeg>(entity =>
        {
            entity.ToTable("voyage_plan_legs");

            entity.Property(e => e.PlannedDistance).HasColumnType("decimal(10,2)");
            entity.Property(e => e.PlannedDurationHours).HasColumnType("decimal(10,2)");
            entity.Property(e => e.PlannedAverageSpeed).HasColumnType("decimal(5,2)");

            entity.HasIndex(e => new { e.VoyageId, e.Sequence })
                .IsUnique()
                .HasDatabaseName("idx_voyage_plan_leg_voyage_seq");

            entity.HasIndex(e => e.LegType)
                .HasDatabaseName("idx_voyage_plan_leg_type");
        });

        modelBuilder.Entity<VoyageStatusHistory>(entity =>
        {
            entity.ToTable("voyage_status_history");

            entity.HasIndex(e => new { e.VoyageId, e.ChangedAt })
                .HasDatabaseName("idx_voyage_status_history_voyage_changed")
                .IsDescending(false, true);

            entity.HasIndex(e => e.ToStatus)
                .HasDatabaseName("idx_voyage_status_history_to_status");
        });

        // ========== Phase 2: VOYAGE PLANNING ENTITIES ==========

        modelBuilder.Entity<VoyageCargoPlan>(entity =>
        {
            entity.ToTable("voyage_cargo_plans");

            entity.HasIndex(e => new { e.VoyageId, e.Sequence })
                .HasDatabaseName("idx_voyage_cargo_plan_voyage_seq");

            entity.HasIndex(e => e.PlanLegId)
                .HasDatabaseName("idx_voyage_cargo_plan_leg");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_voyage_cargo_plan_synced")
                .HasFilter("is_synced = false");

            entity.HasOne(e => e.Voyage)
                .WithMany(v => v.CargoPlans)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.PlanLeg)
                .WithMany()
                .HasForeignKey(e => e.PlanLegId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<VoyageBunkerPlan>(entity =>
        {
            entity.ToTable("voyage_bunker_plans");

            entity.HasIndex(e => new { e.VoyageId, e.Sequence })
                .HasDatabaseName("idx_voyage_bunker_plan_voyage_seq");

            entity.HasIndex(e => e.PlanLegId)
                .HasDatabaseName("idx_voyage_bunker_plan_leg");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_voyage_bunker_plan_synced")
                .HasFilter("is_synced = false");

            entity.HasOne(e => e.Voyage)
                .WithMany(v => v.BunkerPlans)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.PlanLeg)
                .WithMany()
                .HasForeignKey(e => e.PlanLegId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<VoyageCrewChangePlan>(entity =>
        {
            entity.ToTable("voyage_crew_change_plans");

            entity.HasIndex(e => new { e.VoyageId, e.Sequence })
                .HasDatabaseName("idx_voyage_crew_change_plan_voyage_seq");

            entity.HasIndex(e => e.PlanLegId)
                .HasDatabaseName("idx_voyage_crew_change_plan_leg");

            entity.HasIndex(e => e.CrewMemberId)
                .HasDatabaseName("idx_voyage_crew_change_plan_crew");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_voyage_crew_change_plan_synced")
                .HasFilter("is_synced = false");

            entity.HasOne(e => e.Voyage)
                .WithMany(v => v.CrewChangePlans)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.PlanLeg)
                .WithMany()
                .HasForeignKey(e => e.PlanLegId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.CrewMember)
                .WithMany()
                .HasForeignKey(e => e.CrewMemberId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.Rank)
                .WithMany()
                .HasForeignKey(e => e.RankId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<VoyageCostEstimate>(entity =>
        {
            entity.ToTable("voyage_cost_estimates");

            entity.HasIndex(e => new { e.VoyageId, e.Sequence })
                .HasDatabaseName("idx_voyage_cost_estimate_voyage_seq");

            entity.HasIndex(e => e.CostCategory)
                .HasDatabaseName("idx_voyage_cost_estimate_category");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_voyage_cost_estimate_synced")
                .HasFilter("is_synced = false");

            entity.HasOne(e => e.Voyage)
                .WithMany(v => v.CostEstimates)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VoyageRevenueEstimate>(entity =>
        {
            entity.ToTable("voyage_revenue_estimates");

            entity.HasIndex(e => new { e.VoyageId, e.Sequence })
                .HasDatabaseName("idx_voyage_revenue_estimate_voyage_seq");

            entity.HasIndex(e => e.RevenueCategory)
                .HasDatabaseName("idx_voyage_revenue_estimate_category");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_voyage_revenue_estimate_synced")
                .HasFilter("is_synced = false");

            entity.HasOne(e => e.Voyage)
                .WithMany(v => v.RevenueEstimates)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== PHASE 4: FINANCIAL ENTITIES ==========

        modelBuilder.Entity<VoyageExpenseRequest>(entity =>
        {
            entity.ToTable("voyage_expense_requests");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_expense_request_voyage");

            entity.HasIndex(e => e.RequestNumber)
                .IsUnique()
                .HasDatabaseName("idx_expense_request_number_unique");

            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_expense_request_status");

            entity.HasIndex(e => e.CostCategory)
                .HasDatabaseName("idx_expense_request_category");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_expense_request_synced")
                .HasFilter("is_synced = false");

            entity.HasOne(e => e.Voyage)
                .WithMany(v => v.ExpenseRequests)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VoyageAdvancePayment>(entity =>
        {
            entity.ToTable("voyage_advance_payments");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_advance_payment_voyage");

            entity.HasIndex(e => e.AdvanceNumber)
                .IsUnique()
                .HasDatabaseName("idx_advance_payment_number_unique");

            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_advance_payment_status");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_advance_payment_synced")
                .HasFilter("is_synced = false");

            entity.HasOne(e => e.Voyage)
                .WithMany(v => v.AdvancePayments)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VoyageDisbursement>(entity =>
        {
            entity.ToTable("voyage_disbursements");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_disbursement_voyage");

            entity.HasIndex(e => e.DisbursementNumber)
                .IsUnique()
                .HasDatabaseName("idx_disbursement_number_unique");

            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_disbursement_status");

            entity.HasIndex(e => e.CostCategory)
                .HasDatabaseName("idx_disbursement_category");

            entity.HasIndex(e => e.ExpenseRequestId)
                .HasDatabaseName("idx_disbursement_expense_request");

            entity.HasIndex(e => e.AdvancePaymentId)
                .HasDatabaseName("idx_disbursement_advance_payment");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_disbursement_synced")
                .HasFilter("is_synced = false");

            entity.HasOne(e => e.Voyage)
                .WithMany(v => v.Disbursements)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.ExpenseRequest)
                .WithMany()
                .HasForeignKey(e => e.ExpenseRequestId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.AdvancePayment)
                .WithMany()
                .HasForeignKey(e => e.AdvancePaymentId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<VoyageActualRevenue>(entity =>
        {
            entity.ToTable("voyage_actual_revenues");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_actual_revenue_voyage");

            entity.HasIndex(e => e.RevenueNumber)
                .IsUnique()
                .HasDatabaseName("idx_actual_revenue_number_unique");

            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_actual_revenue_status");

            entity.HasIndex(e => e.RevenueCategory)
                .HasDatabaseName("idx_actual_revenue_category");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_actual_revenue_synced")
                .HasFilter("is_synced = false");

            entity.HasOne(e => e.Voyage)
                .WithMany(v => v.ActualRevenues)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VoyageSettlement>(entity =>
        {
            entity.ToTable("voyage_settlements");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_settlement_voyage");

            entity.HasIndex(e => e.SettlementNumber)
                .IsUnique()
                .HasDatabaseName("idx_settlement_number_unique");

            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_settlement_status");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_settlement_synced")
                .HasFilter("is_synced = false");

            entity.HasOne(e => e.Voyage)
                .WithMany(v => v.Settlements)
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== PORT MASTER DATA ==========
        modelBuilder.Entity<Port>(entity =>
        {
            entity.ToTable("ports");
            
            entity.HasIndex(e => e.PortCode)
                .IsUnique()
                .HasDatabaseName("idx_port_code_unique");
            
            entity.HasIndex(e => e.CountryCode)
                .HasDatabaseName("idx_port_country_code");
            
            entity.HasIndex(e => e.PortName)
                .HasDatabaseName("idx_port_name");
            
            entity.HasIndex(e => e.IsActive)
                .HasDatabaseName("idx_port_active");
        });

        // ========== PORT CALLS ==========
        modelBuilder.Entity<PortCall>(entity =>
        {
            entity.ToTable("port_calls");
            
            entity.Property(e => e.DraftFore).HasColumnType("decimal(5,2)");
            entity.Property(e => e.DraftAft).HasColumnType("decimal(5,2)");
            
            entity.HasIndex(e => new { e.VoyageId, e.Sequence })
                .IsUnique()
                .HasDatabaseName("idx_port_call_voyage_seq");
            
            entity.HasIndex(e => e.PortCode)
                .HasDatabaseName("idx_port_call_port_code");
            
            entity.HasIndex(e => e.CallType)
                .HasDatabaseName("idx_port_call_type");
            
            entity.HasIndex(e => e.ArrivalTime)
                .HasDatabaseName("idx_port_call_arrival");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_port_call_synced")
                .HasFilter("is_synced = false");
            
            entity.HasOne(e => e.Port)
                .WithMany()
                .HasForeignKey(e => e.PortId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(e => e.VoyagePlanLegId)
                .HasDatabaseName("idx_port_call_leg_id");
        });

        // ========== VOYAGE CREW ASSIGNMENTS ==========
        modelBuilder.Entity<VoyageCrewAssignment>(entity =>
        {
            entity.ToTable("voyage_crew_assignments");
            
            entity.HasIndex(e => new { e.VoyageId, e.CrewMemberId })
                .IsUnique()
                .HasDatabaseName("idx_vca_voyage_crew_unique");
            
            entity.HasIndex(e => e.CrewMemberId)
                .HasDatabaseName("idx_vca_crew_member");
            
            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_vca_status");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_vca_synced")
                .HasFilter("is_synced = false");
            
            entity.HasOne(e => e.CrewMember)
                .WithMany()
                .HasForeignKey(e => e.CrewMemberId)
                .OnDelete(DeleteBehavior.Cascade);
            
            entity.HasOne(e => e.Rank)
                .WithMany()
                .HasForeignKey(e => e.RankId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // ========== CREW LOGBOOK ENTRIES ==========
        modelBuilder.Entity<CrewLogbookEntry>(entity =>
        {
            entity.ToTable("crew_logbook_entries");
            entity.HasKey(e => e.Id);

            entity.HasIndex(e => e.CrewMemberId)
                .HasDatabaseName("idx_crew_logbook_crew_member");
            entity.HasIndex(e => e.EntryOrigin)
                .HasDatabaseName("idx_crew_logbook_origin");
            entity.HasIndex(e => e.EntryDate)
                .HasDatabaseName("idx_crew_logbook_date");
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_crew_logbook_synced")
                .HasFilter("is_synced = false");

            entity.HasOne(e => e.CrewMember)
                .WithMany()
                .HasForeignKey(e => e.CrewMemberId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== ABSTRACT LOG ==========
        modelBuilder.Entity<AbstractLogVoyage>(entity =>
        {
            entity.ToTable("abstract_log_voyages");

            entity.HasIndex(e => e.VoyageId)
                .IsUnique()
                .HasDatabaseName("idx_alv_voyage_unique");

            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_alv_status");

            entity.HasOne(e => e.Voyage)
                .WithMany()
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AbstractLogLeg>(entity =>
        {
            entity.ToTable("abstract_log_legs");

            entity.HasIndex(e => new { e.AbstractLogVoyageId, e.Sequence })
                .IsUnique()
                .HasDatabaseName("idx_all_voyage_leg_unique");

            entity.HasOne(e => e.AbstractLogVoyage)
                .WithMany(v => v.Legs)
                .HasForeignKey(e => e.AbstractLogVoyageId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AbstractLogDailyEntry>(entity =>
        {
            entity.ToTable("abstract_log_daily_entries");

            entity.HasIndex(e => new { e.AbstractLogLegId, e.EntryDate })
                .IsUnique()
                .HasDatabaseName("idx_alde_leg_date_unique");

            entity.HasIndex(e => e.AbstractLogLegId)
                .HasDatabaseName("idx_alde_leg");

            entity.HasOne(e => e.AbstractLogLeg)
                .WithMany(l => l.DailyEntries)
                .HasForeignKey(e => e.AbstractLogLegId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== SHIP'S DATA MODULE ==========
        modelBuilder.Entity<ShipData>(entity =>
        {
            entity.ToTable("ship_data");

            entity.HasIndex(e => e.ImoNumber)
                .IsUnique()
                .HasDatabaseName("idx_ship_data_imo_unique");

            entity.HasIndex(e => e.ShipName)
                .HasDatabaseName("idx_ship_data_name");
        });

        modelBuilder.Entity<ShipMainEngine>(entity =>
        {
            entity.ToTable("ship_main_engines");

            entity.HasOne(e => e.ShipData)
                .WithMany(s => s.MainEngines)
                .HasForeignKey(e => e.ShipDataId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.ShipDataId)
                .HasDatabaseName("idx_ship_me_ship_data");
        });

        modelBuilder.Entity<ShipAuxiliaryEngine>(entity =>
        {
            entity.ToTable("ship_auxiliary_engines");

            entity.HasOne(e => e.ShipData)
                .WithMany(s => s.AuxiliaryEngines)
                .HasForeignKey(e => e.ShipDataId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.ShipDataId)
                .HasDatabaseName("idx_ship_ae_ship_data");
        });

        modelBuilder.Entity<ShipPropeller>(entity =>
        {
            entity.ToTable("ship_propellers");

            entity.HasOne(e => e.ShipData)
                .WithMany(s => s.Propellers)
                .HasForeignKey(e => e.ShipDataId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.ShipDataId)
                .HasDatabaseName("idx_ship_prop_ship_data");
        });

        modelBuilder.Entity<ShipBowthruster>(entity =>
        {
            entity.ToTable("ship_bowthrusters");

            entity.HasOne(e => e.ShipData)
                .WithMany(s => s.Bowthrusters)
                .HasForeignKey(e => e.ShipDataId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.ShipDataId)
                .HasDatabaseName("idx_ship_bt_ship_data");
        });

        modelBuilder.Entity<ShipSternthruster>(entity =>
        {
            entity.ToTable("ship_sternthrusters");

            entity.HasOne(e => e.ShipData)
                .WithMany(s => s.Sternthrusters)
                .HasForeignKey(e => e.ShipDataId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.ShipDataId)
                .HasDatabaseName("idx_ship_st_ship_data");
        });

        modelBuilder.Entity<ShipRudder>(entity =>
        {
            entity.ToTable("ship_rudders");

            entity.HasOne(e => e.ShipData)
                .WithMany(s => s.Rudders)
                .HasForeignKey(e => e.ShipDataId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.ShipDataId)
                .HasDatabaseName("idx_ship_rud_ship_data");
        });

        modelBuilder.Entity<ShipShaftGenerator>(entity =>
        {
            entity.ToTable("ship_shaft_generators");

            entity.HasOne(e => e.ShipData)
                .WithMany(s => s.ShaftGenerators)
                .HasForeignKey(e => e.ShipDataId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.ShipDataId)
                .HasDatabaseName("idx_ship_sg_ship_data");
        });

        modelBuilder.Entity<ShipBoiler>(entity =>
        {
            entity.ToTable("ship_boilers");

            entity.HasOne(e => e.ShipData)
                .WithMany(s => s.Boilers)
                .HasForeignKey(e => e.ShipDataId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.ShipDataId)
                .HasDatabaseName("idx_ship_boil_ship_data");
        });

        modelBuilder.Entity<ShipLoadLine>(entity =>
        {
            entity.ToTable("ship_load_lines");

            entity.HasOne(e => e.ShipData)
                .WithMany(s => s.LoadLines)
                .HasForeignKey(e => e.ShipDataId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.ShipDataId)
                .HasDatabaseName("idx_ship_ll_ship_data");
        });

        modelBuilder.Entity<ShipPilotCardData>(entity =>
        {
            entity.ToTable("ship_pilot_card_data");

            entity.HasOne(e => e.ShipData)
                .WithMany(s => s.PilotCardData)
                .HasForeignKey(e => e.ShipDataId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(e => e.ShipDataId)
                .HasDatabaseName("idx_ship_pcd_ship_data");
        });

        // ========== SYNC QUEUE ==========
        modelBuilder.Entity<SyncQueue>(entity =>
        {
            entity.ToTable("sync_queue");

            entity.HasIndex(e => new { e.Priority, e.NextRetryAt })
                .HasDatabaseName("idx_sync_priority_retry")
                .HasFilter("synced_at IS NULL");
            
            entity.HasIndex(e => e.TableName)
                .HasDatabaseName("idx_sync_table");
            
            entity.HasIndex(e => e.SyncedAt)
                .HasDatabaseName("idx_sync_synced_at");
            
            // FIXME: SyncQueue.RecordId property does not exist - commented out
            // entity.HasIndex(e => new { e.TableName, e.RecordId })
            //     .HasDatabaseName("idx_sync_table_record");
        });

        // Vessel Provisioning v3 — Managed Mode profile (only 1 row may be active at a time)
        modelBuilder.Entity<EdgeProvisioningProfile>(entity =>
        {
            entity.ToTable("edge_provisioning_profile");

            entity.HasIndex(e => e.IsActive)
                .IsUnique()
                .HasFilter("is_active = true")
                .HasDatabaseName("idx_epp_is_active");
        });

        modelBuilder.Entity<SyncFileManifest>(entity =>
        {
            entity.ToTable("sync_file_manifests");

            entity.HasIndex(e => e.Id)
                .IsUnique()
                .HasDatabaseName("idx_sync_file_manifest_id");

            entity.HasIndex(e => new { e.OwnerNodeId, e.TableName, e.RecordKey })
                .HasDatabaseName("idx_sync_file_manifest_owner_record");

            entity.HasIndex(e => new { e.ReceiverNodeId, e.TransferStatus })
                .HasDatabaseName("idx_sync_file_manifest_receiver_status");

            entity.HasIndex(e => e.Sha256)
                .HasDatabaseName("idx_sync_file_manifest_sha256");
        });

        modelBuilder.Entity<SyncFileTransferRequest>(entity =>
        {
            entity.ToTable("sync_file_transfer_requests");

            entity.HasIndex(e => new { e.RequesterNodeId, e.Status })
                .HasDatabaseName("idx_sync_file_request_requester_status");

            entity.HasIndex(e => new { e.SupplierNodeId, e.Status })
                .HasDatabaseName("idx_sync_file_request_supplier_status");

            entity.HasOne(e => e.Manifest)
                .WithMany()
                .HasForeignKey(e => e.ManifestId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SyncFileChunkSession>(entity =>
        {
            entity.ToTable("sync_file_chunk_sessions");

            entity.HasIndex(e => new { e.RequesterNodeId, e.SupplierNodeId, e.Direction, e.Status })
                .HasDatabaseName("idx_sync_file_chunk_session_nodes_status");

            entity.HasIndex(e => new { e.ManifestId, e.Direction, e.Status })
                .HasDatabaseName("idx_sync_file_chunk_session_manifest_status");

            entity.HasIndex(e => e.ExpiresAtUtc)
                .HasDatabaseName("idx_sync_file_chunk_session_expires");

            entity.HasIndex(e => e.ResumeToken)
                .IsUnique()
                .HasDatabaseName("idx_sync_file_chunk_session_resume_token");
        });

        // ========== CERTIFICATES (Master Data) ==========
        modelBuilder.Entity<Certificate>(entity =>
        {
            entity.ToTable("certificates");
            
            entity.HasIndex(e => e.CertificateCode)
                .IsUnique()
                .HasDatabaseName("idx_certificate_code_unique");
            
            entity.HasIndex(e => e.Category)
                .HasDatabaseName("idx_certificate_category");
            
            entity.HasIndex(e => e.IsActive)
                .HasDatabaseName("idx_certificate_active")
                .HasFilter("is_active = true");
        });

        // ========== CREW CERTIFICATES ==========
        modelBuilder.Entity<CrewCertificate>(entity =>
        {
            entity.ToTable("crew_certificates");
            
            entity.HasIndex(e => e.CertificateNumber)
                .IsUnique()
                .HasDatabaseName("idx_crew_cert_number_unique");
            
            entity.HasIndex(e => e.CrewMemberId)
                .HasDatabaseName("idx_crew_cert_crew_id");
            
            entity.HasIndex(e => e.CertificateId)
                .HasDatabaseName("idx_crew_cert_type_id");
            
            entity.HasIndex(e => e.ExpiryDate)
                .HasDatabaseName("idx_crew_cert_expiry");
            
            entity.HasIndex(e => new { e.CrewMemberId, e.ExpiryDate })
                .HasDatabaseName("idx_crew_cert_crew_expiry");
            
            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_crew_cert_status");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_crew_cert_synced")
                .HasFilter("is_synced = false");
            
            // Relationships
            entity.HasOne(e => e.CrewMember)
                .WithMany(e => e.Certificates)
                .HasForeignKey(e => e.CrewMemberId)
                .OnDelete(DeleteBehavior.Cascade);
            
            entity.HasOne(e => e.Certificate)
                .WithMany(e => e.CrewCertificates)
                .HasForeignKey(e => e.CertificateId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ========== COUNTRIES ==========
        modelBuilder.Entity<Country>(entity =>
        {
            entity.ToTable("countries");
            
            entity.HasIndex(e => e.CountryCode)
                .IsUnique()
                .HasDatabaseName("idx_country_code_unique");
            
            entity.HasIndex(e => e.IsActive)
                .HasDatabaseName("idx_country_active")
                .HasFilter("is_active = true");
        });

        // ========== COUNTRY CERTIFICATES ==========
        modelBuilder.Entity<CountryCertificate>(entity =>
        {
            entity.ToTable("country_certificates");
            
            entity.HasIndex(e => new { e.CountryId, e.CertificateId })
                .IsUnique()
                .HasDatabaseName("idx_country_cert_unique");
            
            entity.HasIndex(e => e.CountryId)
                .HasDatabaseName("idx_country_cert_country_id");
            
            entity.HasIndex(e => e.CertificateId)
                .HasDatabaseName("idx_country_cert_certificate_id");
            
            // Relationships
            entity.HasOne(e => e.Country)
                .WithMany(e => e.CountryCertificates)
                .HasForeignKey(e => e.CountryId)
                .OnDelete(DeleteBehavior.Cascade);
            
            entity.HasOne(e => e.Certificate)
                .WithMany(e => e.CountryCertificates)
                .HasForeignKey(e => e.CertificateId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== CREW MEMBERS ==========
        modelBuilder.Entity<CrewMember>(entity =>
        {
            entity.ToTable("crew_members");
            
            entity.HasIndex(e => e.CrewId)
                .IsUnique()
                .HasDatabaseName("idx_crew_id_unique");
            
            entity.HasIndex(e => e.IsOnboard)
                .HasDatabaseName("idx_crew_onboard")
                .HasFilter("is_onboard = true");
            
            entity.HasIndex(e => e.RankId)
                .HasDatabaseName("idx_crew_rank_id");

            entity.HasIndex(e => e.CountryId)
                .HasDatabaseName("idx_crew_country_id");
            
            entity.HasOne(e => e.Country)
                .WithMany()
                .HasForeignKey(e => e.CountryId)
                .OnDelete(DeleteBehavior.SetNull);
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_crew_synced")
                .HasFilter("is_synced = false");

            entity.HasIndex(e => e.OnboardStatus)
                .HasDatabaseName("idx_crew_onboard_status")
                .HasFilter("onboard_status IS NOT NULL");
        });

        // ========== MAINTENANCE TASKS ==========
        modelBuilder.Entity<MaintenanceTask>(entity =>
        {
            entity.ToTable("maintenance_tasks");
            
            entity.Property(e => e.IntervalHours).HasColumnType("decimal(10,2)");
            entity.Property(e => e.RunningHoursAtLastDone).HasColumnType("decimal(10,2)");
            entity.Property(e => e.ActualRunningHours).HasColumnType("decimal(10,2)");
            
            entity.HasIndex(e => e.TaskId)
                .IsUnique()
                .HasDatabaseName("idx_maintenance_task_id_unique");
            
            entity.HasIndex(e => e.EquipmentId)
                .HasDatabaseName("idx_maintenance_equipment");
            
            entity.HasIndex(e => e.NextDueAt)
                .HasDatabaseName("idx_maintenance_next_due");
            
            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_maintenance_status");
            
            entity.HasIndex(e => new { e.Status, e.Priority })
                .HasDatabaseName("idx_maintenance_status_priority")
                .HasFilter("status IN ('SCHEDULED', 'DUE', 'OVERDUE', 'IN_PROGRESS', 'PENDING_APPROVAL', 'RECTIFY')");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_maintenance_synced")
                .HasFilter("is_synced = false");
            
            entity.HasIndex(e => e.AssignedTo)
                .HasDatabaseName("idx_maintenance_assigned_to");
            
            entity.HasIndex(e => e.AssignedDepartment)
                .HasDatabaseName("idx_maintenance_department");
            
            entity.HasIndex(e => e.EquipmentAssetId)
                .HasDatabaseName("idx_maintenance_equipment_asset");
            
            entity.HasIndex(e => e.HasPendingDeferral)
                .HasDatabaseName("idx_maintenance_pending_deferral")
                .HasFilter("has_pending_deferral = true");

            // Index for AssignedTo - frequently used in MyTasks queries
            entity.HasIndex(e => e.AssignedTo)
                .HasDatabaseName("idx_maintenance_assigned_to");

            // Composite index for common query pattern
            entity.HasIndex(e => new { e.AssignedTo, e.Status })
                .HasDatabaseName("idx_maintenance_assigned_status");
            
            // Relationship with DeferralRequests
            entity.HasMany(e => e.DeferralRequests)
                .WithOne(e => e.Task)
                .HasForeignKey(e => e.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
            
            // Relationship with StatusHistory
            entity.HasMany(e => e.StatusHistory)
                .WithOne(e => e.Task)
                .HasForeignKey(e => e.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== TASK DEFERRAL REQUESTS ==========
        modelBuilder.Entity<TaskDeferralRequest>(entity =>
        {
            entity.ToTable("task_deferral_requests");
            
            entity.HasIndex(e => e.TaskId)
                .HasDatabaseName("idx_deferral_task_id");
            
            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_deferral_status");
            
            entity.HasIndex(e => e.RequestedBy)
                .HasDatabaseName("idx_deferral_requested_by");
            
            entity.HasIndex(e => new { e.Status, e.RequestedAt })
                .HasDatabaseName("idx_deferral_pending")
                .HasFilter("status = 'PENDING'");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_deferral_synced")
                .HasFilter("is_synced = false");
        });

        // ========== TASK STATUS HISTORY ==========
        modelBuilder.Entity<TaskRiskAssessment>().HasOne<MaintenanceTask>().WithMany()
            .HasForeignKey(e => e.TaskId).HasPrincipalKey(t => t.TaskId)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TaskInspectionReport>().HasOne<MaintenanceTask>().WithMany()
            .HasForeignKey(e => e.TaskId).HasPrincipalKey(t => t.TaskId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<TaskStatusHistory>(entity =>
        {
            entity.ToTable("task_status_history");
            
            entity.HasIndex(e => e.TaskId)
                .HasDatabaseName("idx_status_history_task_id");
            
            entity.HasIndex(e => e.ChangedAt)
                .HasDatabaseName("idx_status_history_changed_at");
            
            entity.HasIndex(e => new { e.TaskId, e.ChangedAt })
                .HasDatabaseName("idx_status_history_task_time");
        });

        // ========== MAINTENANCE TASK DETAILS (N-N junction table) ==========
        modelBuilder.Entity<MaintenanceTaskDetail>(entity =>
        {
            entity.ToTable("maintenance_task_details");

            entity.Property(e => e.MeasuredValue).HasColumnType("decimal(10,3)");

            entity.HasIndex(e => e.MaintenanceTaskId)
                .HasDatabaseName("idx_mtd_maintenance_task_id");

            entity.HasIndex(e => new { e.MaintenanceTaskId, e.TaskDetailId })
                .IsUnique()
                .HasDatabaseName("idx_mtd_task_detail_unique");

            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_mtd_status");

            entity.HasIndex(e => e.IsCompleted)
                .HasDatabaseName("idx_mtd_completed")
                .HasFilter("is_completed = false");

            // Foreign key to MaintenanceTask
            entity.HasOne<MaintenanceTask>()
                .WithMany()
                .HasForeignKey(e => e.MaintenanceTaskId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== TASK CHECKLIST ITEMS ==========
        modelBuilder.Entity<TaskChecklistItem>(entity =>
        {
            entity.ToTable("task_checklist_items");

            // Configure TaskId relationship to MaintenanceTask.TaskId (string)
            entity.HasOne(e => e.Task)
                .WithMany(t => t.ChecklistItems)
                .HasForeignKey(e => e.TaskId)
                .HasPrincipalKey(t => t.TaskId)
                .OnDelete(DeleteBehavior.Cascade);

            // Configure AssetId relationship to EquipmentAsset
            entity.HasOne(e => e.Asset)
                .WithMany()
                .HasForeignKey(e => e.AssetId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ========== EQUIPMENT GROUPS ==========
        modelBuilder.Entity<EquipmentGroup>(entity =>
        {
            entity.ToTable("equipment_groups");
            
            // Map C# property GroupName to database column name
            entity.Property(e => e.GroupName)
                .HasColumnName("name");

            entity.Property(e => e.IsActive)
                .HasColumnName("is_active");
            
            entity.HasIndex(e => e.GroupCode)
                .IsUnique()
                .HasDatabaseName("uk_equipment_groups_group_code");
        });

        // ========== EQUIPMENT ASSETS ==========
        modelBuilder.Entity<EquipmentAsset>(entity =>
        {
            entity.ToTable("equipment_assets");
            
            // Map C# property AssetName to database column name
            entity.Property(e => e.AssetName)
                .HasColumnName("name");
            
            entity.HasIndex(e => e.AssetCode)
                .IsUnique()
                .HasDatabaseName("uk_equipment_assets_asset_code");

            // Self-referencing hierarchy: parent -> children
            entity.HasOne(e => e.Parent)
                .WithMany(e => e.Children)
                .HasForeignKey(e => e.ParentId)
                .OnDelete(DeleteBehavior.Restrict)
                .IsRequired(false);
        });

        // ========== EQUIPMENT GROUP MEMBERS ==========
        modelBuilder.Entity<EquipmentGroupMember>(entity =>
        {
            entity.ToTable("equipment_group_members");
            entity.HasIndex(e => new { e.GroupId, e.AssetId }).IsUnique()
                .HasDatabaseName("uk_equipment_group_asset");
            
            entity.HasOne(e => e.Group)
                .WithMany()
                .HasForeignKey(e => e.GroupId)
                .OnDelete(DeleteBehavior.Cascade);
            
            entity.HasOne(e => e.Asset)
                .WithMany()
                .HasForeignKey(e => e.AssetId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== VOYAGE LOG ENTRIES ==========
        modelBuilder.Entity<VoyageLogEntry>(entity =>
        {
            entity.ToTable("voyage_log_entries");
            
            entity.Property(e => e.EventType)
                .HasColumnName("event_type");
            
            entity.Property(e => e.EventDateTime)
                .HasColumnName("event_date_time");
            
            entity.Property(e => e.EventDateTimeLocal)
                .HasColumnName("event_date_time_local");
            
            entity.Property(e => e.TimeZone)
                .HasColumnName("time_zone");
            
            entity.Property(e => e.PortName)
                .HasColumnName("port_name");
            
            entity.Property(e => e.PortLocode)
                .HasColumnName("port_locode");
            
            entity.Property(e => e.PortCountry)
                .HasColumnName("port_country");
            
            entity.Property(e => e.BerthNumber)
                .HasColumnName("berth_number");
            
            entity.Property(e => e.DistanceToGo)
                .HasColumnName("distance_to_go");
            
            entity.Property(e => e.DistanceFromLast)
                .HasColumnName("distance_from_last");
            
            entity.Property(e => e.TotalVoyageDistance)
                .HasColumnName("total_voyage_distance");
            
            entity.Property(e => e.CourseOverGround)
                .HasColumnName("course_over_ground");
            
            entity.Property(e => e.SpeedOverGround)
                .HasColumnName("speed_over_ground");
            
            entity.Property(e => e.PilotName)
                .HasColumnName("pilot_name");
            
            entity.Property(e => e.PilotStation)
                .HasColumnName("pilot_station");
            
            entity.Property(e => e.OfficerOnWatch)
                .HasColumnName("officer_on_watch");
            
            entity.Property(e => e.MasterSignature)
                .HasColumnName("master_signature");
            
            entity.Property(e => e.SignedAt)
                .HasColumnName("signed_at");
            
            entity.Property(e => e.VoyageId)
                .HasColumnName("voyage_id");
            
            entity.Property(e => e.IsSynced)
                .HasColumnName("is_synced");
            
            entity.Property(e => e.CreatedAt)
                .HasColumnName("created_at");
            
            entity.Property(e => e.UpdatedAt)
                .HasColumnName("updated_at");
            
            entity.Property(e => e.OriginNode)
                .HasColumnName("origin_node");
            
            // Indexes
            entity.HasIndex(e => e.EventType)
                .HasDatabaseName("idx_voyage_log_event_type");
            
            entity.HasIndex(e => e.EventDateTime)
                .HasDatabaseName("idx_voyage_log_event_datetime");
            
            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_voyage_log_voyage_id");
            
            entity.HasIndex(e => e.PortLocode)
                .HasDatabaseName("idx_voyage_log_port_locode");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_voyage_log_synced");

            entity.HasIndex(e => e.VoyagePlanLegId)
                .HasDatabaseName("idx_voyage_log_leg_id");
        });

        // ========== MAINTENANCE SCHEDULES ==========
        modelBuilder.Entity<MaintenanceSchedule>(entity =>
        {
            entity.ToTable("maintenance_schedules");
            
            entity.Property(e => e.Instructions)
                .HasColumnName("notes");
            
            entity.Property(e => e.LastExecutedAt)
                .HasColumnName("last_maintenance_date");
            
            entity.Property(e => e.LastExecutedRunningHours)
                .HasColumnName("last_running_hours");

            entity.Property(e => e.AutoGenerate)
                .HasColumnName("auto_generate");
            
            // Foreign key to equipment_groups (optional - for group-based schedules)
            entity.HasOne<EquipmentGroup>()
                .WithMany()
                .HasForeignKey(e => e.EquipmentGroupId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.SetNull);
            
            // Foreign key to equipment_assets (optional - for per-equipment schedules)
            entity.HasOne<EquipmentAsset>()
                .WithMany()
                .HasForeignKey(e => e.EquipmentAssetId)
                .IsRequired(false)
                .OnDelete(DeleteBehavior.SetNull);
            
            entity.HasIndex(e => e.EquipmentAssetId)
                .HasDatabaseName("idx_schedule_equipment_asset");
            
            entity.HasIndex(e => e.EquipmentGroupId)
                .HasDatabaseName("idx_schedule_equipment_group");
        });

        // ========== CARGO OPERATIONS ==========
        modelBuilder.Entity<CargoOperation>(entity =>
        {
            entity.ToTable("cargo_operations");
            
            entity.Property(e => e.Quantity).HasColumnType("decimal(15,3)");
            
            entity.HasIndex(e => e.OperationId)
                .IsUnique()
                .HasDatabaseName("idx_cargo_operation_id_unique");
            
            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_cargo_voyage");
            
            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_cargo_status");
            
            entity.HasIndex(e => e.CargoType)
                .HasDatabaseName("idx_cargo_type");
            
            entity.HasIndex(e => e.BillOfLading)
                .HasDatabaseName("idx_cargo_bol");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_cargo_synced")
                .HasFilter("is_synced = false");

            entity.HasIndex(e => e.VoyagePlanLegId)
                .HasDatabaseName("idx_cargo_leg_id");
        });

        // ========== WATCHKEEPING LOGS ==========
        modelBuilder.Entity<WatchkeepingLog>(entity =>
        {
            entity.ToTable("watchkeeping_logs");
            
            entity.Property(e => e.CourseLogged).HasColumnType("decimal(5,2)");
            entity.Property(e => e.SpeedLogged).HasColumnType("decimal(5,2)");
            entity.Property(e => e.PositionLat).HasColumnType("decimal(10,7)");
            entity.Property(e => e.PositionLon).HasColumnType("decimal(10,7)");
            entity.Property(e => e.DistanceRun).HasColumnType("decimal(8,2)");
            
            entity.HasIndex(e => e.WatchDate)
                .HasDatabaseName("idx_watchkeeping_date")
                .IsDescending();
            
            entity.HasIndex(e => new { e.WatchDate, e.WatchPeriod })
                .HasDatabaseName("idx_watchkeeping_date_period");
            
            entity.HasIndex(e => e.WatchType)
                .HasDatabaseName("idx_watchkeeping_type");
            
            entity.HasIndex(e => e.OfficerOnWatch)
                .HasDatabaseName("idx_watchkeeping_officer");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_watchkeeping_synced")
                .HasFilter("is_synced = false");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_watchkeeping_voyage_id");

            entity.HasIndex(e => e.VoyagePlanLegId)
                .HasDatabaseName("idx_watchkeeping_leg_id");
        });

        // ========== OIL RECORD BOOK ==========
        modelBuilder.Entity<OilRecordBook>(entity =>
        {
            entity.ToTable("oil_record_books");
            
            entity.Property(e => e.LocationLat).HasColumnType("decimal(10,7)");
            entity.Property(e => e.LocationLon).HasColumnType("decimal(10,7)");
            entity.Property(e => e.Quantity).HasColumnType("decimal(10,3)");
            
            entity.HasIndex(e => e.EntryDate)
                .HasDatabaseName("idx_orb_entry_date")
                .IsDescending();
            
            entity.HasIndex(e => e.OperationCode)
                .HasDatabaseName("idx_orb_operation_code");
            
            entity.HasIndex(e => e.OfficerInCharge)
                .HasDatabaseName("idx_orb_officer");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_orb_synced")
                .HasFilter("is_synced = false");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_orb_voyage_id");

            entity.HasIndex(e => e.VoyagePlanLegId)
                .HasDatabaseName("idx_orb_leg_id");
        });

        // ========== GARBAGE RECORD BOOK ==========
        modelBuilder.Entity<GarbageRecordBook>(entity =>
        {
            entity.ToTable("garbage_record_books");
            
            // Map OperationCode property to operation_type column in database
            entity.Property(e => e.OperationCode).HasColumnName("operation_type");
            entity.Property(e => e.Description).HasColumnName("garbage_description");
            entity.Property(e => e.Quantity).HasColumnName("estimated_amount");
            entity.Property(e => e.QuantityUnit).HasColumnName("unit_of_measurement");
            entity.Property(e => e.Latitude).HasColumnName("discharge_latitude");
            entity.Property(e => e.Longitude).HasColumnName("discharge_longitude");
            entity.Property(e => e.ReceptionFacility).HasColumnName("reception_facility_name");
            
            // Ignore properties that don't exist in database
            entity.Ignore(e => e.IncinerationStartTime);
            entity.Ignore(e => e.IncinerationEndTime);
            entity.Ignore(e => e.IncineratorDetails);
            entity.Ignore(e => e.AccidentalDischargeReason);
            entity.Ignore(e => e.AccidentalDischargeMeasures);
            
            entity.Property(e => e.Latitude).HasColumnType("decimal(10,7)");
            entity.Property(e => e.Longitude).HasColumnType("decimal(10,7)");
            
            entity.HasIndex(e => e.OperationDateTime)
                .HasDatabaseName("idx_garbage_operation_date")
                .IsDescending();
            
            entity.HasIndex(e => e.GarbageCategory)
                .HasDatabaseName("idx_garbage_category");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_garbage_synced")
                .HasFilter("is_synced = false");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_garbage_voyage_id");

            entity.HasIndex(e => e.VoyagePlanLegId)
                .HasDatabaseName("idx_garbage_leg_id");
        });

        // ========== GARBAGE RECORD PART I ==========
        modelBuilder.Entity<GarbageRecordPartI>(entity =>
        {
            entity.ToTable("garbage_record_part_i");
            
            entity.Property(e => e.DischargeLatitude).HasColumnType("decimal(10,7)");
            entity.Property(e => e.DischargeLongitude).HasColumnType("decimal(10,7)");
            
            entity.HasIndex(e => e.OperationDate)
                .HasDatabaseName("idx_garbage_part_i_date")
                .IsDescending();
            
            entity.HasIndex(e => e.Category)
                .HasDatabaseName("idx_garbage_part_i_category");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_garbage_part_i_synced")
                .HasFilter("is_synced = false");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_garbage_part_i_voyage_id");

            entity.HasIndex(e => e.VoyagePlanLegId)
                .HasDatabaseName("idx_garbage_part_i_leg_id");
        });

        // ========== GARBAGE RECORD PART II ==========
        modelBuilder.Entity<GarbageRecordPartII>(entity =>
        {
            entity.ToTable("garbage_record_part_ii");
            
            entity.Property(e => e.StartLatitude).HasColumnType("decimal(10,7)");
            entity.Property(e => e.StartLongitude).HasColumnType("decimal(10,7)");
            entity.Property(e => e.EndLatitude).HasColumnType("decimal(10,7)");
            entity.Property(e => e.EndLongitude).HasColumnType("decimal(10,7)");
            
            entity.HasIndex(e => e.OperationDate)
                .HasDatabaseName("idx_garbage_part_ii_date")
                .IsDescending();
            
            entity.HasIndex(e => e.Category)
                .HasDatabaseName("idx_garbage_part_ii_category");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_garbage_part_ii_synced")
                .HasFilter("is_synced = false");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_garbage_part_ii_voyage_id");

            entity.HasIndex(e => e.VoyagePlanLegId)
                .HasDatabaseName("idx_garbage_part_ii_leg_id");
        });

        // ========== BALLAST WATER RECORD BOOK ==========
        modelBuilder.Entity<BallastWaterRecordBook>(entity =>
        {
            entity.ToTable("ballast_water_record_books");
            
            entity.Property(e => e.ExchangeVolumePercentage).HasColumnName("exchange_volume_percentage");
            entity.Property(e => e.SalinityBeforeExchange).HasColumnName("salinity_before_exchange");
            entity.Property(e => e.SalinityAfterExchange).HasColumnName("salinity_after_exchange");
            
            entity.Property(e => e.StartLatitude).HasColumnType("decimal(10,7)");
            entity.Property(e => e.StartLongitude).HasColumnType("decimal(10,7)");
            entity.Property(e => e.EndLatitude).HasColumnType("decimal(10,7)");
            entity.Property(e => e.EndLongitude).HasColumnType("decimal(10,7)");
            
            entity.HasIndex(e => e.OperationDateTime)
                .HasDatabaseName("idx_ballast_operation_date")
                .IsDescending();
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_ballast_synced")
                .HasFilter("is_synced = false");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_ballast_voyage_id");

            entity.HasIndex(e => e.VoyagePlanLegId)
                .HasDatabaseName("idx_ballast_leg_id");
        });

        // ========== DECK LOG BOOK ==========
        modelBuilder.Entity<DeckLogBook>(entity =>
        {
            entity.ToTable("deck_log_books");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_deck_log_voyage_id");

            entity.HasIndex(e => e.VoyagePlanLegId)
                .HasDatabaseName("idx_deck_log_leg_id");
        });

        // ========== ENGINE LOG BOOK ==========
        modelBuilder.Entity<EngineLogBook>(entity =>
        {
            entity.ToTable("engine_log_books");
            
            // Fix naming convention for acronyms
            entity.Property(e => e.MainEngineRPM).HasColumnName("main_engine_rpm");
            entity.Property(e => e.FuelOilConsumedME).HasColumnName("fuel_oil_consumed_me");
            entity.Property(e => e.FuelOilConsumedAE).HasColumnName("fuel_oil_consumed_ae");
            entity.Property(e => e.FuelOilROB).HasColumnName("fuel_oil_rob");
            entity.Property(e => e.LubOilROB).HasColumnName("lub_oil_rob");
            entity.Property(e => e.FreshWaterROB).HasColumnName("fresh_water_rob");
            entity.Property(e => e.SludgeROB).HasColumnName("sludge_rob");
            entity.Property(e => e.BilgeWaterROB).HasColumnName("bilge_water_rob");

            // Decimal precision
            entity.Property(e => e.MainEngineRPM).HasColumnType("decimal(6,2)");
            entity.Property(e => e.MainEngineLoad).HasColumnType("decimal(5,2)");
            entity.Property(e => e.FuelOilConsumedME).HasColumnType("decimal(10,3)");
            entity.Property(e => e.FuelOilConsumedAE).HasColumnType("decimal(10,3)");
            entity.Property(e => e.FuelOilConsumedBoiler).HasColumnType("decimal(10,3)");
            entity.Property(e => e.LubeOilConsumed).HasColumnType("decimal(10,3)");
            entity.Property(e => e.FreshWaterConsumed).HasColumnType("decimal(10,3)");
            entity.Property(e => e.FuelOilROB).HasColumnType("decimal(10,3)");
            entity.Property(e => e.LubOilROB).HasColumnType("decimal(10,3)");
            entity.Property(e => e.FreshWaterROB).HasColumnType("decimal(10,3)");
            entity.Property(e => e.SludgeROB).HasColumnType("decimal(10,3)");
            entity.Property(e => e.BilgeWaterROB).HasColumnType("decimal(10,3)");
            
            entity.HasIndex(e => e.LogDateTime)
                .HasDatabaseName("idx_engine_log_date")
                .IsDescending();
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_engine_log_synced")
                .HasFilter("is_synced = false");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_engine_log_voyage_id");

            entity.HasIndex(e => e.VoyagePlanLegId)
                .HasDatabaseName("idx_engine_log_leg_id");
        });

        // ========== MATERIAL CATEGORIES ==========
        modelBuilder.Entity<MaterialCategory>(entity =>
        {
            entity.ToTable("material_categories");

            entity.HasIndex(e => e.CategoryCode)
                .IsUnique()
                .HasDatabaseName("idx_material_category_code_unique");

            entity.HasIndex(e => e.ParentCategoryId)
                .HasDatabaseName("idx_material_category_parent");

            entity.HasIndex(e => e.IsActive)
                .HasDatabaseName("idx_material_category_active")
                .HasFilter("is_active = true");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_material_category_synced")
                .HasFilter("is_synced = false");

            // Self reference
            entity.HasOne<MaterialCategory>()
                .WithMany()
                .HasForeignKey(e => e.ParentCategoryId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ========== MATERIAL CATALOG (material_items) ==========
        // DANH MỤC vật tư dùng chung (đồng bộ từ Shore). Khớp schema shore catalog.
        modelBuilder.Entity<MaterialCatalogItem>(entity =>
        {
            entity.ToTable("material_items");

            entity.Property(e => e.UnitPrice).HasColumnType("decimal(18,4)");

            entity.HasIndex(e => e.ItemCode)
                .IsUnique()
                .HasDatabaseName("idx_material_catalog_code_unique");

            entity.HasIndex(e => e.CategoryId)
                .HasDatabaseName("idx_material_catalog_category");

            entity.HasIndex(e => e.IsActive)
                .HasDatabaseName("idx_material_catalog_active")
                .HasFilter("is_active = true");

            // CategoryId is retained only for historical data; definitions no longer require a category.
        });

        // ========== MATERIAL ITEM SHIP (material_item_ship) ==========
        // Vật tư theo tàu — bảng cũ material_items đổi tên. Class vẫn là MaterialItem.
        modelBuilder.Entity<MaterialItem>(entity =>
        {
            entity.ToTable("material_item_ship");

            entity.Property(e => e.OnHandQuantity).HasColumnType("decimal(14,3)");
            entity.Property(e => e.MinStock).HasColumnType("decimal(14,3)");
            entity.Property(e => e.MaxStock).HasColumnType("decimal(14,3)");
            entity.Property(e => e.ReorderLevel).HasColumnType("decimal(14,3)");
            entity.Property(e => e.ReorderQuantity).HasColumnType("decimal(14,3)");
            entity.Property(e => e.UnitCost).HasColumnType("decimal(18,2)");

            entity.HasIndex(e => e.ItemCode)
                .IsUnique()
                .HasDatabaseName("idx_material_item_ship_code_unique");

            entity.HasIndex(e => e.MaterialItemCode)
                .HasDatabaseName("idx_material_item_ship_catalog_code");

            entity.HasIndex(e => e.CategoryId)
                .HasDatabaseName("idx_material_item_ship_category");

            entity.HasIndex(e => e.Barcode)
                .HasDatabaseName("idx_material_item_ship_barcode");

            entity.HasIndex(e => e.IsActive)
                .HasDatabaseName("idx_material_item_ship_active")
                .HasFilter("is_active = true");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_material_item_ship_synced")
                .HasFilter("is_synced = false");

            // CategoryId is retained only for historical data; definitions no longer require a category.

            // FK trỏ danh mục qua mã vật tư (ItemCode là alternate key của material_items).
            entity.HasOne<MaterialCatalogItem>()
                .WithMany()
                .HasForeignKey(e => e.MaterialItemCode)
                .HasPrincipalKey(c => c.ItemCode)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // ========== STORE LOCATIONS ==========
        modelBuilder.Entity<StoreLocation>(entity =>
        {
            entity.ToTable("store_locations");

            entity.HasIndex(e => e.LocationCode)
                .IsUnique()
                .HasDatabaseName("uk_store_locations_code");

            entity.HasIndex(e => e.IsActive)
                .HasDatabaseName("idx_store_location_active")
                .HasFilter("is_active = true");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_store_location_synced")
                .HasFilter("is_synced = false");

            // Self-referencing hierarchy: parent -> children
            entity.HasOne(e => e.Parent)
                .WithMany(e => e.Children)
                .HasForeignKey(e => e.ParentId)
                .OnDelete(DeleteBehavior.Restrict)
                .IsRequired(false);
        });

        // ========== MATERIAL RECEIPT ITEMS ==========
        // Config đã có trong migration, không cần config lại ở đây

        // ========== MATERIAL REQUESTS ==========
        modelBuilder.Entity<MaterialRequest>(entity =>
        {
            entity.ToTable("material_requests");

            entity.HasIndex(e => e.RequestCode)
                .IsUnique()
                .HasDatabaseName("uk_material_request_code");

            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_material_request_status");
        });

        modelBuilder.Entity<MaterialRequestItem>(entity =>
        {
            entity.ToTable("material_request_items");

            entity.HasOne(e => e.Request)
                .WithMany(e => e.Items)
                .HasForeignKey(e => e.RequestId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.Property(e => e.QuantityOnHand).HasColumnType("decimal(14,3)");
            entity.Property(e => e.QuantityRequested).HasColumnType("decimal(14,3)");

            // Yêu cầu theo loại → trỏ DANH MỤC material_items (nullable, freeform).
            entity.HasOne<MaterialCatalogItem>()
                .WithMany()
                .HasForeignKey(e => e.MaterialItemId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // Relink sang DANH MỤC: định mức phụ tùng + liên kết vật tư-thiết bị.
        modelBuilder.Entity<ScheduleSparePart>(entity =>
        {
            entity.HasOne<MaterialCatalogItem>()
                .WithMany()
                .HasForeignKey(e => e.MaterialItemId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<MaterialItemEquipment>(entity =>
        {
            entity.HasIndex(e => new { e.MaterialItemId, e.EquipmentAssetId }).IsUnique()
                .HasDatabaseName("uk_material_equipment");
            entity.HasOne<EquipmentAsset>().WithMany()
                .HasForeignKey(e => e.EquipmentAssetId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<MaterialCatalogItem>()
                .WithMany()
                .HasForeignKey(e => e.MaterialItemId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ========== STOCK RECEIPTS ==========
        modelBuilder.Entity<StockReceipt>(entity =>
        {
            entity.ToTable("stock_receipts");

            entity.HasIndex(e => e.ReceiptCode)
                .IsUnique()
                .HasDatabaseName("uk_stock_receipt_code");

            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_stock_receipt_status");

            entity.HasOne(e => e.MaterialRequest)
                .WithMany()
                .HasForeignKey(e => e.MaterialRequestId)
                .OnDelete(DeleteBehavior.SetNull)
                .IsRequired(false);
        });

        modelBuilder.Entity<StockReceiptItem>(entity =>
        {
            entity.ToTable("stock_receipt_items");
            entity.HasOne<StoreLocation>().WithMany()
                .HasForeignKey(e => e.StoreLocationId).OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Receipt)
                .WithMany(e => e.Items)
                .HasForeignKey(e => e.ReceiptId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.Property(e => e.QuantityRequested).HasColumnType("decimal(14,3)");
            entity.Property(e => e.QuantityReceived).HasColumnType("decimal(14,3)");
            entity.Property(e => e.UnitCost).HasColumnType("decimal(18,2)");
        });

        // ========== INVENTORY STOCK ==========
        modelBuilder.Entity<InventoryStock>(entity =>
        {
            entity.ToTable("inventory_stock", t =>
            {
                t.HasCheckConstraint("ck_inventory_quantity_nonnegative", "quantity >= 0");
                t.HasCheckConstraint("ck_inventory_unit_cost_nonnegative", "unit_cost >= 0");
            });
            entity.HasOne<MaterialItem>().WithMany()
                .HasForeignKey(e => e.MaterialItemId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<StoreLocation>().WithMany()
                .HasForeignKey(e => e.StoreLocationId).OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.MaterialItemId, e.StoreLocationId })
                .IsUnique()
                .HasDatabaseName("uk_inventory_material_location");

            entity.Property(e => e.Quantity).HasColumnType("decimal(14,3)");
            entity.Property(e => e.UnitCost).HasColumnType("decimal(18,2)");
        });

        // ========== FUEL ANALYTICS SUMMARY ==========
        modelBuilder.Entity<FuelAnalyticsSummary>(entity =>
        {
            entity.ToTable("fuel_analytics_summaries");
            
            entity.Property(e => e.DistanceNauticalMiles).HasColumnType("decimal(12,2)");
            entity.Property(e => e.TimeUnderwayHours).HasColumnType("decimal(10,2)");
            entity.Property(e => e.TimeBerthHours).HasColumnType("decimal(10,2)");
            entity.Property(e => e.AverageSpeedKnots).HasColumnType("decimal(5,2)");
            
            entity.Property(e => e.TotalFuelConsumedMT).HasColumnType("decimal(10,3)");
            entity.Property(e => e.MainEngineFuelMT).HasColumnType("decimal(10,3)");
            entity.Property(e => e.AuxiliaryFuelMT).HasColumnType("decimal(10,3)");
            entity.Property(e => e.BoilerFuelMT).HasColumnType("decimal(10,3)");
            
            entity.Property(e => e.EEOI).HasColumnType("decimal(10,2)");
            entity.Property(e => e.FuelPerNauticalMile).HasColumnType("decimal(8,4)");
            entity.Property(e => e.FuelPerHour).HasColumnType("decimal(8,4)");
            entity.Property(e => e.SFOC).HasColumnType("decimal(8,2)");
            
            entity.Property(e => e.CO2EmissionsMT).HasColumnType("decimal(12,3)");
            entity.Property(e => e.CII).HasColumnType("decimal(10,2)");
            
            entity.Property(e => e.AvgMainEngineRPM).HasColumnType("decimal(6,2)");
            entity.Property(e => e.AvgMainEngineLoad).HasColumnType("decimal(5,2)");
            entity.Property(e => e.AvgSeaState).HasColumnType("decimal(3,1)");
            entity.Property(e => e.AvgWindSpeed).HasColumnType("decimal(5,2)");
            entity.Property(e => e.CargoWeightMT).HasColumnType("decimal(12,3)");
            
            entity.Property(e => e.EstimatedFuelCostUSD).HasColumnType("decimal(15,2)");
            entity.Property(e => e.FuelPricePerMT).HasColumnType("decimal(10,2)");
            entity.Property(e => e.DataQualityScore).HasColumnType("decimal(5,2)");
            
            entity.HasIndex(e => new { e.PeriodType, e.PeriodStart })
                .HasDatabaseName("idx_fuel_analytics_period")
                .IsDescending(false, true);
            
            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_fuel_analytics_voyage");
            
            entity.HasIndex(e => e.CIIRating)
                .HasDatabaseName("idx_fuel_analytics_cii");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_fuel_analytics_synced")
                .HasFilter("is_synced = false");
        });

        // ========== FUEL EFFICIENCY ALERTS ==========
        modelBuilder.Entity<FuelEfficiencyAlert>(entity =>
        {
            entity.ToTable("fuel_efficiency_alerts");
            
            entity.Property(e => e.CurrentValue).HasColumnType("decimal(10,3)");
            entity.Property(e => e.ExpectedValue).HasColumnType("decimal(10,3)");
            entity.Property(e => e.DeviationPercent).HasColumnType("decimal(6,2)");
            
            entity.HasIndex(e => e.Timestamp)
                .HasDatabaseName("idx_fuel_alert_timestamp")
                .IsDescending();
            
            entity.HasIndex(e => new { e.IsResolved, e.Severity })
                .HasDatabaseName("idx_fuel_alert_unresolved")
                .HasFilter("is_resolved = false");
            
            entity.HasIndex(e => e.AlertType)
                .HasDatabaseName("idx_fuel_alert_type");
            
            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_fuel_alert_synced")
                .HasFilter("is_synced = false");
        });

        // ========== ROLES ==========
        modelBuilder.Entity<Role>(entity =>
        {
            entity.ToTable("roles");

            entity.HasIndex(e => e.RoleCode)
                .IsUnique()
                .HasDatabaseName("idx_role_code_unique");

            entity.HasIndex(e => e.IsActive)
                .HasDatabaseName("idx_role_active")
                .HasFilter("is_active = true");
        });

        // ========== USERS ==========
        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");

            entity.HasIndex(e => e.Username)
                .IsUnique()
                .HasDatabaseName("idx_user_username_unique");

            entity.HasIndex(e => e.CrewId)
                .HasDatabaseName("idx_user_crew_id");

            entity.HasIndex(e => e.RoleId)
                .HasDatabaseName("idx_user_role_id");

            entity.HasIndex(e => e.IsActive)
                .HasDatabaseName("idx_user_active")
                .HasFilter("is_active = true");

            // Foreign key relationship with Role
            entity.HasOne(u => u.Role)
                .WithMany()
                .HasForeignKey(e => e.RoleId)
                .OnDelete(DeleteBehavior.Restrict);

            // Foreign key relationship with CrewMember (optional)
            entity.HasOne<CrewMember>()
                .WithMany()
                .HasForeignKey(e => e.CrewId)
                .HasPrincipalKey(c => c.CrewId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ========== USER SESSIONS (ISPS/ISM Compliant) ==========
        modelBuilder.Entity<UserSession>(entity =>
        {
            entity.ToTable("user_sessions");

            entity.HasIndex(e => e.AccessToken)
                .IsUnique()
                .HasDatabaseName("idx_session_access_token");

            entity.HasIndex(e => e.RefreshToken)
                .IsUnique()
                .HasDatabaseName("idx_session_refresh_token");

            entity.HasIndex(e => e.UserId)
                .HasDatabaseName("idx_session_user_id");

            entity.HasIndex(e => e.IsActive)
                .HasDatabaseName("idx_session_active")
                .HasFilter("is_active = true");

            entity.HasIndex(e => new { e.IsActive, e.AccessTokenExpiresAt })
                .HasDatabaseName("idx_session_active_expiry");

            entity.HasIndex(e => e.LoginAt)
                .HasDatabaseName("idx_session_login_at")
                .IsDescending();

            // FK to User
            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== SYSTEM LOG (ISM Code / IMO MSC.428) ==========
        modelBuilder.Entity<SystemLog>(entity =>
        {
            entity.ToTable("system_logs");

            entity.HasIndex(e => e.Timestamp)
                .HasDatabaseName("idx_syslog_timestamp")
                .IsDescending();

            entity.HasIndex(e => e.Category)
                .HasDatabaseName("idx_syslog_category");

            entity.HasIndex(e => e.Action)
                .HasDatabaseName("idx_syslog_action");

            entity.HasIndex(e => e.Level)
                .HasDatabaseName("idx_syslog_level");

            entity.HasIndex(e => e.UserId)
                .HasDatabaseName("idx_syslog_user_id");

            entity.HasIndex(e => new { e.Category, e.Timestamp })
                .HasDatabaseName("idx_syslog_category_timestamp");

            entity.HasIndex(e => new { e.UserId, e.Category, e.Timestamp })
                .HasDatabaseName("idx_syslog_user_category_time");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_syslog_synced")
                .HasFilter("is_synced = false");

            entity.HasIndex(e => e.SessionId)
                .HasDatabaseName("idx_syslog_session_id");
        });

        // ========== LOGIN ATTEMPTS (Brute Force Protection) ==========
        modelBuilder.Entity<LoginAttempt>(entity =>
        {
            entity.ToTable("login_attempts");

            entity.HasIndex(e => e.Username)
                .HasDatabaseName("idx_login_attempt_username");

            entity.HasIndex(e => e.AttemptedAt)
                .HasDatabaseName("idx_login_attempt_time")
                .IsDescending();

            entity.HasIndex(e => new { e.Username, e.AttemptedAt })
                .HasDatabaseName("idx_login_attempt_user_time");

            entity.HasIndex(e => e.IpAddress)
                .HasDatabaseName("idx_login_attempt_ip");
        });

        // ========== MARITIME REPORTING SYSTEM ==========

        // ========== REPORT TYPES ==========
        modelBuilder.Entity<ReportType>(entity =>
        {
            entity.ToTable("report_types");

            entity.HasIndex(e => e.TypeCode)
                .IsUnique()
                .HasDatabaseName("idx_report_type_code_unique");

            entity.HasIndex(e => e.Category)
                .HasDatabaseName("idx_report_type_category");

            entity.HasIndex(e => e.IsMandatory)
                .HasDatabaseName("idx_report_type_mandatory")
                .HasFilter("is_mandatory = true");

            entity.HasIndex(e => e.IsActive)
                .HasDatabaseName("idx_report_type_active")
                .HasFilter("is_active = true");
        });

        // ========== MARITIME REPORTS (Polymorphic Parent) ==========
        modelBuilder.Entity<MaritimeReport>(entity =>
        {
            entity.ToTable("maritime_reports");

            entity.HasIndex(e => e.ReportNumber)
                .IsUnique()
                .HasDatabaseName("idx_report_number_unique");

            entity.HasIndex(e => e.ReportTypeId)
                .HasDatabaseName("idx_report_type_id");

            entity.HasIndex(e => e.VoyageId)
                .HasDatabaseName("idx_report_voyage_id");

            entity.HasIndex(e => e.ReportDateTime)
                .HasDatabaseName("idx_report_datetime")
                .IsDescending();

            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_report_status");

            entity.HasIndex(e => new { e.Status, e.ReportDateTime })
                .HasDatabaseName("idx_report_status_datetime")
                .HasFilter("status IN ('DRAFT', 'SUBMITTED')");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_report_synced")
                .HasFilter("is_synced = false");

            // Foreign key to ReportType
            entity.HasOne<ReportType>()
                .WithMany()
                .HasForeignKey(e => e.ReportTypeId)
                .OnDelete(DeleteBehavior.Restrict);

            // Foreign key to VoyageRecord (optional)
            entity.HasOne<VoyageRecord>()
                .WithMany()
                .HasForeignKey(e => e.VoyageId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(e => e.VoyagePlanLegId)
                .HasDatabaseName("idx_report_leg_id");
        });

        // ========== NOON REPORTS ==========
        modelBuilder.Entity<NoonReport>(entity =>
        {
            entity.ToTable("noon_reports");

            entity.HasIndex(e => e.MaritimeReportId)
                .HasDatabaseName("idx_noon_report_id")
                .IsUnique();

            entity.HasIndex(e => e.ReportDate)
                .HasDatabaseName("idx_noon_date")
                .IsDescending();

            // FK is defined via [ForeignKey] attribute on the navigation property in the model.
            // Using the fluent API here in addition would create a duplicate shadow FK 'MaritimeReportId1'.
            entity.HasOne(e => e.MaritimeReport)
                .WithOne()
                .HasForeignKey<NoonReport>(e => e.MaritimeReportId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== DEPARTURE REPORTS ==========
        modelBuilder.Entity<DepartureReport>(entity =>
        {
            entity.ToTable("departure_reports");

            entity.HasIndex(e => e.MaritimeReportId)
                .HasDatabaseName("idx_departure_report_id");

            entity.HasIndex(e => e.PortName)
                .HasDatabaseName("idx_departure_port");

            entity.HasIndex(e => e.DepartureDateTime)
                .HasDatabaseName("idx_departure_datetime")
                .IsDescending();

            // FK via navigation property - use HasOne(nav) to avoid duplicate shadow FK
            entity.HasOne(e => e.MaritimeReport)
                .WithOne()
                .HasForeignKey<DepartureReport>(e => e.MaritimeReportId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== ARRIVAL REPORTS ==========
        modelBuilder.Entity<ArrivalReport>(entity =>
        {
            entity.ToTable("arrival_reports");

            entity.HasIndex(e => e.MaritimeReportId)
                .HasDatabaseName("idx_arrival_report_id");

            entity.HasIndex(e => e.PortName)
                .HasDatabaseName("idx_arrival_port");

            entity.HasIndex(e => e.ArrivalDateTime)
                .HasDatabaseName("idx_arrival_datetime")
                .IsDescending();

            // FK via navigation property - use HasOne(nav) to avoid duplicate shadow FK
            entity.HasOne(e => e.MaritimeReport)
                .WithOne()
                .HasForeignKey<ArrivalReport>(e => e.MaritimeReportId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== BUNKER REPORTS ==========
        modelBuilder.Entity<BunkerReport>(entity =>
        {
            entity.ToTable("bunker_reports");

            entity.HasIndex(e => e.MaritimeReportId)
                .HasDatabaseName("idx_bunker_report_id");

            entity.HasIndex(e => e.PortName)
                .HasDatabaseName("idx_bunker_port");

            entity.HasIndex(e => e.BunkerDate)
                .HasDatabaseName("idx_bunker_date")
                .IsDescending();

            // FK via navigation property - use HasOne(nav) to avoid duplicate shadow FK
            entity.HasOne(e => e.MaritimeReport)
                .WithOne()
                .HasForeignKey<BunkerReport>(e => e.MaritimeReportId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== POSITION REPORTS ==========
        modelBuilder.Entity<PositionReport>(entity =>
        {
            entity.ToTable("position_reports");

            entity.HasIndex(e => e.MaritimeReportId)
                .HasDatabaseName("idx_position_report_id");

            entity.HasIndex(e => e.ReportDateTime)
                .HasDatabaseName("idx_position_report_datetime")
                .IsDescending();

            // FK via navigation property - use HasOne(nav) to avoid duplicate shadow FK
            entity.HasOne(e => e.MaritimeReport)
                .WithOne()
                .HasForeignKey<PositionReport>(e => e.MaritimeReportId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== REPORT ATTACHMENTS ==========
        modelBuilder.Entity<ReportAttachment>(entity =>
        {
            entity.ToTable("report_attachments");

            entity.HasIndex(e => e.MaritimeReportId)
                .HasDatabaseName("idx_attachment_report_id");

            entity.HasIndex(e => e.IsSynced)
                .HasDatabaseName("idx_attachment_synced")
                .HasFilter("is_synced = false");

            // Foreign key to MaritimeReport
            entity.HasOne<MaritimeReport>()
                .WithMany()
                .HasForeignKey(e => e.MaritimeReportId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== REPORT DISTRIBUTION (N-N Junction Table) ==========
        modelBuilder.Entity<ReportDistribution>(entity =>
        {
            entity.ToTable("report_distributions");

            entity.HasIndex(e => e.ReportTypeId)
                .HasDatabaseName("idx_distribution_report_type");

            entity.HasIndex(e => e.RecipientType)
                .HasDatabaseName("idx_distribution_recipient_type");

            entity.HasIndex(e => e.IsActive)
                .HasDatabaseName("idx_distribution_active")
                .HasFilter("is_active = true");

            // Foreign key to ReportType
            entity.HasOne<ReportType>()
                .WithMany()
                .HasForeignKey(e => e.ReportTypeId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== REPORT TRANSMISSION LOG ==========
        modelBuilder.Entity<ReportTransmissionLog>(entity =>
        {
            entity.ToTable("report_transmission_logs");

            entity.HasIndex(e => e.MaritimeReportId)
                .HasDatabaseName("idx_transmission_report_id");

            entity.HasIndex(e => e.TransmissionDateTime)
                .HasDatabaseName("idx_transmission_datetime")
                .IsDescending();

            entity.HasIndex(e => e.Status)
                .HasDatabaseName("idx_transmission_status");

            entity.HasIndex(e => new { e.Status, e.RetryCount })
                .HasDatabaseName("idx_transmission_failed_retry")
                .HasFilter("status = 'FAILED'");

            // Foreign key to MaritimeReport
            entity.HasOne<MaritimeReport>()
                .WithMany()
                .HasForeignKey(e => e.MaritimeReportId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ========== RANKS SEED DATA ==========
        var rankSeedTimestamp = new DateTime(2026, 7, 28, 9, 34, 37, 607, DateTimeKind.Utc);
        modelBuilder.Entity<Rank>().HasData(
            new Rank { Id = 1, RankCode = "MAST", RankName = "Master (Captain)", IsActive = true, CreatedAt = rankSeedTimestamp.AddTicks(3117), UpdatedAt = rankSeedTimestamp.AddTicks(3121) },
            new Rank { Id = 2, RankCode = "C/O", RankName = "Chief Officer", IsActive = true, CreatedAt = rankSeedTimestamp.AddTicks(3126), UpdatedAt = rankSeedTimestamp.AddTicks(3127) },
            new Rank { Id = 3, RankCode = "2/O", RankName = "Second Officer", IsActive = true, CreatedAt = rankSeedTimestamp.AddTicks(3128), UpdatedAt = rankSeedTimestamp.AddTicks(3128) },
            new Rank { Id = 4, RankCode = "3/O", RankName = "Third Officer", IsActive = true, CreatedAt = rankSeedTimestamp.AddTicks(3129), UpdatedAt = rankSeedTimestamp.AddTicks(3129) },
            new Rank { Id = 5, RankCode = "C/E", RankName = "Chief Engineer", IsActive = true, CreatedAt = rankSeedTimestamp.AddTicks(3130), UpdatedAt = rankSeedTimestamp.AddTicks(3130) },
            new Rank { Id = 6, RankCode = "2/E", RankName = "Second Engineer", IsActive = true, CreatedAt = rankSeedTimestamp.AddTicks(3131), UpdatedAt = rankSeedTimestamp.AddTicks(3132) },
            new Rank { Id = 7, RankCode = "BOSN", RankName = "Bosun", IsActive = true, CreatedAt = rankSeedTimestamp.AddTicks(3133), UpdatedAt = rankSeedTimestamp.AddTicks(3134) },
            new Rank { Id = 8, RankCode = "AB", RankName = "Able Seaman", IsActive = true, CreatedAt = rankSeedTimestamp.AddTicks(3134), UpdatedAt = rankSeedTimestamp.AddTicks(3135) },
            new Rank { Id = 9, RankCode = "OILR", RankName = "Oiler", IsActive = true, CreatedAt = rankSeedTimestamp.AddTicks(3135), UpdatedAt = rankSeedTimestamp.AddTicks(3136) },
            new Rank { Id = 10, RankCode = "COOK", RankName = "Chief Cook", IsActive = true, CreatedAt = rankSeedTimestamp.AddTicks(3136), UpdatedAt = rankSeedTimestamp.AddTicks(3137) }
        );

        // ===================================================================
        // Configure Drill Training Management (SOLAS/ISPS Compliance)
        // ===================================================================

        // Configure DrillType
        modelBuilder.Entity<DrillType>(entity =>
        {
            entity.HasIndex(dt => dt.DrillCode).IsUnique();
            entity.HasIndex(dt => new { dt.Category, dt.DisplayOrder });
            entity.HasIndex(dt => dt.IsActive);
            entity.HasIndex(dt => dt.FrequencyType);
        });

        // Configure DrillSchedule
        modelBuilder.Entity<DrillSchedule>(entity =>
        {
            entity.HasOne(ds => ds.DrillType)
                .WithMany(dt => dt.Schedules)
                .HasForeignKey(ds => ds.DrillTypeId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(ds => ds.AssignedToCrew)
                .WithMany()
                .HasForeignKey(ds => ds.AssignedToCrewId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(ds => ds.DueDate);
            entity.HasIndex(ds => ds.Status);
            entity.HasIndex(ds => new { ds.ScheduledYear, ds.ScheduledMonth });
            entity.HasIndex(ds => ds.ScheduleCode).IsUnique();
            entity.HasIndex(ds => ds.VesselId);
        });

        // Configure DrillLog
        modelBuilder.Entity<DrillLog>(entity =>
        {
            entity.HasOne(dl => dl.DrillSchedule)
                .WithMany(ds => ds.Logs)
                .HasForeignKey(dl => dl.DrillScheduleId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(dl => dl.DrillType)
                .WithMany(dt => dt.Logs)
                .HasForeignKey(dl => dl.DrillTypeId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(dl => dl.ConductedBy)
                .WithMany()
                .HasForeignKey(dl => dl.ConductedByCrewId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(dl => dl.VerifiedBy)
                .WithMany()
                .HasForeignKey(dl => dl.VerifiedByCrewId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasIndex(dl => dl.ExecutionDate);
            entity.HasIndex(dl => dl.DrillTypeId);
            entity.HasIndex(dl => dl.LogCode).IsUnique();
            entity.HasIndex(dl => dl.IsLocked);

            entity.HasIndex(dl => dl.VoyageId)
                .HasDatabaseName("idx_drill_log_voyage_id");

            entity.HasIndex(dl => dl.VoyagePlanLegId)
                .HasDatabaseName("idx_drill_log_leg_id");
        });
    }

    /// <summary>
    /// Initialize database with migrations
    /// </summary>
    public async Task InitializeDatabaseAsync()
    {
        // Use migrations instead of EnsureCreated for production
        await Database.MigrateAsync();
    }

    /// <summary>
    /// Cleanup old data based on retention policy — uses ExecuteDeleteAsync for efficiency
    /// </summary>
    public async Task CleanupOldDataAsync(Dictionary<string, int> retentionDays)
    {
        var cutoffDates = retentionDays.ToDictionary(
            kvp => kvp.Key,
            kvp => DateTime.UtcNow.AddDays(-kvp.Value)
        );

        // Position Data
        if (cutoffDates.TryGetValue("PositionData", out var positionCutoff))
        {
            await PositionData
                .Where(p => p.Timestamp < positionCutoff && p.IsSynced)
                .ExecuteDeleteAsync();
        }

        // AIS Data
        if (cutoffDates.TryGetValue("AisData", out var aisCutoff))
        {
            await AisData
                .Where(a => a.Timestamp < aisCutoff && a.IsSynced)
                .ExecuteDeleteAsync();
        }

        // Engine Data
        if (cutoffDates.TryGetValue("EngineData", out var engineCutoff))
        {
            await EngineData
                .Where(e => e.Timestamp < engineCutoff && e.IsSynced)
                .ExecuteDeleteAsync();
        }

        // Environmental Data
        if (cutoffDates.TryGetValue("EnvironmentalData", out var envCutoff))
        {
            await EnvironmentalData
                .Where(e => e.Timestamp < envCutoff && e.IsSynced)
                .ExecuteDeleteAsync();
        }

        // NMEA Raw Data (keep only recent for debugging)
        var nmeaCutoff = DateTime.UtcNow.AddDays(-1);
        await NmeaRawData
            .Where(n => n.Timestamp < nmeaCutoff && n.IsSynced)
            .ExecuteDeleteAsync();

        // Synced queue items older than 7 days
        var syncQueueCutoff = DateTime.UtcNow.AddDays(-7);
        await SyncQueue
            .Where(s => s.SyncedAt != null && s.SyncedAt < syncQueueCutoff)
            .ExecuteDeleteAsync();
    }

    /// <summary>
    /// Get unsynchronized records count — executes via raw SQL in a single query
    /// </summary>
    public async Task<Dictionary<string, int>> GetUnsyncedCountsAsync()
    {
        var sql = @"
            SELECT 
                (SELECT COUNT(*) FROM position_data WHERE is_synced = false) AS position_data,
                (SELECT COUNT(*) FROM ais_data WHERE is_synced = false) AS ais_data,
                (SELECT COUNT(*) FROM navigation_data WHERE is_synced = false) AS navigation_data,
                (SELECT COUNT(*) FROM engine_data WHERE is_synced = false) AS engine_data,
                (SELECT COUNT(*) FROM generator_data WHERE is_synced = false) AS generator_data,
                (SELECT COUNT(*) FROM tank_levels WHERE is_synced = false) AS tank_levels,
                (SELECT COUNT(*) FROM fuel_consumption WHERE is_synced = false) AS fuel_consumption,
                (SELECT COUNT(*) FROM environmental_data WHERE is_synced = false) AS environmental_data,
                (SELECT COUNT(*) FROM safety_alarms WHERE is_synced = false) AS safety_alarms,
                (SELECT COUNT(*) FROM voyage_records WHERE is_synced = false) AS voyage_records
        ";

        var counts = new Dictionary<string, int>();
        
        using var command = Database.GetDbConnection().CreateCommand();
        command.CommandText = sql;
        
        var wasOpen = command.Connection!.State == System.Data.ConnectionState.Open;
        if (!wasOpen) await command.Connection.OpenAsync();
        
        try
        {
            using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                counts["PositionData"] = reader.GetInt32(reader.GetOrdinal("position_data"));
                counts["AisData"] = reader.GetInt32(reader.GetOrdinal("ais_data"));
                counts["NavigationData"] = reader.GetInt32(reader.GetOrdinal("navigation_data"));
                counts["EngineData"] = reader.GetInt32(reader.GetOrdinal("engine_data"));
                counts["GeneratorData"] = reader.GetInt32(reader.GetOrdinal("generator_data"));
                counts["TankLevels"] = reader.GetInt32(reader.GetOrdinal("tank_levels"));
                counts["FuelConsumption"] = reader.GetInt32(reader.GetOrdinal("fuel_consumption"));
                counts["EnvironmentalData"] = reader.GetInt32(reader.GetOrdinal("environmental_data"));
                counts["SafetyAlarms"] = reader.GetInt32(reader.GetOrdinal("safety_alarms"));
                counts["VoyageRecords"] = reader.GetInt32(reader.GetOrdinal("voyage_records"));
            }
        }
        finally
        {
            if (!wasOpen) await command.Connection.CloseAsync();
        }

        return counts;
    }

    /// <summary>
    /// Convert PascalCase to snake_case
    /// </summary>
    private static string ToSnakeCase(string input)
    {
        if (string.IsNullOrEmpty(input)) return input;
        
        return string.Concat(
            input.Select((c, i) => i > 0 && char.IsUpper(c) 
                ? "_" + char.ToLower(c).ToString() 
                : char.ToLower(c).ToString())
        );
    }

    public override int SaveChanges()
    {
        NormalizeDateTimesToUtc();
        var deferred = ProcessSyncQueue();
        var result = base.SaveChanges();

        // Bản ghi mới có khoá số nguyên do CSDL cấp: giờ mới có Id thật, xếp hàng lần hai.
        // base.SaveChanges() không gọi lại ProcessSyncQueue nên không có đệ quy.
        // Việc ghi sổ đồng bộ KHÔNG được phép làm đổ thao tác nghiệp vụ. Dữ liệu đã lưu xong
        // ở dòng trên; nếu xếp hàng lỗi thì ghi nhật ký rồi đi tiếp, người dùng vẫn tạo được
        // phiếu. (Đây đúng là kiểu hỏng đã làm đổ chức năng tạo phiếu ngày 29/07.)
        if (deferred.Count > 0)
        {
            try
            {
                EnqueueDeferredCreates(deferred);
                base.SaveChanges();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EDGE-SYNC] Khong xep hang duoc ban ghi vua tao: {ex.Message}");
            }
        }

        return result;
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        NormalizeDateTimesToUtc();
        var deferred = ProcessSyncQueue();
        var result = await base.SaveChangesAsync(cancellationToken);

        if (deferred.Count > 0)
        {
            try
            {
                EnqueueDeferredCreates(deferred);
                await base.SaveChangesAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EDGE-SYNC] Khong xep hang duoc ban ghi vua tao: {ex.Message}");
            }
        }

        return result;
    }

    /// <summary>
    /// Normalize all DateTime properties to UTC to avoid PostgreSQL timestamp with time zone errors.
    /// PostgreSQL with Npgsql 6+ requires DateTime.Kind to be UTC for 'timestamp with time zone' columns.
    /// </summary>
    private void NormalizeDateTimesToUtc()
    {
        var entries = ChangeTracker.Entries()
            .Where(e => e.State == EntityState.Added || e.State == EntityState.Modified)
            .ToList();

        foreach (var entry in entries)
        {
            foreach (var property in entry.Properties)
            {
                // Handle DateTime properties
                if (property.Metadata.ClrType == typeof(DateTime))
                {
                    if (property.CurrentValue is DateTime dateTime && dateTime.Kind == DateTimeKind.Unspecified)
                    {
                        // Assume Unspecified DateTime is UTC
                        property.CurrentValue = DateTime.SpecifyKind(dateTime, DateTimeKind.Utc);
                    }
                }
                // Handle nullable DateTime properties
                else if (property.Metadata.ClrType == typeof(DateTime?))
                {
                    if (property.CurrentValue is DateTime dateTime && dateTime.Kind == DateTimeKind.Unspecified)
                    {
                        // Assume Unspecified DateTime is UTC
                        property.CurrentValue = DateTime.SpecifyKind(dateTime, DateTimeKind.Utc);
                    }
                }
            }
        }
    }

    /// <summary>
    /// Xếp hàng đồng bộ cho các thay đổi trong lần lưu này.
    /// Trả về những entity phải hoãn tới sau khi lưu vì chưa có khoá chính thật.
    /// </summary>
    private List<object> ProcessSyncQueue()
    {
        var deferred = new List<object>();

        // Detect changes
        var modifiedEntries = ChangeTracker.Entries()
            .Where(e => e.State == EntityState.Added || 
                        e.State == EntityState.Modified || 
                        e.State == EntityState.Deleted)
            .ToList();

        foreach (var entry in modifiedEntries)
        {
            // 1. Skip SyncQueue itself to avoid infinite recursion
            if (entry.Entity is SyncQueue) continue;

            // 2. Skip real-time telemetry that shore does not store
            //    (NavigationData and EnvironmentalData models were intentionally
            //    removed from the shore backend — syncing them only causes failures)
            if (entry.Entity is NavigationData || entry.Entity is EnvironmentalData || entry.Entity is SystemLog)
                continue;

            // 3. Skip reporting entities — reports are sent to shore ONLY via
            //    explicit Transmit action (ReportingService.TransmitReportAsync),
            //    never through the automatic background sync.
            if (entry.Entity is MaritimeReport || entry.Entity is NoonReport
                || entry.Entity is DepartureReport || entry.Entity is ArrivalReport
                || entry.Entity is BunkerReport || entry.Entity is PositionReport
                || entry.Entity is ReportWorkflowHistory || entry.Entity is ReportAttachment
                || entry.Entity is ReportDistribution || entry.Entity is ReportTransmissionLog
                || entry.Entity is ReportAmendment)
                continue;

            // Material definitions are owned by Shore. Stock movements and equipment links remain operational data.
            if (entry.Entity is MaterialItem or MaterialCatalogItem or MaterialCategory) continue;

            // Material-equipment links are syncable without a schema-level IsSynced flag.
            var entityType = entry.Entity.GetType();
            var isSyncedProp = entityType.GetProperty("IsSynced");
            if (isSyncedProp == null && entry.Entity is not MaterialItemEquipment) continue;

            // 3. Get Primary Key
            // Assumption: All our models use "Id" as Key (Guid or Long)
            var keyProperty = entry.Properties.FirstOrDefault(p => p.Metadata.IsPrimaryKey());

            // Bản ghi MỚI có khoá chính do CSDL cấp (kiểu số nguyên tự tăng) thì lúc này
            // CHƯA CÓ id thật — EF mới gán khoá tạm (0 hoặc số âm quanh int.MinValue). Xếp
            // hàng ngay sẽ gửi lên bờ một id vô nghĩa, kéo theo mọi khoá ngoại trong cùng bộ
            // dữ liệu trỏ sai. Hoãn lại, xếp hàng sau khi base.SaveChanges() cấp số thật.
            //
            // Bảng khoá uuid không dính vì ứng dụng tự sinh Guid trước khi lưu — đó là lý do
            // material_item_ship và equipment_assets chưa bao giờ hỏng.
            if (entry.State == EntityState.Added && IsStoreGeneratedKeyPending(keyProperty))
            {
                deferred.Add(entry.Entity);
                continue;
            }

            var recordKey = keyProperty?.CurrentValue?.ToString();

            if (entry.Entity is CrewCertificate crewCertificateEntity &&
                !string.IsNullOrWhiteSpace(crewCertificateEntity.CertificateNumber))
            {
                recordKey = crewCertificateEntity.CertificateNumber;
            }
            
            if (string.IsNullOrEmpty(recordKey)) continue;

            var tableName = ToSnakeCase(entityType.Name);

            var syncItem = new SyncQueue
            {
                TableName = tableName,
                RecordKey = recordKey,
                CreatedAt = DateTime.UtcNow,
                Priority = GetPriorityForEntity(entityType),
                // Default to 0 retries
                RetryCount = 0,
                MaxRetries = 5
            };

            // 4. Handle State & Payload
            if (entry.State == EntityState.Deleted)
            {
                syncItem.ActionType = SyncActionType.DELETE;
                syncItem.Payload = "{}"; 
                Console.WriteLine($"[EDGE-SYNC] Queued DELETE: {tableName}/{recordKey}");
            }
            else if (entry.State == EntityState.Added)
            {
                syncItem.ActionType = SyncActionType.CREATE;
                syncItem.Payload = SerializeSyncPayload(entry.Entity);
                Console.WriteLine($"[EDGE-SYNC] Queued CREATE: {tableName}/{recordKey}");
            }
            else if (entry.State == EntityState.Modified)
            {
                syncItem.ActionType = SyncActionType.UPDATE;
                
                // Smart Delta Sync: Only serialize changed properties
                var changedProps = new Dictionary<string, object?>();
                
                foreach (var prop in entry.Properties)
                {
                    // Skip if not modified
                    if (!prop.IsModified) continue;
                    
                    // Skip sync metadata fields — these are updated by MarkSynced() after receiving
                    // items from shore, and must NOT be queued back or it creates an infinite sync loop.
                    // Also skip CreatedAt — it never changes after initial creation and pull-from-shore
                    // re-applying it causes an infinite sync loop with empty delta payloads.
                    // Skip EdgeChanges/EdgeChangesViewed — these are local-only tracking fields managed
                    // by CLEAR_EDGE_CHANGES; sending them to shore is wasteful and shore ignores them anyway.
                    if (prop.Metadata.Name is "UpdatedAt" or "CreatedAt" or "IsSynced" or "SyncVersion" or "OriginNode" or "LastSyncedAt"
                        or "EdgeChanges" or "EdgeChangesViewed") continue;

                    changedProps[prop.Metadata.Name] = prop.CurrentValue;
                }

                // If no meaningful changes, skip sync
                if (changedProps.Count == 0)
                {
                    Console.WriteLine($"[EDGE-SYNC] Skipped UPDATE (no meaningful changes): {tableName}/{recordKey}");
                    continue;
                }

                // For ship_data: always include ImoNumber in delta payload so shore
                // can perform the IMO-based upsert lookup even if IMO wasn't changed.
                if (tableName == "ship_data" && !changedProps.ContainsKey("ImoNumber"))
                {
                    var imoProp = entry.Properties.FirstOrDefault(p => p.Metadata.Name == "ImoNumber");
                    if (imoProp?.CurrentValue != null)
                        changedProps["ImoNumber"] = imoProp.CurrentValue;
                }

                if (entry.Entity is CrewCertificate modifiedCertificate)
                {
                    EnrichCrewCertificatePayload(changedProps, modifiedCertificate);
                }

                // Dòng phiếu: delta có thể chỉ chứa vài cột, nhưng bờ luôn cần mã phiếu cha
                // (để nối khoá ngoại) và mã vật tư + tên (để nhận ra đúng dòng nào trong phiếu).
                EnrichLineItemPayload(changedProps, entry.Entity);

                syncItem.Payload = System.Text.Json.JsonSerializer.Serialize(changedProps);
                
                // Log CrewMember updates with FullName specifically
                if (tableName == "crew_member" && changedProps.ContainsKey("FullName"))
                {
                    Console.WriteLine($"[EDGE-SYNC] Queued UPDATE: crew_member/{recordKey} with FullName='{changedProps["FullName"]}'");
                }
                else
                {
                    Console.WriteLine($"[EDGE-SYNC] Queued UPDATE: {tableName}/{recordKey} with {changedProps.Count} changed properties: [{string.Join(", ", changedProps.Keys)}]");
                }
            }

            // 5. Add to SyncQueue
            SyncQueue.Add(syncItem);
        }

        return deferred;
    }

    /// <summary>
    /// Khoá chính do CSDL cấp và hiện chưa có giá trị thật hay không.
    /// Chỉ đúng với khoá số nguyên tự tăng; khoá Guid do ứng dụng sinh nên luôn có sẵn.
    /// </summary>
    private static bool IsStoreGeneratedKeyPending(Microsoft.EntityFrameworkCore.ChangeTracking.PropertyEntry? keyProperty)
    {
        if (keyProperty == null) return false;
        if (keyProperty.Metadata.ValueGenerated == Microsoft.EntityFrameworkCore.Metadata.ValueGenerated.Never)
            return false;

        return keyProperty.CurrentValue switch
        {
            int i => i <= 0,
            long l => l <= 0,
            short s => s <= 0,
            _ => false
        };
    }

    /// <summary>
    /// Xếp hàng cho những bản ghi vừa được CSDL cấp khoá chính. Gọi SAU base.SaveChanges()
    /// nên Id, và mọi khoá ngoại trỏ tới nó, đều đã là số thật.
    /// </summary>
    private void EnqueueDeferredCreates(List<object> entities)
    {
        foreach (var entity in entities)
        {
            var entityType = entity.GetType();
            var entry = Entry(entity);
            var keyProperty = entry.Properties.FirstOrDefault(p => p.Metadata.IsPrimaryKey());
            var recordKey = keyProperty?.CurrentValue?.ToString();
            if (string.IsNullOrEmpty(recordKey)) continue;

            var tableName = ToSnakeCase(entityType.Name);

            SyncQueue.Add(new SyncQueue
            {
                TableName = tableName,
                RecordKey = recordKey,
                ActionType = SyncActionType.CREATE,
                Payload = SerializeSyncPayload(entity),
                CreatedAt = DateTime.UtcNow,
                Priority = GetPriorityForEntity(entityType),
                RetryCount = 0,
                MaxRetries = 5
            });

            Console.WriteLine($"[EDGE-SYNC] Queued CREATE (sau khi luu): {tableName}/{recordKey}");
        }
    }

    /// <summary>
    /// Dùng cho bộ đối soát: dựng payload y hệt đường đồng bộ tự động, kể cả phần làm giàu
    /// neo định danh cho dòng phiếu. Tách ra để không có hai chỗ dựng payload lệch nhau.
    /// </summary>
    public string BuildSyncPayload(object entity) => SerializeSyncPayload(entity);

    private string SerializeSyncPayload(object entity)
    {
        if (entity is CrewCertificate crewCertificate)
        {
            var payload = new Dictionary<string, object?>
            {
                ["Id"] = crewCertificate.Id,
                ["CrewMemberId"] = crewCertificate.CrewMemberId,
                ["CertificateId"] = crewCertificate.CertificateId,
                ["CertificateNumber"] = crewCertificate.CertificateNumber,
                ["IssueDate"] = crewCertificate.IssueDate,
                ["ExpiryDate"] = crewCertificate.ExpiryDate,
                ["IssuingAuthority"] = crewCertificate.IssuingAuthority,
                ["CertificateOfCompetency"] = crewCertificate.CertificateOfCompetency,
                ["CountryId"] = crewCertificate.CountryId,
                ["DocumentFilePath"] = crewCertificate.DocumentFilePath,
                ["Status"] = crewCertificate.Status,
                ["Notes"] = crewCertificate.Notes,
                ["IsSynced"] = crewCertificate.IsSynced,
                ["OriginNode"] = crewCertificate.OriginNode,
                ["SyncVersion"] = crewCertificate.SyncVersion,
                ["CreatedAt"] = crewCertificate.CreatedAt,
                ["UpdatedAt"] = crewCertificate.UpdatedAt
            };

            EnrichCrewCertificatePayload(payload, crewCertificate);
            return System.Text.Json.JsonSerializer.Serialize(payload);
        }

        // Dòng phiếu chỉ mang RequestId/ReceiptId là số nguyên của TÀU, mà bờ đánh số độc lập
        // nên số đó vô nghĩa bên kia. Gửi kèm mã phiếu cha để bờ nối lại đúng phiếu.
        if (entity is MaterialRequestItem or StockReceiptItem)
        {
            var payload = ToPayloadDictionary(entity);
            EnrichLineItemPayload(payload, entity);
            return System.Text.Json.JsonSerializer.Serialize(payload);
        }

        return System.Text.Json.JsonSerializer.Serialize(entity, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = false,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
            ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles
        });
    }

    /// <summary>
    /// Gắn neo định danh cho dòng phiếu. Id nguyên của tàu vô nghĩa trên bờ, nên bờ nhận
    /// ra dòng nào bằng bộ ba: mã phiếu cha + vật tư + tên vật tư.
    /// </summary>
    private void EnrichLineItemPayload(Dictionary<string, object?> payload, object entity)
    {
        if (entity is MaterialRequestItem reqItem)
        {
            payload["RequestCode"] = MaterialRequests.AsNoTracking()
                .Where(r => r.Id == reqItem.RequestId)
                .Select(r => r.RequestCode)
                .FirstOrDefault();
            payload["MaterialItemId"] = reqItem.MaterialItemId;
            payload["ItemName"] = reqItem.ItemName;
        }
        else if (entity is StockReceiptItem recItem)
        {
            payload["ReceiptCode"] = StockReceipts.AsNoTracking()
                .Where(r => r.Id == recItem.ReceiptId)
                .Select(r => r.ReceiptCode)
                .FirstOrDefault();
            payload["MaterialItemId"] = recItem.MaterialItemId;
            payload["ItemName"] = recItem.ItemName;
        }
    }

    /// <summary>Chuyển entity thành từ điển để chèn thêm trường làm giàu trước khi tuần tự hoá.</summary>
    private static Dictionary<string, object?> ToPayloadDictionary(object entity)
    {
        var json = System.Text.Json.JsonSerializer.Serialize(entity, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = false,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
            ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles
        });
        return System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, object?>>(json)
               ?? new Dictionary<string, object?>();
    }

    private void EnrichCrewCertificatePayload(Dictionary<string, object?> payload, CrewCertificate crewCertificate)
    {
        // Identity anchors — an UPDATE payload carries only the CHANGED columns, and the
        // record key for this table is CertificateNumber, which the crew can rename on board.
        // Without these, a rename reaches shore keyed by a number shore has never seen, so it
        // rebuilds the row from partial data with CertificateId=0 and trips the FK to
        // certificates. Always send them so shore can identify (and remap) the row.
        payload["Id"] = crewCertificate.Id;
        payload["CrewMemberId"] = crewCertificate.CrewMemberId;
        payload["CertificateId"] = crewCertificate.CertificateId;

        var crewMember = CrewMembers.Local.FirstOrDefault(c => c.Id == crewCertificate.CrewMemberId)
            ?? CrewMembers.AsNoTracking().FirstOrDefault(c => c.Id == crewCertificate.CrewMemberId);
        if (crewMember != null)
        {
            payload["CrewId"] = crewMember.CrewId;
            payload["CrewFullName"] = crewMember.FullName;
            payload["CrewIdCardNumber"] = crewMember.IdCardNumber;
            payload["CrewDateOfBirth"] = crewMember.DateOfBirth;
        }

        var certificate = Certificates.Local.FirstOrDefault(c => c.Id == crewCertificate.CertificateId)
            ?? Certificates.AsNoTracking().FirstOrDefault(c => c.Id == crewCertificate.CertificateId);
        if (certificate != null)
        {
            payload["CertificateCode"] = certificate.CertificateCode;
        }

        if (crewCertificate.CountryId.HasValue)
        {
            var country = Countries.Local.FirstOrDefault(c => c.Id == crewCertificate.CountryId.Value)
                ?? Countries.AsNoTracking().FirstOrDefault(c => c.Id == crewCertificate.CountryId.Value);
            if (country != null)
            {
                payload["CountryCode"] = country.CountryCode;
            }
        }
    }

    /// <summary>
    /// Determine Sync Priority based on Entity Type
    /// </summary>
    private SyncPriority GetPriorityForEntity(Type type)
    {
        // P1: Critical Safety & Alerts
        if (type == typeof(SafetyAlarm) || 
            type == typeof(FuelEfficiencyAlert)) 
            return SyncPriority.Critical;

        // P2: Operational Reports & Tracking
        if (type == typeof(MaritimeReport) || 
            type == typeof(NoonReport) || 
            type == typeof(PositionReport) ||
            type == typeof(PositionData) ||
            type == typeof(Port) ||
            type == typeof(VoyageRecord) ||
            type == typeof(VoyagePlanLeg) ||
            type == typeof(VoyageStatusHistory) ||
            type == typeof(VoyageCargoPlan) ||
            type == typeof(VoyageBunkerPlan) ||
            type == typeof(VoyageCrewChangePlan) ||
            type == typeof(VoyageCostEstimate) ||
            type == typeof(VoyageRevenueEstimate) ||
            type == typeof(VoyageExpenseRequest) ||
            type == typeof(VoyageAdvancePayment) ||
            type == typeof(VoyageDisbursement) ||
            type == typeof(VoyageActualRevenue) ||
            type == typeof(VoyageSettlement) ||
            type == typeof(PortCall) ||
            type == typeof(VoyageCrewAssignment) ||
            type == typeof(VoyageLogEntry) ||
            type == typeof(CargoOperation) ||
            type == typeof(EngineData) ||
            type == typeof(IsmElement) ||
            type == typeof(SmsProcedure) ||
            type == typeof(SmsProcedureAcknowledge) ||
            type == typeof(SmsFormTemplate) ||
            type == typeof(SmsFilledRecord)) 
            return SyncPriority.Operational;

        // P2.5: Crew data — important for shore HR sync
        if (type == typeof(Maritime.Shared.Models.Crew.CrewMember) ||
            type == typeof(Maritime.Shared.Models.Crew.CrewCertificate) ||
            type == typeof(Maritime.Shared.Models.Crew.ServiceRecord) ||
            type == typeof(Maritime.Shared.Models.Documents.TravelDocument) ||
            type == typeof(Maritime.Shared.Models.Documents.SeafarerDocument) ||
            type == typeof(Maritime.Shared.Models.Documents.EmploymentDocument) ||
            type == typeof(Maritime.Shared.Models.Documents.HealthDocument))
            return SyncPriority.Operational;

        // P3: Logs & Inventory (Default)
        return SyncPriority.Low;
    }
}
