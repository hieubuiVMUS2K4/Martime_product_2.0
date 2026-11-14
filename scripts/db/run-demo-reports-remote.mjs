// Run EF/report generation locally through SSH; production server only handles database writes.
// Existing container configuration stays in memory; credentials are never written or printed.
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const required = name => { const value = opt(name); if (!value || value.startsWith('--')) throw Error(`Missing ${name}`); return value; };
let tunnel;
try {
  const host = required('--host'), key = required('--key'), container = required('--container');
  const runtime = path.resolve(required('--runtime')), imo = required('--imo');
  const sshArgs = ['-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', `root@${host}`];
  const remote = command => execFileSync('ssh', [...sshArgs, command], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (!/^[a-zA-Z0-9_-]+$/.test(container)) throw Error('Invalid container name');
  const info = JSON.parse(remote(`docker inspect ${container}`))[0];
  const config = JSON.parse(remote(`docker exec ${container} cat /app/appsettings.json`));
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(EDGE_|Database__|DataProtection__|SyncSecurity__|ShoreAPI__)/.test(k)) delete env[k];
  function flatten(prefix, value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, child] of Object.entries(value)) flatten(prefix ? `${prefix}__${k}` : k, child);
    } else if (value !== null && value !== undefined) env[prefix] = String(value);
  }
  flatten('', config);
  for (const entry of info.Config.Env) {
    const i = entry.indexOf('='), k = entry.slice(0, i);
    if (/^(PATH|HOME|HOSTNAME|TMP|TEMP|DOTNET_ROOT.*|DOTNET_RUNNING_IN_CONTAINER.*|DOTNET_VERSION|ASPNET_VERSION)$/.test(k)) continue;
    env[k] = entry.slice(i + 1);
  }
  if (!['EDGE_POSTGRES_DB', 'EDGE_POSTGRES_USER', 'EDGE_POSTGRES_PASSWORD'].every(k => env[k]))
    throw Error('Expected EDGE_POSTGRES_DB/USER/PASSWORD in backend environment; no credential guessing.');
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  tunnel = spawn('ssh', [...sshArgs.slice(0, -1), '-o', 'ExitOnForwardFailure=yes', '-N', '-L', `127.0.0.1:${port}:127.0.0.1:5432`, sshArgs.at(-1)], { stdio: 'ignore' });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (tunnel.exitCode !== null) throw Error('SSH tunnel exited');
    ready = await new Promise(resolve => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { s.destroy(); resolve(true); }); s.once('error', () => resolve(false)); });
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) throw Error('SSH tunnel did not become ready');
  Object.assign(env, { EDGE_POSTGRES_HOST: '127.0.0.1', EDGE_POSTGRES_PORT: String(port), DOTNET_gcServer: '0',
    Logging__LogLevel__Default: 'Warning', ASPNETCORE_ENVIRONMENT: 'Production' });
  const command = [path.join(runtime, 'MaritimeEdgeServer.dll'), '--seed-demo-reports', '--vessel-imo', imo,
    '--start', opt('--start', '2026-08-16'), '--days', opt('--days', '90'), '--batch', opt('--batch', 'reports-20261114')];
  if (args.includes('--apply')) command.push('--apply');
  const child = spawn('dotnet', command, { cwd: runtime, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const secrets = Object.entries(env).filter(([k,v]) => /password|secret|token|key|connectionstring/i.test(k) && v.length >= 8).map(([,v]) => v);
  let pending = '';
  const write = chunk => {
    pending += chunk.toString('utf8');
    let i;
    while ((i = pending.indexOf('\n')) >= 0) {
      let line = pending.slice(0, i); pending = pending.slice(i + 1);
      for (const secret of secrets) line = line.split(secret).join('[REDACTED]');
      if (args.includes('--verbose') || /^\[DEMO:|^\{|^PREVIEW|^SKIP|Demo seed stopped|fail:|error:/i.test(line)) console.log(line);
    }
  };
  child.stdout.on('data', write); child.stderr.on('data', write);
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  if (pending) write('\n');
} catch (e) {
  // Never include captured subprocess output/configuration in exception output.
  console.error(e.status !== undefined ? 'Remote configuration read failed; check SSH and container name.' : e.message);
  process.exitCode = 1;
} finally {
  tunnel?.kill();
}
