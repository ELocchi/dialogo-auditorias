import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createNplusDatabase } from "./lib/nplus1-database.mjs";
import { createFollowUpPhotoLoader } from "../src/lib/follow-up/photo-loader.ts";
import { readPublishedAuditSnapshot } from "../src/lib/audits/service.ts";
import { readFollowUpPhotoBatch } from "../src/lib/follow-up/photo-batch-service.ts";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const output=path.resolve(process.env.NPLUS_EVIDENCE || "docs/evidence/nplus1-20261006");
await mkdir(output,{recursive:true});
const temporary=await mkdtemp(path.join(tmpdir(),"dialogo-nplus1-"));
const baselineCommit="46a464c1665f8ea16bde79930ec88ac87168cd3a";
async function baselineModule(relative){
 const source=execFileSync("git",["show",`${baselineCommit}:${relative}`],{cwd:root,encoding:"utf8"});
 const rewritten=source.replace(/from "(\.[^"]+)"/g,(_,specifier)=>`from "${pathToFileURL(path.resolve(root,path.dirname(relative),specifier)).href}"`);
 const file=path.join(temporary,path.basename(relative));await writeFile(file,rewritten);return import(pathToFileURL(file).href);
}
const oldLoader=(await baselineModule("src/lib/follow-up/photo-loader.ts")).createFollowUpPhotoLoader;
const oldService=(await baselineModule("src/lib/follow-up/workspace-service.ts")).readFollowUpVisitPhotos;
const db=await createNplusDatabase(root);
const id=n=>`aabc0000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const actor={userId:id(2),profile:"AUDITOR_QUALIDADE",engineeringScope:null,administrativeScope:null};
const context={...actor,user:{id:id(2),role:"quality-auditor",modules:["quality"],workIds:[id(101)],workModuleScopes:[{workId:id(101),module:"quality"}]},works:[{id:id(101)}]};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const statistics=values=>({medianMs:+median(values).toFixed(3),minMs:+Math.min(...values).toFixed(3),maxMs:+Math.max(...values).toFixed(3),samples:values.length,rawMs:values.map(value=>+value.toFixed(3))});
const evidence={baselineCommit,environment:"PostgreSQL/PGlite local; synthetic fixtures; no hosted database",photos:[],standalone:[],publicationEvidence:[]};
let errors=0;
try {
 await db.exec(await readFile(path.join(root,"supabase/tests/nplus1.sql"),"utf8"));
 const version=await db.query("select version() as version");evidence.database=version.rows[0].version;
 // Inspect the batch's relational plan too: one SDK call must not conceal
 // repeated full Storage scans for every requested visit.
 const batchSql=await readFile(path.join(root,"supabase/migrations/20261006000600_follow_up_photo_batch.sql"),"utf8");
 const queryStart=batchSql.indexOf(" with prefixes as"),queryEnd=batchSql.indexOf(" if jsonb_array_length",queryStart);
 const projection=batchSql.slice(queryStart,queryEnd).trim().replace(" into v_rows","").replaceAll("v_ids","$1::uuid[]").replaceAll("v_actor","$2::uuid");
 const explained=await db.query(`explain (analyze,buffers,format json) ${projection}`,[Array.from({length:42},(_,n)=>id(1001+n)),id(2)]);
 const plan=explained.rows[0]["QUERY PLAN"];
 const scanNodes=[];const walk=node=>{if(node["Relation Name"]==="objects")scanNodes.push(node);for(const child of node.Plans??[])walk(child);};walk(plan[0].Plan);
 assert.ok(scanNodes.length>0);assert.ok(scanNodes.every(node=>node["Actual Loops"]===1),"Storage must be scanned once per batch");
 await writeFile(path.join(output,"photo-batch-explain.json"),JSON.stringify(plan,null,2));
 evidence.photoBatchPlan={storageScanNodes:scanNodes.length,loops:scanNodes.map(node=>node["Actual Loops"]),executionMs:plan[0]["Execution Time"]};
 // Both versions execute the actual SQL functions. Storage is a small adapter
 // for the old SDK list call; no image bytes or signed URLs are measured here.
 async function photoRun(loaderFactory,before,count,rtt=0){
  const calls=[];let requests=0;
  async function query(label,sql,values=[]){calls.push(label);if(rtt)await pause(rtt);return db.query(sql,values);}
  const client={rpc:async(name,args)=>{
   try{
    const keys=Object.keys(args),sql=`select public.${name}(${keys.map((key,i)=>`${key}=>$${i+1}`).join(",")}) as data`;
    const result=await query(name,sql,keys.map(key=>args[key]));return {data:result.rows[0].data,error:null};
   }catch(e){return {data:null,error:{code:e.code,message:e.message}};}
  },storage:{from:()=>({list:async folder=>{
   const result=await query("storage.list","select substring(name from length($1::text)+2) as name from storage.objects where bucket_id='follow-up-photos' and name like $1||'/%' order by name limit 1000",[folder]);
   return {data:result.rows,error:null};
  }})}};
  const fetcher=async url=>{
   requests++;
   await query("read_current_access_account","select public.read_current_access_account()");
   await query("read_current_access_workspace","select public.read_current_access_workspace('AUDITOR_QUALIDADE',null,null)");
   const parsed=new URL(url,"http://fixture");
   const result=before?await oldService(client,context,parsed.pathname.split("/")[4]):await readFollowUpPhotoBatch(client,context,parsed.searchParams.getAll("visitId"));
   return new Response(JSON.stringify(result.snapshot),{status:result.status});
  };
  const store=loaderFactory(actor,fetcher),ids=Array.from({length:count},(_,n)=>id(1001+n));
  const start=performance.now();ids.forEach(visit=>store.acquire(visit));
  const deadline=Date.now()+30000;
  while(ids.some(visit=>["idle","loading"].includes(store.getState(visit).status))){assert.ok(Date.now()<deadline,"Photo benchmark timeout");await pause(1);}
  const elapsed=performance.now()-start;
  for(const visit of ids){assert.equal(store.getState(visit).status,"ready",JSON.stringify(store.getState(visit)));assert.equal(store.getState(visit).photos.length,1);}
  store.cancel();return {callsByType:Object.fromEntries([...new Set(calls)].map(name=>[name,calls.filter(c=>c===name).length])),requests,queries:calls.length,metadataQueries:calls.filter(c=>!c.startsWith("read_current_access")).length,elapsed};
 }
 for(const count of [1,10,42]){
  const before=[],after=[];let b,a;
  // One warm-up per version, followed by paired measurements.
  await photoRun(oldLoader,true,count);await photoRun(createFollowUpPhotoLoader,false,count);
  for(let n=0;n<5;n++){b=await photoRun(oldLoader,true,count,15);a=await photoRun(createFollowUpPhotoLoader,false,count,15);before.push(b.elapsed);after.push(a.elapsed);}
  assert.equal(b.queries,4*count);assert.equal(a.queries,3);assert.equal(a.metadataQueries,1);
  evidence.photos.push({visits:count,transportDelayPerCallMs:15,before:{callsByType:b.callsByType,requests:b.requests,queries:b.queries,metadataQueries:b.metadataQueries,...statistics(before)},after:{callsByType:a.callsByType,requests:a.requests,queries:a.queries,metadataQueries:a.metadataQueries,...statistics(after)}});
 }
 // Measure the actual exported action body too: it used sequential detail
 // reads, which is a different schedule from the browser loader above.
 async function actionModule(before){
  const relative="src/app/follow-up/actions.ts";
  const source=before?execFileSync("git",["show",`${baselineCommit}:${relative}`],{cwd:root,encoding:"utf8"}):await readFile(path.join(root,relative),"utf8");
  const start=source.indexOf("export async function readFindingPhotosAction"),end=source.indexOf("export async function uploadFindingPhotosAction",start);
  const imports=[['uuidPattern','lib/access/validation.ts'],['parseAgendaVisit','lib/agenda/service.ts'],['canReadVisit','domain/prototype-access.ts'],['readVisitPhotos','lib/follow-up/photos.ts'],['readFollowUpPhotoBatch','lib/follow-up/photo-batch-service.ts'],['photoBatchSize','lib/follow-up/photo-batch.ts']].map(([name,file])=>`import {${name}} from "${pathToFileURL(path.join(root,"src",file)).href}";`).join("\n");
  const body=imports+'\nconst activeContext=async()=>globalThis.__nplusAction.activeContext();const createClient=async()=>globalThis.__nplusAction.client;\n'+source.slice(start,end);
  const file=path.join(temporary,`action-${before}.ts`);await writeFile(file,body);return (await import(pathToFileURL(file).href)).readFindingPhotosAction;
 }
 const beforeAction=await actionModule(true),afterAction=await actionModule(false);
 async function actionRun(fn,count){
  let queries=0;async function query(sql,values=[]){queries++;await pause(15);return db.query(sql,values);}
  const client={rpc:async(name,args)=>{const keys=Object.keys(args);const r=await query(`select public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(",")}) as data`,keys.map(k=>args[k]));return {data:r.rows[0].data,error:null};},storage:{from:()=>({list:async folder=>({data:(await query("select substring(name from length($1::text)+2) as name from storage.objects where bucket_id='follow-up-photos' and name like $1||'/%' order by name limit 1000",[folder])).rows,error:null})})}};
  globalThis.__nplusAction={client,activeContext:async()=>{await query("select public.read_current_access_account()");await query("select public.read_current_access_workspace('AUDITOR_QUALIDADE',null,null)");return context;}};
  const start=performance.now();const result=await fn(Array.from({length:count},(_,n)=>id(1001+n)),actor);assert.equal(result.available,true,JSON.stringify(result));assert.equal(result.photos.length,count);return {queries,elapsed:performance.now()-start};
 }
 evidence.photoAction=[];
 for(const count of [1,10,42]){
  const before=[],after=[];let b,a;await actionRun(beforeAction,count);await actionRun(afterAction,count);
  for(let n=0;n<5;n++){b=await actionRun(beforeAction,count);a=await actionRun(afterAction,count);before.push(b.elapsed);after.push(a.elapsed);}
  assert.equal(b.queries,2+2*count);assert.equal(a.queries,3);
  evidence.photoAction.push({visits:count,transportDelayPerCallMs:15,before:{queries:b.queries,...statistics(before)},after:{queries:a.queries,...statistics(after)}});
 }
 delete globalThis.__nplusAction;
 // Clone the exact old function for comparison; benchmark writes are rolled
 // back to a savepoint each time. No immutable publication survives this run.
 const oldSql=await readFile(path.join(root,"supabase/migrations/20261002000100_standalone_follow_up_reports.sql"),"utf8");
 const oldBody=oldSql.slice(oldSql.indexOf("create function public.save_standalone_follow_up_report"),oldSql.indexOf("-- A compact index"));
 const newBody=(await db.query("select pg_get_functiondef('public.save_standalone_follow_up_report(text,uuid,date,text,text,text,text,uuid[],uuid)'::regprocedure) as definition")).rows[0].definition;
 const clone=(body,name)=>body.replace(/CREATE(?: OR REPLACE)? FUNCTION public.save_standalone_follow_up_report/i,`CREATE OR REPLACE FUNCTION pg_temp.${name}`);
 await db.exec(clone(oldBody,"save_before"));
 await db.exec("create temporary sequence nplus_queries minvalue 0 start 0");
 const counter="perform nextval('pg_temp.nplus_queries');\n";
 await db.exec(clone(oldBody,"count_before").replace("select * into v_finding from",counter+"select * into v_finding from").replace("perform 1 from storage.objects",counter+"perform 1 from storage.objects"));
 await db.exec(clone(newBody,"count_after").replace("with selected as materialized",counter+"with selected as materialized").replace("perform 1 from storage.objects",counter+"perform 1 from storage.objects"));
 async function saveRun(fn,count){
  await db.exec("savepoint sample");const start=performance.now();
  try {await db.query(`select ${fn}('AUDITOR_QUALIDADE',$1,current_date,'Título','','Orientações','',$2,$3)`,[id(101),Array.from({length:count},(_,n)=>id(2001+n)),id(999)]);return performance.now()-start;}
  finally {await db.exec("rollback to sample;release sample");}
 }
 async function counted(fn,count){await db.exec("select setval('pg_temp.nplus_queries',0,false)");await saveRun(fn,count);return (await db.query("select last_value+case when is_called then 1 else 0 end as count from pg_temp.nplus_queries")).rows[0].count;}
 for(const count of [1,10,30]){
  const queriesBefore=Number(await counted("pg_temp.count_before",count)),queriesAfter=Number(await counted("pg_temp.count_after",count));
  assert.equal(queriesBefore,2*count);assert.equal(queriesAfter,2);
  await saveRun("pg_temp.save_before",count);await saveRun("public.save_standalone_follow_up_report",count);
  const before=[],after=[];for(let n=0;n<9;n++){before.push(await saveRun("pg_temp.save_before",count));after.push(await saveRun("public.save_standalone_follow_up_report",count));}
  evidence.standalone.push({findings:count,countScope:"Executed finding/photo SQL statements; shared authorization and INSERT excluded",latencyScope:"Full save_standalone_follow_up_report, local PostgreSQL; rollback outside timer",before:{queries:queriesBefore,...statistics(before)},after:{queries:queriesAfter,...statistics(after)}});
 }
 // Exercise the exact evidence-check blocks, isolated from PDF generation and
 // unrelated publication checks. Count instrumentation is excluded from timing.
 const pubBefore=await readFile(path.join(root,"supabase/migrations/20261006000500_publication_month.sql"),"utf8"),pubAfter=await readFile(path.join(root,"supabase/migrations/20261006000800_publication_evidence_batch.sql"),"utf8");
 const beforeBlock=pubBefore.slice(pubBefore.indexOf("  for file in select"),pubBefore.indexOf("  insert into public.published_audits"));
 const afterBlock=pubAfter.slice(pubAfter.indexOf("  -- One set-based"),pubAfter.indexOf("  insert into public.published_audits"));
 const evidenceFunction=(name,block)=>`create function pg_temp.${name}(p_payload jsonb) returns void language plpgsql as $body$ declare d public.audit_drafts%rowtype; file text; begin d.id:='${id(701)}';d.work_id:='${id(101)}';${block}end;$body$;`;
 await db.exec(evidenceFunction("evidence_before",beforeBlock)+evidenceFunction("evidence_after",afterBlock));
 await db.exec(evidenceFunction("evidence_count_before",beforeBlock.replace("   if not exists",counter+"   if not exists"))+evidenceFunction("evidence_count_after",counter+afterBlock));
 for(const count of [1,42,200]){
  const payload={evidenceFiles:Array.from({length:count},(_,n)=>`${n+1}.jpg`),reportFileName:"201.jpg"};
  const invoke=async name=>{const start=performance.now();await db.query(`select pg_temp.${name}($1::jsonb)`,[JSON.stringify(payload)]);return performance.now()-start;};
  await db.exec("select setval('pg_temp.nplus_queries',0,false)");await invoke("evidence_count_before");const qb=Number((await db.query("select last_value+1 as count from pg_temp.nplus_queries")).rows[0].count);
  await db.exec("select setval('pg_temp.nplus_queries',0,false)");await invoke("evidence_count_after");const qa=Number((await db.query("select last_value+1 as count from pg_temp.nplus_queries")).rows[0].count);
  assert.equal(qb,count+1);assert.equal(qa,1);
  await invoke("evidence_before");await invoke("evidence_after");const before=[],after=[];
  for(let n=0;n<9;n++){before.push(await invoke("evidence_before"));after.push(await invoke("evidence_after"));}
  evidence.publicationEvidence.push({photos:count,countScope:"File-existence SQL statements including PDF",latencyScope:"Exact validation block only, local PostgreSQL",before:{queries:qb,...statistics(before)},after:{queries:qa,...statistics(after)}});
 }
 // Legacy export is not called by current routes, but its per-audit signing
 // pattern is fixed as well. This measurement uses an explicit SDK simulation.
 const oldSnapshot=(await baselineModule("src/lib/audits/service.ts")).readPublishedAuditSnapshot;
 const criterion={id:"F176-Q01",code:"01.01",title:"Item",text:"Descrição",group:"1. Grupo",subgroup:"",source:"F176",locator:"linha 1",documentedWeight:null,orientations:[],verificationRule:"Conforme/Não Conforme"};
 const legacyContext={...context,profile:"ENGENHARIA",engineeringScope:"EQUIPE_OBRA",user:{id:id(2),workModuleScopes:[{workId:id(101),module:"quality"}]}};
 async function signingRun(fn,count){
  const indexes=Array.from({length:count},(_,n)=>({id:id(10000+n),workId:id(101),modelId:"quality-f176",date:"2026-10-01",auditorId:id(2),auditor:"Auditor fictício",finalScore:9,catalogRevisionId:null,catalogVersion:1,catalogRevisionLabel:"F.176/00"}));
  const details=indexes.map(row=>({...row,criteria:[criterion],responses:{"F176-Q01":{answer:"Conforme",note:""}},evidenceFiles:[],reportFileName:"report.pdf"}));
  let rpcQueries=0,signRequests=0;const batchSizes=[];
  const client={rpc:async name=>{rpcQueries++;await pause(15);return {data:name==="read_published_audit_index"?indexes:details,error:null};},storage:{from:()=>({createSignedUrls:async paths=>{signRequests++;batchSizes.push(paths.length);await pause(15);return {data:paths.map(path=>({path,signedUrl:`https://storage.invalid/${path}`})),error:null};}})}};
  const start=performance.now();const result=await fn(client,legacyContext);
  assert.equal(Object.keys(result.responses).length,count);return {rpcQueries,signRequests,batchSizes,elapsed:performance.now()-start};
 }
 evidence.legacySigning=[];
 for(const count of [1,42,150]){
  const before=[],after=[];let b,a;await signingRun(oldSnapshot,count);await signingRun(readPublishedAuditSnapshot,count);
  for(let n=0;n<5;n++){b=await signingRun(oldSnapshot,count);a=await signingRun(readPublishedAuditSnapshot,count);before.push(b.elapsed);after.push(a.elapsed);}
  assert.equal(b.signRequests,count);assert.equal(a.signRequests,Math.ceil(count/100));assert.ok(a.batchSizes.every(n=>n<=100));
  evidence.legacySigning.push({audits:count,scope:"Legacy export, no current UI caller; SDK responses simulated with 15 ms per call",before:{rpcQueries:b.rpcQueries,signRequests:b.signRequests,...statistics(before)},after:{rpcQueries:a.rpcQueries,signRequests:a.signRequests,...statistics(after)}});
 }
 await db.exec(await readFile(path.join(root,"supabase/tests/nplus1-assertions.sql"),"utf8"));
 evidence.assertions="passed";
 await writeFile(path.join(output,"benchmark.json"),JSON.stringify(evidence,null,2)+"\n");console.log(JSON.stringify(evidence,null,2));
} catch(e){errors++;console.error(e.message,e.where ?? "");await writeFile(path.join(output,"benchmark-partial.json"),JSON.stringify(evidence,null,2));process.exitCode=1;}
finally {await db.close();await rm(temporary,{recursive:true,force:true});}
if(!errors)console.log("PASS: query-count gates and PostgreSQL assertions; database discarded.");
