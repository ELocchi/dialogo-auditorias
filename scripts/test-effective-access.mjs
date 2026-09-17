import assert from "node:assert/strict";
import test from "node:test";
import { effectiveDestination, readEffectiveAccount } from "../src/lib/auth/effective-access.ts";

const id = "d1a20000-0000-4000-8000-000000000001";
const otherId = "d1a20000-0000-4000-8000-000000000002";
const user = { id, email: "fixture.effective@dialogo.com.br", email_confirmed_at: "2026-09-13T12:00:00Z" };
const originalAccount = {
  auth_user_id: id, perfil: "ADMINISTRATIVO", perfis: ["ADMINISTRATIVO"], atuacao_engenharia: null, atuacoes_engenharia: [], atuacao_administrativa: "GERAL",
  ativo: true, approved_at: "2026-09-13T12:30:00Z",
};
const originalRequest = {
  auth_user_id: id, status_acesso: "APROVADO", email: user.email,
  email_confirmado_em: user.email_confirmed_at,
};

function fixture(options = {}) {
  const state = {
    account: structuredClone(originalAccount), request: structuredClone(originalRequest),
    active: true, accountError: null, requestError: null, activeError: null, scopeError: null, legacyAuthority: true,
    throwFrom: false, throwRpc: false, ...options,
  };
  const calls = [];
  const client = {
    from(table) {
      calls.push(["from", table]);
      if (state.throwFrom) throw new Error("synthetic provider failure");
      assert.ok(["access_accounts", "access_requests"].includes(table));
      let selected = "";
      return {
        select(columns) { selected = columns; return this; },
        eq(column, value) {
          assert.equal(column, "auth_user_id");
          assert.equal(value, id, "Each read must explicitly select the verified identity.");
          return this;
        },
        async maybeSingle() {
          if (table === "access_accounts" && selected === "atuacao_administrativa" && state.scopeError)
            return { data: null, error: state.scopeError };
          const key = table === "access_accounts" ? "account" : "request";
          return { data: state[key], error: state[`${key}Error`] };
        },
      };
    },
    async rpc(name) {
      calls.push(["rpc", name]);
      assert.ok(["is_current_access_active", "is_current_access_administrator"].includes(name));
      if (state.throwRpc) throw new Error("synthetic RPC transport failure");
      return name === "is_current_access_active" ? { data: state.active, error: state.activeError }
        : { data: state.legacyAuthority, error: null };
    },
  };
  return { state, calls, client };
}

test("A verified General administrator chooses which administrative view to enter", async () => {
  const { client, calls } = fixture();
  const account = await readEffectiveAccount(client, user);
  assert.deepEqual(account, originalAccount);
  assert.equal(effectiveDestination(account), "/escolher-perfil");
  assert.deepEqual(calls.filter(([type]) => type === "rpc"), [["rpc", "is_current_access_active"]]);
});
test("before B.14, only a database-confirmed existing administrator receives General activity", async () => {
  const legacy = fixture({ scopeError: { code: "42703" } });
  assert.equal((await readEffectiveAccount(legacy.client, user))?.atuacao_administrativa, "GERAL");
  assert.ok(legacy.calls.some(([kind, name]) => kind === "rpc" && name === "is_current_access_administrator"));
  assert.equal(await readEffectiveAccount(fixture({ scopeError: { code: "42703" }, legacyAuthority: false }).client, user), null);
  assert.equal(await readEffectiveAccount(fixture({ scopeError: { code: "PGRST500" } }).client, user), null);
});

test("Approved single auditor and engineering profiles enter their workspace", async () => {
  for (const [perfil, atuacao_engenharia] of [
    ["AUDITOR_SEGURANCA", null], ["AUDITOR_QUALIDADE", null],
    ["ENGENHARIA", "EQUIPE_OBRA"], ["ENGENHARIA", "COORDENACAO"],
  ]) {
    const { client } = fixture({ account: { ...originalAccount, perfil, perfis: [perfil], atuacao_engenharia, atuacoes_engenharia: atuacao_engenharia ? [atuacao_engenharia] : [] } });
    const account = await readEffectiveAccount(client, user);
    assert.equal(account?.perfil, perfil);
    assert.equal(effectiveDestination(account), "/app");
  }
});

