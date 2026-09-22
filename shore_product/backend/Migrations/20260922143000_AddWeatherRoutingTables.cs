using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace productapi.Migrations
{
    /// <inheritdoc />
    /// <summary>
    /// Đề 4 Phase 1 — add weather_routing_jobs + weather_routing_routes only.
    /// Idempotent SQL (IF NOT EXISTS) to match Shore migration style.
    /// </summary>
    public partial class AddWeatherRoutingTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS weather_routing_jobs (
                    ""Id"" uuid NOT NULL,
                    ""VesselId"" uuid NULL,
                    ""StartLat"" double precision NOT NULL,
                    ""StartLon"" double precision NOT NULL,
                    ""GoalLat"" double precision NOT NULL,
                    ""GoalLon"" double precision NOT NULL,
                    ""Status"" character varying(32) NOT NULL,
                    ""Version"" integer NOT NULL DEFAULT 1,
                    ""RequestJson"" jsonb NOT NULL DEFAULT '{}'::jsonb,
                    ""HazardJson"" jsonb NOT NULL DEFAULT '[]'::jsonb,
                    ""MetricsJson"" jsonb NOT NULL DEFAULT '{}'::jsonb,
                    ""ErrorMessage"" character varying(2000) NULL,
                    ""CreatedAt"" timestamp with time zone NOT NULL,
                    ""UpdatedAt"" timestamp with time zone NOT NULL,
                    ""CompletedAt"" timestamp with time zone NULL,
                    CONSTRAINT ""PK_weather_routing_jobs"" PRIMARY KEY (""Id"")
                );

                CREATE INDEX IF NOT EXISTS ""IX_weather_routing_jobs_Status""
                    ON weather_routing_jobs (""Status"");
                CREATE INDEX IF NOT EXISTS ""IX_weather_routing_jobs_VesselId""
                    ON weather_routing_jobs (""VesselId"");
                CREATE INDEX IF NOT EXISTS ""IX_weather_routing_jobs_CreatedAt""
                    ON weather_routing_jobs (""CreatedAt"" DESC);

                CREATE TABLE IF NOT EXISTS weather_routing_routes (
                    ""Id"" uuid NOT NULL,
                    ""JobId"" uuid NOT NULL,
                    ""Kind"" character varying(32) NOT NULL,
                    ""Version"" integer NOT NULL DEFAULT 1,
                    ""WaypointsJson"" jsonb NOT NULL DEFAULT '[]'::jsonb,
                    ""MetricsJson"" jsonb NOT NULL DEFAULT '{}'::jsonb,
                    ""CreatedAt"" timestamp with time zone NOT NULL,
                    CONSTRAINT ""PK_weather_routing_routes"" PRIMARY KEY (""Id""),
                    CONSTRAINT ""FK_weather_routing_routes_weather_routing_jobs_JobId""
                        FOREIGN KEY (""JobId"") REFERENCES weather_routing_jobs (""Id"") ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS ""IX_weather_routing_routes_JobId""
                    ON weather_routing_routes (""JobId"");
                CREATE INDEX IF NOT EXISTS ""IX_weather_routing_routes_JobId_Version""
                    ON weather_routing_routes (""JobId"", ""Version"");
                CREATE INDEX IF NOT EXISTS ""IX_weather_routing_routes_Kind""
                    ON weather_routing_routes (""Kind"");
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                DROP TABLE IF EXISTS weather_routing_routes;
                DROP TABLE IF EXISTS weather_routing_jobs;
            ");
        }
    }
}
