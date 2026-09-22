using Microsoft.EntityFrameworkCore;
using ProductApi.Models;
using Maritime.Shared.Models.CrewManagement;
using Maritime.Shared.Models.Sync;

namespace ProductApi.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<User> Users { get; set; } = null!;
        public DbSet<Ship> Ships { get; set; } = null!;
        public DbSet<CrewMember> CrewMembers { get; set; } = null!;
        public DbSet<MaintenanceTask> MaintenanceTasks { get; set; } = null!;
        
        // Maritime entities
        public DbSet<Vessel> Vessels { get; set; } = null!;
        public DbSet<VesselPosition> VesselPositions { get; set; } = null!;
        public DbSet<FuelConsumption> FuelConsumptions { get; set; } = null!;
        public DbSet<Port> Ports { get; set; } = null!;
        public DbSet<PortCall> PortCalls { get; set; } = null!;
        public DbSet<VesselAlert> VesselAlerts { get; set; } = null!;
        public DbSet<VesselCertificate> VesselCertificates { get; set; } = null!;
        public DbSet<VoyagePlanLeg> VoyagePlanLegs { get; set; } = null!;
        public DbSet<VoyageStatusHistory> VoyageStatusHistories { get; set; } = null!;
        public DbSet<VoyageCrewAssignment> VoyageCrewAssignments { get; set; } = null!;
        public DbSet<CargoOperation> CargoOperations { get; set; } = null!;
        public DbSet<VoyageLogEntry> VoyageLogEntries { get; set; } = null!;
        public DbSet<VoyageCargoPlan> VoyageCargoPlans { get; set; } = null!;
        public DbSet<VoyageBunkerPlan> VoyageBunkerPlans { get; set; } = null!;
        public DbSet<VoyageCrewChangePlan> VoyageCrewChangePlans { get; set; } = null!;
        public DbSet<VoyageCostEstimate> VoyageCostEstimates { get; set; } = null!;
        public DbSet<VoyageRevenueEstimate> VoyageRevenueEstimates { get; set; } = null!;
        public DbSet<VoyageExpenseRequest> VoyageExpenseRequests { get; set; } = null!;
        public DbSet<VoyageAdvancePayment> VoyageAdvancePayments { get; set; } = null!;
        public DbSet<VoyageDisbursement> VoyageDisbursements { get; set; } = null!;
        public DbSet<VoyageActualRevenue> VoyageActualRevenues { get; set; } = null!;
        public DbSet<VoyageSettlement> VoyageSettlements { get; set; } = null!;
        public DbSet<VoyageReview> VoyageReviews { get; set; } = null!;

        // Edge Sync Models (Optimized for Shore - Essential Data Only)
        // REMOVED: NmeaRawData (debug only), NavigationData (realtime only), EnvironmentalData (in NoonReport)
        public DbSet<PositionData> PositionData { get; set; } = null!;
        public DbSet<AisData> AisData { get; set; } = null!;
        public DbSet<EngineData> EngineData { get; set; } = null!;
        public DbSet<FuelConsumptionData> FuelConsumptionData { get; set; } = null!;
        public DbSet<TankLevel> TankLevels { get; set; } = null!;
        public DbSet<GeneratorData> GeneratorData { get; set; } = null!;
        public DbSet<SafetyAlarm> SafetyAlarms { get; set; } = null!;
        public DbSet<EngineEvent> EngineEvents { get; set; } = null!;
        public DbSet<VoyageRecord> VoyageRecords { get; set; } = null!;
        public DbSet<ReportType> ReportTypes { get; set; } = null!;
        public DbSet<MaritimeReport> MaritimeReports { get; set; } = null!;
        public DbSet<NoonReport> NoonReports { get; set; } = null!;
        public DbSet<DepartureReport> DepartureReports { get; set; } = null!;
        public DbSet<ArrivalReport> ArrivalReports { get; set; } = null!;
        public DbSet<BunkerReport> BunkerReports { get; set; } = null!;
        public DbSet<PositionReport> PositionReports { get; set; } = null!;

        // ============================================================
        // CREW MANAGEMENT (Maritime.Shared models via SharedTypeAliases)
        // ============================================================
        public DbSet<Certificate> CrewCertificateTypes { get; set; } = null!;
        public DbSet<CrewCertificate> CrewCertificates { get; set; } = null!;
        public DbSet<Country> Countries { get; set; } = null!;
        public DbSet<Rank> Ranks { get; set; } = null!;
        public DbSet<RankCertificate> RankCertificates { get; set; } = null!;
        public DbSet<CountryCertificate> CountryCertificates { get; set; } = null!;
        public DbSet<ServiceRecord> ServiceRecords { get; set; } = null!;
        public DbSet<CrewLogbookEntry> CrewLogbookEntries { get; set; } = null!;

        // Crew Documents
        public DbSet<TravelDocument> TravelDocuments { get; set; } = null!;
        public DbSet<SeafarerDocument> SeafarerDocuments { get; set; } = null!;
        public DbSet<EmploymentDocument> EmploymentDocuments { get; set; } = null!;
        public DbSet<HealthDocument> HealthDocuments { get; set; } = null!;

        // ============================================================
        // SYNC INFRASTRUCTURE
        // ============================================================
        public DbSet<SyncOutbox> SyncOutbox { get; set; } = null!;
        public DbSet<SyncLog> SyncLogs { get; set; } = null!;
        public DbSet<SyncNodeTracker> SyncNodeTrackers { get; set; } = null!;
        public DbSet<SyncIdempotencyRecord> SyncIdempotencyRecords { get; set; } = null!;
        public DbSet<SyncTableStats> SyncTableStats { get; set; } = null!;
        public DbSet<SyncFileManifest> SyncFileManifests { get; set; } = null!;
        public DbSet<SyncFileTransferRequest> SyncFileTransferRequests { get; set; } = null!;
        public DbSet<SyncFileChunkSession> SyncFileChunkSessions { get; set; } = null!;
        
        // Phase 2.3: Replay Protection (Nonce Registry)
        public DbSet<SyncNonceRegistryEntry> SyncNonceRegistry { get; set; } = null!;
        
        // Phase 2.4: Batch Failure & Dead-Letter Queue
        public DbSet<SyncDlqEntry> SyncDlqItems { get; set; } = null!;

        // ============================================================
        // CREW MANAGEMENT WORKFLOW (Phase 1A)
        // ============================================================
        public DbSet<CrewStatusHistory> CrewStatusHistory { get; set; } = null!;
        public DbSet<OnboardingCase> OnboardingCases { get; set; } = null!;
        public DbSet<OnboardingChecklistItem> OnboardingChecklistItems { get; set; } = null!;
        public DbSet<CrewDocumentSubmission> DocumentSubmissions { get; set; } = null!;
        public DbSet<CrewDocumentVersion> DocumentVersions { get; set; } = null!;
        public DbSet<DocumentVerificationTask> VerificationTasks { get; set; } = null!;
        public DbSet<DocumentVerificationAction> VerificationActions { get; set; } = null!;
        public DbSet<AuditLog> AuditLogs { get; set; } = null!;

        // ============================================================
        // COMPLIANCE MATRIX (Phase 2)
        // ============================================================
        public DbSet<ComplianceRuleSet> ComplianceRuleSets { get; set; } = null!;
        public DbSet<ComplianceRule> ComplianceRules { get; set; } = null!;
        public DbSet<ComplianceDimension> ComplianceDimensions { get; set; } = null!;
        public DbSet<ComplianceWaiver> ComplianceWaivers { get; set; } = null!;
        public DbSet<ComplianceSnapshot> ComplianceSnapshots { get; set; } = null!;

        // ============================================================
        // PLANNING & ASSIGNMENT (Phase 5)
        // ============================================================
        public DbSet<VesselManningStandard> VesselManningStandards { get; set; } = null!;
        public DbSet<ManningPosition> ManningPositions { get; set; } = null!;
        public DbSet<CrewAssignment> CrewAssignments { get; set; } = null!;
        public DbSet<AssignmentConfirmation> AssignmentConfirmations { get; set; } = null!;
        public DbSet<AssignmentConflict> AssignmentConflicts { get; set; } = null!;
        public DbSet<AssignmentComment> AssignmentComments { get; set; } = null!;
        public DbSet<AssignmentStatusHistory> AssignmentStatusHistory { get; set; } = null!;

        // ============================================================
        // EXTERNAL REQUESTS & TRAVEL (Phase 6)
        // ============================================================
        public DbSet<ExternalRequest> ExternalRequests { get; set; } = null!;
        public DbSet<ExternalCandidate> ExternalCandidates { get; set; } = null!;
        public DbSet<ExternalRequestMessage> ExternalRequestMessages { get; set; } = null!;
        public DbSet<TravelRequest> TravelRequests { get; set; } = null!;
        public DbSet<TravelSegment> TravelSegments { get; set; } = null!;
        public DbSet<TravelStatusHistory> TravelStatusHistory { get; set; } = null!;

        // ============================================================
        // ONBOARD EVENTS, ACCESS & SIGN-ON/SIGN-OFF (Phase 7)
        // ============================================================
        public DbSet<OnboardEvent> OnboardEvents { get; set; } = null!;
        public DbSet<CrewAccessGrant> CrewAccessGrants { get; set; } = null!;
        public DbSet<SignOnRecord> SignOnRecords { get; set; } = null!;
        public DbSet<SignOffRecord> SignOffRecords { get; set; } = null!;

        // ============================================================
        // PMS — PLANNED MAINTENANCE SYSTEM (Phase 8)
        // ============================================================
        public DbSet<EquipmentAsset> EquipmentAssets { get; set; } = null!;
        public DbSet<EquipmentGroup> EquipmentGroups { get; set; } = null!;
        public DbSet<EquipmentGroupMember> EquipmentGroupMembers { get; set; } = null!;
        public DbSet<MaintenanceSchedule> MaintenanceSchedules { get; set; } = null!;
        public DbSet<ScheduleSparePart> ScheduleSpareParts { get; set; } = null!;
        public DbSet<ScheduleChecklistTemplate> ScheduleChecklistTemplates { get; set; } = null!;
        public DbSet<MaintenanceHistory> MaintenanceHistories { get; set; } = null!;

        // ============================================================
        // MATERIALS — VẬT TƯ (Phase 8)
        // ============================================================
        public DbSet<MaterialCategory> MaterialCategories { get; set; } = null!;
        public DbSet<MaterialItem> MaterialItems { get; set; } = null!;
        public DbSet<MaterialItemShip> MaterialItemShips { get; set; } = null!;
        public DbSet<MaterialItemEquipment> MaterialItemEquipments { get; set; } = null!;
        public DbSet<StoreLocation> StoreLocations { get; set; } = null!;
        public DbSet<MaterialRequest> MaterialRequests { get; set; } = null!;
        public DbSet<MaterialRequestItem> MaterialRequestItems { get; set; } = null!;
        public DbSet<StockReceipt> StockReceipts { get; set; } = null!;
        public DbSet<StockReceiptItem> StockReceiptItems { get; set; } = null!;
        public DbSet<InventoryStock> InventoryStocks { get; set; } = null!;

        // ============================================================
        // NOTIFICATIONS (Phase 9)
        // ============================================================
        public DbSet<ShoreNotification> ShoreNotifications { get; set; } = null!;

        public DbSet<ReportEvaluation> ReportEvaluations { get; set; } = null!;

        // ============================================================
        // SMS — SAFETY MANAGEMENT SYSTEM
        // ============================================================
        public DbSet<IsmElement> IsmElements { get; set; } = null!;
        public DbSet<SmsProcedure> SmsProcedures { get; set; } = null!;
        public DbSet<SmsProcedureAcknowledge> SmsProcedureAcknowledgements { get; set; } = null!;
        public DbSet<SmsFormTemplate> SmsFormTemplates { get; set; } = null!;
        public DbSet<SmsFilledRecord> SmsFilledRecords { get; set; } = null!;

        // ============================================================
        // DE4 WEATHER ROUTING
        // ============================================================
        public DbSet<ProductApi.Models.WeatherRouting.WeatherRoutingJob> WeatherRoutingJobs { get; set; } = null!;
        public DbSet<ProductApi.Models.WeatherRouting.WeatherRoutingRoute> WeatherRoutingRoutes { get; set; } = null!;
        public DbSet<ProductApi.Models.WeatherRouting.VesselFuelProfile> VesselFuelProfiles { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Configure Vessel
            modelBuilder.Entity<Vessel>(entity =>
            {
                entity.HasIndex(v => v.IMO).IsUnique();
                entity.Property(v => v.GrossTonnage).HasPrecision(10, 2);
                entity.Property(v => v.DeadWeight).HasPrecision(10, 2);
            });

            // Configure VesselPosition
            modelBuilder.Entity<VesselPosition>(entity =>
            {
                entity.HasOne(vp => vp.Vessel)
                    .WithMany(v => v.Positions)
                    .HasForeignKey(vp => vp.VesselId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.Property(vp => vp.Latitude).HasPrecision(10, 7);
                entity.Property(vp => vp.Longitude).HasPrecision(10, 7);
                entity.Property(vp => vp.Speed).HasPrecision(5, 2);
                entity.Property(vp => vp.Course).HasPrecision(5, 2);
                
                entity.HasIndex(vp => new { vp.VesselId, vp.Timestamp });
            });

            // Configure PositionData (synced from Edge — snake_case table name)
            modelBuilder.Entity<PositionData>(entity =>
            {
                entity.ToTable("position_data");

                entity.Property(e => e.Latitude).HasPrecision(10, 7);
                entity.Property(e => e.Longitude).HasPrecision(10, 7);
                entity.Property(e => e.SpeedOverGround).HasPrecision(5, 2);
                entity.Property(e => e.CourseOverGround).HasPrecision(5, 2);

                entity.HasIndex(e => e.Timestamp).IsDescending();
                entity.HasIndex(e => e.OriginNode);
                entity.HasIndex(e => new { e.OriginNode, e.Timestamp });
            });

            // Configure FuelConsumption
            modelBuilder.Entity<FuelConsumption>(entity =>
            {
                entity.HasOne(fc => fc.Vessel)
                    .WithMany(v => v.FuelRecords)
                    .HasForeignKey(fc => fc.VesselId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.Property(fc => fc.FuelConsumed).HasPrecision(8, 3);
                entity.Property(fc => fc.DistanceTraveled).HasPrecision(8, 2);
                entity.Property(fc => fc.AverageSpeed).HasPrecision(5, 2);
                entity.Property(fc => fc.FuelEfficiency).HasPrecision(6, 4);
            });

            // Configure PortCall
            modelBuilder.Entity<Port>(entity =>
            {
                entity.ToTable("ports");
                entity.HasKey(e => e.Id);

                // ════ CRITICAL: Enforce UTC ════
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

                entity.HasIndex(e => e.PortCode).IsUnique();
                entity.HasIndex(e => e.CountryCode);
                entity.HasIndex(e => e.PortName);
                entity.HasIndex(e => e.IsActive);
                entity.HasIndex(e => e.IsSynced);
            });

            modelBuilder.Entity<PortCall>(entity =>
            {
                entity.ToTable("PortCalls");

                // ════ CRITICAL: Enforce UTC ════
                entity.Property(e => e.ArrivalTime)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.DepartureTime)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.PilotOnBoard)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.PilotOffBoard)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

                entity.HasOne(pc => pc.Vessel)
                    .WithMany(v => v.PortCalls)
                    .HasForeignKey(pc => pc.VesselId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(pc => pc.Voyage)
                    .WithMany(v => v.PortCalls)
                    .HasForeignKey(pc => pc.VoyageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(pc => pc.Port)
                    .WithMany()
                    .HasForeignKey(pc => pc.PortId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasOne(pc => pc.VoyagePlanLeg)
                    .WithMany()
                    .HasForeignKey(pc => pc.VoyagePlanLegId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.Property(pc => pc.PortFees).HasPrecision(12, 2);
                entity.Property(pc => pc.CargoQuantity).HasPrecision(10, 3);
                entity.Property(pc => pc.DraftFore).HasPrecision(5, 2);
                entity.Property(pc => pc.DraftAft).HasPrecision(5, 2);
                
                entity.HasIndex(pc => new { pc.VesselId, pc.ArrivalTime });
                entity.HasIndex(pc => new { pc.VoyageId, pc.Sequence });
                entity.HasIndex(pc => pc.PortCode);
                entity.HasIndex(pc => pc.CallType);
                entity.HasIndex(pc => pc.IsSynced);
            });

            modelBuilder.Entity<SyncNodeTracker>(entity =>
            {
                entity.ToTable("sync_node_trackers");
                entity.HasIndex(e => e.NodeId).IsUnique();
                entity.HasIndex(e => e.VesselId)
                    .IsUnique()
                    .HasFilter("\"VesselId\" IS NOT NULL");
                entity.HasIndex(e => e.ImoNumber)
                    .IsUnique()
                    .HasFilter("\"ImoNumber\" IS NOT NULL");
                entity.HasIndex(e => e.IsOnline);
                entity.HasIndex(e => e.IsRegistered);
                entity.HasIndex(e => e.IsRevoked);
                entity.HasIndex(e => e.NodeApiTokenHash)
                    .IsUnique()
                    .HasFilter("\"NodeApiTokenHash\" IS NOT NULL");
                entity.HasIndex(e => e.ProvisioningStatus);
                entity.Property(e => e.SigningKey).HasMaxLength(500);
                entity.Property(e => e.PreviousSigningKey).HasMaxLength(500);
                entity.Property(e => e.RevokedReason).HasMaxLength(500);
                entity.Property(e => e.ProvisioningStatus).HasMaxLength(30).HasDefaultValue("Unknown");
                entity.Property(e => e.NodeApiTokenVersion).HasDefaultValue(1);
                entity.Property(e => e.ConfigDownloadCount).HasDefaultValue(0);
            });

            modelBuilder.Entity<VoyageRecord>(entity =>
            {
                entity.ToTable("voyage_records");
                entity.HasKey(e => e.Id);

                entity.Property(e => e.CargoWeight).HasPrecision(12, 3);
                entity.Property(e => e.PlannedDistance).HasPrecision(10, 2);
                entity.Property(e => e.PlannedDurationHours).HasPrecision(10, 2);
                entity.Property(e => e.PlannedAverageSpeed).HasPrecision(5, 2);
                entity.Property(e => e.PlannedFuelConsumption).HasPrecision(10, 3);
                entity.Property(e => e.DistanceTraveled).HasPrecision(10, 2);
                entity.Property(e => e.FuelConsumed).HasPrecision(10, 3);
                entity.Property(e => e.AverageSpeed).HasPrecision(5, 2);

                // ════ CRITICAL: Enforce UTC for all DateTime fields ════
                // Npgsql rejects DateTime.Kind=Local. Always convert to UTC on write,
                // and ensure read values are marked as UTC.
                entity.Property(e => e.DepartureTime)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.ArrivalTime)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.ApprovedAt)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.ReadyAt)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.CommencedAt)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.ArrivedAt)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.CompletedAt)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.CancelledAt)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.FinancialClosedAt)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

                entity.HasIndex(e => e.VoyageNumber).IsUnique();
                entity.HasIndex(e => e.VoyageStatus);
                entity.HasIndex(e => e.VesselIMO);
                entity.HasIndex(e => e.DepartureTime);
                entity.HasIndex(e => e.IsSynced);

                entity.HasMany(e => e.CrewAssignments)
                    .WithOne(e => e.Voyage)
                    .HasForeignKey(e => e.VoyageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(e => e.LogEntries)
                    .WithOne(e => e.Voyage)
                    .HasForeignKey(e => e.VoyageId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasMany(e => e.CargoOperations)
                    .WithOne(e => e.Voyage)
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

                entity.HasMany(e => e.CargoPlans)
                    .WithOne(e => e.Voyage)
                    .HasForeignKey(e => e.VoyageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(e => e.BunkerPlans)
                    .WithOne(e => e.Voyage)
                    .HasForeignKey(e => e.VoyageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(e => e.CrewChangePlans)
                    .WithOne(e => e.Voyage)
                    .HasForeignKey(e => e.VoyageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(e => e.CostEstimates)
                    .WithOne(e => e.Voyage)
                    .HasForeignKey(e => e.VoyageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(e => e.RevenueEstimates)
                    .WithOne(e => e.Voyage)
                    .HasForeignKey(e => e.VoyageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(e => e.ExpenseRequests)
                    .WithOne(e => e.Voyage)
                    .HasForeignKey(e => e.VoyageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(e => e.AdvancePayments)
                    .WithOne(e => e.Voyage)
                    .HasForeignKey(e => e.VoyageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(e => e.Disbursements)
                    .WithOne(e => e.Voyage)
                    .HasForeignKey(e => e.VoyageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(e => e.ActualRevenues)
                    .WithOne(e => e.Voyage)
                    .HasForeignKey(e => e.VoyageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasMany(e => e.Settlements)
                    .WithOne(e => e.Voyage)
                    .HasForeignKey(e => e.VoyageId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<VoyagePlanLeg>(entity =>
            {
                entity.ToTable("voyage_plan_legs");
                entity.HasKey(e => e.Id);

                entity.Property(e => e.PlannedDistance).HasPrecision(10, 2);
                entity.Property(e => e.PlannedDurationHours).HasPrecision(10, 2);
                entity.Property(e => e.PlannedAverageSpeed).HasPrecision(5, 2);
                entity.Property(e => e.PlannedFuelConsumption).HasPrecision(10, 3);

                // ════ CRITICAL: Enforce UTC for datetime fields ════
                entity.Property(e => e.PlannedDepartureTime)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.PlannedArrivalTime)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

                entity.HasIndex(e => new { e.VoyageId, e.Sequence }).IsUnique();
                entity.HasIndex(e => e.LegType);
                entity.HasIndex(e => e.IsSynced);
            });

            modelBuilder.Entity<VoyageStatusHistory>(entity =>
            {
                entity.ToTable("voyage_status_history");
                entity.HasKey(e => e.Id);

                // ════ CRITICAL: Enforce UTC ════
                entity.Property(e => e.ChangedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

                entity.HasIndex(e => new { e.VoyageId, e.ChangedAt });
                entity.HasIndex(e => e.ToStatus);
                entity.HasIndex(e => e.IsSynced);
            });

            modelBuilder.Entity<VoyageCrewAssignment>(entity =>
            {
                entity.ToTable("voyage_crew_assignments");
                entity.HasKey(e => e.Id);

                // ════ CRITICAL: Enforce UTC ════
                entity.Property(e => e.EmbarkDate)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.DisembarkDate)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

                entity.HasIndex(e => new { e.VoyageId, e.CrewMemberId }).IsUnique();
                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => e.IsSynced);

                entity.HasOne(e => e.CrewMember)
                    .WithMany()
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Rank)
                    .WithMany()
                    .HasForeignKey(e => e.RankId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<CargoOperation>(entity =>
            {
                entity.ToTable("cargo_operations");
                entity.HasKey(e => e.Id);

                entity.Property(e => e.Quantity).HasPrecision(15, 3);

                // ════ CRITICAL: Enforce UTC ════
                entity.Property(e => e.LoadedAt)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.DischargedAt)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

                entity.HasIndex(e => e.OperationId).IsUnique();
                entity.HasIndex(e => e.VoyageId);
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => e.CargoType);
                entity.HasIndex(e => e.BillOfLading);
                entity.HasIndex(e => e.IsSynced);
            });

            modelBuilder.Entity<VoyageLogEntry>(entity =>
            {
                entity.ToTable("voyage_log_entries");
                entity.HasKey(e => e.Id);

                // ════ CRITICAL: Enforce UTC ════
                entity.Property(e => e.EventDateTime)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.EventDateTimeLocal)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.SignedAt)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

                entity.HasIndex(e => e.EventType);
                entity.HasIndex(e => e.EventDateTime);
                entity.HasIndex(e => e.VoyageId);
                entity.HasIndex(e => e.PortLocode);
                entity.HasIndex(e => e.IsSynced);
            });

            modelBuilder.Entity<VoyageCargoPlan>(entity =>
            {
                entity.ToTable("voyage_cargo_plans");
                entity.HasKey(e => e.Id);

                // ════ CRITICAL: Enforce UTC ════
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

                entity.HasIndex(e => new { e.VoyageId, e.Sequence }).IsUnique();
                entity.HasIndex(e => e.PlanLegId);
                entity.HasIndex(e => e.IsSynced);

                entity.HasOne(e => e.PlanLeg)
                    .WithMany()
                    .HasForeignKey(e => e.PlanLegId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<VoyageBunkerPlan>(entity =>
            {
                entity.ToTable("voyage_bunker_plans");
                entity.HasKey(e => e.Id);

                entity.HasIndex(e => new { e.VoyageId, e.Sequence }).IsUnique();
                entity.HasIndex(e => e.PlanLegId);
                entity.HasIndex(e => e.IsSynced);

                entity.HasOne(e => e.PlanLeg)
                    .WithMany()
                    .HasForeignKey(e => e.PlanLegId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<VoyageCrewChangePlan>(entity =>
            {
                entity.ToTable("voyage_crew_change_plans");
                entity.HasKey(e => e.Id);

                entity.HasIndex(e => new { e.VoyageId, e.Sequence }).IsUnique();
                entity.HasIndex(e => e.PlanLegId);
                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => e.IsSynced);

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
                entity.HasKey(e => e.Id);

                entity.HasIndex(e => new { e.VoyageId, e.Sequence }).IsUnique();
                entity.HasIndex(e => e.CostCategory);
                entity.HasIndex(e => e.IsSynced);
            });

            modelBuilder.Entity<VoyageRevenueEstimate>(entity =>
            {
                entity.ToTable("voyage_revenue_estimates");
                entity.HasKey(e => e.Id);

                entity.HasIndex(e => new { e.VoyageId, e.Sequence }).IsUnique();
                entity.HasIndex(e => e.RevenueCategory);
                entity.HasIndex(e => e.IsSynced);
            });

            modelBuilder.Entity<VoyageExpenseRequest>(entity =>
            {
                entity.ToTable("voyage_expense_requests");
                entity.HasKey(e => e.Id);

                entity.HasIndex(e => e.VoyageId);
                entity.HasIndex(e => e.RequestNumber).IsUnique();
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => e.CostCategory);
                entity.HasIndex(e => e.IsSynced);
            });

            modelBuilder.Entity<VoyageAdvancePayment>(entity =>
            {
                entity.ToTable("voyage_advance_payments");
                entity.HasKey(e => e.Id);

                entity.HasIndex(e => e.VoyageId);
                entity.HasIndex(e => e.AdvanceNumber).IsUnique();
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => e.IsSynced);
            });

            modelBuilder.Entity<VoyageDisbursement>(entity =>
            {
                entity.ToTable("voyage_disbursements");
                entity.HasKey(e => e.Id);

                entity.HasIndex(e => e.VoyageId);
                entity.HasIndex(e => e.DisbursementNumber).IsUnique();
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => e.CostCategory);
                entity.HasIndex(e => e.ExpenseRequestId);
                entity.HasIndex(e => e.AdvancePaymentId);
                entity.HasIndex(e => e.IsSynced);

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
                entity.HasKey(e => e.Id);

                entity.HasIndex(e => e.VoyageId);
                entity.HasIndex(e => e.RevenueNumber).IsUnique();
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => e.RevenueCategory);
                entity.HasIndex(e => e.IsSynced);
            });

            modelBuilder.Entity<VoyageSettlement>(entity =>
            {
                entity.ToTable("voyage_settlements");
                entity.HasKey(e => e.Id);

                entity.HasIndex(e => e.VoyageId);
                entity.HasIndex(e => e.SettlementNumber).IsUnique();
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => e.IsSynced);
            });

            modelBuilder.Entity<VoyageReview>(entity =>
            {
                entity.ToTable("voyage_reviews");
                entity.HasKey(e => e.Id);

                entity.HasIndex(e => e.VoyageId).IsUnique();
                entity.HasIndex(e => e.ReviewStatus);

                entity.HasOne(e => e.Voyage)
                    .WithMany()
                    .HasForeignKey(e => e.VoyageId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure VesselAlert
            modelBuilder.Entity<VesselAlert>(entity =>
            {
                entity.HasOne(va => va.Vessel)
                    .WithMany(v => v.Alerts)
                    .HasForeignKey(va => va.VesselId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(va => new { va.VesselId, va.Timestamp });
                entity.HasIndex(va => va.IsAcknowledged);
            });

            // Configure VesselCertificate (renamed from Certificate to avoid conflict with shared crew Certificate)
            modelBuilder.Entity<VesselCertificate>(entity =>
            {
                entity.ToTable("Certificates"); // Keep the same table name for backward compatibility
                entity.HasOne(c => c.Vessel)
                    .WithMany()
                    .HasForeignKey(c => c.VesselId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(c => new { c.VesselId, c.ExpiryDate });
                entity.HasIndex(c => c.CertificateNumber).IsUnique();
            });

            // ============================================================
            // CREW MANAGEMENT ENTITY CONFIGURATIONS
            // ============================================================
            
            // Configure CrewMember
            modelBuilder.Entity<CrewMember>(entity =>
            {
                entity.ToTable("crew_members");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewId).IsUnique();
                entity.HasIndex(e => e.FullName);
                entity.HasIndex(e => e.IsOnboard);
                entity.HasIndex(e => e.IsSynced);
                
                entity.HasOne(e => e.Rank)
                    .WithMany()
                    .HasForeignKey(e => e.RankId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasOne(e => e.Country)
                    .WithMany()
                    .HasForeignKey(e => e.CountryId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasIndex(e => e.VesselId);

                entity.Property(e => e.Weight).HasPrecision(5, 2);
            });

            // Configure CrewLogbookEntry
            modelBuilder.Entity<CrewLogbookEntry>(entity =>
            {
                entity.ToTable("crew_logbook_entries");
                entity.HasKey(e => e.Id);
                
                // Enforce UTC conversion
                entity.Property(e => e.EntryDate)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.EdgeLocalCreatedAt)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                                   v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(),
                                   v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => e.EntryOrigin);
                entity.HasIndex(e => e.EntryDate);
                entity.HasIndex(e => e.IsSynced);

                entity.HasOne(e => e.CrewMember)
                    .WithMany()
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure Certificate (Crew Certificate Types)
            modelBuilder.Entity<Certificate>(entity =>
            {
                entity.ToTable("certificates");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CertificateCode).IsUnique();
            });

            // Configure CrewCertificate
            modelBuilder.Entity<CrewCertificate>(entity =>
            {
                entity.ToTable("crew_certificates");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.CrewMemberId, e.CertificateId });
                entity.HasIndex(e => e.ExpiryDate);
                entity.HasIndex(e => e.IsSynced);

                entity.HasOne(e => e.CrewMember)
                    .WithMany(c => c.Certificates)
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Certificate)
                    .WithMany(c => c.CrewCertificates)
                    .HasForeignKey(e => e.CertificateId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(e => e.Country)
                    .WithMany(c => c.CrewCertificates)
                    .HasForeignKey(e => e.CountryId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            // Configure Country
            modelBuilder.Entity<Country>(entity =>
            {
                entity.ToTable("countries");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CountryCode).IsUnique();
            });

            // Configure Rank
            modelBuilder.Entity<Rank>(entity =>
            {
                entity.ToTable("ranks");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.RankCode).IsUnique();
            });

            // Configure RankCertificate
            modelBuilder.Entity<RankCertificate>(entity =>
            {
                entity.ToTable("rank_certificates");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.RankId, e.CertificateId }).IsUnique();

                entity.HasOne(e => e.Rank)
                    .WithMany()
                    .HasForeignKey(e => e.RankId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Certificate)
                    .WithMany()
                    .HasForeignKey(e => e.CertificateId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure CountryCertificate
            modelBuilder.Entity<CountryCertificate>(entity =>
            {
                entity.ToTable("country_certificates");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.CountryId, e.CertificateId }).IsUnique();

                entity.HasOne(e => e.Country)
                    .WithMany(c => c.CountryCertificates)
                    .HasForeignKey(e => e.CountryId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Certificate)
                    .WithMany(c => c.CountryCertificates)
                    .HasForeignKey(e => e.CertificateId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // VesselCertificateAssignment đã bị bỏ: danh mục loại chứng chỉ do bờ làm chủ và
            // phát xuống mọi tàu, không còn khái niệm gán loại chứng chỉ cho từng tàu.

            // Configure ServiceRecord
            modelBuilder.Entity<ServiceRecord>(entity =>
            {
                entity.ToTable("service_records");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => e.IsSynced);

                entity.HasOne(e => e.CrewMember)
                    .WithMany(c => c.ServiceRecords)
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.Property(e => e.VesselGrt).HasPrecision(12, 2);
                entity.Property(e => e.VesselDwt).HasPrecision(12, 2);
            });

            // Configure TravelDocument
            modelBuilder.Entity<TravelDocument>(entity =>
            {
                entity.ToTable("travel_documents");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);

                entity.HasOne(e => e.CrewMember)
                    .WithMany(c => c.TravelDocuments)
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Country)
                    .WithMany()
                    .HasForeignKey(e => e.CountryId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            // Configure SeafarerDocument
            modelBuilder.Entity<SeafarerDocument>(entity =>
            {
                entity.ToTable("seafarer_documents");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);

                entity.HasOne(e => e.CrewMember)
                    .WithMany(c => c.SeafarerDocuments)
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Country)
                    .WithMany()
                    .HasForeignKey(e => e.CountryId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            // Configure EmploymentDocument
            modelBuilder.Entity<EmploymentDocument>(entity =>
            {
                entity.ToTable("employment_documents");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);

                entity.HasOne(e => e.CrewMember)
                    .WithMany(c => c.EmploymentDocuments)
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Country)
                    .WithMany()
                    .HasForeignKey(e => e.CountryId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            // Configure HealthDocument
            modelBuilder.Entity<HealthDocument>(entity =>
            {
                entity.ToTable("health_documents");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);

                entity.HasOne(e => e.CrewMember)
                    .WithMany(c => c.HealthDocuments)
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure MaritimeReport
            modelBuilder.Entity<MaritimeReport>(entity =>
            {
                entity.ToTable("maritime_reports");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.ReportNumber).IsUnique();
                entity.HasIndex(e => e.OriginNode);
                entity.HasIndex(e => e.ReportDateTime);
                entity.HasIndex(e => e.Status);
            });

            // Configure ReportType
            modelBuilder.Entity<ReportType>(entity =>
            {
                entity.ToTable("report_types");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.TypeCode).IsUnique();
            });

            // Configure NoonReport
            modelBuilder.Entity<NoonReport>(entity =>
            {
                entity.ToTable("noon_reports");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.MaritimeReportId).IsUnique();
            });

            // Configure DepartureReport
            modelBuilder.Entity<DepartureReport>(entity =>
            {
                entity.ToTable("departure_reports");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.MaritimeReportId).IsUnique();
            });

            // Configure ArrivalReport
            modelBuilder.Entity<ArrivalReport>(entity =>
            {
                entity.ToTable("arrival_reports");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.MaritimeReportId).IsUnique();
            });

            // Configure BunkerReport
            modelBuilder.Entity<BunkerReport>(entity =>
            {
                entity.ToTable("bunker_reports");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.MaritimeReportId).IsUnique();
            });

            // Configure PositionReport
            modelBuilder.Entity<PositionReport>(entity =>
            {
                entity.ToTable("position_reports");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.MaritimeReportId).IsUnique();
            });

            // Seed ReportTypes
            var seedDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            modelBuilder.Entity<ReportType>().HasData(
                new ReportType { Id = 1, TypeCode = "NOON",      TypeName = "Noon Report",      Category = "VOYAGE", Frequency = "DAILY",       IsMandatory = true,  RequiresMasterSignature = true,  IsActive = true, RegulationReference = "SOLAS V/28", CreatedAt = seedDate },
                new ReportType { Id = 2, TypeCode = "DEPARTURE", TypeName = "Departure Report", Category = "VOYAGE", Frequency = "EVENT_BASED", IsMandatory = true,  RequiresMasterSignature = true,  IsActive = true, CreatedAt = seedDate },
                new ReportType { Id = 3, TypeCode = "ARRIVAL",   TypeName = "Arrival Report",   Category = "VOYAGE", Frequency = "EVENT_BASED", IsMandatory = true,  RequiresMasterSignature = true,  IsActive = true, CreatedAt = seedDate },
                new ReportType { Id = 4, TypeCode = "DAILY",     TypeName = "Daily Report",     Category = "VOYAGE", Frequency = "DAILY",       IsMandatory = false, RequiresMasterSignature = false, IsActive = true, CreatedAt = seedDate },
                new ReportType { Id = 5, TypeCode = "BUNKER",    TypeName = "Bunker Report",    Category = "VOYAGE", Frequency = "EVENT_BASED", IsMandatory = false, RequiresMasterSignature = false, IsActive = true, CreatedAt = seedDate },
                new ReportType { Id = 6, TypeCode = "POSITION",  TypeName = "Position Report",  Category = "VOYAGE", Frequency = "EVENT_BASED", IsMandatory = false, RequiresMasterSignature = false, IsActive = true, CreatedAt = seedDate }
            );

            // Configure SyncOutbox (shore → ship)
            modelBuilder.Entity<SyncOutbox>(entity =>
            {
                entity.ToTable("sync_outbox");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.DeliveredAt);
                entity.HasIndex(e => new { e.TableName, e.RecordKey });
            });

            // Configure SyncLog
            modelBuilder.Entity<SyncLog>(entity =>
            {
                entity.ToTable("sync_logs");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.ProcessedAt);
                entity.HasIndex(e => e.OriginNode);
            });

            // Configure SyncNodeTracker
            modelBuilder.Entity<SyncNodeTracker>(entity =>
            {
                entity.ToTable("sync_node_trackers");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.NodeId).IsUnique();
                entity.HasIndex(e => e.IsOnline);
            });

            // Configure SyncIdempotencyRecord
            modelBuilder.Entity<SyncIdempotencyRecord>(entity =>
            {
                entity.ToTable("sync_idempotency_records");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.IdempotencyKey).IsUnique();
                entity.HasIndex(e => e.ProcessedAt);
            });

            // Configure SyncTableStats
            modelBuilder.Entity<SyncTableStats>(entity =>
            {
                entity.ToTable("sync_table_stats");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.NodeId, e.TableName });
            });

            modelBuilder.Entity<SyncFileManifest>(entity =>
            {
                entity.ToTable("sync_file_manifests");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.OwnerNodeId, e.TableName, e.RecordKey });
                entity.HasIndex(e => new { e.ReceiverNodeId, e.TransferStatus });
                entity.HasIndex(e => e.Sha256);
            });

            modelBuilder.Entity<SyncFileTransferRequest>(entity =>
            {
                entity.ToTable("sync_file_transfer_requests");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.RequesterNodeId, e.Status });
                entity.HasIndex(e => new { e.SupplierNodeId, e.Status });
                entity.HasOne(e => e.Manifest)
                    .WithMany()
                    .HasForeignKey(e => e.ManifestId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<SyncFileChunkSession>(entity =>
            {
                entity.ToTable("sync_file_chunk_sessions");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.RequesterNodeId, e.SupplierNodeId, e.Direction, e.Status });
                entity.HasIndex(e => new { e.ManifestId, e.Direction, e.Status });
                entity.HasIndex(e => e.ExpiresAtUtc);
                entity.HasIndex(e => e.ResumeToken).IsUnique();
            });

            // ============================================================
            // CREW MANAGEMENT WORKFLOW CONFIGURATIONS (Phase 1A)
            // ============================================================

            // Configure CrewStatusHistory
            modelBuilder.Entity<CrewStatusHistory>(entity =>
            {
                entity.ToTable("crew_status_history");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => e.ChangedAt);

                entity.HasOne(e => e.CrewMember)
                    .WithMany()
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure OnboardingCase
            modelBuilder.Entity<OnboardingCase>(entity =>
            {
                entity.ToTable("onboarding_cases");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => e.CreatedAt);

                entity.HasOne(e => e.CrewMember)
                    .WithMany()
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure OnboardingChecklistItem
            modelBuilder.Entity<OnboardingChecklistItem>(entity =>
            {
                entity.ToTable("onboarding_checklist_items");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.OnboardingCaseId);
                entity.HasIndex(e => new { e.OnboardingCaseId, e.Status });

                entity.HasOne(e => e.OnboardingCase)
                    .WithMany(c => c.ChecklistItems)
                    .HasForeignKey(e => e.OnboardingCaseId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure CrewDocumentSubmission
            modelBuilder.Entity<CrewDocumentSubmission>(entity =>
            {
                entity.ToTable("crew_document_submissions");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => new { e.CrewMemberId, e.DocumentType, e.IsActiveSubmission });
                entity.HasIndex(e => e.Status);

                entity.HasOne(e => e.CrewMember)
                    .WithMany()
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.IssuingCountry)
                    .WithMany()
                    .HasForeignKey(e => e.IssuingCountryId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            // Configure CrewDocumentVersion
            modelBuilder.Entity<CrewDocumentVersion>(entity =>
            {
                entity.ToTable("crew_document_versions");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.SubmissionId);
                entity.HasIndex(e => new { e.SubmissionId, e.IsActiveVersion });

                entity.HasOne(e => e.Submission)
                    .WithMany(s => s.Versions)
                    .HasForeignKey(e => e.SubmissionId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure DocumentVerificationTask
            modelBuilder.Entity<DocumentVerificationTask>(entity =>
            {
                entity.ToTable("document_verification_tasks");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.SubmissionId);
                entity.HasIndex(e => new { e.Status, e.Priority });
                entity.HasIndex(e => e.AssignedTo);
                entity.HasIndex(e => e.DueAt);

                entity.HasOne(e => e.Submission)
                    .WithMany(s => s.VerificationTasks)
                    .HasForeignKey(e => e.SubmissionId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Version)
                    .WithMany()
                    .HasForeignKey(e => e.VersionId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            // Configure DocumentVerificationAction
            modelBuilder.Entity<DocumentVerificationAction>(entity =>
            {
                entity.ToTable("document_verification_actions");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.TaskId);

                entity.HasOne(e => e.Task)
                    .WithMany(t => t.Actions)
                    .HasForeignKey(e => e.TaskId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure AuditLog
            modelBuilder.Entity<AuditLog>(entity =>
            {
                entity.ToTable("audit_logs");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => new { e.EntityType, e.EntityId });
                entity.HasIndex(e => e.Actor);
                entity.HasIndex(e => e.Timestamp);
                entity.HasIndex(e => e.CorrelationId);
            });

            // ============================================================
            // COMPLIANCE MATRIX CONFIGURATIONS (Phase 2)
            // ============================================================

            modelBuilder.Entity<ComplianceRuleSet>(entity =>
            {
                entity.ToTable("compliance_rule_sets");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.Code).IsUnique().HasFilter("\"Code\" IS NOT NULL");
                entity.HasIndex(e => e.IsActive);
            });

            modelBuilder.Entity<ComplianceRule>(entity =>
            {
                entity.ToTable("compliance_rules");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.RuleSetId);
                entity.HasIndex(e => e.Severity);
                entity.HasIndex(e => e.EvaluationStage);
                entity.HasIndex(e => e.RequiredCertificateId);
                entity.HasIndex(e => e.IsActive);

                entity.HasOne(e => e.RuleSet)
                    .WithMany(rs => rs.Rules)
                    .HasForeignKey(e => e.RuleSetId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ComplianceDimension>(entity =>
            {
                entity.ToTable("compliance_dimensions");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.RuleId);
                entity.HasIndex(e => new { e.DimensionType, e.Value });

                entity.HasOne(e => e.Rule)
                    .WithMany(r => r.Dimensions)
                    .HasForeignKey(e => e.RuleId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ComplianceWaiver>(entity =>
            {
                entity.ToTable("compliance_waivers");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => e.RuleId);
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => new { e.CrewMemberId, e.RuleId, e.Status });

                entity.HasOne(e => e.Rule)
                    .WithMany()
                    .HasForeignKey(e => e.RuleId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.CrewMember)
                    .WithMany()
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ComplianceSnapshot>(entity =>
            {
                entity.ToTable("compliance_snapshots");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => new { e.CrewMemberId, e.VesselId });
                entity.HasIndex(e => e.OverallResult);
                entity.HasIndex(e => e.EvaluatedAt);

                entity.HasOne(e => e.CrewMember)
                    .WithMany()
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // ============================================================
            // PLANNING & ASSIGNMENT CONFIGURATIONS (Phase 5)
            // ============================================================

            modelBuilder.Entity<VesselManningStandard>(entity =>
            {
                entity.ToTable("vessel_manning_standards");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.VesselId);
                entity.HasIndex(e => e.IsActive);
            });

            modelBuilder.Entity<ManningPosition>(entity =>
            {
                entity.ToTable("manning_positions");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.ManningStandardId);
                entity.HasIndex(e => e.RankId);

                entity.HasOne(e => e.ManningStandard)
                    .WithMany(s => s.Positions)
                    .HasForeignKey(e => e.ManningStandardId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Rank)
                    .WithMany()
                    .HasForeignKey(e => e.RankId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<CrewAssignment>(entity =>
            {
                entity.ToTable("crew_assignments");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => e.VesselId);
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => new { e.CrewMemberId, e.Status });
                entity.HasIndex(e => new { e.VesselId, e.Status });
                entity.HasIndex(e => new { e.PlannedStartDate, e.PlannedEndDate });

                entity.HasOne(e => e.CrewMember)
                    .WithMany()
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Rank)
                    .WithMany()
                    .HasForeignKey(e => e.RankId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(e => e.ManningPosition)
                    .WithMany()
                    .HasForeignKey(e => e.ManningPositionId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<AssignmentConfirmation>(entity =>
            {
                entity.ToTable("assignment_confirmations");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.AssignmentId);

                entity.HasOne(e => e.Assignment)
                    .WithMany(a => a.Confirmations)
                    .HasForeignKey(e => e.AssignmentId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<AssignmentConflict>(entity =>
            {
                entity.ToTable("assignment_conflicts");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.AssignmentId);
                entity.HasIndex(e => new { e.AssignmentId, e.IsResolved });

                entity.HasOne(e => e.Assignment)
                    .WithMany(a => a.Conflicts)
                    .HasForeignKey(e => e.AssignmentId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<AssignmentComment>(entity =>
            {
                entity.ToTable("assignment_comments");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.AssignmentId);

                entity.HasOne(e => e.Assignment)
                    .WithMany(a => a.Comments)
                    .HasForeignKey(e => e.AssignmentId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<AssignmentStatusHistory>(entity =>
            {
                entity.ToTable("assignment_status_history");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.AssignmentId);

                entity.HasOne(e => e.Assignment)
                    .WithMany(a => a.StatusHistory)
                    .HasForeignKey(e => e.AssignmentId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // ============================================================
            // EXTERNAL REQUESTS & TRAVEL CONFIGURATIONS (Phase 6)
            // ============================================================

            modelBuilder.Entity<ExternalRequest>(entity =>
            {
                entity.ToTable("external_requests");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.VesselId);
                entity.HasIndex(e => e.Status);

                entity.HasOne(e => e.Assignment)
                    .WithMany()
                    .HasForeignKey(e => e.AssignmentId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasOne(e => e.Rank)
                    .WithMany()
                    .HasForeignKey(e => e.RankId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<ExternalCandidate>(entity =>
            {
                entity.ToTable("external_candidates");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.ExternalRequestId);
                entity.HasIndex(e => e.Status);

                entity.HasOne(e => e.ExternalRequest)
                    .WithMany(r => r.Candidates)
                    .HasForeignKey(e => e.ExternalRequestId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ExternalRequestMessage>(entity =>
            {
                entity.ToTable("external_request_messages");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.ExternalRequestId);

                entity.HasOne(e => e.ExternalRequest)
                    .WithMany(r => r.Messages)
                    .HasForeignKey(e => e.ExternalRequestId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<TravelRequest>(entity =>
            {
                entity.ToTable("travel_requests");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.AssignmentId);
                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => e.Status);

                entity.HasOne(e => e.Assignment)
                    .WithMany()
                    .HasForeignKey(e => e.AssignmentId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.CrewMember)
                    .WithMany()
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.Property(e => e.EstimatedCost).HasPrecision(12, 2);
            });

            modelBuilder.Entity<TravelSegment>(entity =>
            {
                entity.ToTable("travel_segments");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.TravelRequestId);

                entity.HasOne(e => e.TravelRequest)
                    .WithMany(t => t.Segments)
                    .HasForeignKey(e => e.TravelRequestId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<TravelStatusHistory>(entity =>
            {
                entity.ToTable("travel_status_history");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.TravelRequestId);

                entity.HasOne(e => e.TravelRequest)
                    .WithMany(t => t.StatusHistory)
                    .HasForeignKey(e => e.TravelRequestId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // ============================================================
            // PHASE 7: ONBOARD EVENTS, ACCESS & SIGN-ON/SIGN-OFF
            // ============================================================

            modelBuilder.Entity<OnboardEvent>(entity =>
            {
                entity.ToTable("onboard_events");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => e.VesselId);
                entity.HasIndex(e => e.EventType);
                entity.HasIndex(e => e.EventTimestamp);

                entity.HasOne(e => e.CrewMember)
                    .WithMany()
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Assignment)
                    .WithMany()
                    .HasForeignKey(e => e.AssignmentId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasOne(e => e.OriginalEvent)
                    .WithMany()
                    .HasForeignKey(e => e.OriginalEventId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<CrewAccessGrant>(entity =>
            {
                entity.ToTable("crew_access_grants");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => e.VesselId);
                entity.HasIndex(e => e.Status);

                entity.HasOne(e => e.CrewMember)
                    .WithMany()
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Assignment)
                    .WithMany()
                    .HasForeignKey(e => e.AssignmentId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<SignOnRecord>(entity =>
            {
                entity.ToTable("sign_on_records");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => e.VesselId);
                entity.HasIndex(e => e.SignOnDate);

                entity.HasOne(e => e.CrewMember)
                    .WithMany()
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Rank)
                    .WithMany()
                    .HasForeignKey(e => e.RankId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(e => e.Assignment)
                    .WithMany()
                    .HasForeignKey(e => e.AssignmentId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasOne(e => e.OnboardEvent)
                    .WithMany()
                    .HasForeignKey(e => e.OnboardEventId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<SignOffRecord>(entity =>
            {
                entity.ToTable("sign_off_records");
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.CrewMemberId);
                entity.HasIndex(e => e.VesselId);
                entity.HasIndex(e => e.SignOffDate);

                entity.HasOne(e => e.CrewMember)
                    .WithMany()
                    .HasForeignKey(e => e.CrewMemberId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(e => e.Rank)
                    .WithMany()
                    .HasForeignKey(e => e.RankId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(e => e.Assignment)
                    .WithMany()
                    .HasForeignKey(e => e.AssignmentId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasOne(e => e.OnboardEvent)
                    .WithMany()
                    .HasForeignKey(e => e.OnboardEventId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasOne(e => e.SignOnRecord)
                    .WithMany()
                    .HasForeignKey(e => e.SignOnRecordId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            // ============================================================
            // PMS ENTITY CONFIGURATIONS
            // ============================================================

            modelBuilder.Entity<EquipmentAsset>(entity =>
            {
                entity.ToTable("equipment_assets");
                // Unique per vessel: same asset code can exist on different vessels
                entity.HasIndex(e => new { e.VesselId, e.AssetCode }).IsUnique();
                entity.HasOne(e => e.Parent)
                    .WithMany(e => e.Children)
                    .HasForeignKey(e => e.ParentId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<EquipmentGroup>(entity =>
            {
                entity.ToTable("equipment_groups");
                entity.HasIndex(e => e.GroupCode).IsUnique();
            });

            modelBuilder.Entity<EquipmentGroupMember>(entity =>
            {
                entity.ToTable("equipment_group_members");
                entity.HasOne(e => e.Group)
                    .WithMany(g => g.Members)
                    .HasForeignKey(e => e.GroupId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Asset)
                    .WithMany()
                    .HasForeignKey(e => e.AssetId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasIndex(e => new { e.GroupId, e.AssetId }).IsUnique();
            });

            modelBuilder.Entity<MaintenanceSchedule>(entity =>
            {
                entity.ToTable("maintenance_schedules");
                entity.HasIndex(e => e.ScheduleCode).IsUnique();
            });

            modelBuilder.Entity<ScheduleSparePart>(entity =>
            {
                entity.ToTable("schedule_spare_parts");
                // Định mức phụ tùng tham chiếu DANH MỤC vật tư dùng chung (material_items).
                entity.HasOne<MaterialItem>().WithMany()
                    .HasForeignKey(e => e.MaterialItemId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<ScheduleChecklistTemplate>(entity =>
            {
                entity.ToTable("schedule_checklist_templates");
            });

            modelBuilder.Entity<MaintenanceHistory>(entity =>
            {
                entity.ToTable("maintenance_histories");
            });

            // ============================================================
            // MATERIALS ENTITY CONFIGURATIONS
            // ============================================================

            modelBuilder.Entity<MaterialCategory>(entity =>
            {
                entity.ToTable("material_categories");
                entity.HasIndex(e => e.CategoryCode).IsUnique();
            });

            modelBuilder.Entity<MaterialItem>(entity =>
            {
                // Danh mục vật tư dùng chung toàn fleet.
                entity.ToTable("material_items");
                entity.HasIndex(e => e.ItemCode).IsUnique();
                entity.Property(e => e.UnitPrice).HasPrecision(18, 4);
            });

            modelBuilder.Entity<MaterialItemShip>(entity =>
            {
                // Vật tư theo từng tàu / kho trên tàu.
                entity.ToTable("material_item_ship");
                // Mã vật tư trên tàu duy nhất theo từng tàu.
                entity.HasIndex(e => new { e.VesselId, e.ShipItemCode }).IsUnique();
                entity.Property(e => e.UnitCost).HasPrecision(18, 4);
                // FK trỏ về danh mục chung theo mã vật tư (ItemCode là alternate key của material_items).
                entity.HasOne(e => e.MaterialItem)
                    .WithMany(c => c.ShipItems)
                    .HasForeignKey(e => e.MaterialItemCode)
                    .HasPrincipalKey(c => c.ItemCode)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<MaterialItemEquipment>(entity =>
            {
                entity.ToTable("material_item_equipments");
                entity.HasIndex(e => new { e.MaterialItemId, e.EquipmentAssetId }).IsUnique();
                // Liên kết vật tư–thiết bị tham chiếu DANH MỤC vật tư (material_items).
                entity.HasOne<MaterialItem>().WithMany()
                    .HasForeignKey(e => e.MaterialItemId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<StoreLocation>(entity =>
            {
                entity.ToTable("store_locations");
                entity.HasIndex(e => e.LocationCode).IsUnique();
                entity.HasOne(e => e.Parent)
                    .WithMany(e => e.Children)
                    .HasForeignKey(e => e.ParentId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<MaterialRequest>(entity =>
            {
                entity.ToTable("material_requests");
                entity.HasIndex(e => e.RequestCode).IsUnique();
            });

            modelBuilder.Entity<MaterialRequestItem>(entity =>
            {
                entity.ToTable("material_request_items");
                entity.Property(e => e.QuantityOnHand).HasPrecision(18, 4);
                entity.Property(e => e.QuantityRequested).HasPrecision(18, 4);
                entity.HasOne(e => e.Request)
                    .WithMany(r => r.Items)
                    .HasForeignKey(e => e.RequestId)
                    .OnDelete(DeleteBehavior.Cascade);
                // Dòng yêu cầu tham chiếu DANH MỤC vật tư (material_items), nullable (cho phép freeform).
                entity.HasOne<MaterialItem>().WithMany()
                    .HasForeignKey(e => e.MaterialItemId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<StockReceipt>(entity =>
            {
                entity.ToTable("stock_receipts");
                entity.HasIndex(e => e.ReceiptCode).IsUnique();
                entity.HasOne(e => e.MaterialRequest)
                    .WithMany()
                    .HasForeignKey(e => e.MaterialRequestId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<StockReceiptItem>(entity =>
            {
                entity.ToTable("stock_receipt_items");
                entity.Property(e => e.QuantityRequested).HasPrecision(18, 4);
                entity.Property(e => e.QuantityReceived).HasPrecision(18, 4);
                entity.Property(e => e.UnitCost).HasPrecision(18, 4);
                entity.HasOne(e => e.Receipt)
                    .WithMany(r => r.Items)
                    .HasForeignKey(e => e.ReceiptId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<InventoryStock>(entity =>
            {
                entity.ToTable("inventory_stocks");
                entity.HasIndex(e => new { e.MaterialItemId, e.StoreLocationId }).IsUnique();
                entity.Property(e => e.Quantity).HasPrecision(18, 4);
                entity.Property(e => e.UnitCost).HasPrecision(18, 4);
            });

            // ============================================================
            // PHASE 2.3: SYNC NONCE REGISTRY (Replay Protection)
            // ============================================================
            modelBuilder.Entity<SyncNonceRegistryEntry>(entity =>
            {
                entity.ToTable("sync_nonce_registry");
                entity.HasKey(e => e.Id);

                // Unique constraint on nonce to detect replays
                entity.HasIndex(e => e.Nonce).IsUnique();

                // Index on ExpiresAtUtc for cleanup queries
                entity.HasIndex(e => e.ExpiresAtUtc);

                // Index for debugging
                entity.HasIndex(e => new { e.OriginNode, e.RegisteredAtUtc });
            });

            // ============================================================
            // PHASE 2.4: SYNC DEAD-LETTER QUEUE (Batch Failure Handling)
            // ============================================================
            modelBuilder.Entity<SyncDlqEntry>(entity =>
            {
                entity.ToTable("sync_dlq_items");
                entity.HasKey(e => e.Id);

                // Index for querying pending items
                entity.HasIndex(e => new { e.IsApprovedForManualReplay, e.MovedToDlqAtUtc });

                // Index for statistics
                entity.HasIndex(e => e.Priority);
                entity.HasIndex(e => e.MovedToDlqAtUtc);

                // Index for finding items by origin
                entity.HasIndex(e => e.OriginEdgeNode);
            });

            // ============================================================
            // AI REPORT EVALUATIONS
            // ============================================================
            modelBuilder.Entity<ReportEvaluation>()
                .HasIndex(e => e.ReportId)
                .IsUnique();

            // ============================================================
            // SMS SYSTEM ENTITY CONFIGURATIONS
            // ============================================================
            modelBuilder.Entity<IsmElement>(entity =>
            {
                entity.ToTable("ism_elements");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
            });

            modelBuilder.Entity<SmsProcedure>(entity =>
            {
                entity.ToTable("sms_procedures");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.PublishDate)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.ObsoleteDate)
                    .HasConversion(v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null, v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.HasIndex(e => e.ProcedureCode);
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => e.IsmElementId);
            });

            modelBuilder.Entity<SmsProcedureAcknowledge>(entity =>
            {
                entity.ToTable("sms_procedure_acknowledgements");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.AcknowledgedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.HasIndex(e => new { e.SmsProcedureId, e.UserName, e.Rank });
            });

            modelBuilder.Entity<SmsFormTemplate>(entity =>
            {
                entity.ToTable("sms_form_templates");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.HasIndex(e => e.FormCode);
                entity.HasIndex(e => e.SmsProcedureId);
            });

            modelBuilder.Entity<SmsFilledRecord>(entity =>
            {
                entity.ToTable("sms_filled_records");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.FilledDate)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => e.FormCode);
                entity.HasIndex(e => e.SmsFormTemplateId);
                entity.HasIndex(e => e.VesselName);
            });

            // ============================================================
            // DE4 WEATHER ROUTING
            // ============================================================
            modelBuilder.Entity<ProductApi.Models.WeatherRouting.WeatherRoutingJob>(entity =>
            {
                entity.ToTable("weather_routing_jobs");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Status).HasMaxLength(32).IsRequired();
                entity.Property(e => e.RequestJson).HasColumnType("jsonb");
                entity.Property(e => e.HazardJson).HasColumnType("jsonb");
                entity.Property(e => e.MetricsJson).HasColumnType("jsonb");
                entity.Property(e => e.PlanJson).HasColumnType("jsonb");
                entity.Property(e => e.ErrorMessage).HasMaxLength(2000);
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.CompletedAt)
                    .HasConversion(
                        v => v.HasValue ? v.Value.ToUniversalTime() : (DateTime?)null,
                        v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : (DateTime?)null);
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => e.VesselId);
                entity.HasIndex(e => e.CreatedAt);
                entity.HasMany(e => e.Routes)
                    .WithOne(r => r.Job)
                    .HasForeignKey(r => r.JobId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ProductApi.Models.WeatherRouting.WeatherRoutingRoute>(entity =>
            {
                entity.ToTable("weather_routing_routes");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Kind).HasMaxLength(32).IsRequired();
                entity.Property(e => e.WaypointsJson).HasColumnType("jsonb");
                entity.Property(e => e.MetricsJson).HasColumnType("jsonb");
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.HasIndex(e => e.JobId);
                entity.HasIndex(e => new { e.JobId, e.Version });
                entity.HasIndex(e => e.Kind);
            });

            modelBuilder.Entity<ProductApi.Models.WeatherRouting.VesselFuelProfile>(entity =>
            {
                entity.ToTable("vessel_fuel_profiles");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.FuelType).HasMaxLength(20).IsRequired();
                entity.Property(e => e.VesselName).HasMaxLength(100);
                entity.Property(e => e.Source).HasMaxLength(20).IsRequired();
                entity.Property(e => e.Notes).HasMaxLength(500);
                entity.Property(e => e.CreatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.Property(e => e.UpdatedAt)
                    .HasConversion(v => v.ToUniversalTime(), v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
                entity.HasIndex(e => e.VesselId).IsUnique();
                entity.HasOne(e => e.Vessel)
                    .WithMany()
                    .HasForeignKey(e => e.VesselId)
                    .OnDelete(DeleteBehavior.Cascade);
            });
        }
    }
}
