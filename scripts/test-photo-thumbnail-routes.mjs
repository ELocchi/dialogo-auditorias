import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import sharp from "sharp";

// Session verification is covered by test-audit-detail-routes; these tests run
// the real photo handlers, per-resource permission checks, cache and decoder.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userId = "d1a70000-0000-4000-8000-000000000001";
const workId = "d1a70000-0000-4000-8000-000000000101";
const auditId = "d1a70000-0000-4000-8000-000000000201";
const visitId = "d1a70000-0000-4000-8000-000000000301";
const findingId = "d1a70000-0000-4000-8000-000000000401";
const fileName = `${findingId}_d1a70000-0000-4000-8000-000000000501.png`;
const image = new Blob([await sharp({ create: { width: 640, height: 480, channels: 3, background: "#364c88" } }).png().toBuffer()], { type: "image/png" });
let state;
function reset(profile = "AUDITOR_QUALIDADE") {
  state = { authStatus: 200, authorized: true, findingExists: true, visitExists: true, photoExists: true,
    context: { profile, engineeringScope: profile === "ENGENHARIA" ? "EQUIPE_OBRA" : null, administrativeScope: null,
      works: [{ id: workId }], user: { id: userId, role: "quality-auditor", modules: ["quality"], workIds: [workId],
        workModuleScopes: [{ workId, module: "quality" }] } },
    guards: 0, resourceReads: 0, downloads: [], signed: 0, queries: [] };
  state.client = {
    async rpc(name, parameters) {
      state.resourceReads++;
      assert.equal(name, "read_published_audit_report");
      assert.deepEqual(parameters, { p_audit_id: auditId, p_profile: state.context.profile,
        p_engineering_scope: state.context.engineeringScope, p_administrative_scope: null });
      return { data: state.authorized ? { id: auditId, workId, modelId: "quality-f176", reportFileName: "report.pdf" } : null, error: null };
    },
    from(table) {
      const query = { table, fields: [], filters: [] }; state.queries.push(query);
      return { select(fields) { query.fields.push(fields); return this; }, eq(key, value) { query.filters.push([key, value]); return this; },
        async maybeSingle() { state.resourceReads++; return { data: state.findingExists ? { id: findingId } : null, error: null }; } };
    },
    storage: { from(bucket) { return {
      async download(file) { state.downloads.push({ bucket, file }); return { data: image, error: null }; },
      async list() { return { data: state.photoExists ? [{ name: fileName }] : [], error: null }; },
      async createSignedUrl() { state.signed++; throw new Error("Never needed"); },
    }; } },
  };
  globalThis.__photoFixture = state;
}
const stubs = {
  "next/navigation": "export function notFound() { throw Object.assign(new Error('not found'), { status: 404 }); }",
  "supabase/server": "export async function createClient() { return globalThis.__photoFixture.client; }",
  "audits/request-context": `export const auditResponseHeaders = { 'Cache-Control':'private, no-store', Vary:'Cookie' };
    export async function readAuditRequestContext() { const s=globalThis.__photoFixture; s.guards++; return { context:s.authStatus===200?s.context:null, status:s.authStatus }; }`,
  "agenda/service": `export async function readAgendaSnapshot() { const s=globalThis.__photoFixture; s.resourceReads++; return {available:true,visits:s.visitExists?[{id:'${visitId}',workId:'${workId}',auditorId:'${userId}',module:'quality',kind:'follow_up',modelId:null}]:[]}; }`,
  "follow-up/findings": `export async function readFindingDrafts() { const s=globalThis.__photoFixture; return {available:true,drafts:s.findingExists?[{visitId:'${visitId}',findings:[{id:'${findingId}'}]}]:[]}; }`,
  "follow-up/service": "export async function readFollowUpReports() { return {available:true,reports:[]}; }",
};
registerHooks({ resolve(specifier, context, nextResolve) {
  const key = Object.keys(stubs).find((candidate) => specifier === candidate || specifier.endsWith(`/${candidate}`) || specifier.endsWith(`/${candidate}.ts`));
  if (key) return { url: `data:text/javascript,${encodeURIComponent(stubs[key])}`, shortCircuit: true };
  if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(root, "src", `${specifier.slice(2)}.ts`)).href, context);
  return nextResolve(specifier, context);
} });
const audit = await import("../src/app/api/audits/[auditId]/photos/[fileName]/route.ts");
const work = await import("../src/app/app/acompanhamento/obras/[workId]/fotos/[fileName]/route.ts");
const visit = await import("../src/app/app/acompanhamento/fotos/[visitId]/[fileName]/route.ts");
const endpoints = [
  { name: "audit", handler: audit, params: { auditId, fileName: "p01-01.png" }, path: `${workId}/${auditId}/p01-01.png`, bucket: "published-audits" },
  { name: "work", handler: work, params: { workId, fileName }, path: `${userId}/${workId}/${fileName}`, bucket: "follow-up-photos" },
  { name: "visit", handler: visit, params: { visitId, fileName }, path: `${userId}/${visitId}/${fileName}`, bucket: "follow-up-photos" },
];
const run = (entry, thumbnail = true, params = entry.params) => entry.handler.GET(new Request(`https://offline.invalid/photos/${entry.name}${thumbnail ? "?miniatura=1" : ""}`), { params: Promise.resolve(params) });

