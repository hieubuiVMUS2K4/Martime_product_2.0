using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace MaritimeEdge.Data.Migrations;

[DbContext(typeof(EdgeDbContext))]
[Migration("20261005130000_HardenSyncDelivery")]
public class HardenSyncDelivery : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("ALTER TABLE sync_queue ADD COLUMN IF NOT EXISTS event_id uuid NOT NULL DEFAULT gen_random_uuid();");
        migrationBuilder.Sql("ALTER TABLE report_transmission_logs ADD COLUMN IF NOT EXISTS sync_event_ids_json text;");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn("sync_event_ids_json", "report_transmission_logs");
        migrationBuilder.DropColumn("event_id", "sync_queue");
    }
}
