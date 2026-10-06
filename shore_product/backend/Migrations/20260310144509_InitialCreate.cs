using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace productapi.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AisData",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Mmsi = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: false),
                    SpeedOverGround = table.Column<double>(type: "double precision", nullable: true),
                    Latitude = table.Column<double>(type: "double precision", nullable: true),
                    Longitude = table.Column<double>(type: "double precision", nullable: true),
                    CourseOverGround = table.Column<double>(type: "double precision", nullable: true),
                    ShipName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    Destination = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    EtaMonth = table.Column<int>(type: "integer", nullable: true),
                    EtaDay = table.Column<int>(type: "integer", nullable: true),
                    EtaHour = table.Column<int>(type: "integer", nullable: true),
                    EtaMinute = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AisData", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "arrival_reports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MaritimeReportId = table.Column<Guid>(type: "uuid", nullable: false),
                    PortName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PortLocode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    ArrivalDateTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ArrivalDateTimeLocal = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TimeZone = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ArrivalLat = table.Column<double>(type: "double precision", nullable: true),
                    ArrivalLon = table.Column<double>(type: "double precision", nullable: true),
                    VoyageDistance = table.Column<double>(type: "double precision", nullable: true),
                    VoyageDurationHours = table.Column<double>(type: "double precision", nullable: true),
                    AverageSpeedKnots = table.Column<double>(type: "double precision", nullable: true),
                    DraftFore = table.Column<double>(type: "double precision", nullable: true),
                    DraftAft = table.Column<double>(type: "double precision", nullable: true),
                    DraftMidship = table.Column<double>(type: "double precision", nullable: true),
                    FuelOilConsumed = table.Column<double>(type: "double precision", nullable: true),
                    DieselOilConsumed = table.Column<double>(type: "double precision", nullable: true),
                    FuelOilROB = table.Column<double>(type: "double precision", nullable: true),
                    DieselOilROB = table.Column<double>(type: "double precision", nullable: true),
                    LubOilROB = table.Column<double>(type: "double precision", nullable: true),
                    FreshWaterROB = table.Column<double>(type: "double precision", nullable: true),
                    CargoOnBoard = table.Column<double>(type: "double precision", nullable: true),
                    CargoDescription = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PersonsOnBoard = table.Column<int>(type: "integer", nullable: true),
                    Remarks = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_arrival_reports", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "audit_logs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    EntityType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    EntityId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Actor = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SourceChannel = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    BeforeState = table.Column<string>(type: "text", nullable: true),
                    AfterState = table.Column<string>(type: "text", nullable: true),
                    CorrelationId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Details = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    IpAddress = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit_logs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "certificates",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CertificateCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    CertificateName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ValidityPeriodMonths = table.Column<int>(type: "integer", nullable: true),
                    Description = table.Column<string>(type: "text", nullable: true),
                    IsMandatory = table.Column<bool>(type: "boolean", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_certificates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "compliance_rule_sets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Authority = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    EffectiveFrom = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EffectiveTo = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_compliance_rule_sets", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "countries",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CountryCode = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    CountryName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    FlagImageUrl = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_countries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "departure_reports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MaritimeReportId = table.Column<Guid>(type: "uuid", nullable: false),
                    PortName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PortLocode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    DepartureDateTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DepartureDateTimeLocal = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TimeZone = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    DepartureLat = table.Column<double>(type: "double precision", nullable: true),
                    DepartureLon = table.Column<double>(type: "double precision", nullable: true),
                    DraftFore = table.Column<double>(type: "double precision", nullable: true),
                    DraftAft = table.Column<double>(type: "double precision", nullable: true),
                    DraftMidship = table.Column<double>(type: "double precision", nullable: true),
                    FuelOilROB = table.Column<double>(type: "double precision", nullable: true),
                    DieselOilROB = table.Column<double>(type: "double precision", nullable: true),
                    LubOilROB = table.Column<double>(type: "double precision", nullable: true),
                    FreshWaterROB = table.Column<double>(type: "double precision", nullable: true),
                    DistanceToNextPort = table.Column<double>(type: "double precision", nullable: true),
                    ETA = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    NextPort = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    NextPortLocode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    CargoOnBoard = table.Column<double>(type: "double precision", nullable: true),
                    CargoDescription = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PersonsOnBoard = table.Column<int>(type: "integer", nullable: true),
                    Remarks = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_departure_reports", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EngineData",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EngineId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Rpm = table.Column<double>(type: "double precision", nullable: true),
                    LoadPercent = table.Column<double>(type: "double precision", nullable: true),
                    FuelRate = table.Column<double>(type: "double precision", nullable: true),
                    RunningHours = table.Column<double>(type: "double precision", nullable: true),
                    AlarmStatus = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EngineData", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "FuelConsumptionData",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    FuelType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ConsumedVolume = table.Column<double>(type: "double precision", nullable: false),
                    ConsumedMass = table.Column<double>(type: "double precision", nullable: false),
                    TankId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Density = table.Column<double>(type: "double precision", nullable: true),
                    DistanceTraveled = table.Column<double>(type: "double precision", nullable: true),
                    TimeUnderway = table.Column<double>(type: "double precision", nullable: true),
                    CargoWeight = table.Column<double>(type: "double precision", nullable: true),
                    Co2Emissions = table.Column<double>(type: "double precision", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FuelConsumptionData", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "GeneratorData",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    GeneratorId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    IsRunning = table.Column<bool>(type: "boolean", nullable: false),
                    RunningHours = table.Column<double>(type: "double precision", nullable: true),
                    LoadPercent = table.Column<double>(type: "double precision", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GeneratorData", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MaintenanceTasks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    ScheduledAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ShipId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MaintenanceTasks", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "maritime_reports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ReportNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ReportTypeId = table.Column<int>(type: "integer", nullable: false),
                    ReportDateTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    VoyageId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    PreparedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    MasterSignature = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    SignedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReportData = table.Column<string>(type: "text", nullable: false),
                    Remarks = table.Column<string>(type: "text", nullable: true),
                    IsTransmitted = table.Column<bool>(type: "boolean", nullable: false),
                    TransmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    DeletedReason = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_maritime_reports", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "noon_reports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MaritimeReportId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReportDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Latitude = table.Column<double>(type: "double precision", nullable: true),
                    Longitude = table.Column<double>(type: "double precision", nullable: true),
                    CourseOverGround = table.Column<double>(type: "double precision", nullable: true),
                    SpeedOverGround = table.Column<double>(type: "double precision", nullable: true),
                    DistanceTraveled = table.Column<double>(type: "double precision", nullable: true),
                    DistanceToGo = table.Column<double>(type: "double precision", nullable: true),
                    EstimatedTimeOfArrival = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    WeatherConditions = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SeaState = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    AirTemperature = table.Column<double>(type: "double precision", nullable: true),
                    SeaTemperature = table.Column<double>(type: "double precision", nullable: true),
                    BarometricPressure = table.Column<double>(type: "double precision", nullable: true),
                    WindDirection = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    WindSpeed = table.Column<double>(type: "double precision", nullable: true),
                    Visibility = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    FuelOilConsumed = table.Column<double>(type: "double precision", nullable: true),
                    DieselOilConsumed = table.Column<double>(type: "double precision", nullable: true),
                    LubOilConsumed = table.Column<double>(type: "double precision", nullable: true),
                    FreshWaterConsumed = table.Column<double>(type: "double precision", nullable: true),
                    FuelOilROB = table.Column<double>(type: "double precision", nullable: true),
                    DieselOilROB = table.Column<double>(type: "double precision", nullable: true),
                    LubOilROB = table.Column<double>(type: "double precision", nullable: true),
                    FreshWaterROB = table.Column<double>(type: "double precision", nullable: true),
                    MainEngineRunningHours = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    MainEngineRPM = table.Column<double>(type: "double precision", nullable: true),
                    MainEnginePower = table.Column<double>(type: "double precision", nullable: true),
                    AuxEngineRunningHours = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CargoOnBoard = table.Column<double>(type: "double precision", nullable: true),
                    CargoDescription = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    OperationalRemarks = table.Column<string>(type: "text", nullable: true),
                    MachineryRemarks = table.Column<string>(type: "text", nullable: true),
                    CargoRemarks = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_noon_reports", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PositionData",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Latitude = table.Column<double>(type: "double precision", nullable: false),
                    Longitude = table.Column<double>(type: "double precision", nullable: false),
                    SpeedOverGround = table.Column<double>(type: "double precision", nullable: true),
                    CourseOverGround = table.Column<double>(type: "double precision", nullable: true),
                    Source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PositionData", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ranks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RankCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    RankName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Department = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ranks", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "report_types",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TypeCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TypeName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    RegulationReference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Frequency = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    IsMandatory = table.Column<bool>(type: "boolean", nullable: false),
                    RequiresMasterSignature = table.Column<bool>(type: "boolean", nullable: false),
                    TemplateSchema = table.Column<string>(type: "text", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_report_types", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SafetyAlarms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AlarmType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    AlarmCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Severity = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Location = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    IsAcknowledged = table.Column<bool>(type: "boolean", nullable: false),
                    AcknowledgedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AcknowledgedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    IsResolved = table.Column<bool>(type: "boolean", nullable: false),
                    ResolvedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SafetyAlarms", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Ships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    IMO = table.Column<string>(type: "text", nullable: false),
                    Capacity = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Ships", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "sync_idempotency_records",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    IdempotencyKey = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ProcessedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sync_idempotency_records", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "sync_logs",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Direction = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TableName = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    RecordKey = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ActionType = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ConflictDetail = table.Column<string>(type: "text", nullable: true),
                    ProcessedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sync_logs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "sync_node_trackers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    NodeId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ShipName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    ImoNumber = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    LastPushAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TotalReceivedCount = table.Column<long>(type: "bigint", nullable: false),
                    LastPushBatchSize = table.Column<int>(type: "integer", nullable: false),
                    LastReceivedVersion = table.Column<long>(type: "bigint", nullable: false),
                    LastPullAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TotalDeliveredCount = table.Column<long>(type: "bigint", nullable: false),
                    PendingOutboxCount = table.Column<int>(type: "integer", nullable: false),
                    LastAcknowledgedId = table.Column<long>(type: "bigint", nullable: false),
                    LastHeartbeatAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CurrentNetworkType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    IsOnline = table.Column<bool>(type: "boolean", nullable: false),
                    ConsecutiveFailures = table.Column<int>(type: "integer", nullable: false),
                    LastError = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    LastErrorAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sync_node_trackers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "sync_outbox",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TargetNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TableName = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    RecordKey = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ActionType = table.Column<int>(type: "integer", nullable: false),
                    Payload = table.Column<string>(type: "text", nullable: false),
                    SyncVersion = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeliveredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sync_outbox", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "sync_table_stats",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    NodeId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TableName = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TotalSynced = table.Column<long>(type: "bigint", nullable: false),
                    TotalConflicts = table.Column<long>(type: "bigint", nullable: false),
                    TotalFailed = table.Column<long>(type: "bigint", nullable: false),
                    LastSyncAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SnapshotAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sync_table_stats", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TankLevels",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TankId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TankType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    LevelPercent = table.Column<double>(type: "double precision", nullable: false),
                    VolumeLiters = table.Column<double>(type: "double precision", nullable: true),
                    Temperature = table.Column<double>(type: "double precision", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TankLevels", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Username = table.Column<string>(type: "text", nullable: false),
                    PasswordHash = table.Column<string>(type: "text", nullable: false),
                    Role = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "vessel_manning_standards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    DocumentReference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    EffectiveFrom = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EffectiveTo = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_vessel_manning_standards", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Vessels",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    IMO = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CallSign = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    VesselType = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    GrossTonnage = table.Column<double>(type: "double precision", precision: 10, scale: 2, nullable: false),
                    DeadWeight = table.Column<double>(type: "double precision", precision: 10, scale: 2, nullable: false),
                    BuildDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Flag = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    OfficialNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PortOfRegistry = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PreviousName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PreviousFlag = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    MmsiNumber = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    ClassNotation = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ClassRegisterNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ShipyardCountry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ShipyardName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    YardNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CompanyImoNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SuezCanalIdNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    KeelLaidDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    YearBuilt = table.Column<int>(type: "integer", nullable: true),
                    DateOfRegistry = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    OwnerImoNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PanamaCanalIdNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    MaxPersonsAllowedOB = table.Column<int>(type: "integer", nullable: true),
                    ServiceSpeedKts = table.Column<double>(type: "double precision", nullable: true),
                    VrpNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    VrpType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    NoOfCrewSafeManning = table.Column<int>(type: "integer", nullable: true),
                    MaxPassengersAllowedOB = table.Column<int>(type: "integer", nullable: true),
                    Loa = table.Column<double>(type: "double precision", nullable: true),
                    Lbp = table.Column<double>(type: "double precision", nullable: true),
                    BreadthMoulded = table.Column<double>(type: "double precision", nullable: true),
                    DepthMoulded = table.Column<double>(type: "double precision", nullable: true),
                    DraftMoulded = table.Column<double>(type: "double precision", nullable: true),
                    DraftScantling = table.Column<double>(type: "double precision", nullable: true),
                    DraftFullBallast = table.Column<double>(type: "double precision", nullable: true),
                    HMaxAirdraft = table.Column<double>(type: "double precision", nullable: true),
                    AirdraftReductionMastFouled = table.Column<double>(type: "double precision", nullable: true),
                    DDistance = table.Column<double>(type: "double precision", nullable: true),
                    BridgeToAft = table.Column<double>(type: "double precision", nullable: true),
                    BridgeToBow = table.Column<double>(type: "double precision", nullable: true),
                    BowToBulbousBow = table.Column<double>(type: "double precision", nullable: true),
                    ParallelBodyBallast = table.Column<double>(type: "double precision", nullable: true),
                    ParallelBodyLoaded = table.Column<double>(type: "double precision", nullable: true),
                    LightShip = table.Column<double>(type: "double precision", nullable: true),
                    BlockCoefficientNA = table.Column<bool>(type: "boolean", nullable: false),
                    BlockCoefficient = table.Column<double>(type: "double precision", nullable: true),
                    TpcAtSummerDraft = table.Column<double>(type: "double precision", nullable: true),
                    FreshWaterAllowanceFwa = table.Column<double>(type: "double precision", nullable: true),
                    GrossTonnageInternational = table.Column<double>(type: "double precision", nullable: true),
                    GrossTonnageSuezCanal = table.Column<double>(type: "double precision", nullable: true),
                    GrossTonnagePanamaCanal = table.Column<double>(type: "double precision", nullable: true),
                    NettTonnageInternational = table.Column<double>(type: "double precision", nullable: true),
                    NettTonnageSuezCanal = table.Column<double>(type: "double precision", nullable: true),
                    NettTonnagePanamaCanal = table.Column<double>(type: "double precision", nullable: true),
                    ManifoldToWaterlineBallast = table.Column<double>(type: "double precision", nullable: true),
                    ManifoldToWaterlineLoaded = table.Column<double>(type: "double precision", nullable: true),
                    DeckToManifold = table.Column<double>(type: "double precision", nullable: true),
                    SternToManifold = table.Column<double>(type: "double precision", nullable: true),
                    ShipsideToManifold = table.Column<double>(type: "double precision", nullable: true),
                    BowToManifold = table.Column<double>(type: "double precision", nullable: true),
                    ManifoldToKeel = table.Column<double>(type: "double precision", nullable: true),
                    ManifoldToBridge = table.Column<double>(type: "double precision", nullable: true),
                    MaxLoadingRateShip = table.Column<double>(type: "double precision", nullable: true),
                    NumberOfLines = table.Column<int>(type: "integer", nullable: true),
                    MaxAllowablePressurePsi = table.Column<double>(type: "double precision", nullable: true),
                    VentingSystemShip = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    AnchorChainPort = table.Column<int>(type: "integer", nullable: true),
                    AnchorChainStarboard = table.Column<int>(type: "integer", nullable: true),
                    AnchorChainStern = table.Column<int>(type: "integer", nullable: true),
                    AnchorChainSternNA = table.Column<bool>(type: "boolean", nullable: false),
                    BowthrusterNA = table.Column<bool>(type: "boolean", nullable: false),
                    SternthrusterNA = table.Column<bool>(type: "boolean", nullable: false),
                    ShaftGeneratorNA = table.Column<bool>(type: "boolean", nullable: false),
                    HarbourGeneratorMaker = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    HarbourGeneratorMaxPowerKW = table.Column<double>(type: "double precision", nullable: true),
                    AzimuthEngFwdCount = table.Column<int>(type: "integer", nullable: true),
                    AzimuthEngFwdMaxPowerKW = table.Column<double>(type: "double precision", nullable: true),
                    AzimuthEngAftCount = table.Column<int>(type: "integer", nullable: true),
                    AzimuthEngAftMaxPowerKW = table.Column<double>(type: "double precision", nullable: true),
                    ShipownerName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    ShipownerStreet = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    ShipownerCountry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ShipownerZip = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    ShipownerCity = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ShipownerPhone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ShipownerFax = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ShipownerTlx = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ShipownerEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ShipownerContactPerson = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ManagingOwnerName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    ManagingOwnerStreet = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    ManagingOwnerCountry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ManagingOwnerZip = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    ManagingOwnerCity = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ManagingOwnerPhone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ManagingOwnerFax = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ManagingOwnerTlx = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ManagingOwnerEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ManagingOwnerContactPerson = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    OperatorName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    OperatorStreet = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    OperatorCountry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    OperatorZip = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    OperatorCity = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    OperatorPhone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    OperatorFax = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    OperatorTlx = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    OperatorEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    OperatorContactPerson = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CsoTitle = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    CsoFirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CsoLastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CsoStreet = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    CsoCountry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CsoZip = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    CsoCity = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CsoPhone24h = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CsoFax = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CsoTlx = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CsoEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    DpaTitle = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    DpaFirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    DpaLastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    DpaStreet = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    DpaCountry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    DpaZip = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    DpaCity = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    DpaPhone24h = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DpaFax = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DpaTlx = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DpaEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    QiUsaTitle = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    QiUsaFirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    QiUsaLastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    QiUsaStreet = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    QiUsaCountry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    QiUsaZip = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    QiUsaCity = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    QiUsaPhone24h = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    QiUsaFax = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    QiUsaTlx = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    QiUsaEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    QiPanamaTitle = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    QiPanamaFirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    QiPanamaLastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    QiPanamaStreet = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    QiPanamaCountry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    QiPanamaZip = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    QiPanamaCity = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    QiPanamaPhone24h = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    QiPanamaFax = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    QiPanamaTlx = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    QiPanamaEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ChartererName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    ChartererStreet = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    ChartererCountry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ChartererZip = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    ChartererCity = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ChartererPhone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ChartererFax = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ChartererTlx = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ChartererEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ChartererContactPerson = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    BareboatChartererName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    BareboatChartererStreet = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    BareboatChartererCountry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    BareboatChartererZip = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    BareboatChartererCity = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    BareboatChartererPhone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    BareboatChartererFax = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    BareboatChartererTlx = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    BareboatChartererEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    BareboatChartererContactPerson = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ClassSocietyName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    ClassSocietyStreet = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    ClassSocietyCountry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ClassSocietyZip = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    ClassSocietyCity = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ClassSocietyPhone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ClassSocietyFax = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ClassSocietyTlx = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ClassSocietyEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ClassSocietyContactPerson = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    FlagStateName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    FlagStateStreet = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    FlagStateCountry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FlagStateZip = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    FlagStateCity = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FlagStatePhone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    FlagStateFax = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    FlagStateTlx = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    FlagStateEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    FlagStateContactPerson = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PiClubName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    PiClubStreet = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    PiClubCountry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PiClubZip = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    PiClubCity = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PiClubPhone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PiClubFax = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PiClubTlx = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PiClubEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PiClubContactPerson = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    HmClubName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    HmClubStreet = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    HmClubCountry = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    HmClubZip = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    HmClubCity = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    HmClubPhone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    HmClubFax = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    HmClubTlx = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    HmClubEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    HmClubContactPerson = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    InmarsatTelex1 = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    InmarsatTelex2 = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    InmarsatPhone1 = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    InmarsatPhone2 = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    InmarsatFax1 = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    InmarsatFax2 = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    EmailAddress1 = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    EmailAddress2 = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    GsmPhone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SeaAreaA1 = table.Column<bool>(type: "boolean", nullable: false),
                    SeaAreaA2 = table.Column<bool>(type: "boolean", nullable: false),
                    SeaAreaA3 = table.Column<bool>(type: "boolean", nullable: false),
                    SeaAreaA4 = table.Column<bool>(type: "boolean", nullable: false),
                    DscHF = table.Column<bool>(type: "boolean", nullable: false),
                    DscMF = table.Column<bool>(type: "boolean", nullable: false),
                    DscVHF = table.Column<bool>(type: "boolean", nullable: false),
                    RadiotelephoneHF = table.Column<bool>(type: "boolean", nullable: false),
                    RadiotelephoneMF = table.Column<bool>(type: "boolean", nullable: false),
                    RadiotelephoneVHF = table.Column<bool>(type: "boolean", nullable: false),
                    RadiotelegraphHF = table.Column<bool>(type: "boolean", nullable: false),
                    RadiotelegraphMF = table.Column<bool>(type: "boolean", nullable: false),
                    RadiotelegraphVHF = table.Column<bool>(type: "boolean", nullable: false),
                    Navtex = table.Column<bool>(type: "boolean", nullable: false),
                    Ais = table.Column<bool>(type: "boolean", nullable: false),
                    SartTransponder = table.Column<bool>(type: "boolean", nullable: false),
                    Radiotelex = table.Column<bool>(type: "boolean", nullable: false),
                    OtherRadioEquipment = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    EpirbNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    EpirbOperatingSystem = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    EpirbMaker = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    EpirbModel = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    EpirbFrequency = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    HfoCbm = table.Column<double>(type: "double precision", nullable: true),
                    MdoCbm = table.Column<double>(type: "double precision", nullable: true),
                    LubOilCbm = table.Column<double>(type: "double precision", nullable: true),
                    SludgeCbm = table.Column<double>(type: "double precision", nullable: true),
                    BilgeWaterCbm = table.Column<double>(type: "double precision", nullable: true),
                    SewageCbm = table.Column<double>(type: "double precision", nullable: true),
                    FreshWaterCbm = table.Column<double>(type: "double precision", nullable: true),
                    BallastWaterCbm = table.Column<double>(type: "double precision", nullable: true),
                    NoOfBallastTanks = table.Column<int>(type: "integer", nullable: true),
                    TeuTotal = table.Column<int>(type: "integer", nullable: true),
                    TeuOnDeck = table.Column<int>(type: "integer", nullable: true),
                    TeuUnderDeck = table.Column<int>(type: "integer", nullable: true),
                    GrainCbm = table.Column<double>(type: "double precision", nullable: true),
                    BalesCbm = table.Column<double>(type: "double precision", nullable: true),
                    NoOfCargoHolds = table.Column<int>(type: "integer", nullable: true),
                    NoOfHatches = table.Column<int>(type: "integer", nullable: true),
                    LastEdgeSyncAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastShoreSyncAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FieldOwnership = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Vessels", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "VoyageRecords",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VoyageNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DeparturePort = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DepartureTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ArrivalPort = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ArrivalTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CargoType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CargoWeight = table.Column<double>(type: "double precision", nullable: true),
                    DistanceTraveled = table.Column<double>(type: "double precision", nullable: true),
                    FuelConsumed = table.Column<double>(type: "double precision", nullable: true),
                    AverageSpeed = table.Column<double>(type: "double precision", nullable: true),
                    VoyageStatus = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VoyageRecords", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "compliance_rules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RuleSetId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    RequirementType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    RequiredCertificateId = table.Column<int>(type: "integer", nullable: true),
                    RequiredDocumentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Severity = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    EvaluationStage = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    MinDaysBeforeExpiry = table.Column<int>(type: "integer", nullable: true),
                    GracePeriodDays = table.Column<int>(type: "integer", nullable: true),
                    RenewWindowDays = table.Column<int>(type: "integer", nullable: true),
                    WaiverAllowed = table.Column<bool>(type: "boolean", nullable: false),
                    WaiverApproverRole = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    AllowEquivalent = table.Column<bool>(type: "boolean", nullable: false),
                    EquivalentCertificateIds = table.Column<string>(type: "text", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    UiMessage = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ExplainabilityText = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_compliance_rules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_compliance_rules_compliance_rule_sets_RuleSetId",
                        column: x => x.RuleSetId,
                        principalTable: "compliance_rule_sets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "country_certificates",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CountryId = table.Column<int>(type: "integer", nullable: false),
                    CertificateId = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_country_certificates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_country_certificates_certificates_CertificateId",
                        column: x => x.CertificateId,
                        principalTable: "certificates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_country_certificates_countries_CountryId",
                        column: x => x.CountryId,
                        principalTable: "countries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "crew_members",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    FullName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    RankId = table.Column<int>(type: "integer", nullable: true),
                    Department = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Nationality = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DateOfBirth = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    JoinDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EmbarkDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DisembarkDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ContractEnd = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsOnboard = table.Column<bool>(type: "boolean", nullable: false),
                    EmergencyContact = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    EmailAddress = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PhoneNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Address = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    PlaceOfBirth = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    IdCardNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    MaritalStatus = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Height = table.Column<int>(type: "integer", nullable: true),
                    Weight = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    BloodGroup = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    ClothingSize = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    ShoeSize = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    CateringSize = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    IsSmoker = table.Column<bool>(type: "boolean", nullable: true),
                    IsCovidVaccinated = table.Column<bool>(type: "boolean", nullable: true),
                    PhotoUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    NextOfKinName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    NextOfKinRelation = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    NextOfKinPhone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    NextOfKinAddress = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    EducationInstitution = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    EducationCourse = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    EducationPeriodYears = table.Column<int>(type: "integer", nullable: true),
                    EducationGraduationYear = table.Column<int>(type: "integer", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    StatusChangedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    StatusChangedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PoolStatus = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    IsSynced = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SyncVersion = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crew_members", x => x.Id);
                    table.ForeignKey(
                        name: "FK_crew_members_ranks_RankId",
                        column: x => x.RankId,
                        principalTable: "ranks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "rank_certificates",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RankId = table.Column<int>(type: "integer", nullable: false),
                    CertificateId = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rank_certificates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_rank_certificates_certificates_CertificateId",
                        column: x => x.CertificateId,
                        principalTable: "certificates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_rank_certificates_ranks_RankId",
                        column: x => x.RankId,
                        principalTable: "ranks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "manning_positions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ManningStandardId = table.Column<Guid>(type: "uuid", nullable: false),
                    RankId = table.Column<int>(type: "integer", nullable: false),
                    RequiredCount = table.Column<int>(type: "integer", nullable: false),
                    AllowEquivalent = table.Column<bool>(type: "boolean", nullable: false),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_manning_positions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_manning_positions_ranks_RankId",
                        column: x => x.RankId,
                        principalTable: "ranks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_manning_positions_vessel_manning_standards_ManningStandardId",
                        column: x => x.ManningStandardId,
                        principalTable: "vessel_manning_standards",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Certificates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false),
                    CertificateType = table.Column<string>(type: "text", nullable: false),
                    CertificateName = table.Column<string>(type: "text", nullable: false),
                    IssuingAuthority = table.Column<string>(type: "text", nullable: false),
                    IssueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiryDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CertificateNumber = table.Column<string>(type: "text", nullable: false),
                    IsValid = table.Column<bool>(type: "boolean", nullable: false),
                    DocumentPath = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Certificates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Certificates_Vessels_VesselId",
                        column: x => x.VesselId,
                        principalTable: "Vessels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FuelConsumptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReportDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    FuelConsumed = table.Column<double>(type: "double precision", precision: 8, scale: 3, nullable: false),
                    FuelType = table.Column<string>(type: "text", nullable: false),
                    DistanceTraveled = table.Column<double>(type: "double precision", precision: 8, scale: 2, nullable: false),
                    AverageSpeed = table.Column<double>(type: "double precision", precision: 5, scale: 2, nullable: false),
                    FuelEfficiency = table.Column<double>(type: "double precision", precision: 6, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FuelConsumptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FuelConsumptions_Vessels_VesselId",
                        column: x => x.VesselId,
                        principalTable: "Vessels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PortCalls",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false),
                    PortCode = table.Column<string>(type: "text", nullable: false),
                    PortName = table.Column<string>(type: "text", nullable: false),
                    ArrivalTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DepartureTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PortFees = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    CargoQuantity = table.Column<decimal>(type: "numeric(10,3)", precision: 10, scale: 3, nullable: true),
                    CargoType = table.Column<string>(type: "text", nullable: false),
                    Purpose = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PortCalls", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PortCalls_Vessels_VesselId",
                        column: x => x.VesselId,
                        principalTable: "Vessels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "VesselAlerts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false),
                    AlertType = table.Column<string>(type: "text", nullable: false),
                    Message = table.Column<string>(type: "text", nullable: false),
                    Severity = table.Column<string>(type: "text", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsAcknowledged = table.Column<bool>(type: "boolean", nullable: false),
                    AcknowledgedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AcknowledgedBy = table.Column<string>(type: "text", nullable: true),
                    Data = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VesselAlerts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VesselAlerts_Vessels_VesselId",
                        column: x => x.VesselId,
                        principalTable: "Vessels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "VesselPositions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false),
                    Latitude = table.Column<double>(type: "double precision", precision: 10, scale: 7, nullable: false),
                    Longitude = table.Column<double>(type: "double precision", precision: 10, scale: 7, nullable: false),
                    Speed = table.Column<double>(type: "double precision", precision: 5, scale: 2, nullable: true),
                    Course = table.Column<double>(type: "double precision", precision: 5, scale: 2, nullable: true),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Source = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VesselPositions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VesselPositions_Vessels_VesselId",
                        column: x => x.VesselId,
                        principalTable: "Vessels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "compliance_dimensions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RuleId = table.Column<Guid>(type: "uuid", nullable: false),
                    DimensionType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Operator = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Value = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_compliance_dimensions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_compliance_dimensions_compliance_rules_RuleId",
                        column: x => x.RuleId,
                        principalTable: "compliance_rules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "compliance_snapshots",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: true),
                    OverallResult = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    TotalRules = table.Column<int>(type: "integer", nullable: false),
                    RulesMet = table.Column<int>(type: "integer", nullable: false),
                    RulesNotMet = table.Column<int>(type: "integer", nullable: false),
                    RulesWarning = table.Column<int>(type: "integer", nullable: false),
                    RulesWaived = table.Column<int>(type: "integer", nullable: false),
                    EvaluationDetails = table.Column<string>(type: "jsonb", nullable: true),
                    EvaluatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EvaluationStage = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    NextExpiryDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_compliance_snapshots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_compliance_snapshots_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "compliance_waivers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RuleId = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    Conditions = table.Column<string>(type: "text", nullable: true),
                    RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RequestedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ApprovedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ApprovedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ApprovalNotes = table.Column<string>(type: "text", nullable: true),
                    ValidFrom = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ValidTo = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_compliance_waivers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_compliance_waivers_compliance_rules_RuleId",
                        column: x => x.RuleId,
                        principalTable: "compliance_rules",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_compliance_waivers_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "crew_certificates",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    CertificateId = table.Column<int>(type: "integer", nullable: false),
                    CertificateNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IssueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiryDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IssuingAuthority = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CertificateOfCompetency = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CountryId = table.Column<int>(type: "integer", nullable: true),
                    DocumentFilePath = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    IsSynced = table.Column<bool>(type: "boolean", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SyncVersion = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crew_certificates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_crew_certificates_certificates_CertificateId",
                        column: x => x.CertificateId,
                        principalTable: "certificates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_crew_certificates_countries_CountryId",
                        column: x => x.CountryId,
                        principalTable: "countries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_crew_certificates_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "crew_document_submissions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DocumentTitle = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    DocumentNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    IssuingAuthority = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    IssueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ExpiryDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IssuingCountryId = table.Column<int>(type: "integer", nullable: true),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    StatusChangedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    StatusChangedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    OnboardingCaseId = table.Column<Guid>(type: "uuid", nullable: true),
                    IsActiveSubmission = table.Column<bool>(type: "boolean", nullable: false),
                    SensitivityLevel = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SubmittedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crew_document_submissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_crew_document_submissions_countries_IssuingCountryId",
                        column: x => x.IssuingCountryId,
                        principalTable: "countries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_crew_document_submissions_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "crew_status_history",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromStatus = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ToStatus = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ChangedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ChangedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crew_status_history", x => x.Id);
                    table.ForeignKey(
                        name: "FK_crew_status_history_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "employment_documents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DocumentNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IssueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ExpiryDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FileUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CountryId = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_employment_documents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_employment_documents_countries_CountryId",
                        column: x => x.CountryId,
                        principalTable: "countries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_employment_documents_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "health_documents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DocumentNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IssueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ExpiryDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FileUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_health_documents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_health_documents_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "onboarding_cases",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReferenceVesselId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReferenceVesselName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    VesselGroupCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    FlagState = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    StatusChangedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    StatusChangedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    InvitedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ActivatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_onboarding_cases", x => x.Id);
                    table.ForeignKey(
                        name: "FK_onboarding_cases_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "seafarer_documents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DocumentNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IssueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ExpiryDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FileUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CountryId = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_seafarer_documents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_seafarer_documents_countries_CountryId",
                        column: x => x.CountryId,
                        principalTable: "countries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_seafarer_documents_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "service_records",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    VesselFlag = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    VesselType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    VesselGrt = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    VesselDwt = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    VesselYearBuilt = table.Column<int>(type: "integer", nullable: true),
                    TradeArea = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    MainEngineType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    MainEnginePowerKw = table.Column<int>(type: "integer", nullable: true),
                    MainEngineMaker = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    BoilerType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    HasExhaustGasScrubber = table.Column<bool>(type: "boolean", nullable: true),
                    Ecdis = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    RankAtTime = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    BoardingDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DisembarkDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    BoardingPortCode = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    BoardingPortName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    DisembarkPortCode = table.Column<string>(type: "character varying(5)", maxLength: 5, nullable: true),
                    DisembarkPortName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    BoardingRecords = table.Column<string>(type: "text", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    IsSynced = table.Column<bool>(type: "boolean", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SyncVersion = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CrewMemberId1 = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_service_records", x => x.Id);
                    table.ForeignKey(
                        name: "FK_service_records_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_service_records_crew_members_CrewMemberId1",
                        column: x => x.CrewMemberId1,
                        principalTable: "crew_members",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "travel_documents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DocumentNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    IssueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ExpiryDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FileUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CountryId = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_travel_documents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_travel_documents_countries_CountryId",
                        column: x => x.CountryId,
                        principalTable: "countries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_travel_documents_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "crew_assignments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false),
                    RankId = table.Column<int>(type: "integer", nullable: false),
                    ManningPositionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    StatusChangedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    StatusChangedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PlannedStartDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PlannedEndDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ActualStartDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ActualEndDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    JoinPortCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    JoinPortName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    LeavePortCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    LeavePortName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    IsEquivalentRank = table.Column<bool>(type: "boolean", nullable: false),
                    OriginalRankId = table.Column<int>(type: "integer", nullable: true),
                    EquivalentRankJustification = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ComplianceResult = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ComplianceEvaluatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crew_assignments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_crew_assignments_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_crew_assignments_manning_positions_ManningPositionId",
                        column: x => x.ManningPositionId,
                        principalTable: "manning_positions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_crew_assignments_ranks_RankId",
                        column: x => x.RankId,
                        principalTable: "ranks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "crew_document_versions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SubmissionId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionNumber = table.Column<int>(type: "integer", nullable: false),
                    FilePath = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    OriginalFileName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    ContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: true),
                    FileChecksum = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    IsActiveVersion = table.Column<bool>(type: "boolean", nullable: false),
                    IsLocked = table.Column<bool>(type: "boolean", nullable: false),
                    UploadedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    UploadedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LockedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crew_document_versions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_crew_document_versions_crew_document_submissions_Submission~",
                        column: x => x.SubmissionId,
                        principalTable: "crew_document_submissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "onboarding_checklist_items",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OnboardingCaseId = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Title = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    RequiredDocumentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    RequiredCertificateId = table.Column<int>(type: "integer", nullable: true),
                    SourceRuleId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    IsMandatory = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CompletionNotes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    WaivedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    WaiverReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_onboarding_checklist_items", x => x.Id);
                    table.ForeignKey(
                        name: "FK_onboarding_checklist_items_onboarding_cases_OnboardingCaseId",
                        column: x => x.OnboardingCaseId,
                        principalTable: "onboarding_cases",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "assignment_comments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Author = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AuthorRole = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Content = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    PostedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assignment_comments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_assignment_comments_crew_assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalTable: "crew_assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "assignment_confirmations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Response = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    RespondedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RespondedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    DeclineReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    SentAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SentBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assignment_confirmations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_assignment_confirmations_crew_assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalTable: "crew_assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "assignment_conflicts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConflictType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Severity = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    RelatedEntityId = table.Column<Guid>(type: "uuid", nullable: true),
                    RelatedEntityType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    IsResolved = table.Column<bool>(type: "boolean", nullable: false),
                    ResolutionNote = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    DetectedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ResolvedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assignment_conflicts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_assignment_conflicts_crew_assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalTable: "crew_assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "assignment_status_history",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ToStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ChangedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ChangedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_assignment_status_history", x => x.Id);
                    table.ForeignKey(
                        name: "FK_assignment_status_history_crew_assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalTable: "crew_assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "crew_access_grants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Module = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    GrantedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RevokedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RevokeReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    GrantedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    RevokedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crew_access_grants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_crew_access_grants_crew_assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalTable: "crew_assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_crew_access_grants_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "external_requests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    RankId = table.Column<int>(type: "integer", nullable: false),
                    AgencyName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    AgencyEmail = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    RequiredCount = table.Column<int>(type: "integer", nullable: false),
                    NationalityPreference = table.Column<string>(type: "text", nullable: true),
                    RequiredByDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ResponseSlaDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SentAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ViewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ClosedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    MandatoryDocuments = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_external_requests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_external_requests_crew_assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalTable: "crew_assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_external_requests_ranks_RankId",
                        column: x => x.RankId,
                        principalTable: "ranks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "onboard_events",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    EventType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    EventTimestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PortCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    PortName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ConfirmedBy = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ConfirmedByRole = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    SignOffReason = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Remarks = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    OriginalEventId = table.Column<Guid>(type: "uuid", nullable: true),
                    Source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    IsSynced = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_onboard_events", x => x.Id);
                    table.ForeignKey(
                        name: "FK_onboard_events_crew_assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalTable: "crew_assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_onboard_events_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_onboard_events_onboard_events_OriginalEventId",
                        column: x => x.OriginalEventId,
                        principalTable: "onboard_events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "travel_requests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TravelType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DeparturePort = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ArrivalPort = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    DepartureDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ArrivalDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReportingDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SpecialRequirements = table.Column<string>(type: "text", nullable: true),
                    BaggageNotes = table.Column<string>(type: "text", nullable: true),
                    VisaRequirements = table.Column<string>(type: "text", nullable: true),
                    VendorName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    BookingReference = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    EstimatedCost = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    Currency = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_travel_requests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_travel_requests_crew_assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalTable: "crew_assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_travel_requests_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "document_verification_tasks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SubmissionId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignedTo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Priority = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    DueAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Outcome = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_document_verification_tasks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_document_verification_tasks_crew_document_submissions_Submi~",
                        column: x => x.SubmissionId,
                        principalTable: "crew_document_submissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_document_verification_tasks_crew_document_versions_VersionId",
                        column: x => x.VersionId,
                        principalTable: "crew_document_versions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "external_candidates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExternalRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    CandidateName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Nationality = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    RankId = table.Column<int>(type: "integer", nullable: true),
                    ContactEmail = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ContactPhone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ComplianceResult = table.Column<string>(type: "text", nullable: true),
                    ProfileSummary = table.Column<string>(type: "text", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SubmittedBy = table.Column<string>(type: "text", nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewedBy = table.Column<string>(type: "text", nullable: true),
                    LinkedCrewMemberId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_external_candidates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_external_candidates_crew_members_LinkedCrewMemberId",
                        column: x => x.LinkedCrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_external_candidates_external_requests_ExternalRequestId",
                        column: x => x.ExternalRequestId,
                        principalTable: "external_requests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_external_candidates_ranks_RankId",
                        column: x => x.RankId,
                        principalTable: "ranks",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "external_request_messages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExternalRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    Author = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AuthorRole = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Content = table.Column<string>(type: "text", nullable: false),
                    PostedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_external_request_messages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_external_request_messages_external_requests_ExternalRequest~",
                        column: x => x.ExternalRequestId,
                        principalTable: "external_requests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "sign_on_records",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    RankId = table.Column<int>(type: "integer", nullable: false),
                    SignOnDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PortCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    PortName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    SignedOnBy = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Remarks = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    OnboardEventId = table.Column<Guid>(type: "uuid", nullable: true),
                    Source = table.Column<string>(type: "text", nullable: false),
                    IsSynced = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sign_on_records", x => x.Id);
                    table.ForeignKey(
                        name: "FK_sign_on_records_crew_assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalTable: "crew_assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_sign_on_records_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_sign_on_records_onboard_events_OnboardEventId",
                        column: x => x.OnboardEventId,
                        principalTable: "onboard_events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_sign_on_records_ranks_RankId",
                        column: x => x.RankId,
                        principalTable: "ranks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "travel_segments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TravelRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    SequenceOrder = table.Column<int>(type: "integer", nullable: false),
                    SegmentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Origin = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Destination = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CarrierName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FlightNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DepartureTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ArrivalTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ConfirmationNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_travel_segments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_travel_segments_travel_requests_TravelRequestId",
                        column: x => x.TravelRequestId,
                        principalTable: "travel_requests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "travel_status_history",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TravelRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ToStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ChangedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Reason = table.Column<string>(type: "text", nullable: true),
                    ChangedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_travel_status_history", x => x.Id);
                    table.ForeignKey(
                        name: "FK_travel_status_history_travel_requests_TravelRequestId",
                        column: x => x.TravelRequestId,
                        principalTable: "travel_requests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "document_verification_actions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActionType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ReasonCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Comment = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    PerformedBy = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PerformedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_document_verification_actions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_document_verification_actions_document_verification_tasks_T~",
                        column: x => x.TaskId,
                        principalTable: "document_verification_tasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "sign_off_records",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    RankId = table.Column<int>(type: "integer", nullable: false),
                    SignOffDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PortCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    PortName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Reason = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ReasonDetail = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    SignedOffBy = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Remarks = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    OnboardEventId = table.Column<Guid>(type: "uuid", nullable: true),
                    SignOnRecordId = table.Column<Guid>(type: "uuid", nullable: true),
                    Source = table.Column<string>(type: "text", nullable: false),
                    IsSynced = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sign_off_records", x => x.Id);
                    table.ForeignKey(
                        name: "FK_sign_off_records_crew_assignments_AssignmentId",
                        column: x => x.AssignmentId,
                        principalTable: "crew_assignments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_sign_off_records_crew_members_CrewMemberId",
                        column: x => x.CrewMemberId,
                        principalTable: "crew_members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_sign_off_records_onboard_events_OnboardEventId",
                        column: x => x.OnboardEventId,
                        principalTable: "onboard_events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_sign_off_records_ranks_RankId",
                        column: x => x.RankId,
                        principalTable: "ranks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_sign_off_records_sign_on_records_SignOnRecordId",
                        column: x => x.SignOnRecordId,
                        principalTable: "sign_on_records",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });


            migrationBuilder.CreateIndex(
                name: "IX_arrival_reports_MaritimeReportId",
                table: "arrival_reports",
                column: "MaritimeReportId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_assignment_comments_AssignmentId",
                table: "assignment_comments",
                column: "AssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_assignment_confirmations_AssignmentId",
                table: "assignment_confirmations",
                column: "AssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_assignment_conflicts_AssignmentId",
                table: "assignment_conflicts",
                column: "AssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_assignment_conflicts_AssignmentId_IsResolved",
                table: "assignment_conflicts",
                columns: new[] { "AssignmentId", "IsResolved" });

            migrationBuilder.CreateIndex(
                name: "IX_assignment_status_history_AssignmentId",
                table: "assignment_status_history",
                column: "AssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_Actor",
                table: "audit_logs",
                column: "Actor");

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_CorrelationId",
                table: "audit_logs",
                column: "CorrelationId");

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_EntityType_EntityId",
                table: "audit_logs",
                columns: new[] { "EntityType", "EntityId" });

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_Timestamp",
                table: "audit_logs",
                column: "Timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_certificates_CertificateCode",
                table: "certificates",
                column: "CertificateCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Certificates_CertificateNumber",
                table: "Certificates",
                column: "CertificateNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Certificates_VesselId_ExpiryDate",
                table: "Certificates",
                columns: new[] { "VesselId", "ExpiryDate" });

            migrationBuilder.CreateIndex(
                name: "IX_compliance_dimensions_DimensionType_Value",
                table: "compliance_dimensions",
                columns: new[] { "DimensionType", "Value" });

            migrationBuilder.CreateIndex(
                name: "IX_compliance_dimensions_RuleId",
                table: "compliance_dimensions",
                column: "RuleId");

            migrationBuilder.CreateIndex(
                name: "IX_compliance_rule_sets_Code",
                table: "compliance_rule_sets",
                column: "Code",
                unique: true,
                filter: "\"Code\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_compliance_rule_sets_IsActive",
                table: "compliance_rule_sets",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_compliance_rules_EvaluationStage",
                table: "compliance_rules",
                column: "EvaluationStage");

            migrationBuilder.CreateIndex(
                name: "IX_compliance_rules_IsActive",
                table: "compliance_rules",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_compliance_rules_RequiredCertificateId",
                table: "compliance_rules",
                column: "RequiredCertificateId");

            migrationBuilder.CreateIndex(
                name: "IX_compliance_rules_RuleSetId",
                table: "compliance_rules",
                column: "RuleSetId");

            migrationBuilder.CreateIndex(
                name: "IX_compliance_rules_Severity",
                table: "compliance_rules",
                column: "Severity");

            migrationBuilder.CreateIndex(
                name: "IX_compliance_snapshots_CrewMemberId",
                table: "compliance_snapshots",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_compliance_snapshots_CrewMemberId_VesselId",
                table: "compliance_snapshots",
                columns: new[] { "CrewMemberId", "VesselId" });

            migrationBuilder.CreateIndex(
                name: "IX_compliance_snapshots_EvaluatedAt",
                table: "compliance_snapshots",
                column: "EvaluatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_compliance_snapshots_OverallResult",
                table: "compliance_snapshots",
                column: "OverallResult");

            migrationBuilder.CreateIndex(
                name: "IX_compliance_waivers_CrewMemberId",
                table: "compliance_waivers",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_compliance_waivers_CrewMemberId_RuleId_Status",
                table: "compliance_waivers",
                columns: new[] { "CrewMemberId", "RuleId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_compliance_waivers_RuleId",
                table: "compliance_waivers",
                column: "RuleId");

            migrationBuilder.CreateIndex(
                name: "IX_compliance_waivers_Status",
                table: "compliance_waivers",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_countries_CountryCode",
                table: "countries",
                column: "CountryCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_country_certificates_CertificateId",
                table: "country_certificates",
                column: "CertificateId");

            migrationBuilder.CreateIndex(
                name: "IX_country_certificates_CountryId_CertificateId",
                table: "country_certificates",
                columns: new[] { "CountryId", "CertificateId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_crew_access_grants_AssignmentId",
                table: "crew_access_grants",
                column: "AssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_crew_access_grants_CrewMemberId",
                table: "crew_access_grants",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_crew_access_grants_Status",
                table: "crew_access_grants",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_crew_access_grants_VesselId",
                table: "crew_access_grants",
                column: "VesselId");

            migrationBuilder.CreateIndex(
                name: "IX_crew_assignments_CrewMemberId",
                table: "crew_assignments",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_crew_assignments_CrewMemberId_Status",
                table: "crew_assignments",
                columns: new[] { "CrewMemberId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_crew_assignments_ManningPositionId",
                table: "crew_assignments",
                column: "ManningPositionId");

            migrationBuilder.CreateIndex(
                name: "IX_crew_assignments_PlannedStartDate_PlannedEndDate",
                table: "crew_assignments",
                columns: new[] { "PlannedStartDate", "PlannedEndDate" });

            migrationBuilder.CreateIndex(
                name: "IX_crew_assignments_RankId",
                table: "crew_assignments",
                column: "RankId");

            migrationBuilder.CreateIndex(
                name: "IX_crew_assignments_Status",
                table: "crew_assignments",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_crew_assignments_VesselId",
                table: "crew_assignments",
                column: "VesselId");

            migrationBuilder.CreateIndex(
                name: "IX_crew_assignments_VesselId_Status",
                table: "crew_assignments",
                columns: new[] { "VesselId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_crew_certificates_CertificateId",
                table: "crew_certificates",
                column: "CertificateId");

            migrationBuilder.CreateIndex(
                name: "IX_crew_certificates_CountryId",
                table: "crew_certificates",
                column: "CountryId");

            migrationBuilder.CreateIndex(
                name: "IX_crew_certificates_CrewMemberId_CertificateId",
                table: "crew_certificates",
                columns: new[] { "CrewMemberId", "CertificateId" });

            migrationBuilder.CreateIndex(
                name: "IX_crew_certificates_ExpiryDate",
                table: "crew_certificates",
                column: "ExpiryDate");

            migrationBuilder.CreateIndex(
                name: "IX_crew_certificates_IsSynced",
                table: "crew_certificates",
                column: "IsSynced");

            migrationBuilder.CreateIndex(
                name: "IX_crew_document_submissions_CrewMemberId",
                table: "crew_document_submissions",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_crew_document_submissions_CrewMemberId_DocumentType_IsActiv~",
                table: "crew_document_submissions",
                columns: new[] { "CrewMemberId", "DocumentType", "IsActiveSubmission" });

            migrationBuilder.CreateIndex(
                name: "IX_crew_document_submissions_IssuingCountryId",
                table: "crew_document_submissions",
                column: "IssuingCountryId");

            migrationBuilder.CreateIndex(
                name: "IX_crew_document_submissions_Status",
                table: "crew_document_submissions",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_crew_document_versions_SubmissionId",
                table: "crew_document_versions",
                column: "SubmissionId");

            migrationBuilder.CreateIndex(
                name: "IX_crew_document_versions_SubmissionId_IsActiveVersion",
                table: "crew_document_versions",
                columns: new[] { "SubmissionId", "IsActiveVersion" });

            migrationBuilder.CreateIndex(
                name: "IX_crew_members_CrewId",
                table: "crew_members",
                column: "CrewId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_crew_members_FullName",
                table: "crew_members",
                column: "FullName");

            migrationBuilder.CreateIndex(
                name: "IX_crew_members_IsOnboard",
                table: "crew_members",
                column: "IsOnboard");

            migrationBuilder.CreateIndex(
                name: "IX_crew_members_IsSynced",
                table: "crew_members",
                column: "IsSynced");

            migrationBuilder.CreateIndex(
                name: "IX_crew_members_RankId",
                table: "crew_members",
                column: "RankId");

            migrationBuilder.CreateIndex(
                name: "IX_crew_status_history_ChangedAt",
                table: "crew_status_history",
                column: "ChangedAt");

            migrationBuilder.CreateIndex(
                name: "IX_crew_status_history_CrewMemberId",
                table: "crew_status_history",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_departure_reports_MaritimeReportId",
                table: "departure_reports",
                column: "MaritimeReportId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_document_verification_actions_TaskId",
                table: "document_verification_actions",
                column: "TaskId");

            migrationBuilder.CreateIndex(
                name: "IX_document_verification_tasks_AssignedTo",
                table: "document_verification_tasks",
                column: "AssignedTo");

            migrationBuilder.CreateIndex(
                name: "IX_document_verification_tasks_DueAt",
                table: "document_verification_tasks",
                column: "DueAt");

            migrationBuilder.CreateIndex(
                name: "IX_document_verification_tasks_Status_Priority",
                table: "document_verification_tasks",
                columns: new[] { "Status", "Priority" });

            migrationBuilder.CreateIndex(
                name: "IX_document_verification_tasks_SubmissionId",
                table: "document_verification_tasks",
                column: "SubmissionId");

            migrationBuilder.CreateIndex(
                name: "IX_document_verification_tasks_VersionId",
                table: "document_verification_tasks",
                column: "VersionId");

            migrationBuilder.CreateIndex(
                name: "IX_employment_documents_CountryId",
                table: "employment_documents",
                column: "CountryId");

            migrationBuilder.CreateIndex(
                name: "IX_employment_documents_CrewMemberId",
                table: "employment_documents",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_external_candidates_ExternalRequestId",
                table: "external_candidates",
                column: "ExternalRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_external_candidates_LinkedCrewMemberId",
                table: "external_candidates",
                column: "LinkedCrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_external_candidates_RankId",
                table: "external_candidates",
                column: "RankId");

            migrationBuilder.CreateIndex(
                name: "IX_external_candidates_Status",
                table: "external_candidates",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_external_request_messages_ExternalRequestId",
                table: "external_request_messages",
                column: "ExternalRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_external_requests_AssignmentId",
                table: "external_requests",
                column: "AssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_external_requests_RankId",
                table: "external_requests",
                column: "RankId");

            migrationBuilder.CreateIndex(
                name: "IX_external_requests_Status",
                table: "external_requests",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_external_requests_VesselId",
                table: "external_requests",
                column: "VesselId");

            migrationBuilder.CreateIndex(
                name: "IX_FuelConsumptions_VesselId",
                table: "FuelConsumptions",
                column: "VesselId");

            migrationBuilder.CreateIndex(
                name: "IX_health_documents_CrewMemberId",
                table: "health_documents",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_manning_positions_ManningStandardId",
                table: "manning_positions",
                column: "ManningStandardId");

            migrationBuilder.CreateIndex(
                name: "IX_manning_positions_RankId",
                table: "manning_positions",
                column: "RankId");

            migrationBuilder.CreateIndex(
                name: "IX_maritime_reports_OriginNode",
                table: "maritime_reports",
                column: "OriginNode");

            migrationBuilder.CreateIndex(
                name: "IX_maritime_reports_ReportDateTime",
                table: "maritime_reports",
                column: "ReportDateTime");

            migrationBuilder.CreateIndex(
                name: "IX_maritime_reports_ReportNumber",
                table: "maritime_reports",
                column: "ReportNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_maritime_reports_Status",
                table: "maritime_reports",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_noon_reports_MaritimeReportId",
                table: "noon_reports",
                column: "MaritimeReportId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_onboard_events_AssignmentId",
                table: "onboard_events",
                column: "AssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_onboard_events_CrewMemberId",
                table: "onboard_events",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_onboard_events_EventTimestamp",
                table: "onboard_events",
                column: "EventTimestamp");

            migrationBuilder.CreateIndex(
                name: "IX_onboard_events_EventType",
                table: "onboard_events",
                column: "EventType");

            migrationBuilder.CreateIndex(
                name: "IX_onboard_events_OriginalEventId",
                table: "onboard_events",
                column: "OriginalEventId");

            migrationBuilder.CreateIndex(
                name: "IX_onboard_events_VesselId",
                table: "onboard_events",
                column: "VesselId");

            migrationBuilder.CreateIndex(
                name: "IX_onboarding_cases_CreatedAt",
                table: "onboarding_cases",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_onboarding_cases_CrewMemberId",
                table: "onboarding_cases",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_onboarding_cases_Status",
                table: "onboarding_cases",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_onboarding_checklist_items_OnboardingCaseId",
                table: "onboarding_checklist_items",
                column: "OnboardingCaseId");

            migrationBuilder.CreateIndex(
                name: "IX_onboarding_checklist_items_OnboardingCaseId_Status",
                table: "onboarding_checklist_items",
                columns: new[] { "OnboardingCaseId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PortCalls_VesselId_ArrivalTime",
                table: "PortCalls",
                columns: new[] { "VesselId", "ArrivalTime" });

            migrationBuilder.CreateIndex(
                name: "IX_rank_certificates_CertificateId",
                table: "rank_certificates",
                column: "CertificateId");

            migrationBuilder.CreateIndex(
                name: "IX_rank_certificates_RankId_CertificateId",
                table: "rank_certificates",
                columns: new[] { "RankId", "CertificateId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ranks_RankCode",
                table: "ranks",
                column: "RankCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_report_types_TypeCode",
                table: "report_types",
                column: "TypeCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_seafarer_documents_CountryId",
                table: "seafarer_documents",
                column: "CountryId");

            migrationBuilder.CreateIndex(
                name: "IX_seafarer_documents_CrewMemberId",
                table: "seafarer_documents",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_service_records_CrewMemberId",
                table: "service_records",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_service_records_CrewMemberId1",
                table: "service_records",
                column: "CrewMemberId1");

            migrationBuilder.CreateIndex(
                name: "IX_service_records_IsSynced",
                table: "service_records",
                column: "IsSynced");

            migrationBuilder.CreateIndex(
                name: "IX_sign_off_records_AssignmentId",
                table: "sign_off_records",
                column: "AssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_sign_off_records_CrewMemberId",
                table: "sign_off_records",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_sign_off_records_OnboardEventId",
                table: "sign_off_records",
                column: "OnboardEventId");

            migrationBuilder.CreateIndex(
                name: "IX_sign_off_records_RankId",
                table: "sign_off_records",
                column: "RankId");

            migrationBuilder.CreateIndex(
                name: "IX_sign_off_records_SignOffDate",
                table: "sign_off_records",
                column: "SignOffDate");

            migrationBuilder.CreateIndex(
                name: "IX_sign_off_records_SignOnRecordId",
                table: "sign_off_records",
                column: "SignOnRecordId");

            migrationBuilder.CreateIndex(
                name: "IX_sign_off_records_VesselId",
                table: "sign_off_records",
                column: "VesselId");

            migrationBuilder.CreateIndex(
                name: "IX_sign_on_records_AssignmentId",
                table: "sign_on_records",
                column: "AssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_sign_on_records_CrewMemberId",
                table: "sign_on_records",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_sign_on_records_OnboardEventId",
                table: "sign_on_records",
                column: "OnboardEventId");

            migrationBuilder.CreateIndex(
                name: "IX_sign_on_records_RankId",
                table: "sign_on_records",
                column: "RankId");

            migrationBuilder.CreateIndex(
                name: "IX_sign_on_records_SignOnDate",
                table: "sign_on_records",
                column: "SignOnDate");

            migrationBuilder.CreateIndex(
                name: "IX_sign_on_records_VesselId",
                table: "sign_on_records",
                column: "VesselId");

            migrationBuilder.CreateIndex(
                name: "IX_sync_idempotency_records_IdempotencyKey",
                table: "sync_idempotency_records",
                column: "IdempotencyKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_sync_idempotency_records_ProcessedAt",
                table: "sync_idempotency_records",
                column: "ProcessedAt");

            migrationBuilder.CreateIndex(
                name: "IX_sync_logs_OriginNode",
                table: "sync_logs",
                column: "OriginNode");

            migrationBuilder.CreateIndex(
                name: "IX_sync_logs_ProcessedAt",
                table: "sync_logs",
                column: "ProcessedAt");

            migrationBuilder.CreateIndex(
                name: "IX_sync_node_trackers_IsOnline",
                table: "sync_node_trackers",
                column: "IsOnline");

            migrationBuilder.CreateIndex(
                name: "IX_sync_node_trackers_NodeId",
                table: "sync_node_trackers",
                column: "NodeId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_sync_outbox_DeliveredAt",
                table: "sync_outbox",
                column: "DeliveredAt");

            migrationBuilder.CreateIndex(
                name: "IX_sync_outbox_TableName_RecordKey",
                table: "sync_outbox",
                columns: new[] { "TableName", "RecordKey" });

            migrationBuilder.CreateIndex(
                name: "IX_sync_table_stats_NodeId_TableName",
                table: "sync_table_stats",
                columns: new[] { "NodeId", "TableName" });

            migrationBuilder.CreateIndex(
                name: "IX_travel_documents_CountryId",
                table: "travel_documents",
                column: "CountryId");

            migrationBuilder.CreateIndex(
                name: "IX_travel_documents_CrewMemberId",
                table: "travel_documents",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_travel_requests_AssignmentId",
                table: "travel_requests",
                column: "AssignmentId");

            migrationBuilder.CreateIndex(
                name: "IX_travel_requests_CrewMemberId",
                table: "travel_requests",
                column: "CrewMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_travel_requests_Status",
                table: "travel_requests",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_travel_segments_TravelRequestId",
                table: "travel_segments",
                column: "TravelRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_travel_status_history_TravelRequestId",
                table: "travel_status_history",
                column: "TravelRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_vessel_manning_standards_IsActive",
                table: "vessel_manning_standards",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_vessel_manning_standards_VesselId",
                table: "vessel_manning_standards",
                column: "VesselId");

            migrationBuilder.CreateIndex(
                name: "IX_VesselAlerts_IsAcknowledged",
                table: "VesselAlerts",
                column: "IsAcknowledged");

            migrationBuilder.CreateIndex(
                name: "IX_VesselAlerts_VesselId_Timestamp",
                table: "VesselAlerts",
                columns: new[] { "VesselId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_VesselPositions_VesselId_Timestamp",
                table: "VesselPositions",
                columns: new[] { "VesselId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_Vessels_IMO",
                table: "Vessels",
                column: "IMO",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AisData");

            migrationBuilder.DropTable(
                name: "arrival_reports");

            migrationBuilder.DropTable(
                name: "assignment_comments");

            migrationBuilder.DropTable(
                name: "assignment_confirmations");

            migrationBuilder.DropTable(
                name: "assignment_conflicts");

            migrationBuilder.DropTable(
                name: "assignment_status_history");

            migrationBuilder.DropTable(
                name: "audit_logs");

            migrationBuilder.DropTable(
                name: "Certificates");

            migrationBuilder.DropTable(
                name: "compliance_dimensions");

            migrationBuilder.DropTable(
                name: "compliance_snapshots");

            migrationBuilder.DropTable(
                name: "compliance_waivers");

            migrationBuilder.DropTable(
                name: "country_certificates");

            migrationBuilder.DropTable(
                name: "crew_access_grants");

            migrationBuilder.DropTable(
                name: "crew_certificates");

            migrationBuilder.DropTable(
                name: "crew_status_history");

            migrationBuilder.DropTable(
                name: "departure_reports");

            migrationBuilder.DropTable(
                name: "document_verification_actions");

            migrationBuilder.DropTable(
                name: "employment_documents");

            migrationBuilder.DropTable(
                name: "EngineData");

            migrationBuilder.DropTable(
                name: "external_candidates");

            migrationBuilder.DropTable(
                name: "external_request_messages");

            migrationBuilder.DropTable(
                name: "FuelConsumptionData");

            migrationBuilder.DropTable(
                name: "FuelConsumptions");

            migrationBuilder.DropTable(
                name: "GeneratorData");

            migrationBuilder.DropTable(
                name: "health_documents");

            migrationBuilder.DropTable(
                name: "MaintenanceTasks");

            migrationBuilder.DropTable(
                name: "maritime_reports");

            migrationBuilder.DropTable(
                name: "noon_reports");

            migrationBuilder.DropTable(
                name: "onboarding_checklist_items");

            migrationBuilder.DropTable(
                name: "PortCalls");

            migrationBuilder.DropTable(
                name: "PositionData");

            migrationBuilder.DropTable(
                name: "rank_certificates");

            migrationBuilder.DropTable(
                name: "report_types");

            migrationBuilder.DropTable(
                name: "SafetyAlarms");

            migrationBuilder.DropTable(
                name: "seafarer_documents");

            migrationBuilder.DropTable(
                name: "service_records");

            migrationBuilder.DropTable(
                name: "Ships");

            migrationBuilder.DropTable(
                name: "sign_off_records");

            migrationBuilder.DropTable(
                name: "sync_idempotency_records");

            migrationBuilder.DropTable(
                name: "sync_logs");

            migrationBuilder.DropTable(
                name: "sync_node_trackers");

            migrationBuilder.DropTable(
                name: "sync_outbox");

            migrationBuilder.DropTable(
                name: "sync_table_stats");

            migrationBuilder.DropTable(
                name: "TankLevels");

            migrationBuilder.DropTable(
                name: "travel_documents");

            migrationBuilder.DropTable(
                name: "travel_segments");

            migrationBuilder.DropTable(
                name: "travel_status_history");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "VesselAlerts");

            migrationBuilder.DropTable(
                name: "VesselPositions");

            migrationBuilder.DropTable(
                name: "VoyageRecords");

            migrationBuilder.DropTable(
                name: "compliance_rules");

            migrationBuilder.DropTable(
                name: "document_verification_tasks");

            migrationBuilder.DropTable(
                name: "external_requests");

            migrationBuilder.DropTable(
                name: "onboarding_cases");

            migrationBuilder.DropTable(
                name: "certificates");

            migrationBuilder.DropTable(
                name: "sign_on_records");

            migrationBuilder.DropTable(
                name: "travel_requests");

            migrationBuilder.DropTable(
                name: "Vessels");

            migrationBuilder.DropTable(
                name: "compliance_rule_sets");

            migrationBuilder.DropTable(
                name: "crew_document_versions");

            migrationBuilder.DropTable(
                name: "onboard_events");

            migrationBuilder.DropTable(
                name: "crew_document_submissions");

            migrationBuilder.DropTable(
                name: "crew_assignments");

            migrationBuilder.DropTable(
                name: "countries");

            migrationBuilder.DropTable(
                name: "crew_members");

            migrationBuilder.DropTable(
                name: "manning_positions");

            migrationBuilder.DropTable(
                name: "ranks");

            migrationBuilder.DropTable(
                name: "vessel_manning_standards");
        }
    }
}
