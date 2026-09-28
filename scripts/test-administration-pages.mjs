import assert from "node:assert/strict";
import test from "node:test";
import { readAdministration, ADMINISTRATION_PAGE_SIZE } from "../src/lib/access/administration-service.ts";

const id = (n) => `d1b70000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const stamp = "2026-09-28T12:00:00Z";
const work = (n = 1) => ({ id: id(n + 10000), nome: `Obra ${n}`, ativo: true });
const request = (n = 1) => ({ auth_user_id: id(n), nome: `Pessoa ${n}`, email: `pessoa.${n}@dialogo.com.br`,
  cargo_area_informado: null, obra_referencia_informada: null, email_confirmado_em: stamp, created_at: stamp });
const account = (n = 1) => ({ auth_user_id: id(n), perfis: ["ENGENHARIA"], atuacao_engenharia: "COORDENACAO",
  atuacoes_engenharia: ["COORDENACAO"], atuacao_administrativa: null, ativo: true });
const grant = (n = 1, workNumber = 1) => ({ auth_user_id: id(n), perfil: "ENGENHARIA", obra_id: work(workNumber).id, modulo: "QUALIDADE" });
const decision = (n = 1, decisionNumber = n + 20000) => ({ id: id(decisionNumber), auth_user_id: id(n), decision_type: "APROVACAO",
  perfil: "ENGENHARIA", perfis: ["ENGENHARIA"], atuacao_engenharia: "COORDENACAO", atuacoes_engenharia: ["COORDENACAO"],
  atuacao_administrativa: null, request_snapshot: request(n), grants_snapshot: [{ perfil: "ENGENHARIA", obra_id: work().id, modulo: "QUALIDADE", obra_nome: work().nome }],
  before_access_snapshot: null, actor_snapshot: { auth_user_id: id(9000), nome: "Administrador", email: "administrador@dialogo.com.br" },
  reason: "Solicitação conferida e aprovada.", actor_auth_user_id: id(9000), actor_database_role: null, decided_at: stamp });
const user = (n = 1) => ({ account: account(n), decisions: [decision(n)], grants: [grant(n)] });
const pending = (total = 1, page = 1) => ({ view: "pending", page, pageSize: 20, total,
  requests: Array.from({ length: Math.max(0, Math.min(20, total - (page - 1) * 20)) }, (_, i) => request(i + (page - 1) * 20 + 1)), works: [work()] });
const history = (total = 1, page = 1) => ({ view: "history", page, pageSize: 20, total,
  users: Array.from({ length: Math.max(0, Math.min(20, total - (page - 1) * 20)) }, (_, i) => user(i + (page - 1) * 20 + 1)), works: [work()] });
function fixture(data, error = null) {
  const state = { data, error }, calls = [];
  return { state, calls, client: {
    from() { throw new Error("Administration reads must not fetch unrelated tables"); },
    async rpc(name, args) { calls.push({ name, args }); return state; },
  } };
}

test("summary, pending and history request just their view using one database snapshot", async () => {
  assert.equal(ADMINISTRATION_PAGE_SIZE, 20);
  for (const data of [{ view: "summary", pendingCount: 14, activeCount: 25 }, pending(24, 2), history(41, 3)]) {
    const f = fixture(data);
    assert.deepEqual(await readAdministration(f.client, data.view, data.page), data);
    assert.deepEqual(f.calls, [{ name: "read_access_administration_page", args: { p_view: data.view, p_page: data.page ?? 1 } }]);
  }
});

test("summary never exposes unrelated user or work payloads returned by a provider", async () => {
  const data = { view: "summary", pendingCount: 0, activeCount: 1, works: [work()], users: [user()] };
  assert.deepEqual(await readAdministration(fixture(data).client, "summary"), { view: "summary", pendingCount: 0, activeCount: 1 });
});

test("empty and out of range pages retain valid counts and the full works catalog", async () => {
  for (const data of [pending(0), pending(20, 2), pending(5, 999999), history(0), history(21, 3), history(100, 999999)]) {
    assert.deepEqual(await readAdministration(fixture(data).client, data.view, data.page), data);
  }
});

test("invalid requested views and pages are rejected without any provider call", async () => {
  const f = fixture(pending());
  for (const [view, page] of [["all", 1], [null, 1], ["pending", 0], ["history", -1], ["summary", 1.5], ["pending", NaN], ["pending", Infinity], ["history", 1000000], ["pending", "1"]])
    assert.equal(await readAdministration(f.client, view, page), null);
  assert.equal(f.calls.length, 0);
});

test("invalid envelopes, counts and incomplete or duplicated pages fail closed", async () => {
  for (const data of [null, false, [], {}, "bad", { view: "summary", pendingCount: 0, activeCount: -1 },
    { view: "summary", pendingCount: "0", activeCount: 2 }, { view: "summary", pendingCount: 1.5, activeCount: 2 },
    { view: "summary", pendingCount: 0, activeCount: Number.MAX_SAFE_INTEGER + 1 }])
    assert.equal(await readAdministration(fixture(data).client, "summary"), null);
  for (const make of [pending, history]) for (const mutate of [
    (d) => { d.view = "summary"; }, (d) => { d.page = 2; }, (d) => { d.pageSize = 10; },
    (d) => { d.total = -1; }, (d) => { d.total = "1"; }, (d) => { d.total = 1.5; },
    (d) => { d.total = 2; }, (d) => { d.total = 0; },
    (d) => { d.works = null; }, (d) => { d.works.push(d.works[0]); },
    (d) => { d.works[0].ativo = false; }, (d) => { d.works[0].id = "bad"; }, (d) => { d.works[0].nome = null; },
    (d) => { const key = d.view === "pending" ? "requests" : "users"; d[key].push(d[key][0]); d.total = 2; },
    (d) => { const key = d.view === "pending" ? "requests" : "users"; d[key] = []; },
  ]) {
    const data = make(), view = data.view; mutate(data);
    assert.equal(await readAdministration(fixture(data).client, view), null, `${view}: ${mutate}`);
  }
});

test("pending requests must have their confirmed identity and renderable fields", async () => {
  for (const mutate of [
    (r) => { r.auth_user_id = "bad"; }, (r) => { r.nome = null; }, (r) => { r.email = ""; },
    (r) => { r.email_confirmado_em = null; }, (r) => { r.created_at = "bad"; },
    (r) => { r.cargo_area_informado = {}; }, (r) => { delete r.obra_referencia_informada; },
  ]) {
    const data = pending(); mutate(data.requests[0]);
    assert.equal(await readAdministration(fixture(data).client, "pending"), null);
  }
});

test("foreign decisions, grants and target snapshots invalidate the complete user page", async () => {
  for (const mutate of [
    (u) => { u.decisions[0].auth_user_id = id(99); }, (u) => { u.grants[0].auth_user_id = id(99); },
    (u) => { u.decisions[0].request_snapshot.auth_user_id = id(99); },
    (u) => { u.decisions[0].before_access_snapshot = { account: { auth_user_id: id(99) }, grants: [] }; },
    (u) => { u.decisions.push(u.decisions[0]); }, (u) => { u.grants.push(u.grants[0]); },
    (u) => { u.account.perfis = ["UNKNOWN"]; }, (u) => { u.account.atuacoes_engenharia = "COORDENACAO"; },
    (u) => { u.account.ativo = null; }, (u) => { u.grants[0].perfil = "ADMINISTRATIVO"; },
    (u) => { u.grants[0].modulo = "TODOS"; }, (u) => { u.decisions[0].request_snapshot = []; },
    (u) => { u.decisions[0].request_snapshot.nome = {}; }, (u) => { u.decisions[0].actor_snapshot = null; },
    (u) => { u.decisions[0].grants_snapshot = {}; }, (u) => { u.decisions[0].decided_at = "bad"; },
    (u) => { u.decisions[0].before_access_snapshot = { account: {}, grants: {} }; },
  ]) {
    const data = history(); mutate(data.users[0]);
    assert.equal(await readAdministration(fixture(data).client, "history"), null, String(mutate));
  }
  const data = history(2); data.users[1].decisions[0].id = data.users[0].decisions[0].id;
  assert.equal(await readAdministration(fixture(data).client, "history"), null);
});

test("legacy immutable decisions and inactive-work grants retain their original shapes", async () => {
  const data = history();
  const row = data.users[0];
  row.account.ativo = false;
  row.grants.push({ ...grant(1, 99), perfil: "AUDITOR_SEGURANCA", modulo: "SEGURANCA" });
  const legacy = row.decisions[0];
  legacy.perfis = null; legacy.atuacoes_engenharia = null; legacy.atuacao_administrativa = null;
  legacy.request_snapshot = {};
  legacy.actor_auth_user_id = null; legacy.actor_database_role = "postgres";
  legacy.actor_snapshot = { database_session_user: "postgres", application_name: null };
  legacy.decision_type = "AJUSTE_PERFIS_INICIAL";
  legacy.before_access_snapshot = { account: { perfil: "ENGENHARIA" }, grants: [{ obra_id: work().id, modulo: "QUALIDADE" }] };
  delete legacy.grants_snapshot[0].perfil;
  assert.deepEqual(await readAdministration(fixture(data).client, "history"), data);
});

test("edit snapshots retain administrative scopes and require safe fields for the change description", async () => {
  const data = history();
  const edit = data.users[0].decisions[0];
  edit.decision_type = "EDICAO_USUARIO";
  edit.atuacao_administrativa = "QUALIDADE";
  edit.before_access_snapshot = { account: { ...account(), perfil: "ENGENHARIA" }, grants: [grant()] };
  edit.request_snapshot.access_edit = { ativo: true, perfis: ["ADMINISTRATIVO", "ENGENHARIA"], atuacoes_engenharia: ["COORDENACAO"], atuacao_administrativa: "QUALIDADE" };
  assert.deepEqual(await readAdministration(fixture(data).client, "history"), data);
  for (const mutate of [
    (d) => { d.request_snapshot.access_edit.perfis = null; },
    (d) => { d.request_snapshot.access_edit.atuacoes_engenharia = {}; },
    (d) => { d.before_access_snapshot.account.perfis = undefined; },
    (d) => { d.before_access_snapshot.account.atuacoes_engenharia = "COORDENACAO"; },
  ]) {
    const malformed = structuredClone(data); mutate(malformed.users[0].decisions[0]);
    assert.equal(await readAdministration(fixture(malformed).client, "history"), null);
  }
});

test("selected user history and active works remain complete beyond 1000 records", async () => {
  const data = history();
  data.works = Array.from({ length: 1100 }, (_, i) => work(i + 1));
  data.users[0].decisions = Array.from({ length: 1200 }, (_, i) => decision(1, i + 30000));
  data.users[0].grants = Array.from({ length: 1100 }, (_, i) => grant(1, i + 1));
  const f = fixture(data), result = await readAdministration(f.client, "history");
  assert.deepEqual(result, data);
  assert.equal(result.works.length, 1100);
  assert.equal(result.users[0].decisions.length, 1200);
  assert.equal(result.users[0].grants.length, 1100);
  assert.equal(f.calls.length, 1);
});

test("every call revalidates current authorization and errors never reuse a previous page", async () => {
  const f = fixture(history());
  assert.ok(await readAdministration(f.client, "history"));
  f.state.data = history(0);
  assert.equal((await readAdministration(f.client, "history")).total, 0);
  for (const code of ["42501", "PGRST202", "network_error"]) {
    f.state.error = { code };
    assert.equal(await readAdministration(f.client, "history"), null);
  }
  assert.equal(f.calls.length, 5);
  assert.equal(await readAdministration({ rpc() { throw new Error("Offline"); } }, "pending"), null);
});
