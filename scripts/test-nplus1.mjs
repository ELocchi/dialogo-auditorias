import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";
import { readFollowUpPhotoBatch } from "../src/lib/follow-up/photo-batch-service.ts";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
registerHooks({resolve(specifier,ctx,next){
 if(specifier==="@/lib/supabase/server")return {url:'data:text/javascript,export async function createClient(){return globalThis.nplus.client}',shortCircuit:true};
 if(specifier==="@/lib/audits/request-context")return {url:'data:text/javascript,export const auditResponseHeaders={"Cache-Control":"private, no-store",Vary:"Cookie"};export async function readAuditRequestContext(){const s=globalThis.nplus;return {context:s.status===200?s.context:null,status:s.status}}',shortCircuit:true};
 if(specifier.startsWith("@/"))return next(pathToFileURL(path.join(root,"src",specifier.slice(2)+".ts")).href,ctx);
 return next(specifier,ctx);
}});
const {GET}=await import("../src/app/api/follow-up/photos/route.ts");
const id=n=>`a1000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function fixture(){
 const s={status:200,context:{profile:"AUDITOR_QUALIDADE",engineeringScope:null,administrativeScope:null,user:{id:id(1)}},calls:[],change:data=>data,error:null};
 s.client={rpc:async(name,args)=>{s.calls.push({name,args});assert.equal(name,"read_follow_up_photo_batch");return {data:s.change({available:true,visitIds:args.p_visit_ids,photos:args.p_visit_ids.map(visitId=>({visitId,findingId:id(99),fileName:`${id(99)}_${id(100)}.jpg`}))}),error:s.error};}};
 globalThis.nplus=s;return s;
}
const request=ids=>new Request(`https://fixture/api/follow-up/photos?${new URLSearchParams(ids.map(visit=>["visitId",visit]))}`);
test("1, 10, 42 or 50 visits execute one metadata RPC and no Storage lists",async()=>{
 for(const count of [1,10,42,50]){const s=fixture();const result=await GET(request(Array.from({length:count},(_,n)=>id(n+2))));assert.equal(result.status,200);assert.equal((await result.json()).photos.length,count);assert.equal(s.calls.length,1);assert.equal(result.headers.get("cache-control"),"private, no-store");}
});
test("empty/invalid/oversized API batches perform no metadata query",async()=>{
 for(const ids of [[],["../secret"],Array.from({length:51},(_,n)=>id(n+2))]){const s=fixture();assert.equal((await GET(request(ids))).status,400);assert.equal(s.calls.length,0);}
});
test("unauthorized and non-auditor profiles execute no metadata query",async()=>{
 for(const status of [401,403]){const s=fixture();s.status=status;assert.equal((await GET(request([id(2)]))).status,status);assert.equal(s.calls.length,0);}
 const s=fixture();s.context.profile="ENGENHARIA";assert.equal((await GET(request([id(2)]))).status,403);assert.equal(s.calls.length,0);
});
test("deduplicates canonical UUIDs and preserves the selected profile in SQL",async()=>{
 const s=fixture();await GET(request([id(2),id(2).toUpperCase()]));assert.equal(s.calls.length,1);assert.deepEqual(s.calls[0].args,{p_visit_ids:[id(2)],p_profile:"AUDITOR_QUALIDADE",p_engineering_scope:null,p_administrative_scope:null});
});
test("mixed/foreign IDs, malformed filenames and incomplete batch coverage fail closed",async()=>{
 for(const change of [d=>({...d,visitIds:[]}),d=>({...d,visitIds:[id(3)]}),d=>({...d,photos:[...d.photos,d.photos[0]]}),d=>({...d,photos:[{...d.photos[0],visitId:id(3)}]}),d=>({...d,photos:[{...d.photos[0],fileName:"../photo.jpg"}]}),d=>({...d,photos:[{...d.photos[0],findingId:id(3)}]})]){const s=fixture();s.change=change;const result=await GET(request([id(2)]));assert.equal(result.status,503);assert.deepEqual((await result.json()).photos,[]);}
});
test("empty, denied and failed reads remain distinct and never disclose provider diagnostics",async()=>{
 const empty=fixture();empty.change=d=>({...d,photos:[]});assert.equal((await GET(request([id(2)]))).status,200);
 const denied=fixture();denied.change=()=>({available:false,photos:[]});assert.equal((await GET(request([id(2)]))).status,404);
 for(const code of ["42501","XX000","PGRST202"]){const s=fixture();s.error={code,message:"PRIVATE_DETAIL"};const result=await GET(request([id(2)]));assert.equal(result.status,code==="42501"?403:503);assert.ok(!(await result.text()).includes("PRIVATE_DETAIL"));}
 const thrown=fixture();thrown.client.rpc=async()=>{throw Error("PRIVATE_DETAIL")};assert.equal((await GET(request([id(2)]))).status,503);
});
test("empty internal service batch returns immediately without touching the database",async()=>{
 const s=fixture();assert.equal((await readFollowUpPhotoBatch(s.client,s.context,[])).status,200);assert.equal(s.calls.length,0);
});
