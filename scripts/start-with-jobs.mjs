import { spawn } from 'node:child_process';
// Separate processes keep PDF CPU work off the Next request event loop.
// Fail together: Render restarts the service if either required process dies.
const web=spawn(process.execPath,['node_modules/next/dist/bin/next','start',...process.argv.slice(2)],{stdio:'inherit'});
const worker=spawn(process.execPath,['scripts/jobs-worker.mjs'],{stdio:'inherit'});
let ending=false;
function stop(code){if(ending)return;ending=true;web.kill('SIGTERM');worker.kill('SIGTERM');setTimeout(()=>{web.kill('SIGKILL');worker.kill('SIGKILL');process.exit(code);},5000).unref();process.exitCode=code;}
web.on('exit',code=>stop(code??1));worker.on('exit',code=>stop(code||1));
web.on('error',()=>stop(1));worker.on('error',()=>stop(1));
process.on('SIGTERM',()=>stop(0));process.on('SIGINT',()=>stop(0));
