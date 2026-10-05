import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (["next/image", "next/link", "next/navigation"].includes(specifier)) return nextResolve(`${specifier}.js`, context);
    if (specifier === "@/app/follow-up/actions") return {
      url: `data:text/javascript,${encodeURIComponent('export async function readEngineeringWorkFindingsAction() { throw new Error("Server actions must not run during calendar rendering"); }')}`,
      shortCircuit: true,
    };
    const candidate = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2))
      : specifier.startsWith(".") && context.parentURL?.startsWith("file:") ? path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier) : null;
    if (candidate && !path.extname(candidate)) {
      for (const extension of [".ts", ".tsx"]) if (existsSync(candidate + extension)) return { url: pathToFileURL(candidate + extension).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/logo-dialogo.png")) return { format: "module", source: 'export default { src: "/logo-dialogo.png", width: 400, height: 200 }', shortCircuit: true };
    if (url.endsWith(".module.css")) return { format: "module", source: "export default new Proxy({}, {get:(_,key)=>String(key)})", shortCircuit: true };
    if (url.endsWith(".tsx")) return { format: "module", source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText, shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { VisitAgenda, VisitCard } = await import("../src/app/components/visit-agenda.tsx");
const { PrototypeDashboard } = await import("../src/app/components/prototype-workspace.tsx");
const { getSaoPauloToday } = await import("../src/domain/visit-calendar.ts");
const work = { id: "work", name: "Obra autorizada" };
const admin = { id: "admin", name: "Administrativo", role: "administrative", modules: ["quality"], workIds: [work.id], agendaWorkIds: [work.id], documentWorkIds: [] };
const auditor = { ...admin, id: "auditor", name: "Auditor", role: "quality-auditor" };
const engineer = { ...admin, id: "engineer", name: "Engenheiro", role: "engineering", activity: "site-team" };
const today = getSaoPauloToday();
const visits = Array.from({ length: 105 }, (_, index) => ({ id: `visit-${String(index).padStart(3, "0")}`, workId: work.id, module: "quality", kind: "audit", modelId: "quality-f175",
  auditorId: auditor.id, date: today, note: `Detalhe reservado ${index}`, createdBy: admin.id, createdAt: `${today}T12:00:00Z`, history: [], revision: 1, confirmationStatus: "pending_confirmation" }));
const action = async () => ({ status: "success", message: "Salvo" });
const base = { works: [work], users: [admin, auditor], visits, module: "quality", workId: work.id, available: true, onCreate: action, onDelete: action, onConfirm: action };
const render = (user, changes = {}) => renderToStaticMarkup(createElement(VisitAgenda, { ...base, ...changes, user }));

for (const user of [admin, auditor, engineer]) test(`${user.role}: cards are bounded but calendar totals remain complete`, () => {
  const html = render(user);
  assert.equal((html.match(/<article /g) ?? []).length, 20);
  assert.match(html, /1–20 de 105 visitas/);
  assert.match(html, /Página 1 de 6/);
  assert.match(html, /105 visitas agendadas/);
  assert.doesNotMatch(html, /Detalhe reservado|AGENDAMENTO ADMINISTRATIVO|Confirmar data|Excluir agendamento/);
  assert.equal((html.match(/<details[^>]* open=/g) ?? []).length, 0);
});

test("authorization and invalid dates are applied before list pagination and calendar totals", () => {
  const hidden = [
    { ...visits[0], id: "forbidden", workId: "another-work", auditorId: "another-auditor", note: "FORBIDDEN" },
    { ...visits[0], id: "bad-date", date: "2026-02-31", note: "INVALID" },
    { ...visits[0], id: "wrong-discipline", module: "safety", modelId: "security-it07-r02" },
  ];
  for (const user of [admin, auditor, engineer]) {
    const html = render(user, { visits: [...hidden, ...visits] });
    assert.match(html, /1–20 de 105 visitas/);
    assert.match(html, /105 visitas agendadas/);
    assert.doesNotMatch(html, /FORBIDDEN|INVALID/);
  }
});

test("admin calendar includes follow-ups from every authorized professional without selecting a filter", () => {
  const other = { ...auditor, id: "other-auditor", name: "Outro profissional" };
  const mixed = [visits[0], { ...visits[0], id: "follow-up", kind: "follow_up", modelId: null, auditorId: other.id },
    { ...visits[0], id: "hidden-follow-up", kind: "follow_up", modelId: null, workId: "forbidden-work", auditorId: "hidden" }];
  const html = render(admin, { visits: mixed, users: [admin, auditor, other] });
  assert.match(html, /2 visitas agendadas: (?:Auditor, Outro profissional|Outro profissional, Auditor)/);
  assert.doesNotMatch(html, /3 visitas agendadas/);
  const own = render(auditor, { visits: mixed, users: [admin, auditor, other] });
  assert.match(own, /1 visita agendada/);
  assert.doesNotMatch(own, /2 visitas agendadas/);
});

test("admin overview includes all visit kinds while engineering coordination keeps only audits", () => {
  const other = { ...auditor, id: "other-auditor", name: "Outro profissional" };
  const mixed = [visits[0], { ...visits[0], id: "follow-up", kind: "follow_up", modelId: null, auditorId: other.id }];
  const dashboard = (user) => renderToStaticMarkup(createElement(PrototypeDashboard, {
    user, module: "quality", works: [work], audits: [], visits: mixed,
    auditors: [auditor, other], activeAccountCount: null, open: () => {},
  }));
  assert.match(dashboard(admin), /2 visitas agendadas: (?:Auditor, Outro profissional|Outro profissional, Auditor)/);
  const coordination = dashboard({ ...engineer, activity: "coordination" });
  assert.match(coordination, /1 visita agendada/);
  assert.doesNotMatch(coordination, /2 visitas agendadas/);
});

test("short and empty lists do not show unnecessary page controls", () => {
  const short = render(auditor, { visits: visits.slice(0, 3) });
  assert.equal((short.match(/<article /g) ?? []).length, 3);
  assert.doesNotMatch(short, /Páginas de visitas agendadas/);
  const empty = render(auditor, { visits: [] });
  assert.equal((empty.match(/<article /g) ?? []).length, 0);
  assert.match(empty, /Nenhuma visita agendada para este auditor/);
  assert.doesNotMatch(empty, /Páginas de visitas agendadas/);
});

test("cards used elsewhere keep their initial open state and audit action", () => {
  const props = { ...base, user: auditor, visit: { ...visits[0], confirmationStatus: "confirmed" }, work, onStartAudit: async () => {} };
  const opened = renderToStaticMarkup(createElement(VisitCard, props));
  assert.match(opened, /<details[^>]* open=""/);
  assert.match(opened, /Detalhe reservado 0/);
  assert.match(opened, /Iniciar auditoria/);
  const collapsed = renderToStaticMarkup(createElement(VisitCard, { ...props, collapsedInitially: true }));
  assert.doesNotMatch(collapsed, /Detalhe reservado 0|Iniciar auditoria|AGENDAMENTO ADMINISTRATIVO/);
});
