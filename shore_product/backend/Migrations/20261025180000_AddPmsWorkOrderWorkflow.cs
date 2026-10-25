using ProductApi.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
namespace ProductApi.Migrations;
[DbContext(typeof(AppDbContext))]
[Migration("20261025180000_AddPmsWorkOrderWorkflow")]
public class AddPmsWorkOrderWorkflow : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "maintenance_previous_status", schema: "public", table: "equipment_assets", type: "character varying(50)", maxLength: 50, nullable: true);
        migrationBuilder.AddColumn<int>(name: "workflow_version", schema: "public", table: "maintenance_tasks", type: "integer", nullable: true);
        migrationBuilder.AddColumn<string>(name: "supporting_crew_ids", schema: "public", table: "maintenance_tasks", type: "text", nullable: true);
        migrationBuilder.AddColumn<string>(name: "execution_actors", schema: "public", table: "maintenance_tasks", type: "text", nullable: true);
        migrationBuilder.AddColumn<double>(name: "execution_started_hours", schema: "public", table: "maintenance_tasks", type: "double precision", nullable: true);
        migrationBuilder.CreateTable(name: "pms_work_order_reports", schema: "public", columns: table => new
        {
            id = table.Column<Guid>(type: "uuid", nullable: false),
            pms_protocol_version = table.Column<int>(type: "integer", nullable: false),
            work_order_id = table.Column<Guid>(type: "uuid", nullable: false),
            job_id = table.Column<Guid>(type: "uuid", nullable: true),
            revision = table.Column<int>(type: "integer", nullable: false),
            submit_command_id = table.Column<Guid>(type: "uuid", nullable: false),
            command_hash = table.Column<string>(type: "character varying(64)", nullable: false, maxLength: 64),
            submitted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
            executed_running_hours = table.Column<double>(type: "double precision", nullable: true),
            duration_minutes = table.Column<int>(type: "integer", nullable: false),
            due_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
            due_hours = table.Column<double>(type: "double precision", nullable: true),
            was_overdue = table.Column<bool>(type: "boolean", nullable: false),
            submitted_by_user_id = table.Column<long>(type: "bigint", nullable: false),
            submitted_by_crew_id = table.Column<string>(type: "character varying(50)", nullable: false, maxLength: 50),
            snapshot_json = table.Column<string>(type: "text", nullable: false),
            content_hash = table.Column<string>(type: "character varying(64)", nullable: false, maxLength: 64),
            decision = table.Column<string>(type: "character varying(20)", nullable: true, maxLength: 20),
            decided_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
            decided_by_user_id = table.Column<long>(type: "bigint", nullable: true),
            decided_by_crew_id = table.Column<string>(type: "character varying(50)", nullable: true, maxLength: 50),
            decision_reason = table.Column<string>(type: "text", nullable: true),
            approval_evidence_json = table.Column<string>(type: "text", nullable: true),
            origin_node = table.Column<string>(type: "character varying(50)", nullable: false, maxLength: 50),
            is_synced = table.Column<bool>(type: "boolean", nullable: false),
            created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
        }, constraints: table =>
        {
            table.PrimaryKey("pk_pms_work_order_reports", x => x.id);
            table.ForeignKey(name: "fk_pms_work_order_reports_order", column: x => x.work_order_id, principalSchema: "public", principalTable: "maintenance_tasks", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
            table.ForeignKey(name: "fk_pms_report_job", column: x => x.job_id, principalSchema: "public", principalTable: "maintenance_schedules", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
        });
        migrationBuilder.CreateTable(name: "pms_work_order_material_postings", schema: "public", columns: table => new
        {
            id = table.Column<Guid>(type: "uuid", nullable: false),
            pms_protocol_version = table.Column<int>(type: "integer", nullable: false),
            work_order_id = table.Column<Guid>(type: "uuid", nullable: false),
            report_id = table.Column<Guid>(type: "uuid", nullable: false),
            material_item_id = table.Column<Guid>(type: "uuid", nullable: false),
            quantity = table.Column<decimal>(type: "numeric(18,6)", nullable: false),
            stock_snapshot_json = table.Column<string>(type: "text", nullable: false),
            origin_node = table.Column<string>(type: "character varying(50)", nullable: false, maxLength: 50),
            is_synced = table.Column<bool>(type: "boolean", nullable: false),
            created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
        }, constraints: table =>
        {
            table.PrimaryKey("pk_pms_work_order_material_postings", x => x.id);
            table.ForeignKey(name: "fk_pms_work_order_material_postings_order", column: x => x.work_order_id, principalSchema: "public", principalTable: "maintenance_tasks", principalColumn: "Id", onDelete: ReferentialAction.Restrict);
            table.ForeignKey(name: "fk_pms_posting_report", column: x => x.report_id, principalSchema: "public", principalTable: "pms_work_order_reports", principalColumn: "id", onDelete: ReferentialAction.Restrict);
        });
        migrationBuilder.CreateIndex(name: "ux_pms_report_revision", schema: "public", table: "pms_work_order_reports", columns: new[] { "work_order_id", "revision" }, unique: true);
        migrationBuilder.CreateIndex(name: "ux_pms_report_command", schema: "public", table: "pms_work_order_reports", columns: new[] { "work_order_id", "submit_command_id" }, unique: true);
        migrationBuilder.CreateIndex(name: "ux_pms_material_posting", schema: "public", table: "pms_work_order_material_postings", columns: new[] { "work_order_id", "material_item_id" }, unique: true);
        migrationBuilder.CreateIndex(name: "ix_pms_report_job", schema: "public", table: "pms_work_order_reports", column: "job_id");
        migrationBuilder.CreateIndex(name: "ix_pms_posting_report", schema: "public", table: "pms_work_order_material_postings", column: "report_id");
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $pms$ BEGIN
                IF EXISTS (SELECT 1 FROM public.pms_work_order_reports) OR EXISTS (SELECT 1 FROM public.pms_work_order_material_postings) THEN
                    RAISE EXCEPTION 'PMS workflow reports exist; preserve schema and roll forward';
                END IF;
            END $pms$;
            """);
        migrationBuilder.DropTable(name: "pms_work_order_material_postings", schema: "public");
        migrationBuilder.DropTable(name: "pms_work_order_reports", schema: "public");
        migrationBuilder.DropColumn(name: "maintenance_previous_status", schema: "public", table: "equipment_assets");
        migrationBuilder.DropColumn(name: "workflow_version", schema: "public", table: "maintenance_tasks");
        migrationBuilder.DropColumn(name: "supporting_crew_ids", schema: "public", table: "maintenance_tasks");
        migrationBuilder.DropColumn(name: "execution_actors", schema: "public", table: "maintenance_tasks");
        migrationBuilder.DropColumn(name: "execution_started_hours", schema: "public", table: "maintenance_tasks");
    }
}
