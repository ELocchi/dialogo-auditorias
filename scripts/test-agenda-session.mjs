import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { activeProfileCookieName, encodeActiveProfileChoice } from "../src/lib/auth/active-profile.ts";

// Execute the real agenda Server Actions, GET handler and session/profile
// guards against offline adapters. No environment files, existing cookies,
// network, Supabase project or actual notifications are used.
const userId = "d1a70000-0000-4000-8000-000000000001";
const otherId = "d1a70000-0000-4000-8000-000000000002";
const empty = { available: false, visits: [], auditors: [], notifications: [] };
const input = { requestId: "d1a70000-0000-4000-8000-000000000003", fixture: "payload passed only to the DAL adapter" };
let state;
function reset(profile = "ADMINISTRATIVO", engineeringScope = null) {
  state = {
    user: { id: userId, email: "agenda.session.fixture@dialogo.com.br", email_confirmed_at: "2026-09-14T12:00:00Z" },
    account: { auth_user_id: userId, perfil: "ADMINISTRATIVO", perfis: ["ADMINISTRATIVO", "AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"],
      atuacao_engenharia: "EQUIPE_OBRA", atuacoes_engenharia: ["EQUIPE_OBRA", "COORDENACAO"], atuacao_administrativa: "GERAL", ativo: true, approved_at: "2026-09-14T12:00:00Z" },
    status: "APROVADO", active: true, contextAvailable: true, authError: null,
    cookieValues: [{ value: encodeActiveProfileChoice(userId, profile, engineeringScope, profile === "ADMINISTRATIVO" ? "GERAL" : null) }],
    context: { profile, engineeringScope, user: { id: userId }, works: [], fixture: "trusted workspace" },
    snapshot: { available: true, visits: [{ id: "offline-private-visit" }], auditors: [], notifications: [{ id: "offline-private-notification" }] },
    workspaceReads: [], agendaReads: [], mutations: [], clients: [],
  };
  state.cookieStore = { getAll(name) { assert.equal(name, activeProfileCookieName); return state.cookieValues; } };
  state.client = {
    auth: { async getUser() { return { data: { user: state.user }, error: state.authError }; } },
    from(table) { return {
      select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: table === "access_accounts" ? state.account : {
        auth_user_id: userId, status_acesso: state.status, email: state.user?.email,
        email_confirmado_em: state.user?.email_confirmed_at,
      }, error: null }; },
    }; },
    async rpc(name) { assert.equal(name, "read_current_access_account"); return { data: state.active === true ? { account: state.account,
      request: { auth_user_id: userId, status_acesso: state.status, email: state.user?.email,
        email_confirmado_em: state.user?.email_confirmed_at } } : null, error: null }; },
  };
  globalThis.__agendaSessionFixture = state;
}
const expected = (overrides = {}) => ({ userId, profile: state.context.profile, engineeringScope: state.context.engineeringScope,
  administrativeScope: state.context.profile === "ADMINISTRATIVO" ? "GERAL" : null, ...overrides });
