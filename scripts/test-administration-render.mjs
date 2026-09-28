import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let state;
const stubs = {
  "next/link": "import {createElement} from 'react';export default function Link(props){return createElement('a',props)}",
  "@/lib/auth/session": "export async function requireAdministrator(){const s=globalThis.__administrationRender;if(s.denied)throw Error('DENIED');return {id:'actor'}}",
  "@/lib/supabase/server": "export async function createClient(){return {}}",
  "@/lib/access/administration-service": "export async function readAdministration(client,view,page){const s=globalThis.__administrationRender;s.reads.push({view,page});return s.data}",
  "@/app/components/access/PendingRequests": "export function PendingRequests(props){globalThis.__administrationRender.pending=props;return null}",
  "@/app/components/access/EditUserDialog": "export function EditUserDialog(props){globalThis.__administrationRender.editors.push(props);return null}",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "react" && context.parentURL?.startsWith("data:")) return nextResolve(specifier, { ...context, parentURL: import.meta.url });
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
const { AccessAdministration } = await import("../src/app/components/access/AccessAdministration.tsx");
function reset(data) {
  state = { data, reads: [], editors: [], pending: null, denied: false };
  globalThis.__administrationRender = state;
  process.env.NODE_ENV = "production";
}
const render = async (props = {}) => renderToStaticMarkup(await AccessAdministration(props));

test("administration landing requests counts only and retains links", async () => {
  reset({ view: "summary", pendingCount: 24, activeCount: 1032 });
  const html = await render();
  assert.deepEqual(state.reads, [{ view: "summary", page: 1 }]);
  assert.match(html, /24 aprovações pendentes/);
  assert.match(html, /1032 contas ativas/);
  assert.match(html, /href="\/administracao\/usuarios\/pendentes"/);
  assert.match(html, /href="\/administracao\/usuarios\/historico"/);
  assert.equal(state.pending, null);
  assert.deepEqual(state.editors, []);
});

test("pending page uses its server page and complete work choices without reading history", async () => {
  const requests = [{ auth_user_id: "last-request", nome: "Solicitação da página dois" }];
  const works = Array.from({ length: 1003 }, (_, index) => ({ id: `work-${index}`, nome: `Obra ${index}`, ativo: true }));
  reset({ view: "pending", page: 2, pageSize: 20, total: 21, requests, works });
  const html = await render({ pendingOnly: true, pendingPage: 2 });
  assert.deepEqual(state.reads, [{ view: "pending", page: 2 }]);
  assert.equal(state.pending.requests, requests);
  assert.equal(state.pending.works, works);
  assert.equal(state.pending.actorId, "actor");
  assert.deepEqual(state.pending.previewIds, []);
  assert.match(html, /Página 2 de 2 · 21 registros/);
  assert.match(html, /pendentes=1#pending-heading/);
  assert.deepEqual(state.editors, []);
});

test("history page is not sliced a second time and preserves account, scope and legacy history display", async () => {
  const account = { auth_user_id: "user-21", perfis: ["ADMINISTRATIVO"], atuacao_engenharia: null, atuacoes_engenharia: [], atuacao_administrativa: "QUALIDADE", ativo: false };
  const decisions = [{ id: "decision", auth_user_id: "user-21", decision_type: "APROVACAO", perfil: "ADMINISTRATIVO", perfis: null,
    atuacao_administrativa: "QUALIDADE", request_snapshot: { nome: "Usuário da página dois", email: "fixture@example.invalid" },
    grants_snapshot: [], before_access_snapshot: null, actor_snapshot: { nome: "Responsável anterior" }, decided_at: "2026-09-28T12:00:00Z" }];
  const grants = [{ auth_user_id: "user-21", perfil: "ENGENHARIA", obra_id: "old-inactive-work", modulo: "QUALIDADE" }];
  reset({ view: "history", page: 2, pageSize: 20, total: 21, users: [{ account, decisions, grants }], works: [] });
  const html = await render({ historyOnly: true, historyPage: 2 });
  assert.deepEqual(state.reads, [{ view: "history", page: 2 }]);
  assert.match(html, /<summary><strong>Fixture<\/strong><\/summary>/);
  assert.match(html, /Inativo/);
  assert.match(html, /Solicitação aprovada: Administrativo de Qualidade/);
  assert.match(html, /Responsável anterior/);
  assert.match(html, /Página 2 de 2 · 21 registros/);
  assert.equal(state.editors.length, 1);
  assert.equal(state.editors[0].account, account);
  assert.equal(state.editors[0].grants, grants);
});

test("unavailable views retain their retry page and never render mutation forms", async () => {
  for (const [props, href] of [
    [{ pendingOnly: true, pendingPage: 3 }, "/administracao/usuarios/pendentes?pendentes=3"],
    [{ historyOnly: true, historyPage: 4 }, "/administracao/usuarios/historico?historico=4"],
    [{ embedded: true }, "/app?secao=administracao"],
  ]) {
    reset(null);
    const html = await render(props);
    assert.match(html, /role="alert"/);
    assert.ok(html.includes(`href="${href}"`));
    assert.equal(state.pending, null);
    assert.deepEqual(state.editors, []);
  }
});

test("unauthorized rendering does not load any administrative page", async () => {
  reset(null); state.denied = true;
  await assert.rejects(render({ historyOnly: true }), /DENIED/);
  assert.deepEqual(state.reads, []);
});
