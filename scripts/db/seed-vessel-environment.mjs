import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const key = path.join(process.env.USERPROFILE || process.env.HOME, '.ssh/maritime_cicd_shore_20261105');
const ssh = (command, input) => execFileSync('ssh', ['-i', key, '-o', 'BatchMode=yes', 'root@103.82.22.151', command], { input, encoding: 'utf8', maxBuffer: 1024*1024 });
const sql = input => ssh(`docker exec -i production-postgres-1 sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'`, input);
console.log(sql(`SELECT json_build_object('imo',"IMO",'vessel',"Name") FROM "Vessels" WHERE "IMO"='9278367';`));
if (sql("SELECT to_regclass('public.vessel_environmental_summaries') IS NOT NULL;").trim() !== 't') {
  throw new Error('Environmental summary migration has not been installed; no data written.');
}
if (process.argv.includes('--apply')) {
  const backup = '/root/environment-seed-' + new Date().toISOString().replaceAll(/[^0-9]/g,'');
  ssh(`mkdir -p ${backup} && docker exec production-postgres-1 sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > ${backup}/before.dump`);
  console.log('Backup: '+backup+'/before.dump');
  console.log(sql(readFileSync(new URL('./seed_vessel_environmental_summary.sql',import.meta.url),'utf8')));
} else console.log('Preview only. Add --apply to back up and seed reference values.');