const request = (query = expected()) => {
  const url = new URL("http://offline.invalid/api/agenda");
  if (query) {
    url.searchParams.set("usuario", query.userId);
    url.searchParams.set("perfil", query.profile);
    url.searchParams.set("atuacao", query.engineeringScope ?? "");
    url.searchParams.set("administrativo", query.administrativeScope ?? "");
  }
  return new Request(url);
};
const assertNoAgendaWork = () => {
  assert.equal(state.workspaceReads.length, 0);
  assert.equal(state.agendaReads.length, 0);
  assert.equal(state.mutations.length, 0);
};
async function assertUnavailable(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Cookie, If-None-Match");
  assert.deepEqual(await response.json(), empty);
}
const stubModules = {
  "server-only": "export {};",
  "next/headers": "export async function cookies() { return globalThis.__agendaSessionFixture.cookieStore; }",
  "next/navigation": "export function redirect(destination) { throw Object.assign(new Error('redirect'), { destination }); }",
  "supabase/server": "export async function createClient(options) { const s = globalThis.__agendaSessionFixture; s.clients.push(options); return s.client; }",
  "access/workspace": "export async function readWorkspaceContext(active) { const s = globalThis.__agendaSessionFixture; s.workspaceReads.push(active); return s.contextAvailable ? s.context : null; }",
  "agenda/service": `
    function operation(name, input, context, client) {
      const s = globalThis.__agendaSessionFixture;
      s.mutations.push({ name, input, context, client });
      return Promise.resolve({ status: 'success', message: 'Offline DAL accepted' });
    }
    export const createAgendaVisit = (...args) => operation('create', ...args);
    export const deleteAgendaVisit = (...args) => operation('delete', ...args);
    export const confirmAgendaVisit = (...args) => operation('confirm', ...args);
    export async function readAgendaUpdate(client, context, revision) {
      const s = globalThis.__agendaSessionFixture; s.receivedRevision = revision;
      if (s.unchanged) { s.agendaReads.push({client, context}); return { unchanged: true, revision: s.snapshot.revision }; }
      return { unchanged: false, snapshot: await readAgendaSnapshot(client, context) };
    }
    export async function readAgendaSnapshot(client, context) {
      const s = globalThis.__agendaSessionFixture; s.agendaReads.push({ client, context }); return s.snapshot;
    }
  `,
};
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    const key = ["supabase/server", "access/workspace", "agenda/service"].find((suffix) =>
      specifier.endsWith(suffix) || specifier.endsWith(`${suffix}.ts`)) ?? specifier;
    if (Object.hasOwn(stubModules, key)) return {
      url: `data:text/javascript,${encodeURIComponent(stubModules[key])}`, shortCircuit: true,
    };
    if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(projectRoot, "src", `${specifier.slice(2)}.ts`)).href, context);
    return nextResolve(specifier, context);
  },
});
const actions = await import("../src/app/agenda/actions.ts");
const { GET, dynamic } = await import("../src/app/api/agenda/route.ts");
const operations = [
  ["create", actions.createAgendaVisitAction],
  ["delete", actions.deleteAgendaVisitAction],
  ["confirm", actions.confirmAgendaVisitAction],
];

test("Agenda actions authenticate before any payload, displayed-context or DAL work", async () => {
  for (const [, action] of operations) {
    reset(); state.user = null;
    await assert.rejects(action(input, expected()), (error) => error.destination === "/entrar");
    assertNoAgendaWork();
  }
});

test("Every action rejects stale identity, profile and Engineering activity before workspace reads or mutations", async () => {
  for (const [, action] of operations) {
    for (const mismatch of [{ userId: otherId }, { profile: "AUDITOR_QUALIDADE" }, { engineeringScope: "COORDENACAO" }]) {
      reset(); const result = await action(input, expected(mismatch));
      assert.equal(result.status, "error"); assert.deepEqual(result.snapshot, empty); assertNoAgendaWork();
    }
    reset("ENGENHARIA", "EQUIPE_OBRA");
    const result = await action(input, expected({ engineeringScope: "COORDENACAO" }));
    assert.equal(result.status, "error"); assertNoAgendaWork();
    for (const missing of [undefined, null, {}]) {
      reset(); assert.equal((await action(input, missing)).status, "error"); assertNoAgendaWork();
    }
  }
});

test("Current account approval and cookie choice are required even when displayed context still matches", async () => {
  for (const [change, destination] of [
    [(s) => { s.status = "PENDENTE_APROVACAO"; }, "/aguardando-liberacao"],
    [(s) => { s.active = false; }, "/aguardando-liberacao"],
    [(s) => { s.cookieValues = []; }, "/escolher-perfil"],
  ]) {
    reset(); change(state);
    await assert.rejects(actions.createAgendaVisitAction(input, expected()), (error) => error.destination === destination);
    assertNoAgendaWork();
  }
});

test("Valid actions pass the verified active context and writable session client to the intended DAL operation", async () => {
  for (const [name, action] of operations) {
    reset(name === "confirm" ? "AUDITOR_SEGURANCA" : "ADMINISTRATIVO");
    assert.equal((await action(input, expected())).status, "success");
    assert.equal(state.workspaceReads.length, 1); assert.equal(state.mutations.length, 1);
    const active = state.workspaceReads[0];
    assert.equal(active.user, state.user); assert.deepEqual(active.account, state.account);
    assert.equal(active.profile, state.context.profile); assert.equal(active.engineeringScope, null);
    assert.deepEqual(state.mutations[0], { name, input, context: state.context, client: state.client });
    assert.deepEqual(state.clients.at(-1), { writableCookies: true });
  }
});

