import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createServerClient } from "@supabase/ssr";
import { confirmEmail, emailConfirmationError, emailConfirmationToken } from "../src/lib/auth/email-confirmation.ts";

// Completely offline. No credentials, real identities, mail delivery or Auth writes.
const token = "pkce_" + "a".repeat(64);
const providerDetail = "PRIVATE_PROVIDER_ERROR_MUST_NOT_ESCAPE";
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

function form(value = token) {
  const data = new FormData();
  if (value !== null) data.append("token_hash", value);
  return data;
}

const user = {
  id: "offline-confirmation-user",
  email: "confirmacao-offline@dialogo.com.br",
  email_confirmed_at: "2026-09-29T12:00:00Z",
};
const validResponse = () => ({ data: { user: { ...user }, session: { user: { ...user } } }, error: null });

function harness(options = {}) {
  const calls = { factory: [], verify: [], mutations: [], clear: 0, revalidate: [], redirects: [] };
  const client = {
    from: (...args) => { calls.mutations.push(args); throw Error("TABLE_ACCESS_FORBIDDEN"); },
    rpc: (...args) => { calls.mutations.push(args); throw Error("APPROVAL_RPC_FORBIDDEN"); },
    auth: {
      verifyOtp: async (input) => {
        calls.verify.push(input);
        if (options.verifyThrow) throw Error(providerDetail);
        return options.response ? options.response(calls.verify.length) : validResponse();
      },
    },
  };
  const deps = { createClient: async (config) => {
    calls.factory.push(config);
    if (options.factoryThrow) throw Error(providerDetail);
    return client;
  } };
  const state = { calls, deps };
  globalThis.__emailConfirmation = state;
  return state;
}

function expectFailure(result) {
  assert.deepEqual(result, { state: { status: "error", message: emailConfirmationError } });
  const serialized = JSON.stringify(result);
  for (const secret of [token, user.id, user.email, providerDetail]) assert.equal(serialized.includes(secret), false);
}

test("only one bounded opaque token is accepted; invalid and ambiguous submissions never call Auth", async () => {
  const malformed = [null, "", "short", "a".repeat(513), ` ${token}`, `${token}\n`, "https://example.invalid/confirm", "a".repeat(30) + "&next=/app", new Blob([token])];
  for (const value of malformed) {
    const state = harness();
    expectFailure(await confirmEmail(form(value), state.deps));
    assert.deepEqual(state.calls.factory, []);
  }
  const duplicate = form();
  duplicate.append("token_hash", token);
  const state = harness();
  expectFailure(await confirmEmail(duplicate, state.deps));
  expectFailure(await confirmEmail({}, state.deps));
  assert.deepEqual(state.calls.factory, []);
  for (const value of [undefined, null, [token], [token, token], {}, 42]) assert.equal(emailConfirmationToken(value), null);
  assert.equal(emailConfirmationToken(token), token);
});

