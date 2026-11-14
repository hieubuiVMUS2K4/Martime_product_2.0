-- Only fills a missing standard catalog; refuses conflicting IDs/codes.
-- Run on Shore before the Edge demo command, then compare IDs on both nodes.
BEGIN;
LOCK TABLE report_types IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM report_types r
        JOIN (VALUES (1,'NOON'),(2,'DEPARTURE'),(3,'ARRIVAL'),(4,'BUNKER'),(5,'POSITION')) v(id,code)
          ON r."Id" = v.id OR r."TypeCode" = v.code
        WHERE r."Id" <> v.id OR r."TypeCode" <> v.code
    ) THEN RAISE EXCEPTION 'Catalog IDs conflict; reconcile with Edge before seeding'; END IF;
END $$;
INSERT INTO report_types ("Id","TypeCode","TypeName","Category","Frequency","IsMandatory","RequiresMasterSignature","IsActive","CreatedAt")
SELECT v.id,v.code,v.name,v.category,v.frequency,v.mandatory,v.signature,true,now()
FROM (VALUES
 (1,'NOON','Noon Report','OPERATIONAL','DAILY',true,true),
 (2,'DEPARTURE','Departure Report','OPERATIONAL','VOYAGE_BASED',true,true),
 (3,'ARRIVAL','Arrival Report','OPERATIONAL','VOYAGE_BASED',true,true),
 (4,'BUNKER','Bunker Delivery Note Report','COMPLIANCE','EVENT_BASED',true,true),
 (5,'POSITION','Position Report','OPERATIONAL','EVENT_BASED',false,false)
) v(id,code,name,category,frequency,mandatory,signature)
WHERE NOT EXISTS (SELECT 1 FROM report_types r WHERE r."TypeCode"=v.code);
SELECT setval(pg_get_serial_sequence('report_types','Id'), GREATEST((SELECT max("Id") FROM report_types),1));
COMMIT;
SELECT "Id","TypeCode" FROM report_types ORDER BY "Id";
