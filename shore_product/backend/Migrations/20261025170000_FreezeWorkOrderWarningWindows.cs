using ProductApi.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace ProductApi.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261025170000_FreezeWorkOrderWarningWindows")]
public class FreezeWorkOrderWarningWindows : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(name: "work_order_warning_days", schema: "public", table: "maintenance_tasks", type: "integer", nullable: true);
        migrationBuilder.AddColumn<double>(name: "work_order_warning_hours", schema: "public", table: "maintenance_tasks", type: "double precision", nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $pms$
            BEGIN
                IF EXISTS (SELECT 1 FROM public.maintenance_tasks WHERE pms_protocol_version IS NOT NULL) THEN
                    RAISE EXCEPTION 'PMS rework data exists; preserve frozen warning windows';
                END IF;
            END $pms$;
            """);
        migrationBuilder.DropColumn(name: "work_order_warning_days", schema: "public", table: "maintenance_tasks");
        migrationBuilder.DropColumn(name: "work_order_warning_hours", schema: "public", table: "maintenance_tasks");
    }
}
