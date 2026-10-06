using ProductApi.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace ProductApi.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261003140000_AddMaintenanceCalendarUnitsAndWorkCode")]
public class AddMaintenanceCalendarUnitsAndWorkCode : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>("IntervalMonths", "maintenance_schedules", type: "integer", nullable: true);
        migrationBuilder.AddColumn<int>("IntervalYears", "maintenance_schedules", type: "integer", nullable: true);
        migrationBuilder.AddColumn<string>("WorkCode", "maintenance_schedules", type: "character varying(50)", maxLength: 50, nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn("IntervalMonths", "maintenance_schedules");
        migrationBuilder.DropColumn("IntervalYears", "maintenance_schedules");
        migrationBuilder.DropColumn("WorkCode", "maintenance_schedules");
    }
}
