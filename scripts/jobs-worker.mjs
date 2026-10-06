import { runJobProcess } from './lib/job-process.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { createPublicationClient } from '../build/jobs/src/lib/publications/admin.js';
const client=createPublicationClient();
let stopping=false,lastCleanup=0;
const controller=new AbortController();
const log=(event,values={})=>console.log(JSON.stringify({event,...values}));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;controller.abort();});
async function rpc(operation,job,payload={}) {
 const {data,error}=await client.rpc('background_job_worker',{p_operation:operation,p_id:job?.id??null,p_token:job?.lease_token??null,p_payload:payload});
 if(error)throw Error(error.code||'worker_rpc_failed');return data;
}
log('worker_started',{concurrency:1,timeoutMs:180_000});
while(!stopping) {
 try {
  if(Date.now()-lastCleanup>600_000) {
   try {
   const paths=await rpc('cleanup-inputs');
   if(paths.length) {
    const {error}=await client.storage.from('job-inputs').remove(paths);
    if(error)throw Error('input_cleanup_failed');
    log('input_cleanup',{count:paths.length});
   }
   log('queue_metrics',await rpc('metrics'));
   } catch { log('maintenance_failed'); }
   lastCleanup=Date.now();
  }
  const job=await rpc('claim');
  if(!job){await delay(3000);continue;}
  const start=performance.now();log('job_started',{jobId:job.id,kind:job.kind,attempt:job.attempts,queueAgeMs:Math.max(0,Date.now()-Date.parse(job.created_at))});
  const result=await runJobProcess(job,{signal:controller.signal});
  if(!result.ok)await rpc('fail',job,{code:result.code,retryable:result.retryable});
  log(result.ok?'job_completed':'job_failed',{jobId:job.id,kind:job.kind,attempt:job.attempts,code:result.code,peakRssKb:result.peakRssKb,durationMs:Math.round(performance.now()-start)});
 } catch(error){log('worker_error',{code:error.message});await delay(5000);}
}