test("All four authorized profiles require an explicit profile choice", async () => {
  const multiAccount = { ...originalAccount,
    perfis: ["ADMINISTRATIVO", "AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"],
    atuacao_engenharia: "COORDENACAO", atuacoes_engenharia: ["EQUIPE_OBRA", "COORDENACAO"],
  };
  const account = await readEffectiveAccount(fixture({ account: multiAccount }).client, user);
  assert.deepEqual(account, multiAccount);
  assert.equal(effectiveDestination(account), "/escolher-perfil");
});

test("Combined technical profiles never imply administration", async () => {
  const account = await readEffectiveAccount(fixture({ account: { ...originalAccount,
    perfil: "AUDITOR_SEGURANCA", perfis: ["AUDITOR_SEGURANCA", "ENGENHARIA"], atuacao_engenharia: "EQUIPE_OBRA", atuacoes_engenharia: ["EQUIPE_OBRA"],
  } }).client, { ...user, user_metadata: { perfis: ["ADMINISTRATIVO"] } });
  assert.deepEqual(account?.perfis, ["AUDITOR_SEGURANCA", "ENGENHARIA"]);
  assert.equal(effectiveDestination(account), "/escolher-perfil");
});

test("An Engineering-only account with both authorized scopes needs a view selection", async () => {
  const engineering = { ...originalAccount, perfil: "ENGENHARIA", perfis: ["ENGENHARIA"], atuacao_administrativa: null,
    atuacao_engenharia: "COORDENACAO", atuacoes_engenharia: ["EQUIPE_OBRA", "COORDENACAO"] };
  const account = await readEffectiveAccount(fixture({ account: engineering }).client, user);
  assert.deepEqual(account, engineering);
  assert.equal(effectiveDestination(account), "/escolher-perfil");
});

test("Missing, duplicate, unknown, unordered or incompatible Engineering scope arrays fail closed", async () => {
  for (const fields of [
    { atuacoes_engenharia: undefined }, { atuacoes_engenharia: null }, { atuacoes_engenharia: "COORDENACAO" },
    { atuacoes_engenharia: ["COORDENACAO"] },
    { perfis: ["ADMINISTRATIVO", "ENGENHARIA"], atuacao_engenharia: "COORDENACAO", atuacoes_engenharia: [] },
    { perfis: ["ADMINISTRATIVO", "ENGENHARIA"], atuacao_engenharia: "COORDENACAO", atuacoes_engenharia: ["EQUIPE_OBRA"] },
    { perfis: ["ADMINISTRATIVO", "ENGENHARIA"], atuacao_engenharia: "COORDENACAO", atuacoes_engenharia: ["COORDENACAO", "COORDENACAO"] },
    { perfis: ["ADMINISTRATIVO", "ENGENHARIA"], atuacao_engenharia: "COORDENACAO", atuacoes_engenharia: ["COORDENACAO", "EQUIPE_OBRA"] },
    { perfis: ["ADMINISTRATIVO", "ENGENHARIA"], atuacao_engenharia: "COORDENACAO", atuacoes_engenharia: ["SUPERADMIN", "COORDENACAO"] },
  ]) assert.equal(await readEffectiveAccount(fixture({ account: { ...originalAccount, ...fields } }).client, user), null);
});

test("Missing, duplicated, unknown, noncanonical, or conflicting profile sets fail closed", async () => {
  for (const fields of [
    { perfis: undefined }, { perfis: null }, { perfis: "ADMINISTRATIVO" }, { perfis: [] },
    { perfis: ["ADMINISTRATIVO", "ADMINISTRATIVO"] }, { perfis: ["SUPERADMIN"] },
    { perfis: ["AUDITOR_SEGURANCA"] },
    { perfis: ["AUDITOR_SEGURANCA", "ADMINISTRATIVO"] },
    { perfis: ["ADMINISTRATIVO", "ENGENHARIA"], atuacao_engenharia: null },
    { perfis: ["ADMINISTRATIVO", "ENGENHARIA"], atuacao_engenharia: "INVALIDA" },
    { perfis: ["ADMINISTRATIVO", "AUDITOR_SEGURANCA"], atuacao_engenharia: "COORDENACAO" },
  ]) assert.equal(await readEffectiveAccount(fixture({ account: { ...originalAccount, ...fields } }).client, user), null);
});

