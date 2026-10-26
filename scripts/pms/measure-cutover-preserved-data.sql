-- Read-only business-data fingerprints. Outputs counts/hashes, never account or crew contents.
-- Equipment status/sync metadata may be restored by the reset; all other equipment fields are compared.
CREATE TEMP TABLE pms_preserved_check(table_name text, row_count bigint, fingerprint text);
DO $check$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.table_name FROM information_schema.tables c
    WHERE c.table_schema='public' AND c.table_name IN
      ('equipment_assets','equipment_groups','equipment_group_members','material_item_equipments',
       'material_items','material_item_ship','inventory_stocks','store_locations','crew_members',
       'users','Users','roles','ranks','rank_permission_configs','approval_documents','approval_revisions','approval_actions')
    ORDER BY c.table_name
  LOOP
    IF t='equipment_assets' THEN
      EXECUTE format('INSERT INTO pms_preserved_check SELECT %L,count(*),md5(coalesce(string_agg(h,'''' ORDER BY h),'''')) FROM (SELECT md5((to_jsonb(r)-ARRAY[''status'',''Status'',''maintenance_previous_status'',''MaintenancePreviousStatus'',''is_synced'',''IsSynced'',''updated_at'',''UpdatedAt''])::text) h FROM public.%I r) x',t,t);
    ELSE
      EXECUTE format('INSERT INTO pms_preserved_check SELECT %L,count(*),md5(coalesce(string_agg(h,'''' ORDER BY h),'''')) FROM (SELECT md5(to_jsonb(r)::text) h FROM public.%I r) x',t,t);
    END IF;
  END LOOP;
END $check$;
SELECT row_to_json(c) FROM pms_preserved_check c ORDER BY table_name;
