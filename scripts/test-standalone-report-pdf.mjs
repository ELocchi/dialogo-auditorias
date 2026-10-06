import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

const id = n => `ddcc0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const jpeg = await sharp({ create: { width: 32, height: 20, channels: 3, background: "red" } }).jpeg().toBuffer();
const prepared = await PDFDocument.create();prepared.setTitle("Relatório independente - Obra");prepared.addPage();
const preparedBytes=await prepared.save();
let state;
function reset(profile = "AUDITOR_QUALIDADE", scope = null) {
  state = { archive: new Map([[`standalone/${id(3)}.pdf`,preparedBytes]]), calls: [], downloads: [], error: null, photoError: false,
    context: { profile, engineeringScope: scope, administrativeScope: null,
      user: { id: id(1), workModuleScopes: [{ workId: id(2), module: "quality" }] }, works: [{ id: id(2) }] },
    report: { id: id(3), workId: id(2), auditorId: id(1), auditorName: "Auditor", workName: "Obra",
      module: "quality", title: "Relatório independente", date: "2026-09-30", updatedAt: "2026-10-02T13:00:00Z",
      participants: "", subjects: "Orientações da obra", decisions: "", findings: [], photos: [] },
  };
  state.client = { async rpc(name, params) { state.calls.push({ name, params });
    return { error: state.error, data: { available: true, reports: state.report ? [state.report] : [] } }; },
    storage: { from(bucket) { assert.equal(bucket, "follow-up-photos"); return {
      async download(name, _, { signal }) { assert.ok(signal instanceof AbortSignal); state.downloads.push(name);
        return state.photoError ? { error: { message: "Offline" }, data: null } : { error: null, data: new Blob([jpeg]) }; },
    }; } },
  };
  globalThis.__standalonePdf = state;
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stubs = {
  "server-only": "export {};",
  "@/lib/jobs/service": `export function jobService(){return {async enqueue(kind,target){return {job:{id:target,status:'queued',kind,target},statusUrl:'/api/jobs/'+target}}}}`,
  "@/lib/publications/admin": `export function createPublicationClient() {
    const s = globalThis.__standalonePdf; s.archive ??= new Map();
    return { storage: { from() { return {
      async download(path) { const bytes=s.archive.get(path); return bytes ? {data:new Blob([bytes])} : {error:{statusCode:'404'}}; },
      async upload(path,bytes) { if(s.archive.has(path)) return {error:{statusCode:'409'}}; s.archive.set(path,bytes); return {}; }
    }; } } };
  }`,
  "next/navigation": "export function notFound(){throw Object.assign(new Error('Not found'),{status:404})}",
  "@/lib/auth/session": "export async function requireActiveProfile(){return globalThis.__standalonePdf.context}",
  "@/lib/access/workspace": "export async function readWorkspaceContext(){return globalThis.__standalonePdf.context}",
  "@/lib/supabase/server": "export async function createClient(){return globalThis.__standalonePdf.client}",
};
registerHooks({ resolve(specifier, context, next) {
  if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
  if (specifier.startsWith("@/")) return next(pathToFileURL(path.join(root, "src", `${specifier.slice(2)}.ts`)).href, context);
  return next(specifier, context);
} });
const { GET } = await import("../src/app/app/acompanhamento/relatorio/avulso/[reportId]/pdf/route.ts");
const get = (reportId = id(3), query = "") => GET(new Request(`https://fixture.invalid/report/pdf?${query}`), { params: Promise.resolve({ reportId }) });

test("standalone PDF works without a visit, findings or Storage listing for auditors and engineering", async () => {
  for (const [profile, scope] of [["AUDITOR_QUALIDADE", null], ["ENGENHARIA", "EQUIPE_OBRA"], ["ENGENHARIA", "COORDENACAO"]]) {
    reset(profile, scope);
    const response = await get();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("Vary"), "Cookie");
    assert.match(response.headers.get("Content-Disposition"), /^attachment; filename="relatorio-2026-09-30-/);
    const pdf = await PDFDocument.load(await response.arrayBuffer());
    assert.ok(pdf.getPageCount() > 0);
    assert.equal(pdf.getTitle(), "Relatório independente - Obra");
    assert.deepEqual(state.calls, [{ name: "read_standalone_follow_up_reports", params: {
      p_profile: profile, p_engineering_scope: scope, p_administrative_scope: null, p_report_id: id(3),
    } }]);
    assert.deepEqual(state.downloads, []);
  }
});

test("PDF uses the immutable archive; cache miss queues generation without downloading photos", async () => {
  reset();
  state.report.findings = [{ id: id(4), location: "", description: "Correção necessária", correction: "Orientação completa", serious: true }];
  state.report.photos = [{ findingId: id(4), fileName: `${id(4)}_${id(5)}.jpg` }];
  assert.equal((await get()).status, 200);
  assert.deepEqual(state.downloads, []);
  state.photoError = true;
  assert.equal((await get()).status, 200, "Preserved PDF does not depend on source photos");
  state.archive.clear();
  const failed = await get();
  assert.equal(failed.status, 202);
  assert.notEqual(failed.headers.get("Content-Type"), "application/pdf");
});

test("unauthorized, missing and unavailable standalone documents never download evidence", async () => {
  reset("ADMINISTRATIVO"); await assert.rejects(get(), { status: 404 }); assert.deepEqual(state.calls, []);
  reset(); await assert.rejects(get("invalid"), { status: 404 }); assert.deepEqual(state.calls, []);
  reset(); state.report = null; await assert.rejects(get(), { status: 404 }); assert.deepEqual(state.downloads, []);
  reset(); state.error = { code: "42501" }; assert.equal((await get()).status, 503); assert.deepEqual(state.downloads, []);
});
