using ProductApi.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace ProductApi.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261103120000_AddShoreModuleSettings")]
public class AddShoreModuleSettings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.CreateTable(
        name: "shore_module_settings",
        columns: table => new {
            Id = table.Column<int>(type: "integer", nullable: false),
            DisabledModulesJson = table.Column<string>(type: "text", nullable: false),
            Version = table.Column<int>(type: "integer", nullable: false),
            UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
            UpdatedBy = table.Column<string>(type: "text", nullable: false)
        },
        constraints: table => table.PrimaryKey("PK_shore_module_settings", x => x.Id));
    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropTable("shore_module_settings");
}
