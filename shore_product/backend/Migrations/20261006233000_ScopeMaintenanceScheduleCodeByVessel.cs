using ProductApi.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace ProductApi.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261006233000_ScopeMaintenanceScheduleCodeByVessel")]
public class ScopeMaintenanceScheduleCodeByVessel : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_maintenance_schedules_ScheduleCode", table: "maintenance_schedules");
        migrationBuilder.CreateIndex(name: "IX_maintenance_schedules_VesselId_ScheduleCode", table: "maintenance_schedules",
            columns: new[] { "VesselId", "ScheduleCode" }, unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_maintenance_schedules_VesselId_ScheduleCode", table: "maintenance_schedules");
        migrationBuilder.CreateIndex(name: "IX_maintenance_schedules_ScheduleCode", table: "maintenance_schedules",
            column: "ScheduleCode", unique: true);
    }
}
