import { fork } from 'node:child_process';
/** The watchdog is in the parent: CPU-blocked children cannot ignore the timeout. */
export function runJobProcess(job, { timeoutMs = 180_000, signal,
 entry = new URL('../../build/jobs/src/jobs/execute.js', import.meta.url), env = process.env } = {}) {
 return new Promise(resolve => {
  if(signal?.aborted){resolve({ok:false,code:'worker_interrupted',retryable:true});return;}
  const child=fork(entry,[],{env,stdio:['ignore','inherit','inherit','ipc'],execArgv:['--max-old-space-size=192']});
  let result;
  const stop=code=>{result={ok:false,code,retryable:true};child.kill('SIGKILL');};
  const abort=()=>stop('worker_interrupted');
  const timer=setTimeout(()=>stop('timeout'),timeoutMs);
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
  signal?.addEventListener('abort',abort,{once:true});
  child.once('message',message=>{result=message;});
  child.once('error',()=>{cleanup();resolve({ok:false,code:'worker_start_failed',retryable:true});});
  child.once('exit',()=>{cleanup();resolve(result??{ok:false,code:'worker_interrupted',retryable:true});});
  child.send(job,error=>{if(error)stop('worker_start_failed');});
 });
}