test("every photo route authenticates before resource reads or downloads", async () => {
  for (const entry of endpoints) for (const status of [401, 403]) {
    reset(); state.authStatus = status;
    assert.equal(entry.handler.dynamic, "force-dynamic");
    const response = await run(entry);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(state.guards, 1);
    assert.equal(state.resourceReads, 0);
    assert.equal(state.downloads.length, 0);
  }
});

test("actual route derivatives use private storage and reauthorize on warm cache", async () => {
  for (const entry of endpoints) {
    reset(entry.name === "audit" ? "ENGENHARIA" : "AUDITOR_QUALIDADE");
    const first = await run(entry);
    assert.equal(first.status, 200, entry.name);
    const metadata = await sharp(await first.arrayBuffer()).metadata();
    assert.equal(metadata.width, 320);
    assert.equal(metadata.format, "webp");
    assert.deepEqual(state.downloads, [{ bucket: entry.bucket, file: entry.path }]);
    assert.equal((await run(entry)).status, 200);
    assert.equal(state.resourceReads, 2);
    assert.equal(state.downloads.length, 1);
    state.authorized = false; state.findingExists = false;
    assert.equal((await run(entry)).status, 404, `revoked ${entry.name}`);
    assert.equal(state.resourceReads, 3);
    assert.equal(state.downloads.length, 1);
    state.authStatus = 403;
    assert.equal((await run(entry)).status, 403);
    assert.equal(state.resourceReads, 3);
    assert.equal(state.signed, 0);
  }
});

test("work photos retain finding, owner, work and filename filters; originals are byte-identical", async () => {
  reset();
  const response = await run(endpoints[1], false);
  assert.deepEqual(state.queries, [{ table: "follow_up_work_findings", fields: ["id"], filters: [
    ["id", findingId], ["work_id", workId], ["auditor_auth_user_id", userId], ["photo_file_name", fileName],
  ] }]);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.deepEqual(await response.arrayBuffer(), await image.arrayBuffer());
});

test("audit photo requests cannot cross module or work scope, including a populated cache", async () => {
  reset("ENGENHARIA"); state.context.user.workModuleScopes = [{ workId, module: "safety" }];
  assert.equal((await run(endpoints[0])).status, 404);
  reset("ENGENHARIA"); state.context.works = [];
  assert.equal((await run(endpoints[0])).status, 404);
  assert.equal(state.downloads.length, 0);
  reset("ENGENHARIA");
  assert.equal((await run(endpoints[0], true, { auditId, fileName: "../report.pdf" })).status, 400);
  assert.equal(state.resourceReads, 0);
});

test("visit photo cache cannot bypass missing visit, removed photo or a different profile", async () => {
  reset(); state.visitExists = false;
  assert.equal((await run(endpoints[2])).status, 404);
  reset(); state.photoExists = false;
  assert.equal((await run(endpoints[2])).status, 404);
  reset("ENGENHARIA");
  await assert.rejects(() => run(endpoints[2]), { status: 404 });
  assert.equal(state.resourceReads, 0);
  assert.equal(state.downloads.length, 0);
});
