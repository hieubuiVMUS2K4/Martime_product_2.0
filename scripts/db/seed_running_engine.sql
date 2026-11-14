-- HP PIONEER VMU: append an underway engine reading and start event.
-- Stable IDs prevent duplicate events. Existing stop/start history remains intact.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(927836718);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM maritime_reports WHERE origin_node='edge-9278367-main') THEN
  RAISE EXCEPTION 'Expected HP PIONEER VMU Edge node was not found';
 END IF;
END $$;
INSERT INTO engine_data
 (id,timestamp,engine_id,rpm,load_percent,is_running,alarm_status,is_synced,created_at,updated_at,origin_node)
VALUES
 (md5('engine-running-9278367-20261114:reading')::uuid,now(),'ME1',90,75,true,0,false,now(),now(),'edge-9278367-main')
ON CONFLICT (id) DO NOTHING;

INSERT INTO engine_events
 (id,timestamp,engine_id,event_type,rpm,load_percent,trigger_source,is_synced,created_at,origin_node)
VALUES
 (md5('engine-running-9278367-20261114:start')::uuid,now(),'ME1','START',90,75,'TRAINING-20261114-RUNNING',false,now(),'edge-9278367-main')
ON CONFLICT (id) DO NOTHING;
COMMIT;
SELECT engine_id,is_running,rpm,load_percent,timestamp FROM engine_data
WHERE origin_node='edge-9278367-main' ORDER BY timestamp DESC LIMIT 1;
SELECT engine_id,event_type,timestamp FROM engine_events
WHERE origin_node='edge-9278367-main' ORDER BY timestamp DESC LIMIT 1;
