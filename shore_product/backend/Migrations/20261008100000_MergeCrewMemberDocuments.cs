using ProductApi.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace ProductApi.Migrations;

/// <summary>
/// Gộp 4 bảng tài liệu thuyền viên (travel/seafarer/employment/health_documents) thành MỘT bảng
/// crew_member_documents, phân nhóm bằng cột Category. Chứng chỉ vẫn ở crew_certificates.
/// Theo yêu cầu: không chuyển dữ liệu cũ (chỉ có dữ liệu thử) — bỏ bảng cũ, tạo bảng mới trống.
/// Hàng chờ đồng bộ của các bảng cũ cũng bỏ (tàu đã chuyển sang gói crew_member_document).
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20261008100000_MergeCrewMemberDocuments")]
public class MergeCrewMemberDocuments : Migration
{
    private static readonly string[] OldTables = ["travel_documents", "seafarer_documents", "employment_documents", "health_documents"];

    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DELETE FROM sync_outbox_deliveries WHERE "OutboxId" IN (SELECT "Id" FROM sync_outbox
              WHERE "TableName" IN ('travel_document','seafarer_document','employment_document','health_document'));
            DELETE FROM sync_outbox WHERE "TableName" IN ('travel_document','seafarer_document','employment_document','health_document');
            """);
        foreach (var table in OldTables)
            migrationBuilder.DropTable(name: table);

        migrationBuilder.CreateTable(
            name: "crew_member_documents",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                CrewMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                Category = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                DocumentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                DocumentNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                IssueDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                ExpiryDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                CountryId = table.Column<int>(type: "integer", nullable: true),
                FileUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                Notes = table.Column<string>(type: "text", nullable: true),
                CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_crew_member_documents", x => x.Id);
                table.ForeignKey("FK_crew_member_documents_countries_CountryId", x => x.CountryId, "countries", "Id", onDelete: ReferentialAction.SetNull);
                table.ForeignKey("FK_crew_member_documents_crew_members_CrewMemberId", x => x.CrewMemberId, "crew_members", "Id", onDelete: ReferentialAction.Cascade);
            });
        migrationBuilder.CreateIndex("IX_crew_member_documents_CountryId", "crew_member_documents", "CountryId");
        migrationBuilder.CreateIndex("IX_crew_member_documents_CrewMemberId_Category", "crew_member_documents", new[] { "CrewMemberId", "Category" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "crew_member_documents");
        foreach (var table in OldTables)
        {
            var hasCountry = table != "health_documents";
            migrationBuilder.Sql($"""
                CREATE TABLE {table} (
                  "Id" uuid PRIMARY KEY,
                  "CrewMemberId" uuid NOT NULL REFERENCES crew_members("Id") ON DELETE CASCADE,
                  "DocumentType" character varying(50) NOT NULL,
                  "DocumentNumber" character varying(100) NOT NULL,
                  "IssueDate" timestamp with time zone NULL,
                  "ExpiryDate" timestamp with time zone NULL,
                  "FileUrl" character varying(500) NULL,
                  "Notes" text NULL,
                  "CreatedAt" timestamp with time zone NOT NULL,
                  "UpdatedAt" timestamp with time zone NOT NULL
                  {(hasCountry ? ", \"CountryId\" integer NULL REFERENCES countries(\"Id\") ON DELETE SET NULL" : "")}
                );
                CREATE INDEX "IX_{table}_CrewMemberId" ON {table} ("CrewMemberId");
                """);
        }
    }
}
