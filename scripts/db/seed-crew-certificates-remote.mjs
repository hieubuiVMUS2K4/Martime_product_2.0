// Run the existing certificate/outbox services locally through an SSH database tunnel.
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
const key=path.join(process.env.USERPROFILE || process.env.HOME,'.ssh/maritime_cicd_shore_20261105');
const sshArgs=['-i',key,'-o','BatchMode=yes','root@103.82.22.151'];
const remote=(command,input)=>execFileSync('ssh',[...sshArgs,command],{input,encoding:'utf8',maxBuffer:4*1024*1024});
let tunnel;
try {
  const backend=JSON.parse(remote('docker inspect production-backend-1'))[0];
  const config=JSON.parse(remote('docker exec production-backend-1 cat /app/appsettings.json'));
  const settings=Object.fromEntries(backend.Config.Env.map(value=>{const i=value.indexOf('=');return [value.slice(0,i),value.slice(i+1)];}));
  const connection=settings.ConnectionStrings__DefaultConnection || config.ConnectionStrings?.DefaultConnection;
  if (!connection) throw Error('Missing configured database connection.');
  const db=JSON.parse(remote('docker inspect production-postgres-1'))[0];
  const dbAddress=Object.values(db.NetworkSettings.Networks).map(n=>n.IPAddress).find(Boolean);
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(dbAddress || '')) throw Error('Database address unavailable.');
  const server=net.createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  tunnel=spawn('ssh',[...sshArgs.slice(0,-1),'-o','ExitOnForwardFailure=yes','-N','-L',`127.0.0.1:${port}:${dbAddress}:5432`,sshArgs.at(-1)],{stdio:'ignore'});
  for(let i=0;i<60;i++){
    if(tunnel.exitCode!==null) throw Error('Database tunnel exited.');
    const ready=await new Promise(resolve=>{const socket=net.connect(port,'127.0.0.1');socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));});
    if(ready) break;
    await new Promise(resolve=>setTimeout(resolve,200));
    if(i===59) throw Error('Database tunnel unavailable.');
  }
  const apply=process.argv.includes('--apply');
  if(apply){
    const backup='/root/crew-certificates-'+new Date().toISOString().replaceAll(/[^0-9]/g,'');
    remote(`mkdir -p ${backup} && docker exec production-postgres-1 sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > ${backup}/before.dump`);
    console.log('Backup: '+backup+'/before.dump');
  }
  const dll=path.resolve('artifacts/crew-certificates-runtime/SeedCrewCertificates.dll');
  const child=spawn('dotnet',[dll,...(apply?['--apply']:[])],{env:{...process.env,SEED_CONNECTION:connection,SEED_PORT:String(port)},stdio:['ignore','pipe','pipe']});
  let output='';
  child.stdout.on('data',chunk=>{output+=chunk;});
  child.stderr.on('data',()=>{});
  const code=await new Promise(resolve=>child.once('exit',resolve));
  if(code!==0) throw Error('Certificate seed failed; no credentials or subprocess details are printed.');
  console.log(output.split(/\r?\n/).filter(line=>line.startsWith('{')).join('\n'));
} catch(error){
  console.error(error.status!==undefined?'Remote configuration read failed.':error.message);
  process.exitCode=1;
} finally {tunnel?.kill();}
