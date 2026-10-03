using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace MaritimeEdge.Data.Migrations;

[DbContext(typeof(EdgeDbContext))]
[Migration("20261003140000_AddMaintenanceCalendarUnitsAndWorkCode")]
public class AddMaintenanceCalendarUnitsAndWorkCode : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>("interval_months", "maintenance_schedules", type: "integer", nullable: true);
        migrationBuilder.AddColumn<int>("interval_years", "maintenance_schedules", type: "integer", nullable: true);
        migrationBuilder.AddColumn<string>("work_code", "maintenance_schedules", type: "character varying(50)", maxLength: 50, nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn("interval_months", "maintenance_schedules");
        migrationBuilder.DropColumn("interval_years", "maintenance_schedules");
        migrationBuilder.DropColumn("work_code", "maintenance_schedules");
    }
}
