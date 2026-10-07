using ProductApi.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace ProductApi.Migrations;

/// <summary>
/// Bảng vessel_certificate_assignments đã bị bỏ (danh mục loại chứng chỉ do bờ làm chủ, phát xuống mọi tàu).
/// Các bản ghi hàng chờ tạo trước lúc bỏ vẫn nằm trong sync_outbox: tàu không có bảng này nên không được
/// xác nhận, mỗi chu kỳ đồng bộ lại báo "Unsupported Shore sync table" mãi mãi. Xóa hẳn chúng.
/// </summary>
[DbContext(typeof(AppDbContext))]
[Migration("20261007230000_PurgeObsoleteVesselCertificateAssignmentOutbox")]
public class PurgeObsoleteVesselCertificateAssignmentOutbox : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DELETE FROM sync_outbox_deliveries
             WHERE "OutboxId" IN (SELECT "Id" FROM sync_outbox WHERE "TableName" = 'vessel_certificate_assignment');
            DELETE FROM sync_outbox WHERE "TableName" = 'vessel_certificate_assignment';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Không khôi phục: dữ liệu hàng chờ của một bảng đã bỏ.
    }
}
