using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace productapi.Migrations
{
    /// <inheritdoc />
    public partial class AddWeatherRoutingTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "CruisingRangeNm",
                table: "Vessels",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "FuelCapacityTons",
                table: "Vessels",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "FuelConsumptionTonsPerDay",
                table: "Vessels",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "MainEnginePowerKw",
                table: "Vessels",
                type: "double precision",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "vessel_fuel_profiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FuelType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    FuelCapacityTons = table.Column<double>(type: "double precision", nullable: false),
                    CurrentFuelTons = table.Column<double>(type: "double precision", nullable: true),
                    ReserveFraction = table.Column<double>(type: "double precision", nullable: false),
                    ServiceSpeedKts = table.Column<double>(type: "double precision", nullable: false),
                    ServicePowerKw = table.Column<double>(type: "double precision", nullable: false),
                    SfocMainGPerKwh = table.Column<double>(type: "double precision", nullable: false),
                    AuxLoadKw = table.Column<double>(type: "double precision", nullable: false),
                    SfocAuxGPerKwh = table.Column<double>(type: "double precision", nullable: false),
                    SeaMarginFraction = table.Column<double>(type: "double precision", nullable: false),
                    SpeedExponent = table.Column<double>(type: "double precision", nullable: false),
                    WeatherAllowanceFraction = table.Column<double>(type: "double precision", nullable: false),
                    PortStayHours = table.Column<double>(type: "double precision", nullable: false),
                    MaxDetourNm = table.Column<double>(type: "double precision", nullable: false),
                    Source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_vessel_fuel_profiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_vessel_fuel_profiles_Vessels_VesselId",
                        column: x => x.VesselId,
                        principalTable: "Vessels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "weather_routing_jobs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: true),
                    StartLat = table.Column<double>(type: "double precision", nullable: false),
                    StartLon = table.Column<double>(type: "double precision", nullable: false),
                    GoalLat = table.Column<double>(type: "double precision", nullable: false),
                    GoalLon = table.Column<double>(type: "double precision", nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    RequestJson = table.Column<string>(type: "jsonb", nullable: false),
                    HazardJson = table.Column<string>(type: "jsonb", nullable: false),
                    MetricsJson = table.Column<string>(type: "jsonb", nullable: false),
                    PlanJson = table.Column<string>(type: "jsonb", nullable: false),
                    ErrorMessage = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_weather_routing_jobs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "weather_routing_routes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    JobId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    WaypointsJson = table.Column<string>(type: "jsonb", nullable: false),
                    MetricsJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_weather_routing_routes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_weather_routing_routes_weather_routing_jobs_JobId",
                        column: x => x.JobId,
                        principalTable: "weather_routing_jobs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_vessel_fuel_profiles_VesselId",
                table: "vessel_fuel_profiles",
                column: "VesselId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_weather_routing_jobs_CreatedAt",
                table: "weather_routing_jobs",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_weather_routing_jobs_Status",
                table: "weather_routing_jobs",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_weather_routing_jobs_VesselId",
                table: "weather_routing_jobs",
                column: "VesselId");

            migrationBuilder.CreateIndex(
                name: "IX_weather_routing_routes_JobId",
                table: "weather_routing_routes",
                column: "JobId");

            migrationBuilder.CreateIndex(
                name: "IX_weather_routing_routes_JobId_Version",
                table: "weather_routing_routes",
                columns: new[] { "JobId", "Version" });

            migrationBuilder.CreateIndex(
                name: "IX_weather_routing_routes_Kind",
                table: "weather_routing_routes",
                column: "Kind");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "vessel_fuel_profiles");

            migrationBuilder.DropTable(
                name: "weather_routing_routes");

            migrationBuilder.DropTable(
                name: "weather_routing_jobs");

            migrationBuilder.DropColumn(
                name: "CruisingRangeNm",
                table: "Vessels");

            migrationBuilder.DropColumn(
                name: "FuelCapacityTons",
                table: "Vessels");

            migrationBuilder.DropColumn(
                name: "FuelConsumptionTonsPerDay",
                table: "Vessels");

            migrationBuilder.DropColumn(
                name: "MainEnginePowerKw",
                table: "Vessels");
        }
    }
}
