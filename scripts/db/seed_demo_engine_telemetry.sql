-- HP PIONEER VMU only. Execute on Edge; the existing alert enqueuer delivers to Shore.
-- Stable IDs make replay safe. Never update an existing alarm/event or mark it synced here.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(927836715);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM maritime_reports WHERE origin_node='edge-9278367-main') THEN
  RAISE EXCEPTION 'Expected HP PIONEER VMU Edge node was not found';
 END IF;
END $$;

INSERT INTO safety_alarms
 (id,timestamp,alarm_type,alarm_code,severity,location,description,
  is_acknowledged,acknowledged_at,acknowledged_by,is_resolved,resolved_at,
  is_synced,created_at,updated_at,origin_node)
SELECT md5('demo-telemetry-20261114:alarm:'||n)::uuid,
 now()-age*interval '1 hour',kind,'TRAINING-20261114-'||n,severity,'ENGINE_ROOM',
 description,ack,
 CASE WHEN ack THEN now()-(age-0.25)*interval '1 hour' END,
 CASE WHEN ack THEN 'Ca trực máy' END,resolved,
 CASE WHEN resolved THEN now()-(age-0.5)*interval '1 hour' END,
 false,now(),now(),'edge-9278367-main'
FROM (VALUES
 (1,2.0,'ENGINE','CRITICAL','Áp suất dầu bôi trơn máy chính thấp – tình huống trình diễn.',false,false),
 (2,3.0,'ENGINE','WARNING','Nhiệt độ nước làm mát máy chính tăng – tình huống trình diễn.',true,false),
 (3,5.0,'ENGINE','WARNING','Chênh áp bầu lọc nhiên liệu tăng – tình huống trình diễn.',false,false),
 (4,6.0,'BILGE','WARNING','Mức nước la canh buồng máy cao – tình huống trình diễn.',true,false),
 (5,20.0,'ENGINE','WARNING','Nhiệt độ khí xả xi lanh lệch – đã kiểm tra trong tình huống thực hành.',true,true),
 (6,28.0,'ENGINE','INFO','Áp suất khí khởi động đã trở về bình thường – tình huống thực hành.',true,true)
) v(n,age,kind,severity,description,ack,resolved)
ON CONFLICT (id) DO NOTHING;

INSERT INTO engine_events
 (id,timestamp,engine_id,event_type,rpm,load_percent,trigger_source,is_synced,created_at,origin_node)
SELECT md5('demo-telemetry-20261114:event:'||n)::uuid,
 now()-age*interval '1 hour','ME1',kind,
 CASE WHEN kind='START' THEN 35.0 ELSE 0.0 END,
 CASE WHEN kind='START' THEN 8.0 ELSE 0.0 END,
 'TRAINING-20261114',false,now(),'edge-9278367-main'
FROM (VALUES (1,60,'START'),(2,52,'STOP'),(3,36,'START'),(4,30,'STOP'),
             (5,18,'START'),(6,12,'STOP'),(7,4,'START'),(8,1,'STOP')) v(n,age,kind)
ON CONFLICT (id) DO NOTHING;
COMMIT;

SELECT count(*) AS demo_alarms,
 count(*) FILTER (WHERE NOT is_resolved) AS active,
 count(*) FILTER (WHERE NOT is_resolved AND severity='CRITICAL') AS critical
FROM safety_alarms WHERE alarm_code LIKE 'TRAINING-20261114-%';
SELECT count(*) AS demo_events FROM engine_events WHERE trigger_source='TRAINING-20261114';
