using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ProductApi.Data;

namespace ProductApi.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261005100000_AddCertificateIssuingAuthority")]
public class AddCertificateIssuingAuthority : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("ALTER TABLE certificates ADD COLUMN IF NOT EXISTS \"IssuingAuthority\" character varying(200);");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "IssuingAuthority", table: "certificates");
    }
}
