import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

const id = (n) => `d1fa0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = id(1), workId = id(2), visitId = id(3), reportId = id(4);
const file = (finding, n) => `${id(finding)}_${id(n)}.jpg`;
const jpeg = await sharp({ create: { width: 32, height: 20, channels: 3, background: "red" } }).jpeg().toBuffer();
const prepared = await PDFDocument.create(); prepared.addPage();prepared.addPage();
const preparedBytes = await prepared.save();
let state;
function reset(profile = "AUDITOR_QUALIDADE", scope = null) {
  state = { archive: new Map([[`scheduled/${reportId}.pdf`, preparedBytes]]), guards: 0, contexts: 0, detailReads: [], lists: [], downloads: [],
    listError: null, failedPath: null, invalidImage: false,
    context: { profile, engineeringScope: scope, administrativeScope: null,
      user: { id: userId }, works: [{ id: workId, name: "Obra teste" }] },
    detail: { available: true, visit: { id: visitId, workId, auditorId: userId, auditorName: "Responsável",
      date: "2026-09-28", kind: "follow_up" },
    report: { id: reportId, title: "Orientação: instalações", visitId, revision: 1, updatedAt: "2026-09-28T12:00:00Z",
      participants: "Equipe da obra", subjects: "Assuntos completos", decisions: "Decisões completas",
      findings: [10, 20].map((n) => ({ id: id(n), location: "Andar", description: `Apontamento ${n}`, correction: "Revisar execução" })) },
    workPhotos: [{ findingId: id(10), fileName: file(10, 31), scopeId: workId }] },
  };
  state.client = { from() { throw new Error("No table or broad report query is allowed in the PDF route"); },
    storage: { from(bucket) {
      assert.equal(bucket, "follow-up-photos");
      return {
        async list(folder, options) { state.lists.push({ folder, options });
          return { data: [{ name: file(10, 30) }, { name: file(20, 40) }, { name: file(99, 99) }], error: state.listError }; },
        async download(folder, options, request) {
          state.downloads.push(folder); assert.ok(request.signal instanceof AbortSignal);
          return { data: state.failedPath === folder ? null : new Blob([state.invalidImage ? "broken" : jpeg]),
            error: state.failedPath === folder ? { message: "Offline" } : null };
        },
      };
    } },
  };
  globalThis.__followUpPdfFixture = state;
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stubs = {
  "server-only": "export {};",
  "@/lib/jobs/service": `export function jobService(){return {async enqueue(kind,target){const s=globalThis.__followUpPdfFixture;if(s.jobError)throw Error('Queue offline');return {job:{id:target,status:'queued',kind,target},statusUrl:'/api/jobs/'+target}}}}`,
  "@/lib/publications/admin": `export function createPublicationClient() {
    const s = globalThis.__followUpPdfFixture; s.archive ??= new Map();
    return { storage: { from() { return {
      async download(path) { if(s.archiveError)return {error:{statusCode:'503'}};const bytes=s.archive.get(path); return bytes ? {data:new Blob([bytes])} : {error:{statusCode:'404'}}; },
      async upload(path,bytes) { if(s.archive.has(path)) return {error:{statusCode:'409'}}; s.archive.set(path,bytes); return {}; }
    }; } } };
  }`,
  "next/navigation": "export function notFound() { throw Object.assign(new Error('Not found'), { status:404 }); }",
  "auth/session": "export async function requireActiveProfile() { const s=globalThis.__followUpPdfFixture; s.guards++; return s.context; }",
  "access/workspace": "export async function readWorkspaceContext() { const s=globalThis.__followUpPdfFixture; s.contexts++; return s.context; }",
  "supabase/server": "export async function createClient() { return globalThis.__followUpPdfFixture.client; }",
  "follow-up/visit-service": `export async function readFollowUpReportDetail(client,context,visitId,reportId) {
    const s=globalThis.__followUpPdfFixture; s.detailReads.push({profile:context.profile,scope:context.engineeringScope,visitId,reportId}); return s.detail;
  }`,
};
registerHooks({ resolve(specifier, context, nextResolve) {
  const key = Object.keys(stubs).find((candidate) => specifier === candidate || specifier.endsWith(`/${candidate}`) || specifier.endsWith(`/${candidate}.ts`));
  if (key) return { url: `data:text/javascript,${encodeURIComponent(stubs[key])}`, shortCircuit: true };
  if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(root, "src", `${specifier.slice(2)}.ts`)).href, context);
  return nextResolve(specifier, context);
} });
const route = await import("../src/app/app/acompanhamento/relatorio/[visitId]/pdf/route.ts");
const request = (query = `relatorio=${reportId}`) => new Request(`https://offline.invalid/app/acompanhamento/relatorio/${visitId}/pdf?${query}`);
const get = (query, value = visitId) => route.GET(request(query), { params: Promise.resolve({ visitId: value }) });
function privateResponse(response) {
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Cookie");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
}

