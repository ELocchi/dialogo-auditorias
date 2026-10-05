import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
registerHooks({resolve(specifier,context,next){
 if(specifier==='server-only') return {url:'data:text/javascript,export {};',shortCircuit:true};
 if(specifier==='@/lib/audits/request-context') return {url:'data:text/javascript,export const auditResponseHeaders={"Cache-Control":"private, no-store",Vary:"Cookie"};export async function readAuditRequestContext(){return globalThis.__publicationAccess;}',shortCircuit:true};
 if(specifier.startsWith('@/')) specifier=pathToFileURL(path.join(root,'src',specifier.slice(2))).href;
 if(specifier.startsWith('file:')||specifier.startsWith('.')) {
  const url=new URL(specifier,context.parentURL); const file=fileURLToPath(url);
  if(!path.extname(file)&&existsSync(file+'.ts'))return next(url.href+'.ts',context);
 }
 return next(specifier,context);
}});
const {publicationService}=await import('../src/lib/publications/service.ts');
const {publicationRequest,limitedBody}=await import('../src/lib/publications/http.ts');
const id='10000000-0000-4000-8000-000000000001';
const actor='10000000-0000-4000-8000-000000000002';
const work='10000000-0000-4000-8000-000000000003';
const context={user:{id:actor},profile:'AUDITOR_QUALIDADE',engineeringScope:null,administrativeScope:null};
const criterion={id:'one',code:'1',title:'Inspeção',text:'Descrição',group:'Grupo',subgroup:'',source:'F175',locator:'1',documentedWeight:10,orientations:[],verificationRule:'Conforme/Não Conforme'};
function fixture(){
 const state={draft:{id,visit_id:id,work_id:work,work_name:'Obra real',model_id:'quality-f175',modulo:'QUALIDADE',audit_date:'2026-10-01',auditor_auth_user_id:actor,auditor_name:'Auditor real',catalog_revision_id:null,catalog_version:0,catalog_revision_label:'00',criteria:[criterion],fvs_services:[],responses:{},photos:{},revision:1,published_at:null},objects:new Map(),calls:[],failUpload:false,failFinalize:false};
 const client={rpc:async(name,args)=>{
  state.calls.push(args); assert.equal(name,'publication_command'); assert.equal(args.p_actor,actor);assert.equal(args.p_profile,'AUDITOR_QUALIDADE');
  if(args.p_operation==='read-audit')return {data:structuredClone(state.draft),error:null};
  if(args.p_operation==='save-audit'){
   Object.assign(state.draft,args.p_payload,{revision:state.draft.revision+1});return {data:structuredClone(state.draft),error:null};
  }
  if(args.p_operation==='publish-audit'){
   if(state.failFinalize)return {data:null,error:{code:'40001'}};
   Object.assign(state.draft,{published_at:'2026-10-01T12:00:00Z',final_score:args.p_payload.score,report_file_name:args.p_payload.reportFileName});return {data:structuredClone(state.draft),error:null};
  }
  throw Error('Unexpected '+args.p_operation);
 },storage:{from:bucket=>({upload:async(name,bytes)=>{
  if(state.failUpload)return {error:{statusCode:'503'}};
  const key=bucket+'/'+name;if(state.objects.has(key))return {error:{statusCode:'409'}};
  state.objects.set(key,Uint8Array.from(bytes)); return {error:null};
 },download:async(name)=>{const data=state.objects.get(bucket+'/'+name);return {data:data?new Blob([data]):null,error:data?null:{message:'absent'}};}})}};
 return {state,service:publicationService(context,client)};
}
const responses={'quality-f175':{one:{answer:'Não conforme',note:'Pendência',photos:['camera.jpg']}}};
test('real photo decoding, persistent draft, server PDF and idempotent publication',async()=>{
 const {state,service}=fixture();
 const photo=await sharp({create:{width:10,height:10,channels:3,background:'#dd0000'}}).jpeg().toBuffer();
 const saved=await service.saveAudit(id,1,responses,new Map([['camera.jpg',new File([photo],'camera.jpg',{type:'image/jpeg'})]]));
 assert.equal(saved.revision,2);assert.match(state.draft.photos['camera.jpg'],/^[a-f0-9]{64}\.jpg$/);
 const published=await service.publishAudit(id,2);
 assert.equal(published.audit.status,'Publicada');assert.equal(published.audit.finalScore,0);
 const pdf=[...state.objects.entries()].find(([key])=>key.endsWith('.pdf'));
 assert.equal(new TextDecoder().decode(pdf[1].slice(0,5)),'%PDF-');
 assert.deepEqual(await service.auditReport(id),pdf[1]);
 assert.match(published.responses['quality-f175'].one.photos[0],/^\/api\/publications\//);
 const count=state.objects.size; await service.publishAudit(id,2);assert.equal(state.objects.size,count);
 assert.equal(state.calls.filter(c=>c.p_operation==='publish-audit').length,1);
 await assert.rejects(service.saveAudit(id,2,responses,new Map()),/já foi publicado/);
});
test('invalid or missing evidence never saves or publishes',async()=>{
 const {state,service}=fixture();
 await assert.rejects(service.saveAudit(id,1,responses,new Map()),/foto ainda não/);
 await assert.rejects(service.saveAudit(id,1,responses,new Map([['camera.jpg',new File(['not jpeg'],'camera.jpg',{type:'image/jpeg'})]])),/processada/);
 assert.equal(state.calls.some(c=>c.p_operation==='save-audit'),false);
 await assert.rejects(service.publishAudit(id,1),/item 1/);assert.equal(state.objects.size,0);
});
test('storage failure cannot publish and stale revision cannot overwrite',async()=>{
 const {state,service}=fixture();state.draft.responses={'quality-f175':{one:{answer:'Conforme',note:''}}};state.failUpload=true;
 await assert.rejects(service.publishAudit(id,1),/arquivos/);
 assert.equal(state.calls.some(c=>c.p_operation==='publish-audit'),false);
 await assert.rejects(service.saveAudit(id,0,{},new Map()),/mudou/);
});
test('transaction conflict after staging PDF stays unpublished and artifacts are not deleted on uncertain commit',async()=>{
 const {state,service}=fixture();state.draft.responses={'quality-f175':{one:{answer:'Conforme',note:''}}};state.failFinalize=true;
 await assert.rejects(service.publishAudit(id,1),/outra sessão/);
 assert.equal(state.draft.published_at,null);assert.equal(state.objects.size,1);
});
test('photo route service rejects files outside the exact authorized draft',async()=>{
 const {service}=fixture();await assert.rejects(service.photo(id,'../report.pdf'),/não encontrada/);
});
test('HTTP guard rejects cross-origin and unauthenticated requests before privileged access',async()=>{
 globalThis.__publicationAccess={context:null,status:401};let called=false;
 let response=await publicationRequest(new Request('http://localhost/api/publications',{method:'POST',headers:{Origin:'https://evil.invalid'}}),async()=>{called=true;return new Response();});
 assert.equal(response.status,403);
 response=await publicationRequest(new Request('http://localhost/api/publications'),async()=>{called=true;return new Response();});assert.equal(response.status,401);assert.equal(called,false);
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
test('streaming request limit rejects oversized bodies with no content-length',async()=>{
 await assert.rejects(limitedBody(new Request('http://localhost',{method:'POST',body:'123456789'}),4),e=>e.status===413);
});
test('action plan persists authoritative findings and publishes a real server PDF',async()=>{
 const photo=await sharp({create:{width:12,height:12,channels:3,background:'#224466'}}).jpeg().toBuffer();
 const evidence=createHash('sha256').update(photo).digest('hex')+'.jpg';
 const objects=new Map([['published-audits/'+work+'/'+id+'/'+evidence,new Uint8Array(photo)]]);
 const source={audit:{id,work_id:work,model_id:'quality-f175',audit_date:'2026-10-01',final_score:0,criteria:[criterion],responses:{one:{answer:'Não conforme',note:'Fonte imutável',serious:true,photos:[evidence]}},evidence_files:[evidence]},draft:null,workName:'Obra real',authorName:'Engenheiro real'};
 let publication=null;let finalizations=0;
 const client={rpc:async(_name,args)=>{
  assert.equal(args.p_actor,actor);assert.equal(args.p_profile,'ENGENHARIA');assert.equal(args.p_scope,'EQUIPE_OBRA');
  if(args.p_operation==='read-plan')return {data:structuredClone(publication?{publication}:source),error:null};
  if(args.p_operation==='save-plan'){source.draft={rows:args.p_payload.rows,revision:1};return {data:source.draft,error:null};}
  if(args.p_operation==='publish-plan'){finalizations++;publication={audit_id:id,work_id:work,report_file_name:args.p_payload.reportFileName};return {data:{publication},error:null};}
  throw Error('Unexpected operation');
 },storage:{from:bucket=>({download:async name=>({data:new Blob([objects.get(bucket+'/'+name)]),error:null}),upload:async(name,bytes)=>{objects.set(bucket+'/'+name,bytes);return {error:null};}})}};
 const service=publicationService({...context,profile:'ENGENHARIA',engineeringScope:'EQUIPE_OBRA'},client);
 const initial=await service.readPlan(id);assert.equal(initial.revision,0);assert.equal(initial.metadata.workName,'Obra real');
 assert.match(initial.rows[0].evidencePhotos[0].url,/\/api\/audits\//);
 await service.savePlan(id,0,[{...initial.rows[0],nonconformity:'Fraude',serious:false,correctiveAction:'Corrigir',responsible:'Engenharia',startDate:'2026-10-01',dueDate:'2026-10-03'}]);
 assert.equal(source.draft.rows[0].nonconformity,'Fonte imutável');assert.equal(source.draft.rows[0].serious,true);
 await service.publishPlan(id,1);const bytes=await service.planReport(id);assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');
 await service.publishPlan(id,1);assert.equal(finalizations,1);assert.equal((await service.readPlan(id)).published,true);
 await assert.rejects(service.savePlan(id,1,[]),/publicado/);
});
