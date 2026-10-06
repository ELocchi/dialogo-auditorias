import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const id=n=>`ab000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let state;
const reset=()=>{state={user:{id:id(1)},account:{},selected:{profile:'ADMINISTRATIVO',administrativeScope:'GERAL'},calls:[],rows:[],count:45,error:null,authorized:true,data:{available:true,profiles:[],total:0,page:1,size:20}};
state.client={async rpc(name,args){state.calls.push({name,args});return {data:name==='is_current_access_administrator'?state.authorized:state.data,error:state.error}},from(table){state.calls.push({table});return {select(...args){state.calls.push({select:args});return this},eq(...args){state.calls.push({eq:args});return this},order(...args){state.calls.push({order:args});return this},async range(from,to){state.calls.push({range:[from,to]});return {data:state.rows,count:state.count,error:state.error}}}}};globalThis.__adminList=state;};
const stubs={
 'auth/session':`export async function verifiedUser(){return globalThis.__adminList.user};export async function effectiveAccount(){return globalThis.__adminList.account}`,
 'auth/active-profile-session':`export async function readActiveProfileContext(){return globalThis.__adminList.selected}`,
 'supabase/server':`export async function createClient(){return globalThis.__adminList.client}`,
 'audits/request-context':`export const auditResponseHeaders={'Cache-Control':'private, no-store',Vary:'Cookie'}`,
};
registerHooks({resolve(specifier,context,next){
 if(specifier==='server-only')return {url:'data:text/javascript,export {}',shortCircuit:true};
 const key=Object.keys(stubs).find(k=>specifier.endsWith('/'+k)||specifier.endsWith('/'+k+'.ts'));
 if(key)return {url:'data:text/javascript,'+encodeURIComponent(stubs[key]),shortCircuit:true};
 if(specifier.startsWith('@/'))return next(pathToFileURL(path.join(root,'src',specifier.slice(2)+'.ts')).href,context);
 if(specifier.startsWith('.')&&!path.extname(specifier)&&context.parentURL?.startsWith('file:'))return next(new URL(specifier+'.ts',context.parentURL).href,context);
 return next(specifier,context);
}});
const {GET}=await import('../src/app/api/access/list/route.ts');
const {readWorkHistory,readActiveTeamProfiles}=await import('../src/lib/works/queries.ts');
const req=q=>new Request('https://offline.invalid/api/access/list?'+q);
test('lists require active General Administration, not just an account with that capability',async()=>{
 for(const [user,account,selected,status] of [[null,{},null,401],[{id:id(1)},null,null,403],[{id:id(1)},{},{profile:'AUDITOR_QUALIDADE'},403],[{id:id(1)},{},{profile:'ADMINISTRATIVO',administrativeScope:'QUALIDADE'},403]]){
 reset();Object.assign(state,{user,account,selected});assert.equal((await GET(req(''))).status,status);assert.deepEqual(state.calls,[]);
 }
});
test('invalid page, search, user or work IDs are rejected before data queries',async()=>{
 for(const q of ['page=0','page=1.5','page=1000000','userId=bad','workId=bad','search='+'x'.repeat(121)]){reset();assert.equal((await GET(req(q))).status,400);assert.deepEqual(state.calls,[]);}
});
test('user dropdown requests just selected page and search; decision history just selected account',async()=>{
 reset();let response=await GET(req('page=2&search=Ana'));assert.equal(response.status,200);assert.deepEqual(state.calls,[{name:'read_team_profile_page',args:{p_search:'Ana',p_page:2}}]);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 reset();response=await GET(req(`userId=${id(2)}&page=3`));assert.equal(response.status,200);assert.deepEqual(state.calls,[{name:'read_access_decision_page',args:{p_user_id:id(2),p_page:3}}]);
});
test('work history uses stable order, exact count and only 20 rows at requested offset',async()=>{
 reset();const response=await GET(req(`workId=${id(2)}&page=3`));assert.equal(response.status,200);assert.equal((await response.json()).total,45);
 assert.deepEqual(state.calls.find(c=>c.range).range,[40,59]);assert.deepEqual(state.calls.filter(c=>c.order).map(c=>c.order[0]),['changed_at','id']);assert.deepEqual(state.calls.find(c=>c.select).select[1],{count:'exact'});
});
test('revoked database authority, missing count and provider errors fail visibly',async()=>{
 reset();state.authorized=false;assert.equal((await GET(req(`workId=${id(2)}`))).status,403);assert.equal(state.calls.length,1);
 reset();state.count=null;assert.equal((await readWorkHistory(id(2))).error,true);
 reset();state.error={code:'42501',message:'private'};assert.equal((await GET(req(''))).status,403);
 reset();state.error={code:'500',message:'private'};const response=await GET(req(''));assert.equal(response.status,503);assert.equal((await response.text()).includes('private'),false);
});
test('team form reads existing selections by IDs, never scans 1000 accounts or 10000 grants',async()=>{
 reset();assert.deepEqual(await readActiveTeamProfiles(),[]);assert.deepEqual(state.calls,[]);
 await readActiveTeamProfiles([id(2),id(3)]);assert.deepEqual(state.calls,[{name:'read_team_profile_page',args:{p_ids:[id(2),id(3)]}}]);
 reset();assert.equal(await readActiveTeamProfiles(Array(31).fill(id(2))),null);assert.deepEqual(state.calls,[]);
});
