using ProductApi.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace ProductApi.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261026110000_AddPmsSyncDatasetFence")]
public class AddPmsSyncDatasetFence : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE pms_sync_datasets (
              "OriginNode" varchar(50) NOT NULL, "VesselId" uuid NOT NULL,
              "DatasetId" uuid NOT NULL, "StreamId" uuid NOT NULL,
              "IsActive" boolean NOT NULL, "CreatedAt" timestamptz NOT NULL,
              CONSTRAINT "PK_pms_sync_datasets" PRIMARY KEY ("OriginNode"));
            CREATE TABLE pms_sync_mirror_records (
              "Key" varchar(64) NOT NULL, "OriginNode" varchar(50) NOT NULL,
              "VesselId" uuid NOT NULL, "DatasetId" uuid NOT NULL, "TableName" varchar(60) NOT NULL,
              "SourceId" uuid NOT NULL, "ShoreId" uuid NOT NULL, "Sequence" bigint NOT NULL,
              "PayloadHash" varchar(64) NOT NULL, "SourceJson" text NOT NULL,
              CONSTRAINT "PK_pms_sync_mirror_records" PRIMARY KEY ("Key"));
            ALTER TABLE public.pms_work_order_reports ADD COLUMN vessel_id uuid;
            ALTER TABLE public.pms_work_order_material_postings ADD COLUMN vessel_id uuid;
            """);
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $pms$ BEGIN
              IF EXISTS (SELECT 1 FROM pms_sync_datasets) OR EXISTS (SELECT 1 FROM pms_sync_mirror_records)
                 OR EXISTS (SELECT 1 FROM public.pms_work_order_reports WHERE vessel_id IS NOT NULL)
                 OR EXISTS (SELECT 1 FROM public.pms_work_order_material_postings WHERE vessel_id IS NOT NULL)
              THEN RAISE EXCEPTION 'PMS sync fencing cannot be removed after dataset registration'; END IF;
            END $pms$;
            ALTER TABLE public.pms_work_order_reports DROP COLUMN vessel_id;
            ALTER TABLE public.pms_work_order_material_postings DROP COLUMN vessel_id;
            DROP TABLE pms_sync_mirror_records, pms_sync_datasets;
            """);
    }
}
