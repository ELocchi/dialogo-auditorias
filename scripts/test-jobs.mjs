import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fork, spawn } from 'node:child_process';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { createNplusDatabase } from './lib/nplus1-database.mjs';
import { runJobProcess } from './lib/job-process.mjs';
import { decodeAgendaSpreadsheet } from '../src/lib/agenda/spreadsheet.ts';
import { waitForJob } from '../src/lib/jobs/client.ts';
const id=n=>n===1?'13044e3f-e8d2-4b4b-9981-22a8de22c610':`aabc0000-0000-4000-8000-${String(n).padStart(12,'0')}`;
registerHooks({resolve(specifier,context,next){
 if(specifier==='server-only')return {url:'data:text/javascript,export {};',shortCircuit:true};
 if(specifier==='@/lib/audits/request-context')return {url:'data:text/javascript,export const auditResponseHeaders={"Cache-Control":"private, no-store",Vary:"Cookie"};export async function readAuditRequestContext(){return globalThis.__jobsAccess;}',shortCircuit:true};
 if(specifier.startsWith('@/'))specifier=pathToFileURL(path.join(process.cwd(),'src',specifier.slice(2))).href;
 if(specifier.startsWith('file:')||specifier.startsWith('.')){const url=new URL(specifier,context.parentURL);if(!path.extname(fileURLToPath(url))&&existsSync(fileURLToPath(url)+'.ts'))return next(url.href+'.ts',context);}
 return next(specifier,context);
}});
const evidence=[];
const root=process.cwd();

