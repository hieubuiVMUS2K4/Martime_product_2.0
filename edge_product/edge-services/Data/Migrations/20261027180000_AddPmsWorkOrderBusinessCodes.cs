using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace MaritimeEdge.Data.Migrations;
[DbContext(typeof(EdgeDbContext))]
[Migration("20261027180000_AddPmsWorkOrderBusinessCodes")]
public class AddPmsWorkOrderBusinessCodes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "work_order_code", schema: "public", table: "maintenance_tasks", type: "character varying(32)", maxLength: 32, nullable: true);
        migrationBuilder.CreateIndex(name: "ux_pms_work_order_code", schema: "public", table: "maintenance_tasks", columns: new[] { "origin_node", "work_order_code" }, unique: true);
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $pms$ BEGIN
                IF EXISTS (SELECT 1 FROM public."maintenance_tasks" WHERE work_order_code IS NOT NULL) THEN
                    RAISE EXCEPTION 'PMS business codes exist; rollback would discard Work Order references';
                END IF;
            END $pms$;
            """);
        migrationBuilder.DropIndex(name: "ux_pms_work_order_code", schema: "public", table: "maintenance_tasks");
        migrationBuilder.DropColumn(name: "work_order_code", schema: "public", table: "maintenance_tasks");
    }
}