test("Missing verified identity, corporate email, or confirmation denies access before database reads", async () => {
  for (const unverified of [
    { ...user, id: "" }, { ...user, email: undefined },
    { ...user, email: "fixture@sub.dialogo.com.br" },
    { ...user, email: "fixture@dialogo.com.br.invalid" },
    { ...user, email_confirmed_at: undefined }, { ...user, email_confirmed_at: "" },
  ]) {
    const { client, calls } = fixture();
    assert.equal(await readEffectiveAccount(client, unverified), null);
    assert.equal(calls.length, 0);
  }
});

test("Both database records must belong to the verified identity", async () => {
  for (const options of [
    { account: { ...originalAccount, auth_user_id: otherId } },
    { request: { ...originalRequest, auth_user_id: otherId } },
    { request: { ...originalRequest, email: "another@dialogo.com.br" } },
  ]) assert.equal(await readEffectiveAccount(fixture(options).client, user), null);
  assert.ok(await readEffectiveAccount(fixture({ request: { ...originalRequest, email: user.email.toUpperCase() } }).client, user));
});

test("Pending, unconfirmed, inactive, missing, or malformed authorization records fail closed", async () => {
  const cases = [
    { account: null }, { request: null },
    { account: { ...originalAccount, ativo: false } },
    { account: { ...originalAccount, ativo: "true" } },
    { account: { ...originalAccount, approved_at: null } },
    { request: { ...originalRequest, status_acesso: "PENDENTE_APROVACAO" } },
    { request: { ...originalRequest, email_confirmado_em: null } },
    { request: { ...originalRequest, email: null } },
    { account: { ...originalAccount, perfil: "SUPERADMIN" } },
    { account: { ...originalAccount, perfil: "ENGENHARIA", atuacao_engenharia: null } },
    { account: { ...originalAccount, perfil: "ENGENHARIA", atuacao_engenharia: "ADMINISTRATIVO" } },
    { account: { ...originalAccount, atuacao_engenharia: "COORDENACAO" } },
  ];
  for (const options of cases) {
    const account = await readEffectiveAccount(fixture(options).client, user);
    assert.equal(account, null, JSON.stringify(options));
    assert.equal(effectiveDestination(account), "/aguardando-liberacao");
  }
});

test("Self-declared metadata cannot turn a pending request into an effective account", async () => {
  const forged = { ...user, user_metadata: { perfil: "ADMINISTRATIVO", role: "admin", ativo: true, status_acesso: "APROVADO" } };
  const { client } = fixture({ account: null, request: { ...originalRequest, status_acesso: "PENDENTE_APROVACAO" }, active: false });
  assert.equal(await readEffectiveAccount(client, forged), null);
});

test("Failed reads, missing authority RPC, and transport failures never grant access", async () => {
  for (const options of [
    { accountError: { message: "denied" } }, { requestError: { message: "unavailable" } },
    { activeError: { message: "schema missing" } }, { active: false }, { active: null },
    { active: "true" }, { throwFrom: true }, { throwRpc: true },
  ]) assert.equal(await readEffectiveAccount(fixture(options).client, user), null);
});

test("Every new server read observes account revocation and Auth bans even with the same session", async () => {
  const { client, state, calls } = fixture();
  assert.ok(await readEffectiveAccount(client, user));
  state.account.ativo = false;
  assert.equal(await readEffectiveAccount(client, user), null);
  state.account.ativo = true;
  assert.ok(await readEffectiveAccount(client, user));
  // The Auth-ban/database-state helper overrides otherwise valid account rows.
  state.active = false;
  assert.equal(await readEffectiveAccount(client, user), null);
  assert.equal(calls.filter(([type]) => type === "rpc").length, 4);
});
