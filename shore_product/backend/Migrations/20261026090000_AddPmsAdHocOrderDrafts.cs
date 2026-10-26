using ProductApi.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace ProductApi.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261026090000_AddPmsAdHocOrderDrafts")]
public class AddPmsAdHocOrderDrafts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(name: "creation_command_id", schema: "public", table: "MaintenanceTasks", type: "uuid", nullable: true);
        migrationBuilder.AddColumn<string>(name: "creation_command_hash", schema: "public", table: "MaintenanceTasks", type: "character varying(64)", maxLength: 64, nullable: true);
        migrationBuilder.AddColumn<long>(name: "created_by_user_id", schema: "public", table: "MaintenanceTasks", type: "bigint", nullable: true);
        migrationBuilder.AddColumn<string>(name: "work_order_instructions", schema: "public", table: "MaintenanceTasks", type: "text", nullable: true);
        migrationBuilder.AddColumn<string>(name: "draft_checklist_json", schema: "public", table: "MaintenanceTasks", type: "text", nullable: true);
        migrationBuilder.CreateIndex(name: "ux_pms_work_order_creation", schema: "public", table: "MaintenanceTasks",
            columns: new[] { "VesselId", "OriginNode", "creation_command_id" }, unique: true, filter: "creation_command_id IS NOT NULL");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $pms$ BEGIN
                IF EXISTS (SELECT 1 FROM public."MaintenanceTasks" WHERE creation_command_id IS NOT NULL OR work_order_instructions IS NOT NULL OR draft_checklist_json IS NOT NULL) THEN
                    RAISE EXCEPTION 'PMS ad-hoc data exists; preserve creation receipts and instructions';
                END IF;
            END $pms$;
            """);
        migrationBuilder.DropColumn(name: "draft_checklist_json", schema: "public", table: "MaintenanceTasks");
        migrationBuilder.DropIndex(name: "ux_pms_work_order_creation", schema: "public", table: "MaintenanceTasks");
        migrationBuilder.DropColumn(name: "creation_command_id", schema: "public", table: "MaintenanceTasks");
        migrationBuilder.DropColumn(name: "creation_command_hash", schema: "public", table: "MaintenanceTasks");
        migrationBuilder.DropColumn(name: "created_by_user_id", schema: "public", table: "MaintenanceTasks");
        migrationBuilder.DropColumn(name: "work_order_instructions", schema: "public", table: "MaintenanceTasks");
    }
}
