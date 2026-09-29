import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createServerClient } from "@supabase/ssr";
import { confirmEmail, emailConfirmationError } from "../src/lib/auth/email-confirmation.ts";

// Completely offline. No real identities, mail delivery or hosted Auth/SQL writes.
const providerDetail = "PRIVATE_PROVIDER_ERROR_MUST_NOT_ESCAPE";
const user = {
  id: "a0400000-0000-4000-8000-000000000001",
  email: "confirmacao-offline@dialogo.com.br",
  email_confirmed_at: "2026-09-29T12:00:00Z",
};
const request = {
  auth_user_id: user.id, email: user.email, nome: "Pessoa de teste offline",
  status_acesso: "PENDENTE_APROVACAO", email_confirmado_em: null,
};
const originalFetch = globalThis.fetch;
let attemptedNetwork = 0;
before(() => {
  globalThis.fetch = async () => { attemptedNetwork++; throw Error("NETWORK_FORBIDDEN"); };
});
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(attemptedNetwork, 0);
  delete globalThis.__emailConfirmation;
});

function form(fields = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

function harness(options = {}) {
  const calls = { factory: [], identity: [], exchange: [], rpc: [], forbidden: [], clear: 0, revalidate: [], redirects: [], pageIdentity: 0, ownRequest: [] };
  const forbidden = (name) => (...args) => { calls.forbidden.push([name, ...args]); throw Error("OPERATION_FORBIDDEN"); };
  const client = {
    from: forbidden("from"),
    rpc: async (...args) => {
      calls.rpc.push(args);
      assert.deepEqual(args, ["confirm_own_access_request_email"]);
      if (options.rpcThrow) throw Error(providerDetail);
      return options.rpcResponse ? options.rpcResponse(calls.rpc.length) : { data: true, error: null };
    },
    auth: {
      verifyOtp: forbidden("verifyOtp"),
      getSession: forbidden("getSession"),
      updateUser: forbidden("updateUser"),
      exchangeCodeForSession: async (...args) => {
        calls.exchange.push(args);
        if (options.exchangeThrow) throw Error(providerDetail);
        return options.exchangeResponse ?? { error: null };
      },
      getUser: async (...args) => {
        calls.identity.push(args);
        if (options.identityThrow) throw Error(providerDetail);
        return options.identityResponse ? options.identityResponse() : { data: { user: { ...user } }, error: null };
      },
    },
  };
  const deps = { createClient: async (config) => {
    calls.factory.push(config);
    if (options.factoryThrow) throw Error(providerDetail);
    return client;
  } };
  const state = {
    calls, deps,
    pageUser: Object.hasOwn(options, "pageUser") ? options.pageUser : { ...user },
    pageRequest: Object.hasOwn(options, "pageRequest") ? options.pageRequest : { ...request },
  };
  globalThis.__emailConfirmation = state;
  return state;
}

function expectFailure(result) {
  assert.deepEqual(result, { state: { status: "error", message: emailConfirmationError } });
  const serialized = JSON.stringify(result);
  for (const secret of [user.id, user.email, providerDetail, "ARTIFICIAL_TOKEN_HASH", "ARTIFICIAL_ACCESS_TOKEN"]) assert.equal(serialized.includes(secret), false);
}

test("explicit confirmation verifies the current Auth identity and calls only the no-argument own-request RPC", async () => {
  const state = harness();
  const result = await confirmEmail(form(), state.deps);
  assert.deepEqual(state.calls.identity, [[]]);
  assert.deepEqual(state.calls.rpc, [["confirm_own_access_request_email"]]);
  assert.equal(result.state.status, "success");
  assert.equal(result.redirectTo, "/aguardando-liberacao");
  assert.deepEqual(state.calls.forbidden, []);
});

test("form identity, timestamps, tokens, profile, approval and destination claims are ignored", async () => {
  const data = form({
    auth_user_id: "other-user", email: "attacker@example.invalid", token_hash: "ARTIFICIAL_TOKEN_HASH",
    access_token: "ARTIFICIAL_ACCESS_TOKEN", type: "recovery", email_confirmado_em: "2000-01-01T00:00:00Z",
    next: "https://example.invalid", redirect_to: "/app", perfil: "ADMINISTRATIVO", approved: "true",
  });
  data.append("auth_user_id", "third-user");
  const state = harness();
  const result = await confirmEmail(data, state.deps);
  assert.equal(result.redirectTo, "/aguardando-liberacao");
  assert.deepEqual(state.calls.identity, [[]]);
  assert.deepEqual(state.calls.rpc, [["confirm_own_access_request_email"]]);
  assert.deepEqual(state.calls.forbidden, []);
  assert.equal(JSON.stringify(result).includes("ARTIFICIAL"), false);
});

test("missing, foreign-domain and unconfirmed identities cannot reach the confirmation RPC", async () => {
  const responses = [
    { data: null, error: null },
    { data: { user: null }, error: null },
    { data: { user: { ...user, id: "" } }, error: null },
    { data: { user: { ...user, email: "outsider@example.invalid" } }, error: null },
    { data: { user: { ...user, email: "person@dialogo.com.br.attacker.invalid" } }, error: null },
    { data: { user: { ...user, email_confirmed_at: null } }, error: null },
    { data: { user: { ...user, email_confirmed_at: "not-a-date" } }, error: null },
    { data: { user: { ...user, email_confirmed_at: null, user_metadata: { email_confirmed_at: user.email_confirmed_at, approved: true } } }, error: null },
    { data: { user }, error: { message: providerDetail } },
  ];
  for (const response of responses) {
    const state = harness({ identityResponse: () => response });
    expectFailure(await confirmEmail(form({ email: user.email, email_confirmed_at: user.email_confirmed_at }), state.deps));
    assert.equal(state.calls.identity.length, 1);
    assert.deepEqual(state.calls.rpc, []);
    assert.deepEqual(state.calls.forbidden, []);
  }
  const state = harness();
  expectFailure(await confirmEmail({}, state.deps));
  assert.deepEqual(state.calls.factory, []);
});

test("RPC success must be exactly true; stale authorization or database denial cannot look successful", async () => {
  for (const response of [
    { data: false, error: null }, { data: null, error: null }, { data: "true", error: null },
    { data: 1, error: null }, { data: { confirmed: true }, error: null },
    { data: true, error: { code: "42501", message: providerDetail } },
  ]) {
    const state = harness({ rpcResponse: () => response });
    expectFailure(await confirmEmail(form(), state.deps));
    assert.deepEqual(state.calls.identity, [[]]);
    assert.deepEqual(state.calls.rpc, [["confirm_own_access_request_email"]]);
    assert.deepEqual(state.calls.forbidden, []);
  }
});

test("client, identity and RPC exceptions are generic and never expose provider diagnostics", async () => {
  for (const options of [{ factoryThrow: true }, { identityThrow: true }, { rpcThrow: true }]) {
    const state = harness(options);
    expectFailure(await confirmEmail(form(), state.deps));
    assert.deepEqual(state.calls.forbidden, []);
    if (options.identityThrow || options.factoryThrow) assert.deepEqual(state.calls.rpc, []);
  }
});

test("repeated POSTs recheck live identity and database authorization every time", async () => {
  const state = harness({ rpcResponse: (attempt) => attempt < 3
    ? { data: true, error: null }
    : { data: false, error: null } });
  for (let attempt = 0; attempt < 2; attempt++) assert.equal((await confirmEmail(form(), state.deps)).state.status, "success");
  expectFailure(await confirmEmail(form(), state.deps));
  assert.equal(state.calls.identity.length, 3);
  assert.deepEqual(state.calls.rpc, Array.from({ length: 3 }, () => ["confirm_own_access_request_email"]));
  assert.deepEqual(state.calls.forbidden, []);
});

test("official SSR SDK verifies the existing session over HTTP and posts no claimed identity to SQL", async () => {
  const requests = [];
  const cookies = new Map();
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const jwt = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.${encoded("OFFLINE_SIGNATURE")}`;
  const client = createServerClient("https://offline-confirmation.invalid", "sb_publishable_OFFLINE_ONLY", {
    cookies: {
      getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
    },
    global: {
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        assert.equal(url.origin, "https://offline-confirmation.invalid");
        assert.equal(url.search, "");
        const headers = new Headers(init.headers);
        assert.equal(headers.get("authorization"), `Bearer ${jwt}`);
        requests.push({ path: url.pathname, method: init.method, body: init.body });
        if (url.pathname === "/auth/v1/user") {
          assert.equal(init.method, "GET");
          return Response.json(user);
        }
        assert.equal(url.pathname, "/rest/v1/rpc/confirm_own_access_request_email");
        assert.equal(init.method, "POST");
        assert.deepEqual(JSON.parse(init.body), {});
        return Response.json(true);
      },
    },
  });
  // Seed an artificial, already established session. This performs one mocked
  // getUser request; no sign-up, confirmation token or real endpoint is used.
  assert.equal((await client.auth.setSession({ access_token: jwt, refresh_token: "OFFLINE_REFRESH_TOKEN" })).error, null);
  requests.length = 0;
  const result = await confirmEmail(form({ auth_user_id: "another-user" }), { createClient: async () => client });
  assert.equal(result.state.status, "success");
  assert.equal(result.redirectTo, "/aguardando-liberacao");
  assert.deepEqual(requests.map(({ path, method }) => ({ path, method })), [
    { path: "/auth/v1/user", method: "GET" },
    { path: "/rest/v1/rpc/confirm_own_access_request_email", method: "POST" },
  ]);
  assert.ok(cookies.size > 0);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stubs = {
  "next/link": "import {createElement} from 'react';export default function Link({href,children}){return createElement('a',{href},children)}",
  "next/navigation": "export function redirect(path){globalThis.__emailConfirmation.calls.redirects.push(path);throw Object.assign(Error('REDIRECT'),{destination:path})}",
  "next/cache": "export function revalidatePath(...args){globalThis.__emailConfirmation.calls.revalidate.push(args)}",
  "next/server": "export const NextResponse={redirect(url){return new Response(null,{status:307,headers:{location:String(url)}})}}",
  "@/lib/supabase/server": "export function createClient(config){return globalThis.__emailConfirmation.deps.createClient(config)}",
  "@/lib/auth/active-profile-session": "export async function clearActiveProfileChoice(){globalThis.__emailConfirmation.calls.clear++}",
  "@/lib/auth/site-url": "export function confirmationCallbackUrl(){return 'https://confirmation-app.invalid/auth/callback'}",
  "@/lib/auth/session": "export async function requireUser(){const s=globalThis.__emailConfirmation;s.calls.pageIdentity++;if(!s.pageUser){s.calls.redirects.push('/entrar');throw Object.assign(Error('REDIRECT'),{destination:'/entrar'})}return s.pageUser}export async function ownAccessRequest(id){const s=globalThis.__emailConfirmation;s.calls.ownRequest.push(id);return s.pageRequest}",
  "@/app/auth/actions": "export async function signOutAction(){throw Error('NO_AUTOMATIC_SIGNOUT')}",
  "../dialogo-logo": "export function DialogoLogo(){return null}",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "react" && context.parentURL?.startsWith("data:")) return nextResolve(specifier, { ...context, parentURL: import.meta.url });
    if (stubs[specifier]) return { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true };
    if (specifier.endsWith(".css")) return { url: "data:text/javascript,export default {}", shortCircuit: true };
    if (specifier.startsWith("@/") || (specifier.startsWith(".") && !path.extname(specifier))) {
      const filename = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2)) : fileURLToPath(new URL(specifier, context.parentURL));
      for (const extension of [".ts", ".tsx"]) if (existsSync(filename + extension)) return nextResolve(pathToFileURL(filename + extension).href, context);
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

const { default: ConfirmEmailPage, metadata } = await import("../src/app/confirmar-email/page.tsx");
const { confirmEmailAction } = await import("../src/app/confirmar-email/actions.ts");
const { GET: callbackGet } = await import("../src/app/auth/callback/route.ts");
const render = async () => renderToStaticMarkup(await ConfirmEmailPage());

test("GET and repeated rendering only show the manual button for an eligible identity awaiting explicit confirmation", async () => {
  for (const status_acesso of ["PENDENTE_APROVACAO", "APROVADO"]) {
    const state = harness({ pageRequest: { ...request, status_acesso } });
    for (let visit = 0; visit < 3; visit++) {
      const html = await render();
      assert.match(html, /Confirmar meu e-mail/);
      assert.match(html, /type="submit"/);
      assert.equal(html.includes('name="token_hash"'), false);
      assert.equal(html.includes('name="auth_user_id"'), false);
    }
    assert.equal(state.calls.pageIdentity, 3);
    assert.deepEqual(state.calls.ownRequest, [user.id, user.id, user.id]);
    assert.deepEqual(state.calls.factory, []);
    assert.deepEqual(state.calls.rpc, []);
    assert.deepEqual(state.calls.forbidden, []);
    assert.equal(state.calls.clear, 0);
  }
  assert.equal(metadata.referrer, "no-referrer");
  assert.deepEqual(metadata.robots, { index: false, follow: false });
});

test("GET for a request already explicitly confirmed redirects without repeating confirmation", async () => {
  for (const status_acesso of ["PENDENTE_APROVACAO", "APROVADO"]) {
    const state = harness({ pageRequest: { ...request, status_acesso, email_confirmado_em: user.email_confirmed_at } });
    await assert.rejects(render(), (error) => error.destination === "/aguardando-liberacao");
    assert.deepEqual(state.calls.rpc, []);
    assert.deepEqual(state.calls.factory, []);
    assert.equal(state.calls.clear, 0);
  }
});

test("GET cannot confirm a missing request, unsupported status or an identity without Auth email confirmation", async () => {
  for (const options of [
    { pageRequest: null },
    { pageRequest: { ...request, status_acesso: "UNKNOWN" } },
    { pageUser: { ...user, email_confirmed_at: null } },
  ]) {
    const state = harness(options);
    const html = await render();
    assert.equal(html.includes("Confirmar meu e-mail"), false);
    assert.equal(html.includes("<form"), false);
    assert.deepEqual(state.calls.rpc, []);
    assert.deepEqual(state.calls.factory, []);
  }
  const state = harness({ pageUser: null });
  await assert.rejects(render(), (error) => error.destination === "/entrar");
  assert.deepEqual(state.calls.ownRequest, []);
  assert.deepEqual(state.calls.rpc, []);
});

test("email callback GET establishes the session and opens the button page without confirming the access request", async () => {
  const state = harness();
  const response = await callbackGet({ nextUrl: new URL("https://confirmation-app.invalid/auth/callback?code=OFFLINE_CODE&next=https://attacker.invalid&type=recovery") });
  assert.equal(response.headers.get("location"), "https://confirmation-app.invalid/confirmar-email");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(state.calls.factory, [{ writableCookies: true }]);
  assert.deepEqual(state.calls.exchange, [["OFFLINE_CODE"]]);
  assert.deepEqual(state.calls.identity, [[]]);
  assert.deepEqual(state.calls.rpc, []);
  assert.deepEqual(state.calls.forbidden, []);
  assert.equal(state.calls.clear, 0);
  assert.equal(await response.text(), "");
});

test("missing, expired and failed callback credentials never confirm a request or approve an account", async () => {
  for (const [query, options] of [
    ["", {}], ["?code=OFFLINE_CODE", { exchangeThrow: true }],
    ["?code=OFFLINE_CODE", { exchangeResponse: { error: { message: providerDetail } } }],
    ["?code=OFFLINE_CODE", { identityResponse: () => ({ data: { user: { ...user, email_confirmed_at: null } }, error: null }) }],
    ["?code=OFFLINE_CODE", { identityResponse: () => ({ data: { user: null }, error: null }) }],
    ["?code=OFFLINE_CODE", { identityThrow: true }],
  ]) {
    const state = harness(options);
    const response = await callbackGet({ nextUrl: new URL(`https://confirmation-app.invalid/auth/callback${query}`) });
    assert.equal(response.headers.get("location"), "https://confirmation-app.invalid/entrar?confirmacao=indisponivel");
    assert.deepEqual(state.calls.rpc, []);
    assert.deepEqual(state.calls.forbidden, []);
    assert.equal(await response.text(), "");
    if (!query) assert.deepEqual(state.calls.factory, []);
  }
});