test("confirmation fixes OTP type and destination, ignores claimed identity/profile and never approves access", async () => {
  const state = harness();
  const data = form();
  for (const [key, value] of Object.entries({ type: "recovery", email: "attacker@example.invalid", user_id: "other-user", next: "https://example.invalid", redirect_to: "/app", perfil: "ADMINISTRATIVO", approved: "true" })) data.set(key, value);
  const result = await confirmEmail(data, state.deps);
  assert.deepEqual(state.calls.verify, [{ token_hash: token, type: "email" }]);
  assert.equal(result.state.status, "success");
  assert.equal(result.redirectTo, "/aguardando-liberacao");
  assert.deepEqual(state.calls.mutations, []);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("official SSR SDK confirms by POST and persists the session without signup-browser cookies or approval requests", async () => {
  const requests = [];
  const cookies = new Map();
  const client = createServerClient("https://offline-confirmation.invalid", "sb_publishable_OFFLINE_ONLY", {
    cookies: {
      getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
    },
    global: {
      fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : input);
        assert.equal(url.origin, "https://offline-confirmation.invalid");
        assert.equal(url.pathname, "/auth/v1/verify");
        assert.equal(url.search, "", "The token belongs only in the POST body.");
        assert.equal(init.method, "POST");
        requests.push(JSON.parse(init.body));
        return new Response(JSON.stringify({
          access_token: "OFFLINE_ACCESS_TOKEN", refresh_token: "OFFLINE_REFRESH_TOKEN",
          token_type: "bearer", expires_in: 3600, user,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    },
  });
  assert.equal(cookies.size, 0);
  const result = await confirmEmail(form(), { createClient: async () => client });
  assert.equal(result.state.status, "success");
  assert.equal(result.redirectTo, "/aguardando-liberacao");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].token_hash, token);
  assert.equal(requests[0].type, "email");
  assert.ok(Array.from(cookies).some(([name, value]) => name.includes("auth-token") && value.length > 0));
  assert.equal((await client.auth.getSession()).data.session.user.id, user.id);
  assert.equal(requests.length, 1);
});

test("expired tokens and retries after consumption return the same generic failure", async () => {
  const expired = () => ({ data: { user: null, session: null }, error: { code: "otp_expired", message: providerDetail } });
  const state = harness({ response: (attempt) => attempt === 1 ? validResponse() : expired() });
  assert.equal((await confirmEmail(form(), state.deps)).state.status, "success");
  expectFailure(await confirmEmail(form(), state.deps));
  expectFailure(await confirmEmail(form(), harness({ response: expired }).deps));
  assert.equal(state.calls.verify.length, 2);
  assert.deepEqual(state.calls.mutations, []);
});

test("success requires a confirmed corporate identity and a session for that same identity", async () => {
  const responses = [
    { data: null, error: null },
    { data: { user: null, session: null }, error: null },
    { data: { user, session: null }, error: null },
    { data: { user, session: {} }, error: null },
    { data: { user, session: { user: { id: "different-user" } } }, error: null },
    { data: { user: { ...user, email: "outsider@example.invalid" }, session: { user } }, error: null },
    { data: { user: { ...user, email_confirmed_at: null }, session: { user } }, error: null },
    { data: { user: { ...user, email_confirmed_at: "not-a-date" }, session: { user } }, error: null },
    { ...validResponse(), error: { message: providerDetail } },
  ];
  for (const response of responses) {
    const state = harness({ response: () => response });
    expectFailure(await confirmEmail(form(), state.deps));
    assert.equal(state.calls.verify.length, 1);
    assert.deepEqual(state.calls.mutations, []);
  }
});

test("Auth/client failures including failed session cookie persistence expose no private diagnostics", async () => {
  for (const options of [{ factoryThrow: true }, { verifyThrow: true }]) {
    const state = harness(options);
    expectFailure(await confirmEmail(form(), state.deps));
    assert.deepEqual(state.calls.mutations, []);
  }
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stubs = {
  "next/link": "import {createElement} from 'react';export default function Link({href,children}){return createElement('a',{href},children)}",
  "next/navigation": "export function redirect(path){globalThis.__emailConfirmation.calls.redirects.push(path);throw Object.assign(Error('REDIRECT'),{destination:path})}",
  "next/cache": "export function revalidatePath(...args){globalThis.__emailConfirmation.calls.revalidate.push(args)}",
  "@/lib/supabase/server": "export function createClient(config){return globalThis.__emailConfirmation.deps.createClient(config)}",
  "@/lib/auth/active-profile-session": "export async function clearActiveProfileChoice(){globalThis.__emailConfirmation.calls.clear++}",
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
const render = async (params) => renderToStaticMarkup(await ConfirmEmailPage({ searchParams: Promise.resolve(params) }));

test("GET/render only presents a manual confirmation button; revisiting never consumes the token", async () => {
  const state = harness();
  for (let visit = 0; visit < 3; visit++) {
    const html = await render({ token_hash: token, type: "recovery", next: "https://example.invalid" });
    assert.match(html, /Confirmar meu e-mail/);
    assert.match(html, /type="submit"/);
    assert.match(html, /type="hidden" name="token_hash"/);
    assert.match(html, /href="\/entrar"/);
    assert.equal(html.includes("https://example.invalid"), false);
  }
  assert.deepEqual(state.calls.factory, []);
  assert.deepEqual(state.calls.verify, []);
  assert.deepEqual(state.calls.mutations, []);
  assert.equal(state.calls.clear, 0);
  assert.deepEqual(state.calls.redirects, []);
  assert.equal(metadata.referrer, "no-referrer");
  assert.deepEqual(metadata.robots, { index: false, follow: false });
});

test("missing, repeated and invalid GET tokens show an error and no confirmation form", async () => {
  const state = harness();
  for (const token_hash of [undefined, "", [token, token], [token], "<script>bad</script>", "a".repeat(513)]) {
    const html = await render({ token_hash });
    assert.match(html, /role="alert"/);
    assert.equal(html.includes("<form"), false);
    assert.equal(html.includes(token), false);
  }
  assert.deepEqual(state.calls.factory, []);
});

test("only the successful explicit action writes session cookies, clears selected profile and redirects to review checkpoint", async () => {
  const state = harness();
  await assert.rejects(confirmEmailAction({ status: "success", message: "untrusted" }, form()), (error) => error.destination === "/aguardando-liberacao");
  assert.deepEqual(state.calls.factory, [{ writableCookies: true }]);
  assert.deepEqual(state.calls.verify, [{ token_hash: token, type: "email" }]);
  assert.equal(state.calls.clear, 1);
  assert.deepEqual(state.calls.revalidate, [["/", "layout"]]);
  assert.deepEqual(state.calls.redirects, ["/aguardando-liberacao"]);
  assert.deepEqual(state.calls.mutations, []);
});

test("failed explicit action preserves existing profile selection and never redirects or grants access", async () => {
  for (const [data, options] of [[form(null), {}], [form(), { verifyThrow: true }]]) {
    const state = harness(options);
    const result = await confirmEmailAction({ status: "success", message: "untrusted" }, data);
    assert.deepEqual(result, { status: "error", message: emailConfirmationError });
    assert.equal(state.calls.clear, 0);
    assert.deepEqual(state.calls.redirects, []);
    assert.deepEqual(state.calls.revalidate, []);
    assert.deepEqual(state.calls.mutations, []);
  }
});