test("Failure to rebuild authorized workspace prevents action mutation", async () => {
  reset(); state.contextAvailable = false;
  assert.equal((await actions.createAgendaVisitAction(input, expected())).status, "error");
  assert.equal(state.workspaceReads.length, 1); assert.equal(state.mutations.length, 0);
});

test("GET returns private uncached 401/403 without agenda data for anonymous, pending, revoked or unselected sessions", async () => {
  assert.equal(dynamic, "force-dynamic");
  for (const [change, status] of [
    [(s) => { s.user = null; }, 401],
    [(s) => { s.authError = { message: "offline Auth rejection" }; }, 401],
    [(s) => { s.status = "PENDENTE_APROVACAO"; }, 403],
    [(s) => { s.active = false; }, 403],
    [(s) => { s.cookieValues = []; }, 403],
  ]) {
    reset(); change(state); await assertUnavailable(await GET(request()), status); assertNoAgendaWork();
  }
});

test("GET rejects displayed identity/profile/activity mismatch before invoking workspace or agenda readers", async () => {
  for (const mismatch of [{ userId: otherId }, { profile: "AUDITOR_SEGURANCA" }, { engineeringScope: "EQUIPE_OBRA" }, { administrativeScope: "QUALIDADE" }]) {
    reset(); await assertUnavailable(await GET(request(expected(mismatch))), 403); assertNoAgendaWork();
  }
  reset("ENGENHARIA", "COORDENACAO");
  await assertUnavailable(await GET(request(expected({ engineeringScope: "EQUIPE_OBRA" }))), 403); assertNoAgendaWork();
});

test("Valid GET uses cookie-selected identity/activity and session client and preserves no-store headers", async () => {
  reset("ENGENHARIA", "EQUIPE_OBRA");
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Cookie, If-None-Match");
  assert.deepEqual(await response.json(), state.snapshot);
  assert.deepEqual(state.agendaReads, [{ client: state.client, context: state.context }]);
  assert.deepEqual(state.workspaceReads, [{ user: state.user, account: state.account, profile: "ENGENHARIA", engineeringScope: "EQUIPE_OBRA", administrativeScope: null }]);
  assert.equal(state.clients.at(-1), undefined);
  assert.equal(state.mutations.length, 0);
});

test("GET cannot expose stale data when workspace or persistent agenda is unavailable", async () => {
  reset(); state.contextAvailable = false;
  await assertUnavailable(await GET(request()), 403); assert.equal(state.agendaReads.length, 0);
  reset(); state.snapshot = structuredClone(empty);
  await assertUnavailable(await GET(request()), 503); assert.equal(state.agendaReads.length, 1);
});


test("conditional GET authenticates on every poll and returns zero body only for unchanged data", async () => {
  reset(); state.snapshot.revision = "a".repeat(32); state.unchanged = true;
  const conditional = () => new Request(request(), { headers: { "If-None-Match": '"' + "a".repeat(32) + '"' } });
  const response = await GET(conditional());
  assert.equal(response.status, 304);
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("ETag"), '"' + "a".repeat(32) + '"');
  assert.equal(state.receivedRevision, "a".repeat(32));
  assert.equal(state.workspaceReads.length, 1);
  assert.equal(state.agendaReads.length, 1);
  reset(); state.user = null;
  await assertUnavailable(await GET(conditional()), 401); assertNoAgendaWork();
  reset(); state.active = false;
  await assertUnavailable(await GET(conditional()), 403); assertNoAgendaWork();
});

test("conditional GET ignores malformed or wildcard tokens and exposes no token for failed reads", async () => {
  for (const token of ["*", "a".repeat(32), 'W/"' + "a".repeat(32) + '"', '"bad"']) {
    reset(); state.snapshot = empty;
    const response = await GET(new Request(request(), { headers: { "If-None-Match": token } }));
    await assertUnavailable(response, 503);
    assert.equal(state.receivedRevision, null);
    assert.equal(response.headers.get("ETag"), null);
  }
});
