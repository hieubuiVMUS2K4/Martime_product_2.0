-- Apply on Shore after AddVesselEnvironmentalSummary. No certified measurements are asserted.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(927836717);
DO $$ BEGIN
 IF (SELECT count(*) FROM "Vessels" WHERE "IMO"='9278367') <> 1 THEN
  RAISE EXCEPTION 'Expected exactly one vessel with IMO 9278367';
 END IF;
END $$;
INSERT INTO vessel_environmental_summaries
 ("VesselId","ReportingYear","CiiRating","AttainedCii","AttainedEexi","MrvStatus",
  "PeriodStart","PeriodEnd","Source","Notes","UpdatedAt")
SELECT "Id",2026,'B',3.25,4.12,'DRAFT','2026-08-16 00:00:00+00','2026-11-13 23:59:59+00',
 'Số liệu thực hành',
 'CII và EEXI là chỉ số tham chiếu được nhập phục vụ thực hành, chưa được thẩm tra. Kỳ dữ liệu chưa đủ năm; hồ sơ EU MRV đang chuẩn bị, chưa gửi cơ quan xác minh.',
 now() FROM "Vessels" WHERE "IMO"='9278367'
ON CONFLICT ("VesselId","ReportingYear") DO NOTHING;
COMMIT;
SELECT "ReportingYear","CiiRating","AttainedCii","AttainedEexi","MrvStatus","Source"
FROM vessel_environmental_summaries WHERE "VesselId" IN (SELECT "Id" FROM "Vessels" WHERE "IMO"='9278367');
