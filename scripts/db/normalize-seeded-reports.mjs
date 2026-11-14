// One-off presentation cleanup of the reports-20261114 fixture; never creates or deletes reports.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const apply = process.argv.includes('--apply');
const root = process.env.USERPROFILE || process.env.HOME;
const batch = 'reports-20261114';
const nodes = {
  edge: { host: '103.82.26.114', key: path.join(root, '.ssh/maritime_cicd_edge_20261105'), container: 'production-edge-postgres-1' },
  shore: { host: '103.82.22.151', key: path.join(root, '.ssh/maritime_cicd_shore_20261105'), container: 'production-postgres-1' },
};
const lit = s => `'${String(s).replaceAll("'", "''")}'`;
const ident = s => `"${s.replaceAll('"', '""')}"`;
function remote(node, command, input) {
  return execFileSync('ssh', ['-i', node.key, '-o', 'BatchMode=yes', `root@${node.host}`, command],
    { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}
function sql(node, statement) {
  return remote(node, `docker exec -i ${node.container} sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'`, statement);
}
function rows(node, query) { return JSON.parse(sql(node, `SELECT coalesce(json_agg(x),'[]') FROM (${query}) x;`).trim()); }
function clean(value) {
  return value.replace(/\[DEMO:reports-20261114:[^\]]+\]\s*/gi, '')
    .replaceAll('DEMO report seed', 'Bộ phận khai thác')
    .replaceAll('DEMO - not an actual signature', 'Xác nhận thực hành')
    .replaceAll('Demo workflow only; no real master certification.', 'Đã kiểm tra số liệu báo cáo thực hành.')
    .replaceAll('Demo operational data; not a certified log.', 'Ghi nhận thông số vận hành trong ngày.')
    .replaceAll('Demo readings; machinery operating within reference limits.', 'Ghi nhận thông số máy trong ca trực.')
    .replaceAll('Container cargo - demo', 'Hàng container')
    .replaceAll('VMU Demo Marine Fuels', 'VMU Marine Fuels')
    .replaceAll('DEMO-SEAL-', 'SEAL-').replaceAll('DEMO-reports-', 'BDN-reports-')
    .replace(/demo/gi, 'Thực hành').trim();
}
const hasRegistry = sql(nodes.edge, "SELECT to_regclass('public.report_seed_registry') IS NOT NULL;").trim() === 't';
const reports = rows(nodes.edge, `SELECT id,report_date_time,report_type_id FROM maritime_reports
  WHERE remarks LIKE '%[DEMO:${batch}:%' ${hasRegistry ? `OR id IN (SELECT report_id FROM report_seed_registry WHERE seed_key LIKE '[SEED:${batch}:%')` : ''}`);
if (reports.length !== 167) throw Error(`Expected 167 fixture reports, found ${reports.length}; no changes applied.`);
const ids = reports.map(r => lit(r.id)).join(',');
const type = { 1: 'NOON', 2: 'DEPARTURE', 3: 'ARRIVAL', 4: 'BUNKER', 5: 'POSITION' };
for (const [name, node] of Object.entries(nodes)) {
  const metadata = rows(node, `SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='public' AND data_type IN ('text','character varying')`);
  const where = name === 'edge' ? {
    maritime_reports: `id IN (${ids})`,
    ...Object.fromEntries(['noon_reports','departure_reports','arrival_reports','position_reports','bunker_reports','report_workflow_histories']
      .map(t => [t, `maritime_report_id IN (${ids})`])),
    weekly_performance_reports: "year=2026 AND week_number BETWEEN 33 AND 46 AND prepared_by IN ('DEMO report seed','Bộ phận khai thác')",
    monthly_summary_reports: "year=2026 AND month BETWEEN 8 AND 11 AND prepared_by IN ('DEMO report seed','Bộ phận khai thác')",
  } : {
    maritime_reports: `"Id" IN (${ids})`,
    ...Object.fromEntries(['noon_reports','departure_reports','arrival_reports','position_reports','bunker_reports']
      .map(t => [t, `"MaritimeReportId" IN (${ids})`])),
  };
  const statements = []; let changed = 0;
  for (const [table, filter] of Object.entries(where)) {
    const columns = metadata.filter(c => c.table_name === table).map(c => c.column_name);
    if (!columns.length) continue;
    const id = name === 'edge' ? 'id' : 'Id';
    for (const row of rows(node, `SELECT * FROM ${ident(table)} WHERE ${filter}`)) {
      const sets = columns.filter(c => typeof row[c] === 'string' && /demo/i.test(row[c]))
        .map(c => `${ident(c)}=${lit(clean(row[c]))}`);
      if (sets.length) { statements.push(`UPDATE ${ident(table)} SET ${sets.join(',')} WHERE ${ident(id)}=${lit(row[id])};`); changed++; }
    }
  }
  // Identity is kept outside user-facing remarks, so repeated seed runs remain idempotent.
  statements.push('CREATE TABLE IF NOT EXISTS report_seed_registry (seed_key text PRIMARY KEY, report_id uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());');
  const present = new Set(rows(node, `SELECT ${name === 'edge' ? 'id' : '"Id" AS id'} FROM maritime_reports WHERE ${name === 'edge' ? 'id' : '"Id"'} IN (${ids})`).map(r => r.id));
  for (const r of reports.filter(r => present.has(r.id))) {
    const key = `[SEED:${batch}:${r.report_date_time.slice(0,10).replaceAll('-','')}:${type[r.report_type_id]}]`;
    statements.push(`INSERT INTO report_seed_registry(seed_key,report_id) VALUES (${lit(key)},${lit(r.id)}) ON CONFLICT DO NOTHING;`);
  }
  console.log(JSON.stringify({ node: name, reports: present.size, recordsToClean: changed, apply }));
  if (!apply) continue;
  const stamp = new Date().toISOString().replaceAll(/[^0-9]/g, '').slice(0,17);
  const backup = `/root/report-cleanup-${stamp}`;
  remote(node, `mkdir -p ${backup} && docker exec ${node.container} sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > ${backup}/before.dump`);
  sql(node, `BEGIN; SELECT pg_advisory_xact_lock(927836716);\n${statements.join('\n')}\nCOMMIT;`);
  console.log(JSON.stringify({ node: name, updated: changed, backup }));
}
