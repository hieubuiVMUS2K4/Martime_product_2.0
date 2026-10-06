using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using ProductApi.Data;

namespace ProductApi.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261005130000_HardenSyncDelivery")]
public class HardenSyncDelivery : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable("sync_stream_state", columns: table => new
        {
            Key = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
            Epoch = table.Column<Guid>(type: "uuid", nullable: false)
        }, constraints: table => table.PrimaryKey("PK_sync_stream_state", x => x.Key));
        migrationBuilder.CreateTable("sync_record_identities", columns: table => new
        {
            OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
            TableName = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
            LocalKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
            ShoreKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false)
        }, constraints: table => table.PrimaryKey("PK_sync_record_identities", x => new { x.OriginNode, x.TableName, x.LocalKey }));
        migrationBuilder.CreateTable("sync_record_cursors", columns: table => new
        {
            Key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
            Sequence = table.Column<long>(nullable: false)
        }, constraints: table => table.PrimaryKey("PK_sync_record_cursors", x => x.Key));
        migrationBuilder.CreateTable("sync_outbox_deliveries", columns: table => new
        {
            OutboxId = table.Column<long>(nullable: false),
            NodeId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
            AppliedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
        }, constraints: table => table.PrimaryKey("PK_sync_outbox_deliveries", x => new { x.OutboxId, x.NodeId }));

        // Backfill only unambiguous registry bindings. Unknown senders must be provisioned.
        migrationBuilder.Sql("""
            UPDATE sync_node_trackers n SET "VesselId" = v."Id"
            FROM "Vessels" v
            WHERE n."VesselId" IS NULL AND n."ImoNumber" = v."IMO"
              AND NOT EXISTS (SELECT 1 FROM sync_node_trackers other WHERE other."VesselId" = v."Id");
            UPDATE sync_outbox o SET "TargetNode" = n."NodeId", "DeliveredAt" = NULL
            FROM sync_node_trackers n JOIN "Vessels" v ON n."VesselId" = v."Id"
            WHERE o."TargetNode" = v."IMO" AND n."IsRegistered" AND NOT n."IsRevoked";
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("sync_outbox_deliveries");
        migrationBuilder.DropTable("sync_record_cursors");
        migrationBuilder.DropTable("sync_record_identities");
        migrationBuilder.DropTable("sync_stream_state");
    }
}