test('durable queue: real SQL, child worker, HTTP Storage, PDF, retries and access control',async()=>{
 const db=await createNplusDatabase(root);const objects=new Map();let requests=0,failDownloads=0;
 const rpc=async(name,args)=>{
  const entries=Object.entries(args);assert.ok(['background_job_request','background_job_worker','publication_command'].includes(name));
  return (await db.query(`select public.${name}(${entries.map(([k],i)=>`${k}=>$${i+1}`).join(',')}) as value`,entries.map(([,v])=>typeof v==='object'&&v!==null?JSON.stringify(v):v))).rows[0].value;
 };
 const worker=(op,j,p={})=>rpc('background_job_worker',{p_operation:op,p_id:j?.id??null,p_token:j?.lease_token??null,p_payload:p});
 const request=(op,extra={})=>rpc('background_job_request',{p_actor:id(2),p_profile:'AUDITOR_QUALIDADE',p_scope:null,p_admin:null,p_operation:op,...extra});
 const server=createServer(async(req,res)=>{
  requests++; const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
  try {
   if(req.url.startsWith('/rest/v1/rpc/')) {
    const value=await rpc(req.url.split('/').at(-1),JSON.parse(body.toString()));res.setHeader('content-type','application/json');res.end(JSON.stringify(value));return;
   }
   const pathname=new URL(req.url,'http://localhost').pathname;
   const key=decodeURIComponent(pathname.replace(/^\/storage\/v1\/object\/(?:authenticated\/)?/,''));
   if(req.method==='GET') {
    if(failDownloads>0){failDownloads--;res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({statusCode:'503',message:'Transient fixture failure'}));return;}
    if(!objects.has(key)){res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({statusCode:'404',message:'Object not found'}));return;}
    await new Promise(resolve=>setTimeout(resolve,20));res.end(objects.get(key));return;
   }
   if(req.method==='POST') {
    if(objects.has(key)){res.writeHead(409,{'content-type':'application/json'});res.end(JSON.stringify({statusCode:'409',message:'Duplicate'}));return;}
    objects.set(key,body);const split=key.indexOf('/');
    await db.query('insert into storage.objects(id,bucket_id,name) values($1,$2,$3)',[randomUUID(),key.slice(0,split),key.slice(split+1)]);
    res.setHeader('content-type','application/json');res.end(JSON.stringify({Key:key}));return;
   }
   throw Error('Unexpected test HTTP request');
  }catch(error){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({code:error.code??'fixture',message:'Fixture request failed'}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const run=j=>new Promise((resolve,reject)=>{
  const child=fork('build/jobs/src/jobs/execute.js',[],{execArgv:['--max-old-space-size=192'],env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${server.address().port}`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SECRET_KEY:'sb_secret_fixture'},stdio:['ignore','pipe','pipe','ipc']});
  const logs=[];child.stdout.on('data',b=>logs.push(b.toString()));child.stderr.on('data',b=>logs.push(b.toString()));
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Worker test timed out'));},20000);
  let message;child.on('message',m=>{message=m;});child.on('error',reject);child.on('exit',()=>{clearTimeout(timer);resolve({message,logs});});child.send(j);
 });
 try {
  await db.exec("alter table storage.objects add column created_at timestamptz default now();");
  await db.exec(await readFile('supabase/migrations/20261006000900_background_jobs.sql','utf8'));
  await db.exec(await readFile('supabase/tests/nplus1.sql','utf8'));
  await db.exec('commit');
  const jpeg=await sharp(randomBytes(1200*900*3),{raw:{width:1200,height:900,channels:3}}).jpeg({quality:85}).toBuffer();
  for(let n=1;n<=30;n++)objects.set(`follow-up-photos/${id(2)}/${id(101)}/${id(2000+n)}_${id(3000+n)}.jpg`,jpeg);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(2)]);
  const report=(await db.query("select public.save_standalone_follow_up_report('AUDITOR_QUALIDADE',$1,current_date,'Teste de fila','Equipe','Inspeção','Corrigir',$2,$3) id",[id(101),Array.from({length:30},(_,i)=>id(2001+i)),randomUUID()])).rows[0].id;
  assert.equal((await request('list')).length,1,'report save atomically enqueues a PDF');
  const start=performance.now();const first=await request('enqueue',{p_kind:'standalone-pdf',p_target:report});const dispatchMs=performance.now()-start;
  assert.equal(objects.size,30,'request must not generate PDF');
  const duplicate=await request('enqueue',{p_kind:'standalone-pdf',p_target:report});assert.equal(duplicate.id,first.id);
  const claimed=await worker('claim');assert.equal(claimed.id,first.id);assert.equal(await worker('claim'),null);
  const started=performance.now();const complete=await run(claimed);assert.equal(complete.message?.ok,true,JSON.stringify(complete));
  const status=await request('get',{p_id:first.id});assert.equal(status.status,'succeeded');
  const bytes=objects.get(`orientative-report-pdfs/standalone/${report}.pdf`);assert.ok(bytes);assert.match(bytes.subarray(0,5).toString(),/%PDF-/);
  const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>2);
  assert.equal((await request('enqueue',{p_kind:'standalone-pdf',p_target:report})).id,first.id);
  await assert.rejects(request('get',{p_id:first.id,p_actor:id(3),p_profile:'ENGENHARIA',p_scope:'EQUIPE_OBRA'}),e=>e.code==='42501');
  const requestPermissions=await db.query("select has_function_privilege('authenticated','public.background_job_request(uuid,text,text,text,text,uuid,text,uuid,integer,jsonb)','EXECUTE') allowed");assert.equal(requestPermissions.rows[0].allowed,false);
  const getPermissions=await db.query("select has_function_privilege('authenticated','public.background_job_worker(text,uuid,uuid,jsonb)','EXECUTE') allowed");assert.equal(getPermissions.rows[0].allowed,false);
  evidence.push({scenario:'30-photo standalone PDF',dispatchMs,workerMs:performance.now()-started,pages:pdf.getPageCount(),pdfBytes:bytes.length,sourcePhotoBytes:jpeg.length,downloadDelayMs:20,peakRssKb:complete.message.peakRssKb,httpRequests:requests,jobId:first.id,logs:complete.logs});
  // Scheduled report uses the SAME execution path, with authorized visit photos.
  const scheduled=id(9001);await db.query("insert into public.follow_up_reports(id,visit_id,auditor_auth_user_id,title,participants,guidance,decisions,findings) values($1,$2,$3,'Agendado','Equipe','Vistoria','Corrigir',$4)",[scheduled,id(1001),id(2),JSON.stringify([{id:id(2001),description:'Teste agendado',correction:'Corrigir item',location:'Térreo'}])]);
  objects.set(`follow-up-photos/${id(2)}/${id(1001)}/${id(2001)}_${id(3001)}.jpg`,jpeg);
  const pending=await request('enqueue',{p_kind:'scheduled-pdf',p_target:scheduled});
  let lease=await worker('claim');failDownloads=1;const failure=await run(lease);assert.equal(failure.message.ok,false);
  await worker('fail',lease,failure.message);assert.equal((await request('get',{p_id:pending.id})).status,'queued');
  await db.query("update dialogo_private.background_jobs set available_at=now()-interval '1 second' where id=$1",[pending.id]);
  lease=await worker('claim');assert.equal(lease.attempts,2);const retried=await run(lease);assert.equal(retried.message.ok,true,JSON.stringify(retried));
  // Lost worker lease: reclaim, fence the previous worker, retry exactly once.
  await db.query("update dialogo_private.background_jobs set status='queued',result=null,attempts=0 where id=$1",[pending.id]);
  const old=await worker('claim');await db.query("update dialogo_private.background_jobs set lease_until=now()-interval '1 second' where id=$1",[pending.id]);
  const recovered=await worker('claim');assert.notEqual(old.lease_token,recovered.lease_token);
  await assert.rejects(worker('complete',old,{url:'/forged'}),e=>e.code==='40001');
  assert.equal((await run(recovered)).message.ok,true);
  evidence.push({scenario:'scheduled PDF transient failure, backoff, recovery and stale lease fencing',passed:true});
  // Exercise the actual HTTP route through enqueue -> isolated process -> publication.
  process.env.NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:${server.address().port}`;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';process.env.SUPABASE_SECRET_KEY='sb_secret_fixture';
  globalThis.__jobsAccess={status:200,context:{user:{id:id(2)},profile:'AUDITOR_QUALIDADE',engineeringScope:null,administrativeScope:null}};
  const route=await import('../src/app/api/publications/[id]/[operation]/route.ts');
  const post=(target,operation,body)=>route.POST(new Request('http://localhost/api/publications/'+target+'/'+operation,{method:'POST',headers:{origin:'http://localhost',...(body instanceof FormData?{}:{'content-type':'application/json'})},body:body instanceof FormData?body:JSON.stringify(body)}),{params:Promise.resolve({id:target,operation})});
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(1)]);
  await db.query("insert into public.audit_visits(id,obra_id,modulo,modelo_id,auditor_auth_user_id,data_prevista,created_by,updated_by,confirmation_status,confirmed_by,confirmed_at) values($1,$2,'QUALIDADE','quality-f175',$3,(clock_timestamp() at time zone 'America/Sao_Paulo')::date,$4,$4,'confirmed',$3,now())",[id(9201),id(101),id(2),id(1)]);
  const criterion={id:'item1',code:'1',title:'Teste',text:'Verificação',group:'Grupo',subgroup:'',source:'F175',locator:'1',documentedWeight:10,orientations:[],verificationRule:'Conforme/Não Conforme'};
  const pub=(op,target,revision,payload={},actor=id(2),profile='AUDITOR_QUALIDADE',scope=null)=>rpc('publication_command',{p_actor:actor,p_profile:profile,p_scope:scope,p_admin:null,p_operation:op,p_id:target,p_revision:revision,p_payload:payload});
  const draft=await pub('start-audit',id(9201),null,{modelId:'quality-f175',label:'00',fvsServices:[],criteria:[criterion]});
  const refs=['a.jpg','b.jpg','c.jpg'];
  const form=new FormData();form.set('revision',String(draft.revision));form.set('responses',JSON.stringify({'quality-f175':{item1:{answer:'Não conforme',note:'Teste',photos:refs}}}));form.set('photoRefs',JSON.stringify(refs));refs.forEach((_,i)=>form.set('photo'+i,new File([jpeg],'foto.jpg',{type:'image/jpeg'})));
  const beforeStage=requests;const uploadResponse=await post(draft.id,'save-audit',form);assert.equal(uploadResponse.status,202,await uploadResponse.clone().text());const saveReceipt=await uploadResponse.json();
  assert.equal([...objects.keys()].filter(k=>k.startsWith('job-inputs/')).length,1,'one input transfer for all photos');
  assert.equal((await post(draft.id,'save-audit',form)).status,202,'duplicate dispatch accepted');
  const saveJob=await worker('claim');const saved=await run(saveJob);assert.equal(saved.message.ok,true,JSON.stringify(saved));
  const saveStatus=await request('get',{p_id:saveReceipt.job.id});assert.equal(saveStatus.result.revision,2);
  assert.equal((await post(draft.id,'save-audit',form)).status,202,'replay after completion returns same job');
  // Simulate process loss AFTER commit but BEFORE acknowledgement; saved checkpoint prevents another mutation.
  await db.query("update dialogo_private.background_jobs set status='queued',attempts=0,available_at=now()-interval '1 second' where id=$1",[saveJob.id]);
  const saveRecovered=await worker('claim');assert.equal((await run(saveRecovered)).message.ok,true);
  assert.equal((await pub('read-audit',draft.id,null)).revision,2);
  const publishResponse=await post(draft.id,'publish-audit',{revision:2});assert.equal(publishResponse.status,202);
  const publicationReceipt=await publishResponse.json();const publishJob=await worker('claim');const published=await run(publishJob);assert.equal(published.message.ok,true,JSON.stringify(published));
  const publishedRows=(await db.query('select final_score,report_file_name from public.published_audits where id=$1',[draft.id])).rows;assert.equal(publishedRows.length,1);assert.equal(Number(publishedRows[0].final_score),0);
  assert.equal((await request('get',{p_id:publicationReceipt.job.id})).status,'succeeded');
  await db.query("update dialogo_private.background_jobs set status='queued',attempts=0,available_at=now()-interval '1 second' where id=$1",[publishJob.id]);assert.equal((await run(await worker('claim'))).message.ok,true);
  assert.equal((await db.query("select count(*)::int n from public.audit_visit_events where visit_id=$1 and event_type='published'",[id(9201)])).rows[0].n,1);
  const plan=await pub('save-plan',draft.id,0,{rows:[{id:'item1',correctiveAction:'Corrigir',responsible:'Equipe',startDate:'2026-10-06',dueDate:'2026-10-07'}]},id(3),'ENGENHARIA','EQUIPE_OBRA');
  globalThis.__jobsAccess.context={user:{id:id(3)},profile:'ENGENHARIA',engineeringScope:'EQUIPE_OBRA',administrativeScope:null};
  const planResponse=await post(draft.id,'publish-plan',{revision:plan.revision});assert.equal(planResponse.status,202);
  const planJob=await worker('claim');const planResult=await run(planJob);assert.equal(planResult.message.ok,true,JSON.stringify(planResult));
  assert.equal((await db.query('select count(*)::int n from public.published_action_plans where audit_id=$1',[draft.id])).rows[0].n,1);
  const reportResponse=await route.GET(new Request('http://localhost/api/publications/'+draft.id+'/plan-report'),{params:Promise.resolve({id:draft.id,operation:'plan-report'})});
  assert.equal(reportResponse.status,200);assert.equal(reportResponse.headers.get('content-type'),'application/pdf');assert.ok((await PDFDocument.load(await reportResponse.arrayBuffer())).getPageCount()>=1);
  const csrf=await route.POST(new Request('http://localhost/api/publications/'+draft.id+'/publish-plan',{method:'POST',headers:{origin:'https://foreign.invalid','content-type':'application/json'},body:JSON.stringify({revision:1})}),{params:Promise.resolve({id:draft.id,operation:'publish-plan'})});assert.equal(csrf.status,403);
  const statusRoute=await import('../src/app/api/jobs/[id]/route.ts');globalThis.__jobsAccess={status:401,context:null};
  assert.equal((await statusRoute.GET(new Request('http://localhost/api/jobs/'+pending.id),{params:Promise.resolve({id:pending.id})})).status,401);
  const list=await request('list');assert.ok(list.length>=3);assert.ok(list.every(j=>!('payload' in j)&&!('lease_token' in j)));
  evidence.push({scenario:'actual POST routes, batched photo input, save checkpoint, audit and action plan PDFs, publication replay without duplicates',passed:true,requests:requests-beforeStage});
  const counters=await worker('metrics');assert.ok(counters.queued>=0);assert.ok(counters.failed24h>=0);
  // One report job can retry at most three times automatically and nine including manual retries.
  await db.query("update dialogo_private.background_jobs set status='queued',attempts=0,attempt_limit=3,retryable=true where id=$1",[pending.id]);
  for(let attempt=1;attempt<=9;attempt++) {
   await db.query("update dialogo_private.background_jobs set available_at=now()-interval '1 second' where id=$1",[pending.id]);
   const lease=await worker('claim');assert.equal(lease.attempts,attempt);await worker('fail',lease,{code:'offline',retryable:true});
   const state=await request('get',{p_id:pending.id});assert.equal(state.status,attempt%3===0?'failed':'queued');
   if(attempt%3===0&&attempt<9)assert.equal((await request('retry',{p_id:pending.id})).status,'queued');
  }
  assert.equal((await request('retry',{p_id:pending.id})).status,'failed');
  evidence.push({scenario:'three automatic attempts; bounded manual retries stop at nine; metrics',passed:true});
  // Current permissions must win over an old queued request.
  await db.query("update dialogo_private.background_jobs set status='queued',attempts=0,available_at=now()-interval '1 second' where id=$1",[pending.id]);
  const revoked=await worker('claim');await db.query('update public.access_accounts set ativo=false where auth_user_id=$1',[id(2)]);
  const denied=await run(revoked);assert.equal(denied.message.ok,false);assert.equal(denied.message.retryable,false);
  await worker('fail',revoked,denied.message);await assert.rejects(request('get',{p_id:pending.id}),e=>e.code==='42501');
  await db.query('update public.access_accounts set ativo=true where auth_user_id=$1',[id(2)]);
  const terminal=await request('retry',{p_id:pending.id});assert.equal(terminal.status,'failed');assert.equal(terminal.retryable,false);
  evidence.push({scenario:'revoked account blocks queued work and status; permanent failure cannot retry',passed:true});
  // Cleanup is limited to old temporary inputs, never evidence or failed work.
  const inputPath=saveJob.payload.inputPath;
  await db.query("update storage.objects set created_at=now()-interval '49 hours' where bucket_id='job-inputs' and name=$1",[inputPath]);
  for(const [bucket,name,age] of [['job-inputs','orphan-old',49],['job-inputs','recent',1],['job-inputs','failed-input',49],['follow-up-photos','preserved-photo',49],['orientative-report-pdfs','preserved-report',49]])
   await db.query("insert into storage.objects(id,bucket_id,name,created_at) values($1,$2,$3,now()-make_interval(hours=>$4))",[randomUUID(),bucket,name,age]);
  await db.query("update dialogo_private.background_jobs set payload=jsonb_build_object('inputPath','failed-input') where id=$1",[pending.id]);
  assert.deepEqual((await worker('cleanup-inputs')).sort(),[inputPath,'orphan-old'].sort());
  // Remove only fixture cleanup candidates; the real worker can now exercise its scheduler.
  await db.query("delete from storage.objects where bucket_id='job-inputs' and name=any($1)",[[inputPath,'orphan-old']]);
  await db.query("update dialogo_private.background_jobs set status='queued',attempts=0,attempt_limit=3,retryable=true,available_at=now()-interval '1 second' where id=$1",[pending.id]);
  assert.deepEqual(await worker('cleanup-inputs'),[],'queued input is also protected');
  const scheduler=spawn(process.execPath,['scripts/jobs-worker.mjs'],{env:process.env,stdio:['ignore','pipe','pipe']});
  let schedulerLogs='';scheduler.stdout.on('data',b=>{schedulerLogs+=b;});scheduler.stderr.on('data',b=>{schedulerLogs+=b;});
  const exited=new Promise(resolve=>scheduler.once('exit',resolve));
  const watchdog=setTimeout(()=>scheduler.kill('SIGKILL'),20000);
  try {
   const deadline=Date.now()+15000;
   while(!schedulerLogs.includes('job_completed')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
   assert.equal((await request('get',{p_id:pending.id})).status,'succeeded');
   assert.match(schedulerLogs,/worker_started/);assert.match(schedulerLogs,/queue_metrics/);assert.match(schedulerLogs,/job_completed/);
   evidence.push({scenario:'production scheduler claims persisted job, forks processor and completes; cleanup protects failed/recent/queued inputs and published files',passed:true,logs:schedulerLogs.trim().split('\n').map(line=>JSON.parse(line))});
  } finally {scheduler.kill('SIGTERM');await exited;clearTimeout(watchdog);}
 }finally{await new Promise(resolve=>server.close(resolve));await db.close();}
 await mkdir('docs/evidence/jobs-20261006',{recursive:true});await writeFile('docs/evidence/jobs-20261006/integration.json',JSON.stringify(evidence,null,2)+'\n');
});

test('client follows 202, reports stages, survives a transient status failure',async()=>{
 const base={id:id(42),status:'queued',stage:'queued',attempts:0};const states=[];let calls=0;
 const done=await waitForJob({job:base,statusUrl:`/api/jobs/${base.id}`},{pause:async()=>{},onProgress:j=>states.push(j.status),fetcher:async()=>{
  calls++;if(calls===1)return new Response('',{status:503});return Response.json({...base,status:calls===2?'running':'succeeded',stage:'pdf',result:{url:'/result'}});
 }});assert.equal(done.status,'succeeded');assert.deepEqual(states,['queued','queued','running','succeeded']);
});
test('client cancellation and permission loss stop polling without cancelling persistent work',async()=>{
 const base={id:id(43),status:'queued',stage:'queued'};let calls=0;
 await assert.rejects(waitForJob({job:base,statusUrl:`/api/jobs/${base.id}`},{pause:async()=>{},fetcher:async()=>{calls++;return new Response('',{status:403});}}),/acesso mudou/);assert.equal(calls,1);
 const controller=new AbortController();controller.abort();await assert.rejects(waitForJob({job:base,statusUrl:`/api/jobs/${base.id}`},{signal:controller.signal}));
});


test('parent watchdog terminates a CPU-blocked process and shutdown interrupts work',async()=>{
 const started=performance.now();const timed=await runJobProcess({},{entry:new URL('./fixtures/job-hang.mjs',import.meta.url),timeoutMs:150});
 assert.equal(timed.ok,false);assert.equal(timed.code,'timeout');assert.ok(performance.now()-started<2000);
 const controller=new AbortController();const pending=runJobProcess({},{entry:new URL('./fixtures/job-hang.mjs',import.meta.url),signal:controller.signal});controller.abort();assert.equal((await pending).code,'worker_interrupted');
});
test('spreadsheet decoding bounds file, rows and columns and preserves dates',async()=>{
 const excel=await import('exceljs');const Workbook=excel.Workbook??excel.default.Workbook;const workbook=new Workbook();const sheet=workbook.addWorksheet('Agenda');sheet.addRow(['Obra','Data']);sheet.addRow(['Teste',new Date('2026-10-06T12:00:00Z')]);
 const bytes=await workbook.xlsx.writeBuffer();const rows=await decodeAgendaSpreadsheet(bytes);assert.equal(rows[1][0].text,'Teste');assert.ok(rows[1][1].value instanceof Date);
 await assert.rejects(decodeAgendaSpreadsheet(new ArrayBuffer(2*1024*1024+1)),/2 MB/);
 sheet.getCell('A202').value='Excesso';await assert.rejects(decodeAgendaSpreadsheet(await workbook.xlsx.writeBuffer()),/200 agendamentos/);
});
