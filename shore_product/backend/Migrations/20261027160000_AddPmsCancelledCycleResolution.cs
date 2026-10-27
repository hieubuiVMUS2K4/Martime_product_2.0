using ProductApi.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace ProductApi.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261027160000_AddPmsCancelledCycleResolution")]
public class AddPmsCancelledCycleResolution : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(name: "cycle_release_attempt", schema: "public", table: "maintenance_schedules", type: "integer", nullable: true);
        migrationBuilder.AddColumn<DateTime>(name: "skipped_cycle_at", schema: "public", table: "maintenance_schedules", type: "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<double>(name: "skipped_cycle_hours", schema: "public", table: "maintenance_schedules", type: "double precision", nullable: true);
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $pms$ BEGIN
                IF EXISTS (SELECT 1 FROM public."maintenance_schedules" WHERE cycle_release_attempt IS NOT NULL OR skipped_cycle_at IS NOT NULL OR skipped_cycle_hours IS NOT NULL) THEN
                    RAISE EXCEPTION 'PMS cycle resolution data exists; rollback would lose cycle identity and skipped deadlines';
                END IF;
            END $pms$;
            """);
        migrationBuilder.DropColumn(name: "cycle_release_attempt", schema: "public", table: "maintenance_schedules");
        migrationBuilder.DropColumn(name: "skipped_cycle_at", schema: "public", table: "maintenance_schedules");
        migrationBuilder.DropColumn(name: "skipped_cycle_hours", schema: "public", table: "maintenance_schedules");
    }
}
