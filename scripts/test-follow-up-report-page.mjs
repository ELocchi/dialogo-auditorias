import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const id = (value) => `a9100000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const userId = id(1), workId = id(2), visitId = id(3), reportId = id(4), findingId = id(5);
const finding = { id: findingId, location: "Local", description: "Corrigir execução", correction: "Revisar execução" };
const report = { id: reportId, visitId, title: "Relatório específico", revision: 1, participants: "Auditor e obra", subjects: "Vistoria", decisions: "Corrigir execução", findings: [finding], updatedAt: "2026-09-28T10:00:00Z" };
let state;
function reset() {
  state = {
    context: { profile: "AUDITOR_QUALIDADE", email: "fixture@example.invalid", engineeringScope: null, administrativeScope: null,
      user: { id: userId, name: "Auditor", role: "quality-auditor", modules: ["quality"], workIds: [workId], agendaWorkIds: [workId], workModuleScopes: [{ workId, module: "quality" }] }, works: [{ id: workId, name: "Obra da visita" }] },
    snapshot: { available: true, visit: { id: visitId, workId, auditorId: userId, module: "quality", kind: "follow_up", modelId: null, confirmationStatus: "confirmed", date: "2026-09-20" }, reports: [report], draft: { visitId, revision: 1, findings: [finding], updatedAt: report.updatedAt }, workFindings: [] },
    selected: report, reads: [], lists: [],
  };
  state.client = { storage: { from() { return { async list(folder) { state.lists.push(folder); return { error: null, data: [{ name: `${findingId}_${id(6)}.png` }] }; } }; } } };
  globalThis.__followUpPage = state;
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stubs = {
  "next/link": "export default function Link(props){return props.children}",
  "next/navigation": "export function notFound(){throw Error('NOT_FOUND')}",
  "@/lib/auth/session": "export async function requireActiveProfile(){return {}}",
  "@/lib/access/workspace": "export async function readWorkspaceContext(){return globalThis.__followUpPage.context}",
  "@/lib/supabase/server": "export async function createClient(){return globalThis.__followUpPage.client}",
  "@/lib/follow-up/visit-service": `export async function readFollowUpVisit(client,context,visitId){const s=globalThis.__followUpPage;s.reads.push({kind:'visit',visitId});return s.snapshot}
    export async function readFollowUpReportDetail(client,context,visitId,reportId){const s=globalThis.__followUpPage;s.reads.push({kind:'detail',visitId,reportId});return {available:s.snapshot.available,visit:s.snapshot.visit,report:s.selected,workPhotos:[]}}`,
  "@/app/components/administrative-header": "export function AdministrativeHeader(){return null}",
  "@/app/components/follow-up-report-page": "export function FollowUpReportPage(){return null}",
  "@/app/components/ui-icon": "export function Icon(){return null}",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    if (specifier.endsWith(".css")) return { url: "data:text/javascript,export default {}", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(root, "src", `${specifier.slice(2)}.ts`)).href, context);
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".tsx")) return { format: "module", source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText, shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { default: ReportPage } = await import("../src/app/app/acompanhamento/relatorio/[visitId]/page.tsx");
const page = (query = {}, idValue = visitId) => ReportPage({ params: Promise.resolve({ visitId: idValue }), searchParams: Promise.resolve(query) });
function elements(element) {
  if (!element || typeof element !== "object") return [];
  if (Array.isArray(element)) return element.flatMap(elements);
  return [element, ...elements(element.props?.children)];
}
const editor = (tree) => elements(tree).find((element) => element.type?.name === "FollowUpReportPage");

test("report index reads one visit and never lists Storage or sends report bodies to the editor", async () => {
  reset(); const tree = await page(); assert.deepEqual(state.reads, [{ kind: "visit", visitId }]); assert.deepEqual(state.lists, []); assert.equal(editor(tree), undefined);
  const download = elements(tree).find((element) => element.props?.href === `/app/acompanhamento/relatorio/${visitId}/pdf?relatorio=${reportId}`);
  assert.ok(download); assert.equal(download.props.download, true); assert.equal(download.props.title, "Baixar PDF");
  assert.ok(!elements(tree).some((element) => element.props?.href === `/app/acompanhamento/relatorio/${visitId}?relatorio=${reportId}`));
  assert.ok(elements(tree).some((element) => element.props?.href === `/app/acompanhamento/relatorio/${visitId}?novo=1`));
});

test("new editor loads only the target snapshot and its photo folder, retaining source findings and revision", async () => {
  reset(); const tree = await page({ novo: "1" }); const props = editor(tree).props;
  assert.deepEqual(state.reads, [{ kind: "visit", visitId }]); assert.deepEqual(state.lists, [`${userId}/${visitId}`]);
  assert.equal(props.initialDraft.revision, 1); assert.deepEqual(props.initialReportedFindings, [finding]); assert.equal(props.initialPhotos.length, 1); assert.equal(props.initialReport, undefined);
});

test("editor with only work findings needs no visit Storage listing", async () => {
  reset(); state.snapshot.reports = []; state.snapshot.draft = null; state.snapshot.workFindings = [{ ...finding, workId, photoFileName: "work.png" }];
  const props = editor(await page()).props; assert.equal(props.initialWorkFindings.length, 1); assert.deepEqual(props.initialPhotos, []); assert.deepEqual(state.lists, []);
});

test("closed report uses only exact detail and leaves all photo reads to its PDF", async () => {
  reset(); const props = editor(await page({ relatorio: reportId })).props;
  assert.deepEqual(state.reads, [{ kind: "detail", visitId, reportId }]); assert.equal(props.initialReport.id, reportId);
  assert.deepEqual(props.initialReportedFindings, []); assert.equal(props.initialDraft, undefined); assert.deepEqual(props.initialWorkFindings, []); assert.deepEqual(props.initialPhotos, []); assert.deepEqual(state.lists, []);
});

test("invalid, denied and unavailable visits never reach Storage or masquerade as an empty editor", async () => {
  reset(); await assert.rejects(page({}, "invalid"), /NOT_FOUND/); assert.deepEqual(state.reads, []);
  reset(); state.snapshot.visit = null; await assert.rejects(page(), /NOT_FOUND/); assert.deepEqual(state.lists, []);
  reset(); state.selected = null; await assert.rejects(page({ relatorio: reportId }), /NOT_FOUND/); assert.deepEqual(state.lists, []);
  reset(); state.snapshot.available = false; await assert.rejects(page(), /Não foi possível consultar/); assert.deepEqual(state.lists, []);
});

test("legacy closed report still prevents creating another report from its index", async () => {
  reset(); state.snapshot.reports = [{ ...report, id: visitId }]; const tree = await page();
  assert.equal(elements(tree).some((element) => element.props?.href === `/app/acompanhamento/relatorio/${visitId}?novo=1`), false);
});
