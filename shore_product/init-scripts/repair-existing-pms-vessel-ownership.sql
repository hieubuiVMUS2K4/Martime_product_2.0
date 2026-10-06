BEGIN;
WITH ownership AS (
 SELECT l."RecordKey", (array_agg(DISTINCT n."VesselId"))[1] AS vessel_id
 FROM sync_logs l JOIN sync_node_trackers n ON n."NodeId"=l."OriginNode" AND NOT n."IsRevoked"
 WHERE l."TableName"='store_location' AND l."Direction"='EDGE_TO_SHORE' AND l."Status"='SUCCESS' AND n."VesselId" IS NOT NULL
 GROUP BY l."RecordKey" HAVING count(DISTINCT n."VesselId")=1
)
UPDATE store_locations t SET "VesselId"=o.vessel_id FROM ownership o WHERE t."Id"::text=o."RecordKey" AND t."VesselId" IS NULL;
WITH ownership AS (
 SELECT l."RecordKey", (array_agg(DISTINCT n."VesselId"))[1] AS vessel_id
 FROM sync_logs l JOIN sync_node_trackers n ON n."NodeId"=l."OriginNode" AND NOT n."IsRevoked"
 WHERE l."TableName"='equipment_group' AND l."Direction"='EDGE_TO_SHORE' AND l."Status"='SUCCESS' AND n."VesselId" IS NOT NULL
 GROUP BY l."RecordKey" HAVING count(DISTINCT n."VesselId")=1
)
UPDATE equipment_groups t SET "VesselId"=o.vessel_id FROM ownership o WHERE t."Id"::text=o."RecordKey" AND t."VesselId" IS NULL;
WITH ownership AS (
 SELECT l."RecordKey", (array_agg(DISTINCT n."VesselId"))[1] AS vessel_id
 FROM sync_logs l JOIN sync_node_trackers n ON n."NodeId"=l."OriginNode" AND NOT n."IsRevoked"
 WHERE l."TableName"='maintenance_schedule' AND l."Direction"='EDGE_TO_SHORE' AND l."Status"='SUCCESS' AND n."VesselId" IS NOT NULL
 GROUP BY l."RecordKey" HAVING count(DISTINCT n."VesselId")=1
)
UPDATE maintenance_schedules t SET "VesselId"=o.vessel_id FROM ownership o WHERE t."Id"::text=o."RecordKey" AND t."VesselId" IS NULL;
WITH ownership AS (
 SELECT l."RecordKey", (array_agg(DISTINCT n."VesselId"))[1] AS vessel_id
 FROM sync_logs l JOIN sync_node_trackers n ON n."NodeId"=l."OriginNode" AND NOT n."IsRevoked"
 WHERE l."TableName"='maintenance_task' AND l."Direction"='EDGE_TO_SHORE' AND l."Status"='SUCCESS' AND n."VesselId" IS NOT NULL
 GROUP BY l."RecordKey" HAVING count(DISTINCT n."VesselId")=1
)
UPDATE "MaintenanceTasks" t SET "VesselId"=o.vessel_id FROM ownership o WHERE t."Id"::text=o."RecordKey" AND t."VesselId" IS NULL;
COMMIT;