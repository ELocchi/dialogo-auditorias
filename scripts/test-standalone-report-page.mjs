import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const id = n => `ccdd0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const profiles = ["ADMINISTRATIVO", "AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"];
let state;
function reset(profile = "AUDITOR_QUALIDADE") {
  state = { reads: 0, active: { profile, account: { perfis: profiles } }, context: {
    profile, engineeringScope: null, administrativeScope: null,
    user: { id: id(1), workModuleScopes: [{ workId: id(2), module: profile === "AUDITOR_SEGURANCA" ? "safety" : "quality" }] },
    works: [{ id: id(2), name: "Obra autorizada" }, { id: id(3), name: "Sem concessão" }],
  } };
  globalThis.__standalonePage = state;
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stubs = {
  "next/link": "export default function Link(){return null}",
  "@/lib/auth/session": "export async function requireActiveProfile(){return globalThis.__standalonePage.active}",
  "@/lib/access/workspace": "export async function readWorkspaceContext(){const s=globalThis.__standalonePage;s.reads++;return s.context}",
  "@/app/components/standalone-report-form": "export function StandaloneReportForm(){return null}",
  "@/app/components/standalone-report-shell": "export function StandaloneReportShell(){return null}",
  "@/app/components/auth/AuthShell": "export function AuthShell(){return null}",
  "@/app/escolher-perfil/actions": "export async function selectProfileAction(){}",
};
registerHooks({
  resolve(specifier, context, next) {
    if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    if (specifier.startsWith("@/")) return next(pathToFileURL(path.join(root, "src", `${specifier.slice(2)}.ts`)).href, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".tsx")) return { format: "module", source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { default: ReportPage } = await import("../src/app/app/acompanhamento/relatorio/novo/page.tsx");
const NewReportPage = (query = {}) => ReportPage({ searchParams: Promise.resolve(query) });
const elements = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(elements)
  : [node, ...elements(node.props?.children)];

test("both auditors open the real page with only their granted works and no agenda reads", async () => {
  for (const profile of ["AUDITOR_QUALIDADE", "AUDITOR_SEGURANCA"]) {
    reset(profile);
    const tree = await NewReportPage();
    const form = elements(tree).find(node => node.type?.name === "StandaloneReportForm");
    assert.ok(form);
    assert.deepEqual(form.props.works.map(work => work.id), [id(2)]);
    assert.equal(form.props.initialWorkId, id(2));
    assert.equal(form.props.actor.profile, profile);
    assert.equal(state.reads, 1);
  }
});

test("an unavailable workspace offers a real retry instead of a 404 or a false empty form", async () => {
  reset(); state.context = null;
  const tree = await NewReportPage();
  assert.equal(tree.type.name, "AuthShell");
  assert.match(tree.props.title, /Não foi possível/);
  assert.ok(elements(tree).some(node => node.type === "form" && node.props.method === "get"
    && node.props.action === "/app/acompanhamento/relatorio/novo"));
  assert.equal(elements(tree).some(node => node.type?.name === "StandaloneReportForm"), false);
});

test("another active profile offers only approved auditor choices, without reading technical data", async () => {
  for (const profile of ["ADMINISTRATIVO", "ENGENHARIA"]) {
    reset(profile);
    const tree = await NewReportPage();
    assert.equal(tree.type.name, "AuthShell");
    assert.deepEqual(elements(tree).filter(node => node.type === "button").map(node => node.props.value), ["AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE"]);
    assert.equal(elements(tree).filter(node => node.type === "input").every(node => node.props.value === "relatorio-orientativo"), true);
    assert.equal(state.reads, 0);
  }
});

test("a user without any auditor grant receives a return path and cannot enter the editor", async () => {
  reset("ENGENHARIA"); state.active.account.perfis = ["ENGENHARIA"];
  const tree = await NewReportPage();
  assert.equal(elements(tree).some(node => node.type === "form" || node.type?.name === "StandaloneReportForm"), false);
  assert.ok(elements(tree).some(node => node.props?.href === "/app"));
  assert.equal(state.reads, 0);
});

test("an auditor without works can open the page without a 404, but gets no invented grant", async () => {
  reset(); state.context.works = []; state.context.user.workModuleScopes = [];
  const tree = await NewReportPage();
  assert.deepEqual(elements(tree).find(node => node.type?.name === "StandaloneReportForm").props.works, []);
});

test("the selected work follows the create link and never grants an unauthorized work", async () => {
  reset();
  state.context.user.workModuleScopes.push({ workId: id(3), module: "quality" });
  const tree = await NewReportPage({ obra: id(3) });
  assert.equal(elements(tree).find(node => node.type?.name === "StandaloneReportForm").props.initialWorkId, id(3));
  for (const obra of [id(99), [id(2), id(3)], undefined]) {
    const fallback = await NewReportPage({ obra });
    assert.equal(elements(fallback).find(node => node.type?.name === "StandaloneReportForm").props.initialWorkId, id(2));
  }
});
