using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ProductApi.Data;

namespace ProductApi.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261114130000_AddVesselEnvironmentalSummary")]
public class AddVesselEnvironmentalSummary : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        CREATE TABLE vessel_environmental_summaries (
          "VesselId" uuid NOT NULL REFERENCES "Vessels"("Id") ON DELETE CASCADE,
          "ReportingYear" integer NOT NULL,
          "CiiRating" varchar(1), "AttainedCii" double precision, "AttainedEexi" double precision,
          "MrvStatus" varchar(100) NOT NULL,
          "PeriodStart" timestamptz NOT NULL, "PeriodEnd" timestamptz NOT NULL,
          "Source" varchar(200) NOT NULL, "Notes" varchar(1000) NOT NULL,
          "UpdatedAt" timestamptz NOT NULL,
          PRIMARY KEY ("VesselId", "ReportingYear"),
          CHECK ("CiiRating" IS NULL OR "CiiRating" IN ('A','B','C','D','E')),
          CHECK ("PeriodEnd" >= "PeriodStart")
        );
        """);

    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropTable("vessel_environmental_summaries");
}
