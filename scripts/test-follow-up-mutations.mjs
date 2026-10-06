import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const id = (value) => `a9000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const userId = id(1), workId = id(2), visitId = id(3), findingId = id(4), reportId = id(5);
const timestamp = "2026-09-28T10:00:00.000Z";
const finding = { id: findingId, location: "Andar 2", description: "Proteção incompleta", correction: "Completar proteção" };
const input = { visitId, expectedRevision: 0, title: "Visita de acompanhamento", participants: "Auditor e engenheiro",
  subjects: "Correções observadas", decisions: "Executar as correções", findings: [finding] };
const report = { ...input, id: reportId, revision: 1, updatedAt: timestamp };
delete report.expectedRevision;
const actor = { userId, profile: "AUDITOR_QUALIDADE", engineeringScope: null, administrativeScope: null };
let state;
function reset() {
  state = {
    active: { user: { id: userId }, profile: actor.profile, engineeringScope: null, administrativeScope: null },
    context: { user: { id: userId }, profile: actor.profile, works: [{ id: workId }], engineeringScope: null, administrativeScope: null },
    snapshot: { available: true, visit: { id: visitId, workId, auditorId: userId, module: "quality", kind: "follow_up", confirmationStatus: "confirmed", date: "2026-09-20" },
      reports: [], draft: { visitId, revision: 7, findings: [finding], updatedAt: timestamp }, workFindings: [] },
    calls: [], targeted: [], writes: [], storage: [], files: [], rpcError: null, contextReads: 0,
  };
  state.client = {
    async rpc(name, args) {
      state.calls.push({ name, args });
      assert.ok(["save_follow_up_report", "save_follow_up_finding_drafts", "read_follow_up_photo_batch"].includes(name), "Mutations must not scan agenda, report history or other visit drafts");
      if (state.rpcError) return { error: state.rpcError, data: null };
      if(name==="read_follow_up_photo_batch")return {error:null,data:{available:true,visitIds:args.p_visit_ids,photos:[]}};
      return { error: null, data: name === "save_follow_up_report" ? { ...report, findings: args.p_findings }
        : { visitId: args.p_visit_id, revision: args.p_expected_revision + 1, findings: args.p_findings, updatedAt: timestamp } };
    },
    from(table) {
      assert.equal(table, "follow_up_finding_completions");
      return { async upsert(value, options) { state.writes.push({ table, value, options }); return { error: null }; } };
    },
    storage: { from(bucket) {
      assert.equal(bucket, "follow-up-photos");
      return {
        async list(folder) { state.storage.push({ op: "list", folder }); return { data: state.files.map((name) => ({ name })), error: null }; },
        async upload(target, bytes, options) { state.storage.push({ op: "upload", target, bytes, options }); state.files.push(target.split("/").at(-1)); return { error: null }; },
        async remove(targets) { state.storage.push({ op: "remove", targets }); state.files = state.files.filter((name) => !targets.some((target) => target.endsWith(`/${name}`))); return { error: null }; },
      };
    } },
  };
  globalThis.__followUpMutations = state;
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stubs = {
 "follow-up/document": "export async function scheduledDocument(){return {}};export async function standaloneDocument(){return {}}",
 "lists/service": `export async function readListPage(client,context,query,ids){const s=globalThis.__followUpMutations;
  const all=[...s.snapshot.reports.flatMap(r=>r.findings),...(s.snapshot.draft?.findings??[]),...s.snapshot.workFindings];
  return {available:true,items:all.filter(f=>ids.includes(f.id)),hasMore:false,nextCursor:null};}`,

  "auth/session": "export async function requireActiveProfile() { return globalThis.__followUpMutations.active; }",
  "access/workspace": "export async function readWorkspaceContext() { const state=globalThis.__followUpMutations; state.contextReads++; return state.context; }",
  "supabase/server": "export async function createClient() { return globalThis.__followUpMutations.client; }",
  "follow-up/visit-service": "export async function readFollowUpVisit(client,context,visitId) { const state=globalThis.__followUpMutations; state.targeted.push(visitId); return state.snapshot; }",
  "agenda/service": "export function parseAgendaVisit(v){return v};export async function readAgendaSnapshot() { throw Error('A mutation cannot read the entire agenda'); }",
};
registerHooks({ resolve(specifier, context, nextResolve) {
  const key = Object.keys(stubs).find((candidate) => specifier.endsWith(`/${candidate}`) || specifier.endsWith(`/${candidate}.ts`));
  if (key) return { url: `data:text/javascript,${encodeURIComponent(stubs[key])}`, shortCircuit: true };
  if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(root, "src", `${specifier.slice(2)}.ts`)).href, context);
  return nextResolve(specifier, context);
} });
const actions = await import("../src/app/follow-up/actions.ts");
const { saveFollowUpReport } = await import("../src/lib/follow-up/service.ts");
const uploadForm = () => { const form = new FormData(); form.set("visitId", visitId); form.set("findingId", findingId);
  form.append("photos", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "evidence.png", { type: "image/png" })); return form; };

test("save resolves server findings from one target snapshot and performs only the authoritative save RPC", async () => {
  reset(); state.snapshot.reports = [{ ...report, findings: [{ ...finding, description: "Texto do relatório anterior" }] }];
  state.snapshot.draft.findings = [{ ...finding, description: "Texto salvo no rascunho" }];
  const workFinding = { ...finding, id: id(6), description: "Apontamento atual da obra", workId, module: "quality", serious: true, photoFileName: `${id(6)}_${id(7)}.png`, createdAt: timestamp };
  state.snapshot.workFindings = [workFinding];
  const selected = [{ ...finding, description: "Texto manipulado pelo cliente" }, { ...finding, id: workFinding.id }];
  const result = await actions.saveFollowUpReportAction({ ...input, findings: selected }, actor);
  assert.equal(result.status, "success"); assert.deepEqual(state.targeted, [visitId]); assert.equal(state.contextReads, 1);
  assert.deepEqual(state.calls.map(({ name }) => name), ["save_follow_up_report"]);
  assert.deepEqual(state.calls[0].args.p_findings, [state.snapshot.draft.findings[0], { id: workFinding.id, location: workFinding.location, description: workFinding.description, correction: workFinding.correction, serious: true }]);
  assert.equal(state.storage.length, 0);
});

test("save fails closed on missing snapshot, unauthorized visit, changed source, future or unconfirmed visit", async () => {
  for (const change of [
    () => { state.snapshot.available = false; }, () => { state.snapshot.visit = null; },
    () => { state.snapshot.draft.findings = []; }, () => { state.snapshot.visit.date = "2099-01-01"; },
    () => { state.snapshot.visit.confirmationStatus = "pending"; },
  ]) {
    reset(); change(); assert.equal((await actions.saveFollowUpReportAction(input, actor)).status, "error"); assert.equal(state.calls.length, 0); assert.equal(state.storage.length, 0);
  }
});

test("save service preserves closed revision and SQL concurrency/current-access errors without rereading agenda", async () => {
  reset(); assert.equal((await saveFollowUpReport(state.client, state.context, { ...input, expectedRevision: 1 })).status, "error"); assert.equal(state.calls.length, 0);
  for (const [code, message] of [["40001", /outra sessão/], ["42501", /não está mais autorizado/], ["P0002", /não está mais autorizado/]]) {
    reset(); state.rpcError = { code }; const result = await saveFollowUpReport(state.client, state.context, input);
    assert.equal(result.status, "error"); assert.match(result.message, message); assert.equal(state.calls.length, 1);
  }
});

test("completing a draft uses its exact revision and deletes only that finding's private photos", async () => {
  reset(); const removed = `${findingId}_${id(8)}.png`, retained = `${id(9)}_${id(10)}.jpg`; state.files = [removed, retained];
  const result = await actions.completeFindingAction(visitId, findingId, actor);
  assert.equal(result.status, "success"); assert.equal(result.draft.revision, 8); assert.deepEqual(result.draft.findings, []);
  assert.deepEqual(state.targeted, [visitId]); assert.equal(state.calls[0].args.p_expected_revision, 7); assert.deepEqual(state.writes, []);
  assert.deepEqual(state.storage.map((entry) => entry.op), ["list", "remove"]); assert.deepEqual(state.storage[1].targets, [`${userId}/${visitId}/${removed}`]); assert.deepEqual(state.files, [retained]);
});

test("completing a reported finding records completion and never lists or removes its closed-report photos", async () => {
  reset(); state.snapshot.reports = [report];
  const result = await actions.completeFindingAction(visitId, findingId, actor);
  assert.equal(result.status, "success"); assert.deepEqual(state.targeted, [visitId]); assert.equal(state.writes.length, 1);
  assert.deepEqual(state.writes[0].value, { visit_id: visitId, finding_id: findingId, auditor_auth_user_id: userId });
  assert.equal(state.storage.length, 0);
});

test("a draft revision conflict cannot mark completion or remove photos", async () => {
  reset(); state.snapshot.reports = [report]; state.rpcError = { code: "40001" };
  const result = await actions.completeFindingAction(visitId, findingId, actor);
  assert.equal(result.status, "error"); assert.match(result.message, /outra sessão/); assert.equal(state.writes.length, 0); assert.equal(state.storage.length, 0);
});

test("photo upload loads just the target visit and returns the freshly confirmed photo list", async () => {
  reset(); const result = await actions.uploadFindingPhotosAction(uploadForm(), actor);
  assert.equal(result.status, "success"); assert.deepEqual(state.targeted, [visitId]); assert.equal(result.photos.length, 1);
  assert.deepEqual(state.storage.map((entry) => entry.op), ["list", "upload", "list"]);
  assert.equal(state.storage[0].folder, `${userId}/${visitId}`); assert.equal(result.photos[0].findingId, findingId);
});

test("closed, missing, future and unconfirmed visit findings cannot receive photos or reach Storage", async () => {
  for (const change of [
    () => { state.snapshot.reports = [report]; }, () => { state.snapshot.visit = null; },
    () => { state.snapshot.available = false; }, () => { state.snapshot.draft = null; },
    () => { state.snapshot.visit.date = "2099-01-01"; }, () => { state.snapshot.visit.confirmationStatus = "pending"; },
  ]) {
    reset(); change(); assert.equal((await actions.uploadFindingPhotosAction(uploadForm(), actor)).status, "error"); assert.equal(state.storage.length, 0);
  }
});

test("deletion keeps still-used photos and removes only an unused finding from the authorized visit", async () => {
  reset(); assert.equal(await actions.deleteFindingPhotosAction(visitId, findingId, actor), false); assert.equal(state.storage.length, 0);
  reset(); state.snapshot.draft = null; state.snapshot.reports = [report]; assert.equal(await actions.deleteFindingPhotosAction(visitId, findingId, actor), false); assert.equal(state.storage.length, 0);
  reset(); state.snapshot.draft = null; state.files = [`${findingId}_${id(8)}.png`];
  assert.equal(await actions.deleteFindingPhotosAction(visitId, findingId, actor), true); assert.deepEqual(state.targeted, [visitId]); assert.deepEqual(state.storage.map((entry) => entry.op), ["list", "remove"]);
  reset(); state.snapshot.visit = null; assert.equal(await actions.deleteFindingPhotosAction(visitId, findingId, actor), false); assert.equal(state.storage.length, 0);
});

test("stale actor and invalid identifiers are rejected before target data or storage reads", async () => {
  reset(); const oldActor = { ...actor, userId: id(99) };
  assert.equal((await actions.saveFollowUpReportAction(input, oldActor)).status, "error");
  assert.equal((await actions.completeFindingAction(visitId, findingId, oldActor)).status, "error");
  assert.equal((await actions.uploadFindingPhotosAction(uploadForm(), oldActor)).status, "error");
  assert.equal(await actions.deleteFindingPhotosAction(visitId, findingId, oldActor), false);
  assert.equal((await actions.completeFindingAction("bad", findingId, actor)).status, "error");
  assert.equal(await actions.deleteFindingPhotosAction(visitId, "bad", actor), false);
  assert.deepEqual(state.targeted, []); assert.deepEqual(state.calls, []); assert.deepEqual(state.storage, []);
});

test("legacy photo action batches up to 100 visits without per-visit queries",async()=>{
 for(const count of [1,42,50,100]){
  reset();const {readFindingPhotosAction}=await import("../src/app/follow-up/actions.ts");
  const result=await readFindingPhotosAction(Array.from({length:count},(_,n)=>id(n+100)),actor);
  assert.equal(result.available,true);assert.equal(state.calls.length,Math.ceil(count/50));assert.equal(state.storage.length,0);
 }
});
