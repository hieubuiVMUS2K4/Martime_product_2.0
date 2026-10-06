using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace productapi.Migrations
{
    /// <inheritdoc />
    public partial class AddSensorAndDeferralSyncMirrors : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "environmental_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AirTemperature = table.Column<double>(type: "double precision", nullable: true),
                    BarometricPressure = table.Column<double>(type: "double precision", nullable: true),
                    Humidity = table.Column<double>(type: "double precision", nullable: true),
                    SeaTemperature = table.Column<double>(type: "double precision", nullable: true),
                    WindSpeed = table.Column<double>(type: "double precision", nullable: true),
                    WindDirection = table.Column<double>(type: "double precision", nullable: true),
                    WaveHeight = table.Column<double>(type: "double precision", nullable: true),
                    Visibility = table.Column<double>(type: "double precision", nullable: true),
                    IsSynced = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_environmental_data", x => x.Id);
                    table.ForeignKey(
                        name: "FK_environmental_data_Vessels_VesselId",
                        column: x => x.VesselId,
                        principalTable: "Vessels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "navigation_data",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    HeadingTrue = table.Column<double>(type: "double precision", nullable: true),
                    HeadingMagnetic = table.Column<double>(type: "double precision", nullable: true),
                    RateOfTurn = table.Column<double>(type: "double precision", nullable: true),
                    Pitch = table.Column<double>(type: "double precision", nullable: true),
                    Roll = table.Column<double>(type: "double precision", nullable: true),
                    SpeedThroughWater = table.Column<double>(type: "double precision", nullable: true),
                    Depth = table.Column<double>(type: "double precision", nullable: true),
                    WindSpeedRelative = table.Column<double>(type: "double precision", nullable: true),
                    WindDirectionRelative = table.Column<double>(type: "double precision", nullable: true),
                    WindSpeedTrue = table.Column<double>(type: "double precision", nullable: true),
                    WindDirectionTrue = table.Column<double>(type: "double precision", nullable: true),
                    IsSynced = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_navigation_data", x => x.Id);
                    table.ForeignKey(
                        name: "FK_navigation_data_Vessels_VesselId",
                        column: x => x.VesselId,
                        principalTable: "Vessels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "nmea_raw_data",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SentenceType = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    RawSentence = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    ChecksumValid = table.Column<bool>(type: "boolean", nullable: false),
                    DeviceSource = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    IsSynced = table.Column<bool>(type: "boolean", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_nmea_raw_data", x => x.Id);
                    table.ForeignKey(
                        name: "FK_nmea_raw_data_Vessels_VesselId",
                        column: x => x.VesselId,
                        principalTable: "Vessels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_deferral_request",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestedBy = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    CurrentDueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ProposedDueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DeferralDays = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ReviewedBy = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewNotes = table.Column<string>(type: "text", nullable: true),
                    Priority = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Attachments = table.Column<string>(type: "jsonb", nullable: true),
                    IsCmsItem = table.Column<bool>(type: "boolean", nullable: false),
                    ClassPermissionLetter = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsOverdueDeferral = table.Column<bool>(type: "boolean", nullable: false),
                    RootCause = table.Column<string>(type: "text", nullable: true),
                    PreventiveMeasures = table.Column<string>(type: "text", nullable: true),
                    TaskStatusAtRequest = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    IsSynced = table.Column<bool>(type: "boolean", nullable: false),
                    VesselId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_deferral_request", x => x.Id);
                    table.ForeignKey(
                        name: "FK_task_deferral_request_MaintenanceTasks_TaskId",
                        column: x => x.TaskId,
                        principalTable: "MaintenanceTasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_task_deferral_request_Vessels_VesselId",
                        column: x => x.VesselId,
                        principalTable: "Vessels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_environmental_data_VesselId_Timestamp",
                table: "environmental_data",
                columns: new[] { "VesselId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_navigation_data_VesselId_Timestamp",
                table: "navigation_data",
                columns: new[] { "VesselId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_nmea_raw_data_VesselId_Timestamp",
                table: "nmea_raw_data",
                columns: new[] { "VesselId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_task_deferral_request_TaskId",
                table: "task_deferral_request",
                column: "TaskId");

            migrationBuilder.CreateIndex(
                name: "IX_task_deferral_request_VesselId_Status_RequestedAt",
                table: "task_deferral_request",
                columns: new[] { "VesselId", "Status", "RequestedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "environmental_data");

            migrationBuilder.DropTable(
                name: "navigation_data");

            migrationBuilder.DropTable(
                name: "nmea_raw_data");

            migrationBuilder.DropTable(
                name: "task_deferral_request");
        }
    }
}
