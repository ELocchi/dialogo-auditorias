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
const stubs = {
  "next/link": "export default function Link(props){return props.children}",
  "next/navigation": "export const useRouter=()=>({refresh(){}});export function unstable_rethrow(){}",
  "@/app/administracao/usuarios/actions": "export const updateAccessAction=async()=>({});export const approveAccessAction=async()=>({})",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    if (specifier.endsWith(".css")) return { url: "data:text/javascript,export default {}", shortCircuit: true };
    if (specifier.startsWith("@/")) { const candidate=path.join(root,"src",specifier.slice(2)); return nextResolve(pathToFileURL(candidate+(existsSync(candidate+".tsx")?".tsx":".ts")).href,context); }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:") && !path.extname(specifier)) {
      const candidate=path.resolve(path.dirname(fileURLToPath(context.parentURL)),specifier);
      for(const ext of [".ts",".tsx"]) if(existsSync(candidate+ext)) return nextResolve(pathToFileURL(candidate+ext).href,context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".tsx")) return { format: "module", source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText, shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { EditUserDialog } = await import("../src/app/components/access/EditUserDialog.tsx");
const { PendingRequests } = await import("../src/app/components/access/PendingRequests.tsx");
const works = Array.from({ length: 21 }, (_, index) => ({ id: `work-${index}`, nome: `Obra ${index + 1}`, ativo: true }));
const profiles = ["AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"];
const users = Array.from({ length: 20 }, (_, index) => ({ id: `user-${index}`, name: `Usuário ${index + 1}` }));
const count = (html, tag) => (html.match(new RegExp(`<${tag}(?:\\s|>)`, "g")) ?? []).length;

test("twenty closed access editors render only their triggers, without replicated work selectors", () => {
  const html = renderToStaticMarkup(createElement("div", null, users.map((user) => createElement(EditUserDialog, {
    key: user.id, name: user.name, email: `${user.id}@example.invalid`, actorId: "actor", works,
    account: { auth_user_id: user.id, ativo: true, perfis: profiles, atuacao_administrativa: null,
      atuacao_engenharia: "COORDENACAO", atuacoes_engenharia: ["COORDENACAO"] },
    grants: profiles.flatMap((perfil) => works.flatMap((work) =>
      (perfil === "ENGENHARIA" ? ["QUALIDADE", "SEGURANCA"] : [perfil === "AUDITOR_QUALIDADE" ? "QUALIDADE" : "SEGURANCA"])
        .map((modulo) => ({ auth_user_id: user.id, perfil, obra_id: work.id, modulo })))),
  }))));
  assert.equal(count(html, "button"), 20);
  for (const tag of ["form", "dialog", "select", "option", "input"]) assert.equal(count(html, tag), 0, tag);
  assert.match(html, /Editar usuário Usuário 20/);
  assert.ok(Buffer.byteLength(html) < 12_000, "closed editors must not carry the hidden access forms");
});

test("closed approval cards preserve summaries while deferring all approval forms and confirmation dialogs", () => {
  const html = renderToStaticMarkup(createElement(PendingRequests, {
    requests: users.map((user) => ({ auth_user_id: user.id, nome: user.name, email: `${user.id}@example.invalid`,
      cargo_area_informado: "Engenharia", obra_referencia_informada: "Obra de referência",
      created_at: "2026-09-20T12:00:00Z", email_confirmado_em: "2026-09-20T12:00:00Z" })), works, actorId: "actor",
  }));
  assert.equal(count(html, "details"), 20);
  assert.equal(count(html, "summary"), 20);
  for (const tag of ["form", "dialog", "select", "option", "input"]) assert.equal(count(html, tag), 0, tag);
  assert.match(html, /Usuário 20/);
  assert.match(html, /user-19@example.invalid/);
  assert.ok(Buffer.byteLength(html) < 6_000, "closed approval cards must not carry hidden forms");
});

test("empty approval page retains its eligibility explanation without mounting forms", () => {
  const html = renderToStaticMarkup(createElement(PendingRequests, { requests: [], works, actorId: "actor" }));
  assert.match(html, /Não há solicitações com e-mail confirmado/);
  assert.equal(count(html, "form"), 0);
});
