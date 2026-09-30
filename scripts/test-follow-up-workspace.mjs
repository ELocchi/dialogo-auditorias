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
      assert.ok(["read_follow_up_workspace", "read_follow_up_report_index", "can_read_follow_up_visit_photos"].includes(name),
        "No broad agenda, report body or duplicate auth RPCs in the service");
      return { data: name === "read_follow_up_workspace" ? state.raw
        : name === "read_follow_up_report_index" ? state.index : state.canReadPhotos, error: state.rpcError };
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

test("workspace loads all four lists through one authorized RPC with no Storage access", async () => {
  reset();
  assert.deepEqual(await check(await workspace.GET(request()), 200), snapshot);
  assert.equal(state.guards, 1);
  assert.deepEqual(state.calls, [{ name: "read_follow_up_workspace", parameters: {
    p_profile: "AUDITOR_QUALIDADE", p_engineering_scope: null, p_administrative_scope: null,
  } }]);
  assert.equal(state.lists.length, 0);
});

test("workspace strips unused long report fields and never silently accepts missing completion data", async () => {
  reset(); state.raw.reports[0] = { ...report, participants: "private long text", subjects: "private", decisions: "private" };
  assert.deepEqual(await check(await workspace.GET(request()), 200), snapshot);
  for (const completed of [null, undefined, ["invalid"], [`${visitId}:${findingId}`, `${visitId}:${findingId}`]]) {
    reset(); state.raw.completed = completed;
    const body = await check(await workspace.GET(request()), 503);
    assert.equal(body.available, false); assert.deepEqual(body.reports, []); assert.deepEqual(body.workFindings, []);
  }
});

test("malformed or out-of-scope workspace results fail as a whole", async () => {
  for (const mutate of [
    (raw) => { raw.reports.push(raw.reports[0]); },
    (raw) => { raw.drafts.push(raw.drafts[0]); },
    (raw) => { raw.reports[0].findings[0].description = "bad"; },
    (raw) => { raw.workFindings[0].workId = id(90); },
    (raw) => { raw.workFindings[0].module = "safety"; },
    (raw) => { raw.workFindings[0].serious = "yes"; },
    (raw) => { raw.workFindings[0].photoFileName = "wrong.jpg"; },
    (raw) => { raw.workFindings[0].createdAt = "wrong"; },
  ]) {
    reset(); mutate(state.raw);
    const body = await check(await workspace.GET(request()), 503);
    assert.equal(body.available, false); assert.deepEqual(body.reports, []);
  }
});

test("wrong roles never reach a follow-up workspace or report-index RPC", async () => {
  for (const profile of ["ENGENHARIA", "ADMINISTRATIVO"]) {
    reset(profile, profile === "ENGENHARIA" ? "COORDENACAO" : null);
    await check(await workspace.GET(request()), 403); assert.equal(state.calls.length, 0);
    await check(await runPhotos(), 403); assert.equal(state.calls.length, 0);
  }
  reset(); await check(await reports.GET(request()), 403); assert.equal(state.calls.length, 0);
});

test("engineering receives only report links; both selected engineering scopes reach the database", async () => {
  for (const scope of ["EQUIPE_OBRA", "COORDENACAO"]) {
    reset("ENGENHARIA", scope);
    state.index.reports[0] = { ...index.reports[0], findings: [finding], participants: "Long prose", subjects: "Private", revision: 1 };
    assert.deepEqual(await check(await reports.GET(request()), 200), index);
    assert.equal(state.guards, 1); assert.equal(state.lists.length, 0);
    assert.deepEqual(state.calls, [{ name: "read_follow_up_report_index", parameters: {
      p_profile: "ENGENHARIA", p_engineering_scope: scope, p_administrative_scope: null,
    } }]);
  }
});

test("photo lists authorize one exact visit before Storage; rejected and invalid visits list nothing", async () => {
  reset();
  const body = await check(await runPhotos(), 200);
  assert.deepEqual(body, { available: true, photos: [{ visitId, findingId, fileName }] });
  assert.equal(state.guards, 1);
  assert.deepEqual(state.calls, [{ name: "can_read_follow_up_visit_photos", parameters: {
    p_visit_id: visitId, p_profile: "AUDITOR_QUALIDADE", p_engineering_scope: null, p_administrative_scope: null,
  } }]);
  assert.equal(state.lists.length, 1); assert.equal(state.lists[0].folder, `${userId}/${visitId}`);
  reset(); state.canReadPhotos = false;
  await check(await runPhotos(), 404); assert.equal(state.lists.length, 0);
  reset();
  assert.equal((await runPhotos("wrong")).status, 400); assert.equal(state.calls.length, 0);
});

test("SQL, transport and Storage failures never masquerade as empty successful lists", async () => {
  reset(); state.rpcError = { code: "XX000" };
  await check(await workspace.GET(request()), 503);
  reset("ENGENHARIA", "COORDENACAO"); state.rpcError = { code: "XX000" };
  await check(await reports.GET(request()), 503);
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
