import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { activeProfileCookieName, encodeActiveProfileChoice } from "../src/lib/auth/active-profile.ts";
import { readAccessSummary } from "../src/lib/access/summary-service.ts";
import { loadAccessSummary } from "../src/lib/access/summary-client.ts";

// Exercise the actual session/active-profile guards, GET handler and count-only
// service with offline Auth/PostgREST adapters. No network, files with secrets,
// real accounts, rows, history or grants are read by these fixtures.
const userId = "d1a80000-0000-4000-8000-000000000001";
const otherId = "d1a80000-0000-4000-8000-000000000002";
const unavailable = { available: false, pendingCount: null, activeCount: null };
let state;
function reset(profile = "ADMINISTRATIVO", administrativeScope = "GERAL", engineeringScope = null) {
  if (profile !== "ADMINISTRATIVO") administrativeScope = null;
  state = {
    user: { id: userId, email: "summary.fixture@dialogo.com.br", email_confirmed_at: "2026-09-14T12:00:00Z" },
    account: { auth_user_id: userId, perfil: "ADMINISTRATIVO",
      perfis: ["ADMINISTRATIVO", "AUDITOR_QUALIDADE", "ENGENHARIA"], atuacao_engenharia: "EQUIPE_OBRA",
      atuacoes_engenharia: ["EQUIPE_OBRA", "COORDENACAO"], atuacao_administrativa: "GERAL", ativo: true, approved_at: "2026-09-14T12:00:00Z" },
    status: "APROVADO", active: true, authority: true, authError: null,
    cookieValues: [{ value: encodeActiveProfileChoice(userId, profile, engineeringScope, administrativeScope) }],
    actor: { userId, profile, engineeringScope, administrativeScope },
    pendingCount: 3, activeCount: 7, queryError: null, authorityError: null,
    countReads: [], authorityChecks: 0, clients: [],
  };
  state.cookieStore = { getAll(name) { assert.equal(name, activeProfileCookieName); return state.cookieValues; } };
  state.client = {
    auth: { async getUser() { return { data: { user: state.user }, error: state.authError }; } },
    async rpc(name) {
      if (name === "read_current_access_account") return { data: state.active === true ? { account: state.account,
        request: { auth_user_id: userId, status_acesso: state.status, email: state.user?.email,
          email_confirmado_em: state.user?.email_confirmed_at } } : null, error: null };
      assert.equal(name, "is_current_access_administrator", "Only authority is checked; history is never loaded");
      state.authorityChecks += 1;
      return { data: state.authority, error: state.authorityError };
    },
    from(table) {
      assert.ok(["access_requests", "access_accounts"].includes(table), "No work, history, or grants query");
      const record = { table, filters: [], columns: null, options: null };
      return {
        select(columns, options) {
          record.columns = columns; record.options = options;
          if (options) state.countReads.push(record);
          return this;
        },
        eq(column, value) { record.filters.push(["eq", column, value]); return this; },
        not(column, operator, value) { record.filters.push(["not", column, operator, value]); return this; },
        async maybeSingle() { return { data: table === "access_accounts" ? state.account : {
          auth_user_id: userId, status_acesso: state.status, email: state.user?.email,
          email_confirmado_em: state.user?.email_confirmed_at,
        }, error: null }; },
        then(resolve, reject) {
          assert.equal(record.columns, "auth_user_id");
          assert.deepEqual(record.options, { count: "exact", head: true }, "Counts must not download rows");
          return Promise.resolve({ data: null, count: table === "access_requests" ? state.pendingCount : state.activeCount,
            error: state.queryError }).then(resolve, reject);
        },
      };
    },
  };
  globalThis.__accessSummaryFixture = state;
}
const stubModules = {
  "server-only": "export {};",
  "next/headers": "export async function cookies() { return globalThis.__accessSummaryFixture.cookieStore; }",
  "next/navigation": "export function redirect(destination) { throw Object.assign(new Error('redirect'), { destination }); }",
  "supabase/server": "export async function createClient(options) { const s = globalThis.__accessSummaryFixture; s.clients.push(options); return s.client; }",
};
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({ resolve(specifier, context, nextResolve) {
  const key = specifier.endsWith("supabase/server") || specifier.endsWith("supabase/server.ts") ? "supabase/server" : specifier;
  if (Object.hasOwn(stubModules, key)) return { url: `data:text/javascript,${encodeURIComponent(stubModules[key])}`, shortCircuit: true };
  if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(projectRoot, "src", `${specifier.slice(2)}.ts`)).href, context);
  return nextResolve(specifier, context);
} });
const { GET, dynamic } = await import("../src/app/api/access/summary/route.ts");
function request(overrides = {}, identity = true) {
  const url = new URL("https://offline.invalid/api/access/summary");
  if (identity) for (const [key, value] of Object.entries({ usuario: userId, perfil: state.actor.profile,
    atuacao: state.actor.engineeringScope ?? "", administrativo: state.actor.administrativeScope ?? "", ...overrides }))
    url.searchParams.set(key, value);
  return new Request(url);
}
async function assertResponse(response, status, body = unavailable) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Cookie");
  assert.deepEqual(await response.json(), body);
}

