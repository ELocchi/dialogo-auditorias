import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

// Run the real HTTP handlers, projection service and Storage-list adapter.
// The common session guard is exercised separately in test-audit-detail-routes.
const id = (n) => `a1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = id(1), workId = id(2), visitId = id(3), findingId = id(4), reportId = id(5);
const updatedAt = "2026-09-28T10:00:00.000Z";
const finding = { id: findingId, location: "Segundo andar", description: "Correção necessária", correction: "Revisar execução" };
const report = { id: reportId, title: "Relatório de acompanhamento", visitId, revision: 1, findings: [finding], updatedAt };
const draft = { visitId, revision: 1, findings: [finding], updatedAt };
const fileName = `${findingId}_${id(6)}.jpg`;
const workFinding = { ...finding, workId, module: "quality", serious: true, photoFileName: fileName, createdAt: updatedAt };
const snapshot = { available: true, reports: [report], drafts: [draft], completed: [`${visitId}:${findingId}`], workFindings: [workFinding] };
const index = { available: true, reports: [{ id: reportId, title: report.title, visitId, updatedAt }] };
let state;
function reset(profile = "AUDITOR_QUALIDADE", scope = null) {
  state = {
    authStatus: 200, guards: 0, calls: [], lists: [], raw: structuredClone(snapshot), index: structuredClone(index),
    rpcError: null, canReadPhotos: true, storageError: null, files: [{ name: fileName }],
    context: { profile, engineeringScope: scope, administrativeScope: null,
      works: [{ id: workId, name: "Obra de teste" }], user: { id: userId, role: profile === "ENGENHARIA" ? "engineering" : "quality-auditor",
        modules: ["quality"], workIds: [workId], workModuleScopes: [{ workId, module: "quality" }] } },
  };
  state.client = {
    async rpc(name, parameters) {
      state.calls.push({ name, parameters });
      assert.ok(["read_follow_up_list_page", "read_follow_up_photo_batch"].includes(name),
        "No broad agenda, report body or duplicate auth RPCs in the service");
      return { data: name === "read_follow_up_list_page" ? state.raw : state.canReadPhotos === true
        ? {available:true,visitIds:parameters.p_visit_ids,photos:state.files.map(file=>({visitId:parameters.p_visit_ids[0],findingId,fileName:file.name}))}
        : state.canReadPhotos === false ? {available:false,photos:[]} : state.canReadPhotos, error: state.rpcError ?? state.storageError };
    },
    storage: { from(bucket) {
      assert.equal(bucket, "follow-up-photos");
      return { async list(folder, options) {
        state.lists.push({ folder, options }); return { data: state.files, error: state.storageError };
      } };
    } },
  };
  globalThis.__followUpFixture = state;
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stubs = {
  "supabase/server": "export async function createClient() { return globalThis.__followUpFixture.client; }",
  "audits/request-context": `export const auditResponseHeaders = { 'Cache-Control':'private, no-store', Vary:'Cookie' };
    export async function readAuditRequestContext() { const s=globalThis.__followUpFixture; s.guards++; return { context:s.authStatus===200?s.context:null, status:s.authStatus }; }`,
};
registerHooks({ resolve(specifier, context, nextResolve) {
  const key = Object.keys(stubs).find((candidate) => specifier === candidate || specifier.endsWith(`/${candidate}`) || specifier.endsWith(`/${candidate}.ts`));
  if (key) return { url: `data:text/javascript,${encodeURIComponent(stubs[key])}`, shortCircuit: true };
  if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(root, "src", `${specifier.slice(2)}.ts`)).href, context);
  return nextResolve(specifier, context);
} });
const list = await import("../src/app/api/follow-up/list/route.ts");
const workspace = await import("../src/app/api/follow-up/workspace/route.ts");
const reports = await import("../src/app/api/follow-up/reports/route.ts");
const photos = await import("../src/app/api/follow-up/visits/[visitId]/photos/route.ts");
const services = await import("../src/lib/follow-up/workspace-service.ts");
const request = () => new Request("https://offline.invalid/api/follow-up?perfil=AUDITOR_QUALIDADE");
const runPhotos = (id = visitId) => photos.GET(request(), { params: Promise.resolve({ visitId: id }) });
async function check(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Cookie");
  return response.json();
}

test("all follow-up endpoints verify context once and reject unauthenticated/denied requests before data", async () => {
  for (const handler of [workspace, reports, photos]) for (const status of [401, 403]) {
    reset(); state.authStatus = status;
    assert.equal(handler.dynamic, "force-dynamic");
    const response = await handler.GET(request(), { params: Promise.resolve({ visitId }) });
    const body = await check(response, status);
    assert.equal(body.available, false); assert.equal(state.guards, 1);
    assert.equal(state.calls.length, 0); assert.equal(state.lists.length, 0);
  }
});

const pageRow = { ...workFinding, source: "work", key: `work:${findingId}`, at: updatedAt, workName: "Obra de teste" };
const page = { available: true, items: [pageRow], hasMore: false, nextCursor: null };
const listRequest = (extra = "") => new Request(`https://offline.invalid/api/follow-up/list?kind=work-findings${extra}`);
test("paged HTTP reads only one authorized projection and never accesses Storage", async () => {
 reset(); state.raw=structuredClone(page);
 assert.deepEqual(await check(await list.GET(listRequest()),200),page);
 assert.equal(state.calls.length,1); assert.equal(state.calls[0].name,"read_follow_up_list_page");
 assert.equal(state.calls[0].parameters.p_size,20); assert.equal(state.lists.length,0);
});
test("all three obsolete bulk endpoints require reload without fetching a partial history", async () => {
 const standalone = await import("../src/app/api/follow-up/standalone-reports/route.ts");
 for(const endpoint of [workspace,reports,standalone]) { reset(); await check(await endpoint.GET(request()),410); assert.equal(state.calls.length,0); }
});
test("query rejects unbounded sizes, malformed cursors, work IDs and oversized searches", async () => {
 for(const query of ["&size=1000","&size=0","&cursor={}","&workId=bad",`&search=${"a".repeat(121)}`,"&module=wrong","&visitId=bad"]) {
  reset(); await check(await list.GET(listRequest(query)),400); assert.equal(state.calls.length,0);
 }
});
test("cursor, page size, search, work and visit scope pass to SQL unchanged", async () => {
 reset(); state.raw=page;
 const cursor={at:updatedAt,key:pageRow.key};
 await check(await list.GET(listRequest(`&size=10&workId=${workId}&visitId=${visitId}&search=Corre%C3%A7%C3%A3o&cursor=${encodeURIComponent(JSON.stringify(cursor))}`)),200);
 const args=state.calls[0].parameters; assert.equal(args.p_size,10); assert.deepEqual(args.p_cursor,cursor); assert.equal(args.p_work_id,workId); assert.equal(args.p_visit_id,visitId); assert.equal(args.p_search,"Correção");
});
test("malformed, duplicate, oversized or out-of-scope pages fail closed", async () => {
 for(const mutate of [p=>p.items.push({...pageRow,workId:id(999)}),p=>p.items.push(pageRow),p=>p.items[0].module="safety",p=>p.hasMore=true,p=>p.items[0].photoFileName="../private.jpg",p=>p.items[0].description=null,p=>p.items=Array.from({length:51},()=>pageRow)]) {
  reset(); state.raw=structuredClone(page); mutate(state.raw); const response=await check(await list.GET(listRequest()),503); assert.equal(response.available,false);
 }
});
test("profile, auth and database failure do not masquerade as an empty success", async () => {
 for(const profile of ["ADMINISTRATIVO","OUTRO"]) {reset(profile);await check(await list.GET(listRequest()),403);assert.equal(state.calls.length,0);}
 for(const status of [401,403]) {reset();state.authStatus=status;await check(await list.GET(listRequest()),status);assert.equal(state.calls.length,0);}
 reset();state.rpcError={message:"private diagnostic"};const response=await check(await list.GET(listRequest()),503);assert.equal(JSON.stringify(response).includes("private diagnostic"),false);
 reset();state.raw={available:true,items:[],hasMore:false,nextCursor:null};assert.deepEqual(await check(await list.GET(listRequest()),200),state.raw);
});
test("both engineering scopes retain the selected grants in the paged RPC", async () => {
 for(const scope of ["EQUIPE_OBRA","COORDENACAO"]) {reset("ENGENHARIA",scope);state.raw=page;await check(await list.GET(listRequest()),200);assert.equal(state.calls[0].parameters.p_engineering_scope,scope);}
});

