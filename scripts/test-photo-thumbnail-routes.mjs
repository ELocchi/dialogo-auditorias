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
    findingOwner: userId, findingModule: "QUALIDADE", findingError: null, guards: 0, resourceReads: 0, downloads: [], signed: 0, queries: [], rpcCalls: [], rpcError: null };
  state.client = {
    async rpc(name, parameters) {
      state.resourceReads++;
      state.rpcCalls.push({ name, parameters });
      if (name === "can_read_follow_up_finding_photo") {
        assert.deepEqual(parameters, { p_visit_id: visitId, p_finding_id: findingId, p_file_name: fileName,
          p_profile: state.context.profile, p_engineering_scope: state.context.engineeringScope, p_administrative_scope: null });
        return { data: state.authorized && state.findingExists && state.visitExists && state.photoExists, error: state.rpcError };
      }
      assert.equal(name, "read_published_audit_report");
      assert.deepEqual(parameters, { p_audit_id: auditId, p_profile: state.context.profile,
        p_engineering_scope: state.context.engineeringScope, p_administrative_scope: null });
      return { data: state.authorized ? { id: auditId, workId, modelId: "quality-f176", reportFileName: "report.pdf" } : null, error: null };
    },
    from(table) {
      const query = { table, fields: [], filters: [] }; state.queries.push(query);
      return { select(fields) { query.fields.push(fields); return this; }, eq(key, value) { query.filters.push([key, value]); return this; },
        async maybeSingle() { state.resourceReads++; return { data: state.findingExists ? { id: findingId, auditor_auth_user_id: state.findingOwner, modulo: state.findingModule } : null, error: state.findingError }; } };
    },
    storage: { from(bucket) { return {
      async download(file) { state.downloads.push({ bucket, file }); return { data: image, error: null }; },
      async list() { throw new Error("Exact photos must never list a Storage directory"); },
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
  "agenda/service": "export async function readAgendaSnapshot() { throw new Error('No full agenda per photo'); }",
  "follow-up/findings": "export async function readFindingDrafts() { throw new Error('No full draft list per photo'); }",
  "follow-up/service": "export async function readFollowUpReports() { throw new Error('No full report list per photo'); }",
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
  assert.deepEqual(state.queries, [{ table: "follow_up_work_findings", fields: ["id,auditor_auth_user_id,modulo"], filters: [
    ["id", findingId], ["work_id", workId], ["photo_file_name", fileName], ["auditor_auth_user_id", userId],
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

test("visit image uses one exact RPC, no list calls, and preserves original bytes", async () => {
  reset();
  const response = await run(endpoints[2], false);
  assert.equal(response.status, 200);
  assert.equal(state.guards, 1); assert.equal(state.resourceReads, 1);
  assert.equal(state.rpcCalls[0].name, "can_read_follow_up_finding_photo");
  assert.deepEqual(state.queries, []);
  assert.deepEqual(await response.arrayBuffer(), await image.arrayBuffer());
  assert.equal(response.headers.get("Content-Type"), "image/png");
});

test("photo authorization errors and malformed responses cannot reuse a warm thumbnail", async () => {
  reset(); assert.equal((await run(endpoints[2])).status, 200);
  state.rpcError = { code: "XX000", message: "Unavailable" };
  assert.equal((await run(endpoints[2])).status, 503);
  state.client.rpc = async () => ({ data: "true", error: null });
  assert.equal((await run(endpoints[2])).status, 503);
  assert.equal(state.signed, 0);
});


test("engineering reads a published work photo from its auditor's folder in both scopes", async () => {
  for (const scope of ["EQUIPE_OBRA", "COORDENACAO"]) {
    reset("ENGENHARIA"); state.context.engineeringScope = scope;
    state.findingOwner = "d1a70000-0000-4000-8000-000000000002";
    const response = await run(endpoints[1], false);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.arrayBuffer(), await image.arrayBuffer());
    assert.deepEqual(state.downloads, [{ bucket: "follow-up-photos", file: `${state.findingOwner}/${workId}/${fileName}` }]);
    const thumbnail = await run(endpoints[1]);
    assert.equal(thumbnail.status, 200);
    assert.equal((await sharp(await thumbnail.arrayBuffer()).metadata()).format, "webp");
    assert.equal(state.queries[0].filters.some(([key]) => key === "auditor_auth_user_id"), false);
    state.context.user.workModuleScopes = [];
    assert.equal((await run(endpoints[1])).status, 404);
  }
});

test("work photo access still rejects another work, discipline, owner and unsupported profile", async () => {
  reset("ENGENHARIA"); state.context.works = [];
  await assert.rejects(() => run(endpoints[1]), { status: 404 });
  reset("ENGENHARIA"); state.context.engineeringScope = null;
  await assert.rejects(() => run(endpoints[1]), { status: 404 });
  reset("ADMINISTRATIVO");
  await assert.rejects(() => run(endpoints[1]), { status: 404 });
  assert.equal(state.resourceReads, 0);
  for (const alter of [
    () => { state.findingOwner = "d1a70000-0000-4000-8000-000000000002"; },
    () => { state.context.profile = "AUDITOR_SEGURANCA"; },
    () => { state.findingModule = "SEGURANCA"; },
    () => { state.findingModule = null; },
    () => { state.findingOwner = "../private"; },
  ]) {
    reset(); alter();
    assert.equal((await run(endpoints[1], false)).status, 404);
    assert.equal(state.downloads.length, 0);
  }
});

test("work photo cache cannot mask database errors or removal of the finding", async () => {
  reset("ENGENHARIA"); assert.equal((await run(endpoints[1])).status, 200);
  const downloads = state.downloads.length;
  state.findingError = { code: "XX000" };
  assert.equal((await run(endpoints[1])).status, 503);
  state.findingError = null; state.findingExists = false;
  assert.equal((await run(endpoints[1])).status, 404);
  assert.equal(state.downloads.length, downloads);
});
