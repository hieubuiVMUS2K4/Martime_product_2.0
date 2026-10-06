using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace MaritimeEdge.Data.Migrations;

[DbContext(typeof(EdgeDbContext))]
[Migration("20261005110000_AddCatalogMetadata")]
public class AddCatalogMetadata : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("ALTER TABLE ranks ADD COLUMN IF NOT EXISTS level character varying(100);");
        migrationBuilder.Sql("ALTER TABLE certificates ADD COLUMN IF NOT EXISTS issuing_authority character varying(200);");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "level", table: "ranks");
        migrationBuilder.DropColumn(name: "issuing_authority", table: "certificates");
    }
}
