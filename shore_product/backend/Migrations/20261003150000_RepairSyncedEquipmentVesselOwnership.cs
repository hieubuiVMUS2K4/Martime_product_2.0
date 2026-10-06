using ProductApi.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace ProductApi.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261003150000_RepairSyncedEquipmentVesselOwnership")]
public class RepairSyncedEquipmentVesselOwnership : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        WITH ownership AS (
            SELECT l."RecordKey", COALESCE(n."VesselId", v."Id") AS vessel_id
            FROM sync_logs l
            LEFT JOIN sync_node_trackers n ON n."NodeId" = l."OriginNode" AND NOT n."IsRevoked"
            LEFT JOIN "Vessels" v ON v."IMO" = COALESCE(n."ImoNumber", l."OriginNode")
            WHERE l."TableName" = 'equipment_asset' AND l."Direction" = 'EDGE_TO_SHORE'
              AND l."Status" = 'SUCCESS'
        ), unambiguous AS (
            SELECT "RecordKey", (array_agg(DISTINCT vessel_id))[1] AS vessel_id
            FROM ownership WHERE vessel_id IS NOT NULL
            GROUP BY "RecordKey" HAVING count(DISTINCT vessel_id) = 1
        )
        UPDATE equipment_assets a SET "VesselId" = o.vessel_id
        FROM unambiguous o JOIN "Vessels" v ON v."Id" = o.vessel_id
        WHERE a."Id"::text = o."RecordKey" AND a."VesselId" IS NULL;
        """);

    protected override void Down(MigrationBuilder migrationBuilder)
        => throw new NotSupportedException("Restored vessel ownership must not be erased automatically.");
}
