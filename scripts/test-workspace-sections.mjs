import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { workspaceEntryScreen, workspaceResources } from "../src/lib/access/workspace-resources.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditId = "a1000000-0000-4000-8000-000000000001";
let state;
function reset(profile = "AUDITOR_QUALIDADE", scope = null) {
  state = { calls: [], context: { profile, engineeringScope: profile === "ENGENHARIA" ? scope : null,
    administrativeScope: profile === "ADMINISTRATIVO" ? scope : null, works: [], user: { id: "user" } },
    agenda: { available: true, visits: [{ id: "visit", date: "2026-09-28" }], auditors: [], notifications: [] },
    dashboard: { available: true, publishedCount: 18 },
    audits: { available: true, audits: [{ id: auditId }], responses: {}, criteriaSnapshots: {} } };
  globalThis.__workspaceSections = state;
  process.env.NODE_ENV = "production";
}
const stubs = {
  "next/link": "export default function Link(){}",
  "@/lib/auth/session": "export async function requireActiveProfile(){return {user:{id:'user'},profile:globalThis.__workspaceSections.context?.profile}}",
  "@/lib/access/workspace": "export async function readWorkspaceContext(){return globalThis.__workspaceSections.context}",
  "@/app/components/prototype-app": "export function PrototypeApp(){}",
  "@/app/components/auth/AuthShell": "export function AuthShell(){}",
  "@/app/components/auth/LogoutButton": "export function LogoutButton(){}",
  "@/lib/supabase/server": "export async function createClient(){return {}}",
  "@/lib/agenda/service": "export async function readAgendaSnapshot(){const s=globalThis.__workspaceSections;s.calls.push('agenda');return s.agenda}",
  "@/lib/audits/dashboard-service": "export async function readAuditDashboard(){const s=globalThis.__workspaceSections;s.calls.push('dashboard');return s.dashboard}",
  "@/lib/audits/service": "export async function readPublishedAuditOverview(){const s=globalThis.__workspaceSections;s.calls.push('preview');return s.audits}",
  "@/lib/audits/history-service": "export async function readPublishedAuditHistory(client,context,query){const s=globalThis.__workspaceSections;s.calls.push({history:query});return s.audits}",
  "@/lib/access/account-count": "export async function countActiveAccounts(){globalThis.__workspaceSections.calls.push('accounts');return 21}",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
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
const { default: OperationalPage } = await import("../src/app/app/[[...path]]/page.tsx");
const page = (query = {}) => OperationalPage({ searchParams: Promise.resolve(query) });

test("opening Works loads neither agenda nor dashboard and keeps remote history enabled", async () => {
  for (const [profile, scope] of [["AUDITOR_QUALIDADE", null], ["AUDITOR_SEGURANCA", null], ["ENGENHARIA", "EQUIPE_OBRA"], ["ENGENHARIA", "COORDENACAO"], ["ADMINISTRATIVO", "QUALIDADE"]]) {
    reset(profile, scope);
    const { props } = await page({ secao: "obras" });
    assert.deepEqual(state.calls, []); assert.equal(props.initialScreen, "works");
    assert.equal(props.initialAgenda, undefined); assert.equal(props.initialDashboard, undefined);
    assert.equal(props.remoteAudits, true); assert.deepEqual(props.initialAudits.audits, []);
  }
});

test("overview hydrates its complete calendar and aggregate, without fetching history", async () => {
  reset(); const { props } = await page();
  assert.deepEqual(state.calls, ["agenda", "dashboard"]);
  assert.equal(props.initialAgenda, state.agenda); assert.equal(props.initialDashboard, state.dashboard);
});

test("agenda, auditor history and follow-up hydrate only agenda and preserve deep links", async () => {
  for (const [secao, screen] of [["agenda", "agenda"], ["auditorias", "audits"], ["acompanhamento", "follow_up"], ["relatorios", "audits"]]) {
    reset(); const { props } = await page({ secao, visita: "target-visit" });
    assert.deepEqual(state.calls, secao === "acompanhamento" ? [] : ["agenda"]); assert.equal(props.initialScreen, screen);
    assert.equal(props.initialVisitId, "target-visit"); assert.equal(props.remoteAudits, true);
  }
});

test("coordination never opens the removed agenda or reports tabs", async () => {
  for (const secao of ["agenda", "relatorios", "auditorias"]) {
    reset("ENGENHARIA", "COORDENACAO"); const { props } = await page({ secao });
    assert.equal(props.initialScreen, "overview"); assert.deepEqual(state.calls, ["agenda", "dashboard"]);
  }
});

test("administration opens reports or settings without agenda or dashboard", async () => {
  reset("ADMINISTRATIVO", "GERAL"); const reports = await page({ secao: "relatorios" });
  assert.equal(reports.props.initialScreen, "report"); assert.deepEqual(state.calls, ["accounts"]);
  reset("ADMINISTRATIVO", "GERAL"); const settings = await page({ secao: "administracao" });
  assert.equal(settings.props.initialScreen, "settings"); assert.deepEqual(state.calls, ["accounts"]);
});

test("action-plan deep link retains its exact publication read and invalid IDs do not query history", async () => {
  reset("ENGENHARIA", "EQUIPE_OBRA"); const { props } = await page({ secao: "obras", plano: auditId });
  assert.equal(props.initialScreen, "action_plan"); assert.equal(props.initialActionPlanAuditId, auditId);
  assert.deepEqual(state.calls, ["agenda", { history: { auditId, pageSize: 1, includeFindings: false } }]);
  assert.equal(props.initialAudits.audits[0].id, auditId);
  reset(); await page({ secao: "obras", plano: "invalid" }); assert.deepEqual(state.calls, []);
});

test("development preview remains local and production query failures retain unavailable state", async () => {
  reset(); process.env.NODE_ENV = "development";
  const preview = await page({ secao: "obras" });
  assert.deepEqual(state.calls, ["preview"]); assert.equal(preview.props.remoteAudits, false);
  assert.equal(preview.props.initialAudits, state.audits);
  reset(); state.agenda.available = false; state.dashboard.available = false;
  const failed = await page(); assert.equal(failed.props.initialAgenda.available, false);
  assert.equal(failed.props.initialDashboard.available, false); assert.equal(failed.props.remoteAudits, true);
});

test("missing workspace never loads operational data", async () => {
  reset(); state.context = null; const tree = await page();
  assert.equal(tree.type.name, "AuthShell"); assert.deepEqual(state.calls, []);
});

test("section resources preserve calendar-dependent engineering flows and skip unrelated sections", () => {
  for (const screen of ["overview", "engineering_quality", "engineering_safety"]) assert.deepEqual(workspaceResources(screen), { agenda: true, dashboard: true });
  for (const screen of ["agenda", "audits", "fill", "audit_review"]) assert.deepEqual(workspaceResources(screen), { agenda: true, dashboard: false });
  for (const screen of ["follow_up", "works", "settings", "criteria", "report", "engineering_coordination"]) assert.deepEqual(workspaceResources(screen), { agenda: false, dashboard: false });
  assert.equal(workspaceEntryScreen("agenda", "ENGENHARIA", "EQUIPE_OBRA", null), "agenda");
  assert.equal(workspaceEntryScreen("administracao", "AUDITOR_QUALIDADE", null, null), "overview");
});