test("only a successful explicit action clears selected profile and redirects to the review checkpoint", async () => {
  const state = harness();
  await assert.rejects(confirmEmailAction({ status: "success", message: "untrusted" }, form()), (error) => error.destination === "/aguardando-liberacao");
  assert.deepEqual(state.calls.factory, [{ writableCookies: true }]);
  assert.deepEqual(state.calls.identity, [[]]);
  assert.deepEqual(state.calls.rpc, [["confirm_own_access_request_email"]]);
  assert.equal(state.calls.clear, 1);
  assert.deepEqual(state.calls.revalidate, [["/", "layout"]]);
  assert.deepEqual(state.calls.redirects, ["/aguardando-liberacao"]);
  assert.deepEqual(state.calls.forbidden, []);
});

test("failed explicit action preserves existing profile selection and never redirects or approves access", async () => {
  for (const options of [
    { identityThrow: true }, { rpcThrow: true }, { rpcResponse: () => ({ data: false, error: null }) },
  ]) {
    const state = harness(options);
    const result = await confirmEmailAction({ status: "success", message: "untrusted" }, form({ approved: "true" }));
    assert.deepEqual(result, { status: "error", message: emailConfirmationError });
    assert.equal(state.calls.clear, 0);
    assert.deepEqual(state.calls.redirects, []);
    assert.deepEqual(state.calls.revalidate, []);
    assert.deepEqual(state.calls.forbidden, []);
  }
});
