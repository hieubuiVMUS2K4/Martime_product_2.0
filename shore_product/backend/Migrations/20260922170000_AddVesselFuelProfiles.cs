using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace productapi.Migrations
{
    /// <inheritdoc />
    /// <summary>
    /// DE4 Weather Routing (phần lập kế hoạch n chặng / bunkering plan):
    ///  - thêm bảng vessel_fuel_profiles (thông số nhiên liệu: sức chứa, SFOC, công suất, tốc độ, dự trữ)
    ///  - thêm cột weather_routing_jobs.PlanJson (kế hoạch chặng của mỗi job)
    ///
    /// Idempotent SQL để có thể chạy tay bằng psql/pgAdmin giống migration weather routing trước đó.
    /// Bản DDL tương đương cũng được chạy tự động lúc khởi động backend (Program.cs).
    /// </summary>
    public partial class AddVesselFuelProfiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS vessel_fuel_profiles (
                    ""Id"" uuid NOT NULL,
                    ""VesselId"" uuid NOT NULL,
                    ""VesselName"" character varying(100) NULL,
                    ""FuelType"" character varying(20) NOT NULL DEFAULT 'VLSFO',
                    ""FuelCapacityTons"" double precision NOT NULL DEFAULT 220,
                    ""CurrentFuelTons"" double precision NULL,
                    ""ReserveFraction"" double precision NOT NULL DEFAULT 0.2,
                    ""ServiceSpeedKts"" double precision NOT NULL DEFAULT 11.5,
                    ""ServicePowerKw"" double precision NOT NULL DEFAULT 900,
                    ""SfocMainGPerKwh"" double precision NOT NULL DEFAULT 180,
                    ""AuxLoadKw"" double precision NOT NULL DEFAULT 120,
                    ""SfocAuxGPerKwh"" double precision NOT NULL DEFAULT 215,
                    ""SeaMarginFraction"" double precision NOT NULL DEFAULT 0.15,
                    ""SpeedExponent"" double precision NOT NULL DEFAULT 3.0,
                    ""WeatherAllowanceFraction"" double precision NOT NULL DEFAULT 0.08,
                    ""PortStayHours"" double precision NOT NULL DEFAULT 8.0,
                    ""MaxDetourNm"" double precision NOT NULL DEFAULT 250,
                    ""Source"" character varying(20) NOT NULL DEFAULT 'ESTIMATE',
                    ""Notes"" character varying(500) NULL,
                    ""CreatedAt"" timestamp with time zone NOT NULL,
                    ""UpdatedAt"" timestamp with time zone NOT NULL,
                    CONSTRAINT ""PK_vessel_fuel_profiles"" PRIMARY KEY (""Id"")
                );

                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_vessel_fuel_profiles_VesselId""
                    ON vessel_fuel_profiles (""VesselId"");

                ALTER TABLE weather_routing_jobs
                ADD COLUMN IF NOT EXISTS ""PlanJson"" jsonb NOT NULL DEFAULT '{}'::jsonb;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE weather_routing_jobs DROP COLUMN IF EXISTS ""PlanJson"";
                DROP TABLE IF EXISTS vessel_fuel_profiles;
            ");
        }
    }
}
