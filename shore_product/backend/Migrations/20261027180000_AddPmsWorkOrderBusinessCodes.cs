using ProductApi.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace ProductApi.Migrations;
[DbContext(typeof(AppDbContext))]
[Migration("20261027180000_AddPmsWorkOrderBusinessCodes")]
public class AddPmsWorkOrderBusinessCodes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "work_order_code", schema: "public", table: "MaintenanceTasks", type: "character varying(32)", maxLength: 32, nullable: true);
        migrationBuilder.CreateIndex(name: "ix_pms_work_order_code", schema: "public", table: "MaintenanceTasks", columns: new[] { "VesselId", "OriginNode", "work_order_code" }, unique: false);
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $pms$ BEGIN
                IF EXISTS (SELECT 1 FROM public."MaintenanceTasks" WHERE work_order_code IS NOT NULL) THEN
                    RAISE EXCEPTION 'PMS business codes exist; rollback would discard Work Order references';
                END IF;
            END $pms$;
            """);
        migrationBuilder.DropIndex(name: "ix_pms_work_order_code", schema: "public", table: "MaintenanceTasks");
        migrationBuilder.DropColumn(name: "work_order_code", schema: "public", table: "MaintenanceTasks");
    }
}