test("photo lists authorize one exact visit before Storage; rejected and invalid visits list nothing", async () => {
  reset();
  const body = await check(await runPhotos(), 200);
  assert.deepEqual(body, { available: true, visitIds: [visitId], photos: [{ visitId, findingId, fileName }] });
  assert.equal(state.guards, 1);
  assert.deepEqual(state.calls, [{ name: "read_follow_up_photo_batch", parameters: {
    p_visit_ids: [visitId], p_profile: "AUDITOR_QUALIDADE", p_engineering_scope: null, p_administrative_scope: null,
  } }]);
  assert.equal(state.lists.length, 0);
  reset(); state.canReadPhotos = false;
  await check(await runPhotos(), 404); assert.equal(state.lists.length, 0);
  reset();
  assert.equal((await runPhotos("wrong")).status, 400); assert.equal(state.calls.length, 0);
});

test("SQL, transport and Storage failures never masquerade as empty successful lists", async () => {
  reset(); state.rpcError = { code: "XX000" };
  await check(await list.GET(listRequest()), 503);
  reset("ENGENHARIA", "COORDENACAO"); state.rpcError = { code: "XX000" };
  await check(await list.GET(listRequest()), 503);
  for (const [error, status] of [[{ code: "42501" }, 403], [{ code: "XX000" }, 503]]) {
    reset(); state.rpcError = error;
    await check(await runPhotos(), status); assert.equal(state.lists.length, 0);
  }
  reset(); state.canReadPhotos = "true";
  await check(await runPhotos(), 503); assert.equal(state.lists.length, 0);
  reset(); state.storageError = { message: "Unavailable" };
  const result = await check(await runPhotos(), 503); assert.deepEqual(result.photos, []);
  reset(); state.client.rpc = async () => { throw new Error("Offline"); };
  assert.equal((await services.readFollowUpWorkspace(state.client, state.context)).available, false);
});
