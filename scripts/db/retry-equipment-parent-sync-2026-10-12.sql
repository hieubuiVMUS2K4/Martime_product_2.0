-- Manual recovery after deploying the dependency-aware Edge sender.
-- Keep payloads, event IDs, versions, retry counts and error evidence intact.
BEGIN;
UPDATE sync_queue
SET next_retry_at = NOW()
WHERE synced_at IS NULL
  AND table_name = 'equipment_asset'
  AND last_error LIKE '%FK_equipment_assets_equipment_assets_ParentId%';
COMMIT;
