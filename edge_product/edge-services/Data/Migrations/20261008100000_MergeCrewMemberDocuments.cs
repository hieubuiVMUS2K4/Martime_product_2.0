using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace MaritimeEdge.Data.Migrations;

/// <summary>
/// Gộp 4 bảng tài liệu thuyền viên (travel/seafarer/employment/health_documents) thành MỘT bảng
/// crew_member_documents, phân nhóm bằng cột category. Chứng chỉ vẫn ở crew_certificates.
/// Theo yêu cầu: không chuyển dữ liệu cũ — bỏ bảng cũ, tạo bảng mới trống; bờ gửi lại khi đồng bộ.
/// Hàng chờ gửi lên bờ của các bảng cũ cũng bỏ (bờ đã chuyển sang gói crew_member_document).
/// </summary>
[DbContext(typeof(EdgeDbContext))]
[Migration("20261008100000_MergeCrewMemberDocuments")]
public class MergeCrewMemberDocuments : Migration
{
    private static readonly string[] OldTables = ["travel_documents", "seafarer_documents", "employment_documents", "health_documents"];

    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DELETE FROM public.sync_queue
             WHERE table_name IN ('travel_document','seafarer_document','employment_document','health_document');
            """);
        foreach (var table in OldTables)
            migrationBuilder.DropTable(name: table, schema: "public");

        migrationBuilder.CreateTable(
            name: "crew_member_documents",
            schema: "public",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                crew_member_id = table.Column<Guid>(type: "uuid", nullable: false),
                category = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                document_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                document_number = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                issue_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                expiry_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                country_id = table.Column<int>(type: "integer", nullable: true),
                file_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                notes = table.Column<string>(type: "text", nullable: true),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("p_k_crew_member_documents", x => x.id);
                table.ForeignKey("f_k_crew_member_documents_countries_country_id", x => x.country_id,
                    principalSchema: "public", principalTable: "countries", principalColumn: "id");
                table.ForeignKey("f_k_crew_member_documents_crew_members_crew_member_id", x => x.crew_member_id,
                    principalSchema: "public", principalTable: "crew_members", principalColumn: "id", onDelete: ReferentialAction.Cascade);
            });
        migrationBuilder.CreateIndex("IX_crew_member_documents_country_id", "crew_member_documents", "country_id", schema: "public");
        migrationBuilder.CreateIndex("IX_crew_member_documents_crew_member_id", "crew_member_documents", "crew_member_id", schema: "public");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "crew_member_documents", schema: "public");
        foreach (var table in OldTables)
        {
            var country = table != "health_documents"
                ? ", country_id integer NULL REFERENCES public.countries(id)" : "";
            migrationBuilder.Sql($"""
                CREATE TABLE public.{table} (
                  id uuid PRIMARY KEY,
                  crew_member_id uuid NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
                  document_type character varying(50) NOT NULL,
                  document_number character varying(100) NOT NULL,
                  issue_date timestamp with time zone NULL,
                  expiry_date timestamp with time zone NULL,
                  file_url character varying(500) NULL,
                  notes text NULL,
                  created_at timestamp with time zone NOT NULL,
                  updated_at timestamp with time zone NOT NULL{country}
                );
                """);
        }
    }
}
