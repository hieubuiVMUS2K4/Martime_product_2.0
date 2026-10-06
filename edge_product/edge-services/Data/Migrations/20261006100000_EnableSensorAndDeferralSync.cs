using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace MaritimeEdge.Data.Migrations;

public partial class EnableSensorAndDeferralSync : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Old Shore ACKs for these tables did not prove persistence. Retain queue history,
        // reset retention eligibility, and queue bounded, fresh snapshots after this baseline.
        migrationBuilder.Sql("""
            INSERT INTO sync_state (key, value, updated_at)
            SELECT 'sensor-deferral-sync-v1:queue-baseline', COALESCE(MAX(id), 0)::text, now() FROM sync_queue
            ON CONFLICT (key) DO NOTHING;
            UPDATE nmea_raw_data SET is_synced = false;
            UPDATE navigation_data SET is_synced = false;
            UPDATE environmental_data SET is_synced = false;
            UPDATE task_deferral_requests SET is_synced = false;
            """);
        migrationBuilder.CreateIndex("idx_sync_table_record_id", "sync_queue", new[] { "table_name", "record_key", "id" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex("idx_sync_table_record_id", "sync_queue");
        // Keep pending work and the repair baseline across rollback/re-upgrade.
    }
}
