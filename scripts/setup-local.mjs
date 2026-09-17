import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root=process.cwd();
const envPath=path.join(root,'.env.local');
const localDatabaseUrl='postgresql://postgres:postgres@localhost:5432/patima_dev';
const npmCommand=process.platform==='win32'?'npm.cmd':'npm';

function run(command,args,options={}){
  console.log(`[PATIMA] ${command} ${args.join(' ')}`);
  try{
    execFileSync(command,args,{stdio:'inherit',cwd:root,...options});
  }catch(error){
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function commandOutput(command,args){
  return execFileSync(command,args,{encoding:'utf8',cwd:root}).trim();
}

try{
  if(!existsSync(envPath)){
    writeFileSync(envPath,`DATABASE_URL=${localDatabaseUrl}\nNODE_ENV=development\n`,'utf8');
    console.log('[PATIMA] Created .env.local for local PostgreSQL development.');
  }

  const envText=readFileSync(envPath,'utf8');
  const databaseMatch=envText.match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m);
  if(!process.env.DATABASE_URL) process.env.DATABASE_URL=(databaseMatch?.[1]||localDatabaseUrl).trim();
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing.');

  if(!process.env.NODE_ENV) process.env.NODE_ENV='development';

  run('docker',['version','--format','{{.Server.Version}}']);

  let containerId='';
  try{
    containerId=commandOutput('docker',['ps','-a','--filter','name=^/patima-postgres$','--format','{{.ID}}']);
  }catch{
    throw new Error('Docker is installed but the Docker daemon is not reachable. Start Docker Desktop and retry.');
  }

  if(!containerId){
    run('docker',['run','--name','patima-postgres','-e','POSTGRES_PASSWORD=postgres','-e','POSTGRES_DB=patima_dev','-p','5432:5432','-d','postgres:16']);
  }else{
    const running=commandOutput('docker',['inspect','-f','{{.State.Running}}','patima-postgres']);
    if(running!=='true') run('docker',['start','patima-postgres']);
  }

  let ready=false;
  for(let attempt=1;attempt<=30;attempt++){
    try{
      commandOutput('docker',['exec','patima-postgres','pg_isready','-U','postgres','-d','patima_dev']);
      ready=true;
      break;
    }catch{
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1000);
    }
  }
  if(!ready) throw new Error('PostgreSQL did not become ready within 30 seconds.');

  run(npmCommand,['run','db:migrate']);
  run(npmCommand,['run','db:seed:hiring']);
  run(npmCommand,['run','test:cycle16']);

  console.log('[PATIMA] Local database bootstrap complete. Restart `npm run dev` if it was already running.');
  console.log('[PATIMA] Signup should now use the PostgreSQL-backed server session flow.');
}catch(error){
  console.error(`[PATIMA] Local setup failed: ${error instanceof Error?error.message:String(error)}`);
  process.exitCode=1;
}
