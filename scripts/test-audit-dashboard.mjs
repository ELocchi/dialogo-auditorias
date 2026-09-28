import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { buildAuditDashboard, buildDashboardRanking } from "../src/lib/audits/dashboard.ts";
import { unavailableAuditDashboard } from "../src/lib/audits/dashboard-contracts.ts";
import { parseAuditDashboardOverlay } from "../src/lib/audits/dashboard-overlay.ts";
import { readAuditDashboard } from "../src/lib/audits/dashboard-service.ts";
import { getAnnualAdminRanking, getMonthlyAdminRanking } from "../src/domain/admin-ranking.ts";

const uuid = (number) => `d1a70000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const userId = uuid(1);
const works = [101, 102].map((number) => ({ id: uuid(number), name: `Obra ${number}`, isDemo: false, city: "São Paulo", engineer: "Engenheiro", coordinator: "Coordenação", status: "Ativa" }));
const context = { profile: "AUDITOR_QUALIDADE", engineeringScope: null, administrativeScope: null,
  user: { id: userId, name: "Auditor de teste", role: "quality-auditor", modules: ["quality", "safety"], workIds: works.map((work) => work.id),
    workModuleScopes: works.flatMap((work) => ["quality", "safety"].map((module) => ({ workId: work.id, module }))) }, works };
const audit = (number, overrides = {}) => ({ id: uuid(number), workId: works[0].id, modelId: "quality-f176", date: "2026-09-23", auditorId: userId, auditor: context.user.name,
  finalScore: 8, isDemo: false, status: "Publicada", collectionStatus: "Coleta concluída", calculationStatus: "Disponível",
  catalogRevisionId: null, catalogVersion: 1, catalogRevisionLabel: "F.176/00", ...overrides });
const finding = (record, id = "item-1", overrides = {}) => ({ id, auditId: record.id, workId: record.workId, auditDate: record.date, auditor: record.auditor,
  module: record.modelId === "security-it07-r02" ? "safety" : "quality", modelId: record.modelId, item: "02.04", description: "Armazenamento — Contramarco",
  criterionTitle: "Armazenamento", nonconformity: "Fora do especificado", serious: true, subitem: "Contramarco", ...overrides });
const snapshot = (audits, findings = []) => ({ available: true, audits, findings, responses: {}, criteriaSnapshots: {} });
function clientFor(input, fail = false) {
  return { calls: [], async rpc(name, parameters) { this.calls.push({name, parameters}); assert.equal(name, "read_published_audit_overview"); return { data: input, error: fail ? { message: "offline" } : null }; }, storage: { from() { throw new Error("Dashboard must not sign evidence"); } } };
}

test("complete counts and plan groups remain independent of a ten-row history page", () => {
  const audits = Array.from({length: 41}, (_, index) => audit(200 + index, {workId: works[index % 2].id}));
  const findings = audits.flatMap((record) => [finding(record), finding(record, "item-2")]);
  const summary = buildAuditDashboard(snapshot(audits, findings), works);
  assert.equal(summary.publishedCount, 41);
  assert.equal(summary.findingCount, 82);
  assert.deepEqual(summary.findingCounts, {safety: 0, quality: 82});
  assert.equal(summary.pendingPlanKeys.length, 41);
  assert.equal(summary.mostSevere[0].occurrences, 82);
  assert.equal(summary.mostSevere[0].workCount, 2);
  assert.equal(summary.mostSevere[0].references.length, 82);
  assert.equal(summary.mostRecurring[0].occurrences, 41);
  assert.equal(summary.mostRecurring[0].workCount, 2);
  assert.deepEqual(summary.scoreMonths["2026-09"], {sum: 328, count: 41});
  assert.deepEqual(summary.publishedModules, ["quality"]);
  assert.equal("audits" in summary, false);
  assert.equal("findings" in summary, false);
  assert.equal("responses" in summary, false);
});

test("precomputed rankings preserve duplicate conflicts, ties, zero scores and annual means", () => {
  const scores = [];
  for (let index=0; index<1000; index++) scores.push({month:`${2024 + index % 3}-${String(1 + index % 12).padStart(2,"0")}`, discipline:index % 2 ? "quality":"safety", workId:`work-${index % 23}`, workName:`Obra ${index % 23}`, score:index % 11, published:true});
  scores.push({month:"2026-09", discipline:"quality", workId:"zero",workName:"Zero",score:0,published:true});
  const ranking = buildDashboardRanking(scores);
  for (const month of ranking.months) for (const discipline of ["safety", "quality"])
    assert.deepEqual(ranking.monthly[month][discipline], getMonthlyAdminRanking(scores, month, discipline));
  for (const year of Object.keys(ranking.annual)) for (const discipline of ["safety", "quality"])
    assert.deepEqual(ranking.annual[year][discipline], getAnnualAdminRanking(scores, year, discipline));
  const first = audit(201,{finalScore:8});
  const second = audit(202,{finalScore:10});
  const summary = buildAuditDashboard(snapshot([first,second]),works);
  assert.deepEqual(summary.ranking.monthly["2026-09"].quality,[]);
  assert.deepEqual(summary.scoreMonths["2026-09"],{sum:18,count:2},"engineering average must retain both conflicting publications");
});

test("recurrence counts audits once and keeps quantitative subitems in their original detail order", () => {
  const first = audit(201), second = audit(202,{workId:works[1].id});
  const summary = buildAuditDashboard(snapshot([first,second],[finding(first),finding(first,"check-2"),finding(second,"check-3",{subitem:"Sem identificação",nonconformity:"Sem etiqueta",description:"Armazenamento — Sem identificação"})]),works);
  assert.equal(summary.mostRecurring.length,1);
  assert.equal(summary.mostRecurring[0].occurrences,2);
  assert.equal(summary.mostRecurring[0].title,"02.04 · Armazenamento");
  assert.deepEqual(summary.mostRecurring[0].descriptions,[{label:"Contramarco",description:"Fora do especificado"},{label:"Sem identificação",description:"Sem etiqueta"}]);
});

test("scope filtering excludes every metric, ranking and finding from other works/modules", () => {
  const allowed=audit(201), otherWork=audit(202,{workId:works[1].id}), safety=audit(203,{modelId:"security-it07-r02"});
  const summary=buildAuditDashboard(snapshot([allowed,otherWork,safety],[finding(allowed),finding(otherWork),finding(safety)]),[works[0]],["quality"]);
  assert.equal(summary.publishedCount,1);assert.equal(summary.findingCount,1);assert.equal(summary.mostRecurring.length,0);
  assert.deepEqual(summary.ranking.monthly["2026-09"].safety,[]);
  assert.deepEqual(summary.pendingPlanKeys,[`${allowed.id}:quality:${works[0].id}`]);
  assert.deepEqual(buildAuditDashboard({available:false,audits:[allowed],findings:[finding(allowed)]},works),unavailableAuditDashboard());
});

test("overlay accepts only this auditor's authorized, published session records and discards evidence fields", () => {
  const local=audit(301,{isDemo:true,reportUrl:"should-not-travel"});const localFinding=finding(local);
  const parsed=parseAuditDashboardOverlay({audits:[local],findings:[{...localFinding,photos:["private-photo"]}]},context);
  assert.ok(parsed);assert.equal(parsed.audits[0].reportUrl,undefined);assert.equal(parsed.findings[0].photos,undefined);
  for(const patch of [{isDemo:false},{status:"Em preenchimento"},{auditorId:uuid(2)},{auditor:"Other"},{workId:uuid(999)},{modelId:"security-it07-r02"},{finalScore:-1},{finalScore:NaN},{date:"2026-02-30"}])
    assert.equal(parseAuditDashboardOverlay({audits:[{...local,...patch}],findings:[]},context),null,JSON.stringify(patch));
  for(const patch of [{workId:works[1].id},{auditId:uuid(999)},{module:"safety"},{modelId:"quality-f175"},{auditDate:"2026-09-24"},{auditor:"Other"},{serious:"yes"}])
    assert.equal(parseAuditDashboardOverlay({audits:[local],findings:[{...localFinding,...patch}]},context),null,JSON.stringify(patch));
  assert.equal(parseAuditDashboardOverlay({audits:[local,local],findings:[]},context),null);
  assert.equal(parseAuditDashboardOverlay({audits:[local],findings:[localFinding,localFinding]},context),null);
  assert.equal(parseAuditDashboardOverlay({audits:[local],findings:[]},{...context,profile:"ENGENHARIA"}),null);
  assert.equal(parseAuditDashboardOverlay({audits:Array.from({length:51},(_,index)=>audit(400+index,{isDemo:true})),findings:[]},context),null);
});

test("server recomputes local publication overlays against all history, including items entering the top five", async () => {
  const old=audit(201); const local=audit(301,{isDemo:true,finalScore:10});
  const oldFindings=Array.from({length:6},(_,index)=>finding(old,`item-${index}`,{item:`0${index + 1}`,description:`Title ${index}`,criterionTitle:`Title ${index}`}));
  const input=snapshot([old],oldFindings);
  const source=JSON.stringify(input);
  const overlay={audits:[local],findings:[finding(local,"new-6",{item:"06",description:"Title 5",criterionTitle:"Title 5"})]};
  const merged=await readAuditDashboard(clientFor(input),context,overlay);
  assert.equal(merged.publishedCount,2);assert.equal(merged.findingCount,7);
  assert.equal(merged.mostSevere[0].checklistItem,"06 · Title 5");assert.equal(merged.mostSevere[0].occurrences,2);
  assert.equal(merged.mostRecurring[0].occurrences,2);
  assert.deepEqual(merged.ranking.monthly["2026-09"].quality,[]);
  assert.deepEqual(merged.scoreMonths["2026-09"],{sum:18,count:2});
  assert.equal(JSON.stringify(input),source,"server reads must never mutate persisted data");
  const collision={audits:[{...local,id:old.id}],findings:[]};
  assert.equal((await readAuditDashboard(clientFor(input),context,collision)).available,false);
  assert.equal((await readAuditDashboard(clientFor(input,true),context)).available,false);
  const rejected=clientFor(input);assert.equal((await readAuditDashboard(rejected,context,{audits:[{...local,workId:uuid(999)}],findings:[]})).available,false);assert.equal(rejected.calls.length,0);
});

test("summary service restricts auditor discipline even when the account has multiple modules", async () => {
  const quality=audit(201),safety=audit(202,{modelId:"security-it07-r02"});
  const result=await readAuditDashboard(clientFor(snapshot([quality,safety],[finding(quality),finding(safety)])),context);
  assert.equal(result.publishedCount,1);assert.deepEqual(result.publishedModules,["quality"]);
  assert.equal(result.findingCounts.safety,0);
});

const projectRoot=path.resolve(import.meta.dirname,"..");
let routeAccess={context,status:200};let routeClient=clientFor(snapshot([]));
globalThis.__dashboardRouteFixture={get access(){return routeAccess;},get client(){return routeClient;}};
registerHooks({resolve(specifier,ctx,nextResolve){
 if(specifier.endsWith("/request-context")) return {url:`data:text/javascript,${encodeURIComponent('export const auditResponseHeaders={"Cache-Control":"private, no-store",Vary:"Cookie"};export async function readAuditRequestContext(){return globalThis.__dashboardRouteFixture.access}')}`,shortCircuit:true};
 if(specifier.endsWith("/supabase/server")) return {url:`data:text/javascript,${encodeURIComponent('export async function createClient(){return globalThis.__dashboardRouteFixture.client}')}`,shortCircuit:true};
 if(specifier.startsWith("@/"))return nextResolve(pathToFileURL(path.join(projectRoot,"src",`${specifier.slice(2)}.ts`)).href,ctx);
 return nextResolve(specifier,ctx);
}});
const route=await import("../src/app/api/audits/dashboard/route.ts");
const request=(body,contentType="application/json")=>new Request("https://offline.invalid/api/audits/dashboard",{method:"POST",headers:{"Content-Type":contentType},body:typeof body==="string"?body:JSON.stringify(body)});

test("dashboard HTTP routes authenticate before reads and validate private bounded overlays",async()=>{
 routeClient=clientFor(snapshot([]));
 for(const status of [401,403]){routeAccess={context:null,status};for(const handler of [route.GET,route.POST]){const response=await handler(request({audits:[],findings:[]}));assert.equal(response.status,status);assert.equal(response.headers.get("Cache-Control"),"private, no-store");assert.equal(response.headers.get("Vary"),"Cookie");}}
 assert.equal(routeClient.calls.length,0);routeAccess={context,status:200};
 assert.equal((await route.POST(request("bad"))).status,400);
 assert.equal((await route.POST(request({},"text/plain"))).status,415);
 assert.equal((await route.POST(request({audits:[audit(301,{isDemo:false})],findings:[]}))).status,400);
 assert.equal((await route.POST(request("x".repeat(8*1024*1024+1)))).status,413);
 assert.equal(routeClient.calls.length,0);
 const response=await route.POST(request({audits:[audit(301,{isDemo:true})],findings:[]}));
 assert.equal(response.status,200);assert.equal((await response.json()).publishedCount,1);
 assert.equal(routeClient.calls.length,1);
 assert.equal((await route.GET(new Request("https://offline.invalid/api/audits/dashboard"))).status,200);
 routeClient=clientFor(null,true);assert.equal((await route.GET(new Request("https://offline.invalid/api/audits/dashboard"))).status,503);
});

test("large history becomes aggregates rather than full publication metadata and finding rows",()=>{
 const audits=Array.from({length:2000},(_,index)=>audit(1000+index,{workId:works[index%2].id,date:`2026-${String(1+index%9).padStart(2,"0")}-23`}));
 const findings=audits.flatMap((record)=>Array.from({length:5},(_,index)=>finding(record,`item-${index}`,{serious:index===0,item:`0${index+1}`,criterionTitle:`Title ${index}`,description:`Title ${index}`})));
 const input=snapshot(audits,findings);const summary=buildAuditDashboard(input,works);
 const before=Buffer.byteLength(JSON.stringify(input));const after=Buffer.byteLength(JSON.stringify(summary));
 assert.equal(summary.publishedCount,2000);assert.equal(summary.findingCount,10000);assert.ok(after<before*.25,`${before} -> ${after}`);
 console.log(JSON.stringify({dashboardPayloadBytes:{before,after,reduction:Number((1-after/before).toFixed(4))},audits:2000,findings:10000}));
});