test("auditor and both engineering scopes load the authorized immutable archive without source processing", async () => {
  for (const [profile, scope] of [["AUDITOR_QUALIDADE", null], ["AUDITOR_SEGURANCA", null], ["ENGENHARIA", "COORDENACAO"], ["ENGENHARIA", "EQUIPE_OBRA"]]) {
    reset(profile, scope);
    const response = await get(); assert.equal(response.status, 200); privateResponse(response);
    assert.equal(response.headers.get("Content-Type"), "application/pdf");
    assert.match(response.headers.get("Content-Disposition"), /^attachment; filename="orientacao-instalacoes-/);
    assert.ok((await PDFDocument.load(await response.arrayBuffer())).getPageCount() >= 2);
    assert.equal(state.guards, 1); assert.equal(state.contexts, 1);
    assert.deepEqual(state.detailReads, [{ profile, scope, visitId, reportId }]);
    assert.equal(state.lists.length, 0);assert.deepEqual(state.downloads, []);
  }
});

test("a unique report works without reportId and visualization remains inline", async () => {
  reset(); const response = await get("visualizar=1");
  assert.equal(response.status, 200); assert.match(response.headers.get("Content-Disposition"), /^inline;/);
  assert.equal(state.detailReads[0].reportId, null);
});

test("unavailable, unauthorized, ambiguous or mismatched report reads never touch Storage", async () => {
  reset(); state.detail.available = false;
  const unavailable = await get(); assert.equal(unavailable.status, 503); privateResponse(unavailable);
  assert.equal(state.lists.length, 0);
  for (const denied of ["visit", "report"]) {
    reset(); state.detail[denied] = null;
    await assert.rejects(get(), { status: 404 }); assert.equal(state.lists.length, 0);
  }
  reset("ADMINISTRATIVO"); await assert.rejects(get(), { status: 404 });
  assert.equal(state.detailReads.length, 0); assert.equal(state.lists.length, 0);
  reset(); await assert.rejects(get("relatorio=wrong"), { status: 404 }); assert.equal(state.guards, 0);
  await assert.rejects(get("relatorio="), { status: 404 }); assert.equal(state.guards, 0);
  await assert.rejects(get(undefined, "wrong"), { status: 404 }); assert.equal(state.guards, 0);
});

test("cache miss returns a trackable job without listing or decoding photos", async () => {
  reset();state.archive.clear();
  const response=await get();assert.equal(response.status,202);privateResponse(response);
  const receipt=await response.json();assert.equal(receipt.job.target,reportId);assert.equal(response.headers.get('Location'),receipt.statusUrl);
  assert.deepEqual(state.downloads,[]);assert.equal(state.lists.length,0);
});
test("archive and queue outages fail explicitly without generating partial PDFs", async()=>{
  reset();state.archiveError=true;assert.equal((await get()).status,503);
  reset();state.archive.clear();state.jobError=true;assert.equal((await get()).status,503);
});

test("direct browser download redirects to its tracked processing instead of exposing JSON", async()=>{
  reset();state.archive.clear();
  const direct=new Request(request().url,{headers:{accept:'text/html'}});
  const response=await route.GET(direct,{params:Promise.resolve({visitId})});
  assert.equal(response.status,303);privateResponse(response);
  assert.match(response.headers.get('Location'),/^\/app\/processamentos#job-/);
  assert.deepEqual(state.downloads,[]);
});

test("archived PDF survives source loss, but revoked report access still denies download", async () => {
  reset();
  const original = new Uint8Array(await (await get()).arrayBuffer());
  state.listError = { message: "Photos removed" };
  state.invalidImage = true;
  const archived = await get();
  assert.equal(archived.status, 200);
  assert.deepEqual(new Uint8Array(await archived.arrayBuffer()), original);
  assert.equal(state.lists.length, 0);
  state.detail.report = null;
  await assert.rejects(get(), { status: 404 });
});
