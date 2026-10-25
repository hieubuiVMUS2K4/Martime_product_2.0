using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace MaritimeEdge.Data.Migrations;

[DbContext(typeof(EdgeDbContext))]
[Migration("20261025160000_AddPmsWorkOrderFoundation")]
public class AddPmsWorkOrderFoundation : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(name: "pms_protocol_version", schema: "public", table: "maintenance_schedules", type: "integer", nullable: true);
        migrationBuilder.AddColumn<int>(name: "job_version", schema: "public", table: "maintenance_schedules", type: "integer", nullable: true);
        migrationBuilder.AddColumn<string>(name: "job_state", schema: "public", table: "maintenance_schedules", type: "character varying(32)", maxLength: 32, nullable: true);
        migrationBuilder.AddColumn<DateTime>(name: "baseline_at", schema: "public", table: "maintenance_schedules", type: "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<double>(name: "baseline_running_hours", schema: "public", table: "maintenance_schedules", type: "double precision", nullable: true);
        migrationBuilder.AddColumn<string>(name: "baseline_source", schema: "public", table: "maintenance_schedules", type: "text", nullable: true);
        migrationBuilder.AddColumn<double>(name: "warning_hours", schema: "public", table: "maintenance_schedules", type: "double precision", nullable: true);
        migrationBuilder.AddColumn<string>(name: "release_policy", schema: "public", table: "maintenance_schedules", type: "character varying(20)", maxLength: 20, nullable: true);
        migrationBuilder.AddColumn<string>(name: "responsible_department", schema: "public", table: "maintenance_schedules", type: "character varying(50)", maxLength: 50, nullable: true);
        migrationBuilder.AddColumn<int>(name: "responsible_rank_id", schema: "public", table: "maintenance_schedules", type: "integer", nullable: true);
        migrationBuilder.AddColumn<Guid>(name: "responsible_crew_id", schema: "public", table: "maintenance_schedules", type: "uuid", nullable: true);
        migrationBuilder.AddColumn<string>(name: "assignment_policy", schema: "public", table: "maintenance_schedules", type: "character varying(20)", maxLength: 20, nullable: true);
        migrationBuilder.AddColumn<long>(name: "next_cycle_number", schema: "public", table: "maintenance_schedules", type: "bigint", nullable: true);
        migrationBuilder.AddColumn<int>(name: "pms_protocol_version", schema: "public", table: "maintenance_tasks", type: "integer", nullable: true);
        migrationBuilder.AddColumn<string>(name: "cycle_key", schema: "public", table: "maintenance_tasks", type: "character varying(120)", maxLength: 120, nullable: true);
        migrationBuilder.AddColumn<int>(name: "job_version", schema: "public", table: "maintenance_tasks", type: "integer", nullable: true);
        migrationBuilder.AddColumn<string>(name: "job_snapshot", schema: "public", table: "maintenance_tasks", type: "text", nullable: true);
        migrationBuilder.AddColumn<DateTime>(name: "work_order_due_at", schema: "public", table: "maintenance_tasks", type: "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<double>(name: "work_order_due_hours", schema: "public", table: "maintenance_tasks", type: "double precision", nullable: true);
        migrationBuilder.AddColumn<string>(name: "due_state", schema: "public", table: "maintenance_tasks", type: "character varying(24)", maxLength: 24, nullable: true);
        migrationBuilder.AddColumn<int>(name: "report_revision", schema: "public", table: "maintenance_tasks", type: "integer", nullable: true);
        migrationBuilder.CreateIndex(name: "ux_pms_work_order_cycle", schema: "public", table: "maintenance_tasks", columns: new[] { "schedule_id", "cycle_key" }, unique: true, filter: "cycle_key IS NOT NULL");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // A destructive schema rollback is unsafe once protocol-2 records exist.
        migrationBuilder.Sql("""
            DO $pms$
            BEGIN
                IF EXISTS (SELECT 1 FROM public.maintenance_tasks WHERE pms_protocol_version IS NOT NULL)
                   OR EXISTS (SELECT 1 FROM public.maintenance_schedules WHERE pms_protocol_version IS NOT NULL) THEN
                    RAISE EXCEPTION 'PMS rework data exists; preserve the schema and roll forward instead';
                END IF;
            END $pms$;
            """);
        migrationBuilder.DropIndex(name: "ux_pms_work_order_cycle", schema: "public", table: "maintenance_tasks");
        migrationBuilder.DropColumn(name: "pms_protocol_version", schema: "public", table: "maintenance_tasks");
        migrationBuilder.DropColumn(name: "cycle_key", schema: "public", table: "maintenance_tasks");
        migrationBuilder.DropColumn(name: "job_version", schema: "public", table: "maintenance_tasks");
        migrationBuilder.DropColumn(name: "job_snapshot", schema: "public", table: "maintenance_tasks");
        migrationBuilder.DropColumn(name: "work_order_due_at", schema: "public", table: "maintenance_tasks");
        migrationBuilder.DropColumn(name: "work_order_due_hours", schema: "public", table: "maintenance_tasks");
        migrationBuilder.DropColumn(name: "due_state", schema: "public", table: "maintenance_tasks");
        migrationBuilder.DropColumn(name: "report_revision", schema: "public", table: "maintenance_tasks");
        migrationBuilder.DropColumn(name: "pms_protocol_version", schema: "public", table: "maintenance_schedules");
        migrationBuilder.DropColumn(name: "job_version", schema: "public", table: "maintenance_schedules");
        migrationBuilder.DropColumn(name: "job_state", schema: "public", table: "maintenance_schedules");
        migrationBuilder.DropColumn(name: "baseline_at", schema: "public", table: "maintenance_schedules");
        migrationBuilder.DropColumn(name: "baseline_running_hours", schema: "public", table: "maintenance_schedules");
        migrationBuilder.DropColumn(name: "baseline_source", schema: "public", table: "maintenance_schedules");
        migrationBuilder.DropColumn(name: "warning_hours", schema: "public", table: "maintenance_schedules");
        migrationBuilder.DropColumn(name: "release_policy", schema: "public", table: "maintenance_schedules");
        migrationBuilder.DropColumn(name: "responsible_department", schema: "public", table: "maintenance_schedules");
        migrationBuilder.DropColumn(name: "responsible_rank_id", schema: "public", table: "maintenance_schedules");
        migrationBuilder.DropColumn(name: "responsible_crew_id", schema: "public", table: "maintenance_schedules");
        migrationBuilder.DropColumn(name: "assignment_policy", schema: "public", table: "maintenance_schedules");
        migrationBuilder.DropColumn(name: "next_cycle_number", schema: "public", table: "maintenance_schedules");
    }
}
