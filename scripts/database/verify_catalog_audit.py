"""Read-only verification of repaired catalogs on both local nodes."""
import json
import subprocess
from pathlib import Path
from apply_catalog_audit import NODES, ROOT


def query(node, sql):
    container, user, database = node
    result = subprocess.run(['docker','exec','-i',container,'psql','-U',user,'-d',database,
                             '-v','ON_ERROR_STOP=1','-At'],input=sql,encoding='utf-8',
                            capture_output=True,check=True)
    return json.loads(result.stdout)


def main():
    expected = {'store_locations':14,'equipment_groups':11,'equipment_assets':8,
                'schedule_checklist_templates':24,'sms_procedures':16,
                'sms_form_templates':16,'countries':22,'certificates':22}
    reports = {}
    for node in NODES:
        database = node[2]
        counts = {}
        records = {}
        for table, minimum in expected.items():
            rows = query(node,f"SELECT coalesce(json_agg(to_jsonb(t)), '[]') FROM {table} t;")
            counts[table] = len(rows)
            assert len(rows) >= minimum, f'{database}.{table}: {len(rows)} < {minimum}'
            records[table] = rows
        if database == 'maritime_edge':
            count = query(node,'SELECT count(*) FROM drill_types;')
            assert count >= 15
            counts['drill_types'] = count
        else:
            counts['vessel_manning_standards'] = query(node,'SELECT count(*) FROM vessel_manning_standards;')
            counts['manning_positions'] = query(node,'SELECT count(*) FROM manning_positions;')
        for row in records['sms_procedures']:
            assert (row.get('Id') or row.get('id')) != '18510095-6c26-48f2-9216-3920d6340baa'
        reports[database] = counts

        def normalize(row):
            return {k.replace('_','').lower():v for k,v in row.items()}

        stores = [normalize(r) for r in records['store_locations']]
        by_id = {r['id']:r for r in stores}
        for r in stores:
            if r.get('parentid'):
                assert r['parentid'] in by_id, f'Orphan store: {r}'
        procedures = {normalize(r)['id'] for r in records['sms_procedures']}
        for r in records['sms_form_templates']:
            assert normalize(r)['smsprocedureid'] in procedures
        group_codes = [normalize(r)['groupcode'] for r in records['equipment_groups']]
        assert len(group_codes) == len(set(group_codes)), 'Duplicate group codes'
    output = ROOT/'artifacts/catalog-audit-verification.json'
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(reports,indent=2),encoding='utf-8')
    print(json.dumps(reports,indent=2))


if __name__=='__main__':
    main()
