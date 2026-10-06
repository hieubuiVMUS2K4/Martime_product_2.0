using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ProductApi.Data;

namespace ProductApi.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261005090000_AddRankLevel")]
public class AddRankLevel : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("ALTER TABLE ranks ADD COLUMN IF NOT EXISTS \"Level\" character varying(100);");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "Level", table: "ranks");
    }
}
