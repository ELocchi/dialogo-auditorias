import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { activeProfileCookieName, encodeActiveProfileChoice } from "../src/lib/auth/active-profile.ts";

// Exercise the installed React cache through Next's real RSC renderer. The
// ordinary React client export deliberately does not memoize and would hide
// missing cache keys, cross-render leaks, or ineffective deduplication here.
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverReact = pathToFileURL(path.join(path.dirname(require.resolve("react/package.json")), "react.react-server.js")).href;
const requests = new AsyncLocalStorage();
globalThis.__sessionRequestCacheFixture = requests;
const fixtureExpression = "globalThis.__sessionRequestCacheFixture.getStore()";
const stubs = {
  "server-only": "export {};",
  "next/headers": `export async function cookies(){return ${fixtureExpression}.cookieStore;}`,
  "next/navigation": "export function redirect(destination){throw Object.assign(new Error('redirect'),{destination});}",
  "next/cache": "export function revalidatePath(){}",
  "supabase/server": `export async function createClient(){return ${fixtureExpression}.client;}`,
  "@/lib/access/service": `export async function approveRequest(){${fixtureExpression}.mutations++;return {status:'success'};}
    export async function updateAccountAccess(){${fixtureExpression}.mutations++;return {status:'success'};}`,
  "@/lib/works/service": `export async function createWorkWithDetails(){${fixtureExpression}.mutations++;return {status:'success'};}`,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "react") return { url: serverReact, shortCircuit: true };
    const key = specifier.includes("supabase/server") ? "supabase/server" : specifier;
    if (stubs[key]) return { url: `data:text/javascript,${encodeURIComponent(stubs[key])}`, shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(root, "src", `${specifier.slice(2)}.ts`)).href, context);
    return nextResolve(specifier, context);
  },
});
const React = await import("react");
const { renderToReadableStream } = await import("next/dist/compiled/react-server-dom-webpack/server.node.js");
const { verifiedUser, effectiveAccount, ownAccessRequest, requireAdministrator } = await import("../src/lib/auth/session.ts");
const { approveAccessAction } = await import("../src/app/administracao/usuarios/actions.ts");

function fixture(suffix = "1") {
  const id = `d1a20000-0000-4000-8000-${suffix.padStart(12, "0")}`;
  const state = {
    user: { id, email: `fixture.${suffix}@dialogo.com.br`, email_confirmed_at: "2026-09-13T12:00:00Z" },
    account: {
      auth_user_id: id, perfil: "ADMINISTRATIVO", perfis: ["ADMINISTRATIVO"], atuacao_engenharia: null,
      atuacoes_engenharia: [], atuacao_administrativa: "GERAL", ativo: true, approved_at: "2026-09-13T12:00:00Z",
    },
    administrator: true, active: true, authError: null, accountError: null, administratorError: null,
    cookies: [], mutations: 0, calls: { auth: 0, account: 0, administrator: 0, request: 0 },
  };
  const accessRequest = () => ({ auth_user_id: id, nome: `Fixture ${suffix}`, email: state.user?.email,
    status_acesso: "APROVADO", email_confirmado_em: state.user?.email_confirmed_at });
  state.cookieStore = { getAll(name) { assert.equal(name, activeProfileCookieName); return state.cookies; } };
  state.client = {
    auth: { async getUser() {
      state.calls.auth++;
      await new Promise((resolve) => setImmediate(resolve));
      return { data: { user: structuredClone(state.user) }, error: state.authError };
    } },
    async rpc(name) {
      if (name === "read_current_access_account") {
        state.calls.account++;
        await new Promise((resolve) => setImmediate(resolve));
        return { data: state.active ? { account: structuredClone(state.account), request: accessRequest() } : null, error: state.accountError };
      }
      assert.equal(name, "is_current_access_administrator");
      state.calls.administrator++;
      return { data: state.administrator, error: state.administratorError };
    },
    from(table) {
      assert.equal(table, "access_requests");
      return { select() { return this; }, eq(column) { assert.equal(column, "auth_user_id"); return this; },
        async maybeSingle() { state.calls.request++; return { data: accessRequest(), error: null }; } };
    },
  };
  return state;
}

async function render(state, work) {
  return requests.run(state, async () => {
    const errors = [];
    async function Probe() { return await work(); }
    const stream = await renderToReadableStream(React.createElement(Probe), {}, {
      onError(error) { errors.push(error); return "fixture-error"; },
    });
    await new Response(stream).text();
    return errors;
  });
}
async function renderOk(state, work) {
  const errors = await render(state, work);
  if (errors.length) throw errors[0];
}
async function redirectedRender(state, destination) {
  const errors = await render(state, async () => { await requireAdministrator(); return null; });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].destination, destination);
}

test("administrative page and nested components share one live authorization during an RSC render", async () => {
  const state = fixture();
  const observed = [];
  async function Child() {
    const [first, second, user] = await Promise.all([requireAdministrator(), requireAdministrator(), verifiedUser()]);
    const [account, request] = await Promise.all([effectiveAccount({ ...user }), ownAccessRequest(user.id)]);
    observed.push(first.id, second.id, account.auth_user_id, request.auth_user_id);
    return null;
  }
  await renderOk(state, async () => {
    const user = await requireAdministrator();
    await ownAccessRequest(user.id);
    return React.createElement(Child);
  });
  assert.deepEqual(observed, Array(4).fill(state.user.id));
  assert.deepEqual(state.calls, { auth: 1, account: 1, administrator: 1, request: 1 });
});

