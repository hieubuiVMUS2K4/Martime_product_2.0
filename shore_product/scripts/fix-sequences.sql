-- Dua moi sequence (ID tu tang) ve >= MAX(Id). Chay sau khi nap DB tu dump neu gap loi 'duplicate key PK_*':
--   docker exec -i shore_product-postgres-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/fix-sequences.sql
DO $$
DECLARE r record; mx bigint; lv bigint; called boolean;
BEGIN
  FOR r IN
    SELECT s.relname seq, t.relname tbl, a.attname col
    FROM pg_class s
    JOIN pg_depend d ON d.objid = s.oid AND d.deptype IN ('a','i')
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    JOIN pg_namespace n ON n.oid = s.relnamespace
    WHERE s.relkind = 'S' AND n.nspname = 'public'
  LOOP
    EXECUTE format('SELECT COALESCE(MAX(%I),0) FROM public.%I', r.col, r.tbl) INTO mx;
    EXECUTE format('SELECT last_value, is_called FROM public.%I', r.seq) INTO lv, called;
    IF mx > 0 AND (lv < mx OR (lv = mx AND NOT called)) THEN
      RAISE NOTICE 'fix %.% : seq % -> %', r.tbl, r.col, lv, mx;
      PERFORM setval(format('public.%I', r.seq), mx, true);
    END IF;
  END LOOP;
END $$;
