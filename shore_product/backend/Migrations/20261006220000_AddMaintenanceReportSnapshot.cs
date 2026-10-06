using ProductApi.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace ProductApi.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261006220000_AddMaintenanceReportSnapshot")]
public class AddMaintenanceReportSnapshot : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.AddColumn<string>(
        name: "report_snapshot", schema: "public", table: "maintenance_histories", type: "text", nullable: true);
    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropColumn(
        name: "report_snapshot", schema: "public", table: "maintenance_histories");
}
