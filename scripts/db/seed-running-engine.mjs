import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const key = path.join(process.env.USERPROFILE || process.env.HOME, '.ssh/maritime_cicd_edge_20261105');
const ssh = (command, input) => execFileSync('ssh', ['-i',key,'-o','BatchMode=yes','root@103.82.26.114',command],{input,encoding:'utf8',maxBuffer:1024*1024});
if (!process.argv.includes('--apply')) {
  console.log(readFileSync(new URL('./seed_running_engine.sql',import.meta.url),'utf8'));
} else {
  const backup='/root/running-engine-'+new Date().toISOString().replaceAll(/[^0-9]/g,'');
  ssh(`mkdir -p ${backup} && docker exec production-edge-postgres-1 sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > ${backup}/before.dump`);
  console.log('Backup: '+backup+'/before.dump');
  console.log(ssh(`docker exec -i production-edge-postgres-1 sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'`,readFileSync(new URL('./seed_running_engine.sql',import.meta.url),'utf8')));
}
