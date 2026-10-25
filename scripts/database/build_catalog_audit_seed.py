"""Build the repeatable Shore/Edge catalog repair from the reviewed audit proposal.

Run: python scripts/database/build_catalog_audit_seed.py
Apply the resulting SQL with psql -v ON_ERROR_STOP=1 against each database.
Existing business records are never overwritten. UUIDs are shared across nodes.
"""
from pathlib import Path
import json
import re
import uuid

ROOT = Path(__file__).resolve().parents[2]
NS = uuid.UUID('352e045a-89e8-4bc5-89dd-a8c8568fd58c')


def uid(key):
    return str(uuid.uuid5(NS, key))


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


HEADER = r'''
-- Catalog audit repair, 2026-10-12. Works with Shore PascalCase and Edge snake_case.
-- Run on BOTH nodes. Back up first. Missing keys only; no user data overwritten.
BEGIN;
SELECT pg_advisory_xact_lock(20261012);
CREATE FUNCTION pg_temp.catalog_column(t text, k text) RETURNS text LANGUAGE sql AS $$
 SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name=t
 AND (lower(replace(column_name,'_',''))=lower(replace(k,'_',''))
 OR (k IN ('AssetName','GroupName') AND column_name='name')) LIMIT 1
$$;
CREATE FUNCTION pg_temp.catalog_id(t text, k text, v text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE found text;
BEGIN
 EXECUTE format('SELECT %I::text FROM %I WHERE %I::text=$1 LIMIT 1',
   pg_temp.catalog_column(t,'Id'), t, pg_temp.catalog_column(t,k)) INTO found USING v;
 RETURN found;
END $$;
CREATE FUNCTION pg_temp.catalog_seed(t text, payload jsonb, key_name text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE cols text; mapped jsonb := '{}'; k text; v jsonb; c text; found text; new_id text;
BEGIN
 IF to_regclass('public.' || t) IS NULL THEN RETURN NULL; END IF;
 found := pg_temp.catalog_id(t,key_name,payload->>key_name);
 IF found IS NOT NULL THEN RETURN found; END IF;
 EXECUTE format('LOCK TABLE %I IN SHARE ROW EXCLUSIVE MODE',t);
 FOR k,v IN SELECT * FROM jsonb_each(payload) LOOP
   c := pg_temp.catalog_column(t,k);
   IF c IS NOT NULL THEN mapped := mapped || jsonb_build_object(c,v); END IF;
 END LOOP;
 c := pg_temp.catalog_column(t,'Id');
 IF NOT mapped ? c THEN
   EXECUTE format('SELECT coalesce(max(%I),0)+1 FROM %I',c,t) INTO new_id;
   mapped := mapped || jsonb_build_object(c,new_id::int);
 END IF;
 SELECT string_agg(format('%I',key),',') INTO cols FROM jsonb_object_keys(mapped) key;
 EXECUTE format('INSERT INTO %I (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM jsonb_populate_record(NULL::%I,$1)',t,cols,cols,t) USING mapped;
 RETURN mapped->>c;
END $$;
'''