test("anonymous, pending, revoked or unselected sessions never execute aggregate queries", async () => {
  assert.equal(dynamic, "force-dynamic");
  for (const [change, status] of [
    [(s) => { s.user = null; }, 401],
    [(s) => { s.authError = { message: "Auth unavailable" }; }, 401],
    [(s) => { s.status = "PENDENTE_APROVACAO"; }, 403],
    [(s) => { s.active = false; }, 403],
    [(s) => { s.account.ativo = false; }, 403],
    [(s) => { s.account.atuacao_administrativa = "QUALIDADE"; }, 403],
    [(s) => { s.account.perfis = ["ENGENHARIA"]; }, 403],
    [(s) => { s.cookieValues = []; }, 403],
  ]) {
    reset(); change(state);
    await assertResponse(await GET(request()), status);
    assert.equal(state.countReads.length, 0);
    assert.equal(state.authorityChecks, 0);
  }
});

test("selected profile must be General Administration even when account owns several profiles", async () => {
  for (const selection of [["ADMINISTRATIVO", "QUALIDADE"], ["ADMINISTRATIVO", "SEGURANCA"],
    ["AUDITOR_QUALIDADE", null], ["ENGENHARIA", null, "EQUIPE_OBRA"], ["ENGENHARIA", null, "COORDENACAO"]]) {
    reset(...selection);
    await assertResponse(await GET(request()), 403);
    assert.equal(state.countReads.length, 0);
    assert.equal(state.authorityChecks, 0);
  }
});

test("stale user, profile, Engineering scope or Administrative scope causes no aggregate queries", async () => {
  for (const mismatch of [{ usuario: otherId }, { perfil: "AUDITOR_QUALIDADE" }, { atuacao: "COORDENACAO" }, { administrativo: "QUALIDADE" }]) {
    reset(); await assertResponse(await GET(request(mismatch)), 403);
    assert.equal(state.countReads.length, 0);
    assert.equal(state.authorityChecks, 0);
  }
});

test("database administrator authority is required before either aggregate is read", async () => {
  for (const change of [(s) => { s.authority = false; }, (s) => { s.authorityError = { message: "Database unavailable" }; }]) {
    reset(); change(state);
    assert.deepEqual(await readAccessSummary(state.client), unavailable);
    assert.equal(state.authorityChecks, 1);
    assert.equal(state.countReads.length, 0);
  }
});

test("valid request uses exactly two HEAD counts with the correct confirmation and active filters", async () => {
  reset();
  await assertResponse(await GET(request()), 200, { available: true, pendingCount: 3, activeCount: 7 });
  assert.equal(state.authorityChecks, 1);
  assert.deepEqual(state.countReads, [
    { table: "access_requests", columns: "auth_user_id", options: { count: "exact", head: true },
      filters: [["eq", "status_acesso", "PENDENTE_APROVACAO"], ["not", "email_confirmado_em", "is", null]] },
    { table: "access_accounts", columns: "auth_user_id", options: { count: "exact", head: true }, filters: [["eq", "ativo", true]] },
  ]);
});

test("session cookie supplies authority when optional display identity is omitted", async () => {
  reset();
  await assertResponse(await GET(request({}, false)), 200, { available: true, pendingCount: 3, activeCount: 7 });
  assert.equal(state.countReads.length, 2);
});

test("missing or invalid counts and provider failure stay unavailable rather than becoming zero", async () => {
  for (const change of [(s) => { s.pendingCount = null; }, (s) => { s.activeCount = -1; },
    (s) => { s.pendingCount = 1.5; }, (s) => { s.queryError = { message: "Unavailable" }; }]) {
    reset(); change(state);
    await assertResponse(await GET(request()), 503);
  }
  reset(); state.activeCount = 0; state.pendingCount = 0;
  await assertResponse(await GET(request()), 200, { available: true, pendingCount: 0, activeCount: 0 });
});

test("client sends current identity and bypasses cache on every mount/retry", async () => {
  reset();
  const controller = new AbortController();
  let calls = 0;
  const signals = [];
  const fetcher = async (url, options) => {
    calls += 1;
    const parsed = new URL(url, "https://offline.invalid");
    assert.equal(parsed.pathname, "/api/access/summary");
    assert.equal(parsed.searchParams.get("usuario"), userId);
    assert.equal(parsed.searchParams.get("perfil"), "ADMINISTRATIVO");
    assert.equal(parsed.searchParams.get("atuacao"), "");
    assert.equal(parsed.searchParams.get("administrativo"), "GERAL");
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "same-origin");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    signals.push(options.signal);
    return Response.json({ available: true, pendingCount: calls, activeCount: 7, accounts: ["must not cross boundary"] });
  };
  assert.deepEqual(await loadAccessSummary(state.actor, controller.signal, fetcher), { available: true, pendingCount: 1, activeCount: 7 });
  assert.deepEqual(await loadAccessSummary(state.actor, controller.signal, fetcher), { available: true, pendingCount: 2, activeCount: 7 });
  assert.equal(calls, 2);
  controller.abort();
  signals.forEach(signal => assert.equal(signal.aborted, true));
});

test("client reports authorization/fetch/data failures and retries without keeping an old count", async () => {
  reset();
  for (const [body, status] of [[unavailable, 403], [unavailable, 503], [{ available: true, pendingCount: -1, activeCount: 1 }, 200]]) {
    await assert.rejects(loadAccessSummary(state.actor, undefined, async () => Response.json(body, { status })));
  }
  assert.deepEqual(await loadAccessSummary(state.actor, undefined, async () => Response.json({ available: true, pendingCount: 2, activeCount: 8 })),
    { available: true, pendingCount: 2, activeCount: 8 });
});