test("equal scalar identities deduplicate account reads without mixing changed identity fields", async () => {
  const state = fixture();
  await renderOk(state, async () => {
    const results = await Promise.all([effectiveAccount({ ...state.user }), effectiveAccount({ ...state.user })]);
    assert.equal(results[0], results[1]);
    assert.ok(results[0]);
    assert.equal(await effectiveAccount({ ...state.user, email: "different@dialogo.com.br" }), null);
    assert.equal(await effectiveAccount({ ...state.user, email_confirmed_at: undefined }), null);
    assert.equal(await effectiveAccount({ ...state.user, id: fixture("2").user.id }), null);
    return null;
  });
  assert.deepEqual(state.calls, { auth: 0, account: 3, administrator: 0, request: 0 });
});

test("each new render rechecks Auth and immediately observes account revocation", async () => {
  const state = fixture();
  for (let count = 0; count < 2; count++) await renderOk(state, async () => { await requireAdministrator(); return null; });
  assert.deepEqual(state.calls, { auth: 2, account: 2, administrator: 2, request: 0 });
  state.account.ativo = false;
  await redirectedRender(state, "/aguardando-liberacao");
  assert.deepEqual(state.calls, { auth: 3, account: 3, administrator: 2, request: 0 });
});

test("concurrent RSC requests cannot reuse another user's session, account or access request", async () => {
  const first = fixture("1"), second = fixture("2");
  const identities = await Promise.all([first, second].map(async (state) => {
    let result;
    await renderOk(state, async () => {
      const user = await requireAdministrator();
      const [again, account, request] = await Promise.all([verifiedUser(), effectiveAccount({ ...user }), ownAccessRequest(user.id)]);
      result = [user.id, again.id, account.auth_user_id, request.auth_user_id];
      return null;
    });
    assert.deepEqual(state.calls, { auth: 1, account: 1, administrator: 1, request: 1 });
    return result;
  }));
  assert.deepEqual(identities, [Array(4).fill(first.user.id), Array(4).fill(second.user.id)]);
});

test("the next render rechecks the selected profile and administrative scope", async () => {
  const state = fixture();
  state.account.perfis.push("AUDITOR_QUALIDADE");
  function choose(profile, scope = null) {
    state.cookies = [{ name: activeProfileCookieName, value: encodeActiveProfileChoice(state.user.id, profile, null, scope) }];
  }
  choose("ADMINISTRATIVO", "GERAL");
  await renderOk(state, async () => { await requireAdministrator(); return null; });
  choose("AUDITOR_QUALIDADE");
  await redirectedRender(state, "/app");
  choose("ADMINISTRATIVO", "QUALIDADE");
  await redirectedRender(state, "/app");
  state.cookies = [];
  await redirectedRender(state, "/escolher-perfil");
  assert.deepEqual(state.calls, { auth: 4, account: 4, administrator: 1, request: 0 });
});

test("administrator helper, Auth and database failures keep the original fail-closed redirects", async () => {
  for (const [change, destination, calls] of [
    [(s) => { s.user = null; }, "/entrar", { auth: 1, account: 0, administrator: 0, request: 0 }],
    [(s) => { s.user.email = "fixture@example.invalid"; }, "/entrar", { auth: 1, account: 0, administrator: 0, request: 0 }],
    [(s) => { s.authError = { message: "expired" }; }, "/entrar", { auth: 1, account: 0, administrator: 0, request: 0 }],
    [(s) => { s.active = false; }, "/aguardando-liberacao", { auth: 1, account: 1, administrator: 0, request: 0 }],
    [(s) => { s.accountError = { message: "unavailable" }; }, "/aguardando-liberacao", { auth: 1, account: 1, administrator: 0, request: 0 }],
    [(s) => { s.administrator = false; }, "/minha-conta?acesso=restrito", { auth: 1, account: 1, administrator: 1, request: 0 }],
    [(s) => { s.administratorError = { message: "unavailable" }; }, "/minha-conta?acesso=restrito", { auth: 1, account: 1, administrator: 1, request: 0 }],
  ]) {
    const state = fixture(); change(state);
    await redirectedRender(state, destination);
    assert.deepEqual(state.calls, calls);
  }
});

test("failed authorization deduplicates only within its render and can recover on a new request", async () => {
  const state = fixture();
  state.administrator = false;
  await renderOk(state, async () => {
    const results = await Promise.allSettled([requireAdministrator(), requireAdministrator()]);
    for (const result of results) {
      assert.equal(result.status, "rejected");
      assert.equal(result.reason.destination, "/minha-conta?acesso=restrito");
    }
    return null;
  });
  assert.deepEqual(state.calls, { auth: 1, account: 1, administrator: 1, request: 0 });
  state.administrator = true;
  await renderOk(state, async () => { await requireAdministrator(); return null; });
  assert.deepEqual(state.calls, { auth: 2, account: 2, administrator: 2, request: 0 });
});

test("own access requests cache by user ID and retain the response identity check", async () => {
  const state = fixture(), other = fixture("2");
  await renderOk(state, async () => {
    const first = await ownAccessRequest(state.user.id);
    assert.equal(await ownAccessRequest(state.user.id), first);
    assert.equal(await ownAccessRequest(other.user.id), null);
    return null;
  });
  await renderOk(state, async () => { await ownAccessRequest(state.user.id); return null; });
  assert.equal(state.calls.request, 3);
});

test("real Server Actions outside RSC verify authorization again and reject revocation before mutation", async () => {
  const state = fixture();
  await renderOk(state, async () => { await requireAdministrator(); return null; });
  await requests.run(state, async () => {
    const result = await approveAccessAction({ status: "idle" }, new FormData());
    assert.equal(result.status, "success");
    state.account.ativo = false;
    await assert.rejects(approveAccessAction({ status: "idle" }, new FormData()), (error) => error.destination === "/aguardando-liberacao");
  });
  assert.equal(state.mutations, 1);
  assert.deepEqual(state.calls, { auth: 3, account: 3, administrator: 2, request: 0 });
});
