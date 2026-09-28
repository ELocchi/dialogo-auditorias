import assert from "node:assert/strict";
import test from "node:test";
import { readEffectiveAccount } from "../src/lib/auth/effective-access.ts";
import { readSelectedWorkspace } from "../src/lib/access/workspace-service.ts";
import { buildWorkspaceContext } from "../src/lib/access/workspace-context.ts";
import { resolveActiveProfileContext, encodeActiveProfileChoice } from "../src/lib/auth/active-profile.ts";

const id = (n) => `d1b60000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = { id: id(1), email: "context.fixture@dialogo.com.br", email_confirmed_at: "2026-09-28T12:00:00Z" };
const account = { auth_user_id: user.id, perfil: "ADMINISTRATIVO",
  perfis: ["ADMINISTRATIVO", "AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"],
  atuacao_engenharia: "COORDENACAO", atuacoes_engenharia: ["EQUIPE_OBRA", "COORDENACAO"],
  atuacao_administrativa: "GERAL", ativo: true, approved_at: "2026-09-28T12:00:00Z" };
const identity = { id: user.id, name: "Pessoa autorizada", email: user.email };
const works = [2, 3].map((n) => ({ id: id(n), nome: `Obra ${n}`, ativo: true, cidade: "São Paulo", uf: "SP",
  logradouro: "Rua de teste", numero: "10", responsavel_tecnico: "Responsável", coordenacao: "Coordenação" }));
const selection = (profile = "AUDITOR_QUALIDADE", engineeringScope = null, administrativeScope = null) =>
  ({ user, account, profile, engineeringScope, administrativeScope });
function payload(selected) {
  const grants = selected.profile === "ADMINISTRATIVO" ? [] : works.map((work, i) => ({ perfil: selected.profile,
    obra_id: work.id, modulo: selected.profile === "AUDITOR_SEGURANCA" || (selected.profile === "ENGENHARIA" && i === 0) ? "SEGURANCA" : "QUALIDADE" }));
  return structuredClone({ identity, works, grants });
}
function fixture(data, error = null) {
  const calls = [];
  const state = { data, error };
  const client = { from() { throw new Error("No sequential table reads are allowed"); },
    async rpc(name, args) { calls.push({ name, args }); return { data: state.data, error: state.error }; } };
  return { client, state, calls };
}

test("all selected profiles and scopes use one exact RPC and preserve the previous presentation", async () => {
  for (const selected of [selection(), selection("AUDITOR_SEGURANCA"),
    selection("ENGENHARIA", "COORDENACAO"), selection("ENGENHARIA", "EQUIPE_OBRA"),
    ...["GERAL", "SEGURANCA", "QUALIDADE"].map((scope) => selection("ADMINISTRATIVO", null, scope))]) {
    const data = payload(selected), f = fixture(data);
    const actual = await readSelectedWorkspace(f.client, selected);
    assert.deepEqual(actual, buildWorkspaceContext({ ...selected, ...data }));
    assert.ok(actual);
    assert.deepEqual(f.calls, [{ name: "read_current_access_workspace", args: {
      p_profile: selected.profile, p_engineering_scope: selected.engineeringScope, p_administrative_scope: selected.administrativeScope,
    } }]);
  }
});

test("account plus selected workspace takes two data calls and isolates the selected profile", async () => {
  const selected = selection("ENGENHARIA", "COORDENACAO");
  const calls = [];
  const client = { async rpc(name, args) {
    calls.push({ name, args });
    return { error: null, data: name === "read_current_access_account" ? { account,
      request: { auth_user_id: user.id, status_acesso: "APROVADO", email: user.email, email_confirmado_em: user.email_confirmed_at } } : payload(selected) };
  } };
  const currentAccount = await readEffectiveAccount(client, user);
  const currentSelection = resolveActiveProfileContext(currentAccount, user.id,
    encodeActiveProfileChoice(user.id, selected.profile, selected.engineeringScope));
  const result = await readSelectedWorkspace(client, { user, account: currentAccount, ...currentSelection });
  assert.equal(calls.length, 2);
  assert.equal(result.profile, "ENGENHARIA");
  assert.deepEqual(result.user.workModuleScopes, [{ workId: id(2), module: "safety" }, { workId: id(3), module: "quality" }]);
  assert.equal(result.user.activity, "coordination");
});

test("invalid selections, foreign identities and ungranted scopes are denied before the RPC", async () => {
  for (const selected of [
    { ...selection(), user: { ...user, id: id(99) } },
    { ...selection(), user: { ...user, email: undefined } },
    { ...selection(), account: { ...account, ativo: false } },
    selection("UNKNOWN"), selection("AUDITOR_QUALIDADE", "COORDENACAO"),
    { ...selection("ENGENHARIA", "EQUIPE_OBRA"), account: { ...account, atuacoes_engenharia: ["COORDENACAO"] } },
    { ...selection("ADMINISTRATIVO", null, "GERAL"), account: { ...account, atuacao_administrativa: "QUALIDADE" } },
  ]) {
    const f = fixture(payload(selection()));
    assert.equal(await readSelectedWorkspace(f.client, selected), null);
    assert.equal(f.calls.length, 0);
  }
});

test("malformed, foreign or mixed-profile projections fail as a whole", async () => {
  for (const mutate of [
    (d) => { d.identity.id = id(99); }, (d) => { d.identity.email = "other@dialogo.com.br"; },
    (d) => { d.identity.name = ""; }, (d) => { delete d.identity; },
    (d) => { d.works.push(d.works[0]); }, (d) => { d.works[0].ativo = false; },
    (d) => { d.works[0].cidade = null; }, (d) => { d.grants.push(d.grants[0]); },
    (d) => { d.grants[0].perfil = "ENGENHARIA"; }, (d) => { d.grants[0].modulo = "SEGURANCA"; },
    (d) => { d.grants[0].obra_id = id(99); }, (d) => { d.grants = []; },
    (d) => { d.works = null; },
  ]) {
    const data = payload(selection()); mutate(data);
    assert.equal(await readSelectedWorkspace(fixture(data).client, selection()), null);
  }
  for (const data of [null, [], false, {}, "invalid"])
    assert.equal(await readSelectedWorkspace(fixture(data).client, selection()), null);
});

test("empty current scopes remain valid and administrative contexts accept only the authorized catalog", async () => {
  for (const selected of [selection(), selection("ADMINISTRATIVO", null, "QUALIDADE")]) {
    const empty = await readSelectedWorkspace(fixture({ identity, works: [], grants: [] }).client, selected);
    assert.deepEqual(empty.works, []);
    assert.deepEqual(empty.user.workIds, []);
  }
  const selected = selection("ADMINISTRATIVO", null, "QUALIDADE");
  const limited = await readSelectedWorkspace(fixture({ identity, works: [works[0]], grants: [] }).client, selected);
  assert.deepEqual(limited.user.workModuleScopes, [{ workId: id(2), module: "quality" }]);
  assert.equal(await readSelectedWorkspace(fixture(payload(selection())).client, selected), null);
});

test("large scopes are complete rather than silently capped at 400 grants or 1000 works", async () => {
  const selected = selection();
  const allWorks = Array.from({ length: 1100 }, (_, i) => ({ ...works[0], id: id(i + 10), nome: `Obra ${i}` }));
  const result = await readSelectedWorkspace(fixture({ identity, works: allWorks,
    grants: allWorks.map((w) => ({ perfil: selected.profile, obra_id: w.id, modulo: "QUALIDADE" })) }).client, selected);
  assert.equal(result.works.length, 1100);
  assert.equal(result.user.workModuleScopes.length, 1100);
});

test("every read checks current grants again and provider errors never reuse earlier authorization", async () => {
  const selected = selection(), f = fixture(payload(selected));
  assert.ok(await readSelectedWorkspace(f.client, selected));
  f.state.data = { identity, works: [], grants: [] };
  assert.deepEqual((await readSelectedWorkspace(f.client, selected)).works, []);
  f.state.error = { code: "42501" };
  assert.equal(await readSelectedWorkspace(f.client, selected), null);
  f.state.error = { code: "PGRST202" };
  assert.equal(await readSelectedWorkspace(f.client, selected), null);
  assert.equal(f.calls.length, 4);
  assert.equal(await readSelectedWorkspace({ rpc() { throw new Error("Offline"); } }, selected), null);
});