def build():
    sql = [HEADER]
    now = '2026-10-12T00:00:00Z'

    def seed(table, key, **data):
        # Fields absent from one node's schema are omitted by catalog_seed.
        defaults = dict(CreatedAt=now, UpdatedAt=now, IsActive=True,
                        IsSynced=True, OriginNode='SHORE')
        defaults.update(data)
        sql.append(f"SELECT pg_temp.catalog_seed({literal(table)}, {literal(json.dumps(defaults, ensure_ascii=False))}::jsonb, {literal(key)});")

    proposal = (ROOT / 'docs/DANH_MUC_DATABASE_AUDIT_PROPOSAL.md').read_text(encoding='utf-8')
    rows = [[cell.strip() for cell in line.split('|')[1:-1]]
            for line in proposal.splitlines() if line.startswith('| `')]
    locations = [r for r in rows if len(r) == 4]
    groups = [r for r in rows if len(r) == 5]
    drills = [r for r in rows if len(r) == 6]
    for code, name, parent, desc in locations:
        code = code.strip('`')
        parent_code = parent.strip('`') if '`' in parent else None
        payload = dict(Id=uid('location:'+code), LocationCode=code, Name=name,
                       Description=desc)
        start=len(sql)
        seed('store_locations', 'LocationCode', **payload)
        if parent_code:
            sql[start]=sql[start].replace("::jsonb, 'LocationCode'", "::jsonb || jsonb_build_object('ParentId',pg_temp.catalog_id('store_locations','LocationCode',"+literal(parent_code)+")), 'LocationCode'")
    for code, name, category, dept, role in groups:
        code = code.strip('`')
        role = re.search(r'`([^`]+)`', role)[1]
        seed('equipment_groups', 'GroupCode', Id=uid('group:'+code), GroupCode=code,
             GroupName=name, Category=category.strip('`'), Department=dept.strip('`'), PicRole=role)

    assets = [
        ('ME-01','Main Engine','ENGINE','MAN B&W','6S50MC-C','CRITICAL','GRP-PROPULSION','C/E','9480 kW'),
        ('DG-01','Diesel Generator No.1','GENERATOR','Yanmar','6EY18AL','HIGH','GRP-POWER-GEN','2/E','600 kW'),
        ('DG-02','Diesel Generator No.2','GENERATOR','Yanmar','6EY18AL','HIGH','GRP-POWER-GEN','2/E','600 kW'),
        ('AB-01','Auxiliary Boiler','BOILER','KangRim','Marine Steam Boiler','NORMAL','GRP-BOILER','3/E','0.7 MPa'),
        ('AC-01','Main Air Compressor No.1','COMPRESSOR','Sperre','HL2/105','NORMAL','GRP-COMP-AIR','4/E','30 bar'),
        ('PUR-01','HFO Purifier','SEPARATOR','Alfa Laval','S 921','HIGH','GRP-PURIFIERS','2/E','1850 L/h'),
        ('BP-01','Main Ballast Pump','PUMP','Shinko','Centrifugal Pump','NORMAL','GRP-PUMPS-BILGE','3/E','400 m3/h'),
        ('SG-01','Hydraulic Steering Gear','ENGINE','Yoowon','2-Ram 4-Cylinder','CRITICAL','GRP-STEERING','C/E',''),
    ]
    for code,name,category,maker,model,crit,group,role,spec in assets:
        seed('equipment_assets','AssetCode',Id=uid('asset:'+code),AssetCode=code,
             AssetName=name,Category=category,Manufacturer=maker,Model=model,
             Criticality=crit,Status='ACTIVE',DefaultExecutorRole=role,ApproverRole='C/E',
             TechnicalSpecs=json.dumps({'specification':spec}),
             Notes='AUDIT SAMPLE: verify vessel equipment and manufacturer instructions before use.')
        # Link existing or newly inserted natural keys on each node.
        member = dict(Id=uid('member:'+code),SequenceOrder=1,CreatedAt=now,IsSynced=True)
        sql.append(f"DO $$ DECLARE a text; g text; BEGIN a:=pg_temp.catalog_id('equipment_assets','AssetCode',{literal(code)}); g:=pg_temp.catalog_id('equipment_groups','GroupCode',{literal(group)}); IF NOT EXISTS (SELECT 1 FROM equipment_group_members x WHERE to_jsonb(x)->>pg_temp.catalog_column('equipment_group_members','AssetId')=a AND to_jsonb(x)->>pg_temp.catalog_column('equipment_group_members','GroupId')=g) THEN PERFORM pg_temp.catalog_seed('equipment_group_members',{literal(json.dumps(member))}::jsonb || jsonb_build_object('AssetId',a,'GroupId',g),'Id'); END IF; END $$;")
        schedule_code = 'AUDIT-'+code
        start=len(sql)
        seed('maintenance_schedules','ScheduleCode',Id=uid('schedule:'+code),
             ScheduleCode=schedule_code,ScheduleName=name+' - inspection template',
             EquipmentAssetId=uid('asset:'+code),MaintenanceCategory='INSPECTION',
             IntervalType='CALENDAR',IntervalDays=30,DaysBeforeDue=7,Priority='NORMAL',
             AutoGenerate=False,AssignedToRole=role,IsActive=False,
             RequireRiskAssessment=False,RequireInspectionReport=False,
             Instructions='Draft: confirm interval and checkpoints against manufacturer manual.',
             Notes='Draft: confirm interval and checkpoints against manufacturer manual.')
        sql[start]=sql[start].replace('::jsonb, \'ScheduleCode\'','::jsonb || jsonb_build_object(\'EquipmentAssetId\',pg_temp.catalog_id(\'equipment_assets\',\'AssetCode\','+literal(code)+')), \'ScheduleCode\'')
        for n,desc in enumerate(['Check external condition, leaks and guards.',
                                 'Record readings and compare with manufacturer limits.',
                                 'Record defects and corrective actions for review.'],1):
            start=len(sql)
            seed('schedule_checklist_templates','Id',Id=uid(f'check:{code}:{n}'),
                 ScheduleId=uid('schedule:'+code),SequenceOrder=n,
                 CheckpointDescription=desc,RequiresReading=False)
            sql[start]=sql[start].replace("::jsonb, 'Id'","::jsonb || jsonb_build_object('ScheduleId',pg_temp.catalog_id('maintenance_schedules','ScheduleCode',"+literal(schedule_code)+")), 'Id'")

    for code,name in [('BHS','Bahamas'),('CYP','Cyprus'),('MLT','Malta'),('VUT','Vanuatu'),
                      ('MYS','Malaysia'),('MMR','Myanmar'),('UKR','Ukraine')]:
        seed('countries','CountryCode',CountryCode=code,CountryName=name)
    for code,name,reference,months in [
        ('DSD','Designated Security Duties','STCW VI/6-2',None),
        ('SAT','Security Awareness Training','STCW VI/6-1',None),
        ('PSCRB','Proficiency in Survival Craft and Rescue Boats','STCW VI/2',60),
        ('MLC_MED','Seafarer Medical Certificate','MLC 2006',24),
        ('BTOCT','Basic Oil and Chemical Tanker Cargo Operations','STCW V/1-1',None),
        ('ATOT','Advanced Oil Tanker Cargo Operations','STCW V/1-1',60),
        ('ATCT','Advanced Chemical Tanker Cargo Operations','STCW V/1-1',60)]:
        seed('certificates','CertificateCode',CertificateCode=code,CertificateName=name,
             Category='MEDICAL' if code=='MLC_MED' else 'STCW',IsMandatory=False,
             ValidityPeriodMonths=months,Description=reference,StcwReference=reference)

    source = (ROOT/'shore_product/backend/Data/SmsSeedData.cs').read_text(encoding='utf-8')
    chapters = re.findall(r'new IsmElement \{ Id = (\d+), ChapterName = "([^"]+)"',source)
    # Company SMS topics, not a claim that these labels are the 16 ISM clauses.
    for num,title in chapters:
        n=int(num)
        seed('ism_elements','Id',Id=n,ChapterName=title)
        code=f'SOP-{n:02d}-01'
        seed('sms_procedures','ProcedureCode',Id=uid('sms:'+code),IsmElementId=n,
             ProcedureCode=code,Title=title,Version='Draft 1.0',PublishDate=now,
             Status='Draft',WatermarkText='BẢN NHÁP - CHỜ PHÊ DUYỆT',
             Content='<h3>Mẫu quy trình</h3><p>Công ty cần hoàn thiện phạm vi, trách nhiệm, các bước thực hiện, tiêu chí kiểm tra và hồ sơ lưu trữ trước khi phê duyệt áp dụng.</p>')
        form_code=f'BM-{n:02d}'
        schema=[dict(id='date',label='Ngày thực hiện / Date',type='date',required=True),
                dict(id='responsible',label='Người phụ trách / Responsible person',type='text',required=True),
                dict(id='details',label='Nội dung / Details',type='textarea',required=True),
                dict(id='actions',label='Hành động / Actions',type='textarea',required=False)]
        data=dict(Id=uid('form:'+form_code),FormCode=form_code,Title=title+' - biểu mẫu',
                  ContentSchema=json.dumps(schema,ensure_ascii=False),CreatedAt=now,UpdatedAt=now,
                  IsSynced=True,OriginNode='SHORE')
        sql.append(f"SELECT pg_temp.catalog_seed('sms_form_templates',{literal(json.dumps(data,ensure_ascii=False))}::jsonb || jsonb_build_object('SmsProcedureId',pg_temp.catalog_id('sms_procedures','ProcedureCode',{literal(code)})),'FormCode');")
    # Only the explicitly identified test row; backup keeps its document/history.
    sql.append("DO $$ BEGIN EXECUTE format('DELETE FROM sms_procedures WHERE %I=$1::uuid AND %I=$2',pg_temp.catalog_column('sms_procedures','Id'),pg_temp.catalog_column('sms_procedures','Title')) USING '18510095-6c26-48f2-9216-3920d6340baa','Nhóm 3 Tinh.V.D Linh.N.T.M'; END $$;")

    for order,(code,name,freq,days,role,ref) in enumerate(drills,1):
        code=code.strip('`'); freq=freq.strip('`')
        seed('drill_types','DrillCode',Id=uid('drill:'+code),DrillCode=code,
             DrillName=name,Category='SECURITY_DRILLS' if 'SECURITY' in code else 'STATION_DRILLS',
             FrequencyType=freq,FrequencyDays=None if freq=='ON_EVENT' else int(days),
             TriggerCondition=('ON_DEPARTURE' if 'DEPARTURE' in code else 'ON_JOINING') if freq=='ON_EVENT' else 'ROUTINE',
             TriggerWithinDays=int(days) if freq=='ON_EVENT' else None,
             WarningDaysBefore=0 if freq=='ON_EVENT' else 7,AssignedToRole=role,
             RegulationSource=ref,IsFixedInterval=freq!='ON_EVENT',IsDocumentRequired=False,
             IsSecureHistory=False,IsCrewMemberRequired=True,IsMandatorySignOnEvaluation=False,
             HasNoExpiry=False,IsMandatory=False,DisplayOrder=order,
             InstructionContent='Audit proposal template: verify applicability and schedule in the approved vessel SMS.')
    # Draft manning examples are tied to real Shore vessels, never activated.
    sql.append(r'''DO $$
DECLARE vessel record; standard_id text; rank_code text; rank_id text; n integer;
BEGIN
 IF to_regclass('public.vessel_manning_standards') IS NULL THEN RETURN; END IF;
 FOR vessel IN EXECUTE 'SELECT "Id" FROM "Vessels" WHERE "IsActive"' LOOP
   standard_id := md5('audit-manning:' || vessel."Id"::text)::uuid::text;
   PERFORM pg_temp.catalog_seed('vessel_manning_standards',jsonb_build_object(
     'Id',standard_id,'VesselId',vessel."Id",'Name','AUDIT - Draft manning example',
     'Description','Example only. Replace counts with the vessel Safe Manning Document before activation.',
     'IsActive',false,'CreatedAt','2026-10-12T00:00:00Z','UpdatedAt','2026-10-12T00:00:00Z'),'Id');
   n := 0;
   FOREACH rank_code IN ARRAY ARRAY['MST','C/O','2/O','3/O','C/E','2/E','3/E'] LOOP
     rank_id := pg_temp.catalog_id('ranks','RankCode',rank_code);
     IF rank_id IS NULL THEN CONTINUE; END IF;
     n := n+1;
     PERFORM pg_temp.catalog_seed('manning_positions',jsonb_build_object(
       'Id',md5('audit-manning:' || vessel."Id"::text || ':' || rank_code)::uuid,
       'ManningStandardId',standard_id,'RankId',rank_id::integer,'RequiredCount',1,
       'AllowEquivalent',false,'Notes','Draft example - verify approved manning document.',
       'SortOrder',n,'IsActive',false),'Id');
   END LOOP;
 END LOOP;
END $$;''')
    # Keep identity sequences beyond explicitly allocated catalog IDs.
    sql.append("DO $$ DECLARE t text; c text; seq text; max_id bigint; BEGIN FOREACH t IN ARRAY ARRAY['countries','certificates','ism_elements'] LOOP c:=pg_temp.catalog_column(t,'Id'); seq:=pg_get_serial_sequence(t,c); IF seq IS NOT NULL THEN EXECUTE format('SELECT max(%I) FROM %I',c,t) INTO max_id; PERFORM setval(seq,greatest(max_id,(SELECT last_value FROM pg_sequences WHERE schemaname='public' AND sequencename=replace(split_part(seq,'.',2),'\"',''))),true); END IF; END LOOP; END $$;")
    sql.append('COMMIT;\n')
    target=ROOT/'scripts/database/catalog_audit_2026_10_12.sql'
    target.write_text('\n'.join(sql),encoding='utf-8')
    print(target)


if __name__=='__main__':
    build()
