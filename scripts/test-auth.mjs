import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createServerClient } from "@supabase/ssr";
import { accountDestination, corporateEmail, validateSignIn, validateSignUp } from "../src/lib/auth/validation.ts";
import { requestAccess, signIn, signOut } from "../src/lib/auth/service.ts";

// Offline service/validation tests only. These are not live Auth or database/RLS
// tests. Fixtures never load .env, call Supabase, create accounts or send emails.
const fixtureEmail = "Teste.Automatizado+offline@dialogo.com.br";
const fixturePassword = "ARTIFICIAL_PASSWORD_FOR_OFFLINE_TEST_ONLY";
const privateMarker = "ARTIFICIAL_PROVIDER_DETAIL_MUST_NOT_ESCAPE";
const callbackUrl = "http://127.0.0.1:3001/auth/callback";
const originalFetch = globalThis.fetch;
let attemptedNetwork = 0;

before(() => {
  globalThis.fetch = async () => {
    attemptedNetwork++;
    throw new Error("NETWORK_FORBIDDEN_IN_AUTH_UNIT_TESTS");
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(attemptedNetwork, 0, "No test may contact an external service.");
});

function form(overrides = {}) {
  const result = new FormData();
  const fields = {
    email: fixtureEmail,
    password: fixturePassword,
    passwordConfirmation: fixturePassword,
    nome: "Pessoa de teste offline",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined) result.set(key, value);
  }
  return result;
}

function harness(overrides = {}) {
  const calls = { factory: 0, rpc: [], tables: [], signup: [], signin: [], signout: [] };
  const client = {
    rpc: async (...args) => {
      calls.rpc.push(args);
      throw new Error("RPC_FORBIDDEN_DURING_AUTHENTICATION");
    },
    from: (...args) => {
      calls.tables.push(args);
      throw new Error("DIRECT_TABLE_ACCESS_FORBIDDEN_DURING_AUTHENTICATION");
    },
    auth: {
      signUp: async (...args) => {
        calls.signup.push(args);
        if (overrides.signupThrow) throw new Error(privateMarker);
        return overrides.signup ?? { data: { user: null, session: null }, error: null };
      },
      signInWithPassword: async (...args) => {
        calls.signin.push(args);
        if (overrides.signinThrow) throw new Error(privateMarker);
        return overrides.signin ?? {
          data: { user: { id: "offline-user", email: fixtureEmail }, session: {} },
          error: null,
        };
      },
      signOut: async (...args) => {
        calls.signout.push(args);
        if (overrides.signoutThrow) throw new Error(privateMarker);
        return overrides.signout ?? { error: null };
      },
    },
  };
  return {
    calls,
    deps: {
      createClient: async () => {
        calls.factory++;
        if (overrides.factoryThrow) throw new Error(privateMarker);
        return client;
      },
      callbackUrl: () => {
        if (overrides.callbackThrow) throw new Error(privateMarker);
        return callbackUrl;
      },
    },
  };
}

function safeResult(result) {
  const output = JSON.stringify(result);
  for (const forbidden of [fixturePassword, privateMarker, callbackUrl]) {
    assert.equal(output.includes(forbidden), false, "Public results must not expose private inputs or provider details.");
  }
}

function pendingResult(result) {
  safeResult(result);
  assert.equal(result.state.status, "success");
  assert.equal(result.redirectTo, "/aguardando-liberacao");
  assert.match(result.state.message, /Aguardando liberação do Administrativo/);
}

test("corporate domain is exact and case-insensitive, preserving local dots, suffix and casing", () => {
  for (const [value, expected] of [
    ["pessoa@dialogo.com.br", "pessoa@dialogo.com.br"],
    ["Pessoa.Sobrenome+obra@DIALOGO.COM.BR", "Pessoa.Sobrenome+obra@dialogo.com.br"],
    ["  Pessoa.Sobrenome+obra@Dialogo.Com.Br  ", "Pessoa.Sobrenome+obra@dialogo.com.br"],
    [`${"a".repeat(64)}@dialogo.com.br`, `${"a".repeat(64)}@dialogo.com.br`],
  ]) assert.equal(corporateEmail(value), expected);
  assert.notEqual(corporateEmail("pessoa.sobrenome@dialogo.com.br"), corporateEmail("pessoasobrenome@dialogo.com.br"));
  assert.notEqual(corporateEmail("pessoa+obra@dialogo.com.br"), corporateEmail("pessoa@dialogo.com.br"));
});

test("other domains, subdomains and lookalikes cannot pass through substring matching", () => {
  for (const value of [
    "pessoa@example.invalid", "pessoa@obra.dialogo.com.br", "pessoa@dialogo.com.br.attacker.invalid",
    "pessoa@dialogo-com.br", "pessoa@dialogo.com", "pessoa@dialog0.com.br",
    "dialogo.com.br@attacker.invalid", "pessoa+dialogo.com.br@attacker.invalid",
    "pessoa@dialogo.com.br.", "pessoa@diálogo.com.br", "pessoa@dialogo.com.br/",
  ]) assert.equal(corporateEmail(value), null);
});

test("malformed or unsupported mailbox formats and non-string input are rejected", () => {
  for (const value of [
    null, undefined, 123, {}, "", " ", "@dialogo.com.br", "pessoa@@dialogo.com.br",
    "pessoa", "pessoa @dialogo.com.br", "pessoa@ dialogo.com.br", "pessoa\n@dialogo.com.br",
    ".pessoa@dialogo.com.br", "pessoa.@dialogo.com.br", "pessoa..sobrenome@dialogo.com.br",
    "Pessoa <pessoa@dialogo.com.br>", '"pessoa sobrenome"@dialogo.com.br',
    "pessóa@dialogo.com.br", `${"a".repeat(65)}@dialogo.com.br`,
  ]) assert.equal(corporateEmail(value), null);
});

test("server validation rejects missing credentials and file inputs", () => {
  for (const input of [form({ email: null }), form({ password: null }), form({ password: "" })]) {
    assert.equal(validateSignIn(input).ok, false);
  }
  const fileEmail = form();
  fileEmail.set("email", new Blob(["fixture"]), "offline.txt");
  assert.equal(validateSignIn(fileEmail).ok, false);
});

test("server validation preserves the password exactly instead of trimming it", () => {
  const password = ` ${fixturePassword} `;
  const result = validateSignIn(form({ password }));
  assert.equal(result.ok, true);
  assert.equal(result.data.password, password);
});

test("password mismatch and missing confirmation fail before initializing the Auth client", async () => {
  for (const passwordConfirmation of ["DIFFERENT_OFFLINE_VALUE", null, ""]) {
    const { calls, deps } = harness();
    const result = await requestAccess(form({ passwordConfirmation }), deps);
    assert.equal(result.state.status, "error");
    assert.match(result.state.message, /confirmação/);
    assert.equal(calls.factory, 0);
    safeResult(result);
  }
});

test("invalid corporate domain is denied by both server services before any client call", async () => {
  for (const action of [requestAccess, signIn]) {
    const { calls, deps } = harness();
    const result = await action(form({ email: "pessoa@sub.dialogo.com.br" }), deps);
    assert.equal(result.state.status, "error");
    assert.equal(calls.factory, 0);
    assert.equal(result.redirectTo, undefined);
  }
});

test("declared fields are trimmed and bounded; optional blank fields remain absent", () => {
  const result = validateSignUp(form({ nome: "  Pessoa offline  ", cargoArea: " ", obraReferencia: "  " }));
  assert.equal(result.ok, true);
  assert.equal(result.data.nome, "Pessoa offline");
  assert.equal(result.data.cargo_area_informado, null);
  assert.equal(result.data.obra_referencia_informada, null);
  for (const fields of [
    { nome: null }, { nome: " " }, { nome: "a".repeat(161) },
    { cargoArea: "a".repeat(161) }, { obraReferencia: "a".repeat(161) },
  ]) assert.equal(validateSignUp(form(fields)).ok, false);
});

test("signup forwards only credentials and declared metadata, never caller-assigned status or permissions", async () => {
  const { calls, deps } = harness();
  const result = await requestAccess(form({
    nome: " Pessoa offline ", cargoArea: " Área declarada ", obraReferencia: " Referência livre ",
    status_acesso: "APROVADO", perfil: "ADMINISTRATIVO", role: "service_role",
    email_confirmado_em: "2030-01-01", auth_user_id: "another-user",
    obras: "all", modulos: "all", approved: "true",
  }), deps);
  assert.deepEqual(calls.rpc, []);
  assert.deepEqual(calls.tables, []);
  assert.deepEqual(calls.signup, [[{
    email: fixtureEmail,
    password: fixturePassword,
    options: {
      emailRedirectTo: callbackUrl,
      data: {
        nome: "Pessoa offline",
        cargo_area_informado: "Área declarada",
        obra_referencia_informada: "Referência livre",
      },
    },
  }]]);
  assert.equal(result.state.status, "success");
  assert.equal(result.redirectTo, undefined);
  safeResult(result);
});

test("signup reaches Auth without a readiness RPC or direct table access", async () => {
  // Both RPC and table methods throw if called. The deployed database trigger,
  // not the anonymous PostgREST client, owns access_requests creation.
  const { calls, deps } = harness();
  const result = await requestAccess(form(), deps);
  assert.equal(calls.signup.length, 1);
  assert.deepEqual(calls.rpc, []);
  assert.deepEqual(calls.tables, []);
  assert.equal(result.state.status, "success");
  assert.equal(result.redirectTo, undefined);
  safeResult(result);
});

test("official SSR SDK sends only Auth signup with the local callback, PKCE and declared metadata", async () => {
  const requests = [];
  const cookieJar = new Map();
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: fixtureEmail,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { nome: "Pessoa de teste offline" },
    identities: [],
    created_at: "2026-09-13T00:00:00Z",
    updated_at: "2026-09-13T00:00:00Z",
  };
  const client = createServerClient(
    "https://offline-auth-fixture.invalid",
    "sb_publishable_ARTIFICIAL_OFFLINE_FIXTURE_ONLY",
    {
      cookies: {
        getAll: () => Array.from(cookieJar, ([name, value]) => ({ name, value })),
        setAll: (cookies) => {
          for (const { name, value } of cookies) cookieJar.set(name, value);
        },
      },
      global: {
        fetch: async (input, init) => {
          const url = new URL(input instanceof Request ? input.url : input);
          requests.push({ url, method: init?.method, body: init?.body });
          assert.equal(url.origin, "https://offline-auth-fixture.invalid");
          assert.equal(url.pathname, "/auth/v1/signup", "No RPC, table or other endpoint is permitted.");
          assert.equal(init?.method, "POST");
          return new Response(JSON.stringify(user), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    },
  );
  const result = await requestAccess(form({
    cargoArea: " Área declarada ", obraReferencia: " Referência livre ",
    status_acesso: "APROVADO", auth_user_id: "another-user",
    perfil: "ADMINISTRATIVO", approved: "true", obras: "all", modulos: "all",
  }), { createClient: async () => client, callbackUrl: () => callbackUrl });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.searchParams.get("redirect_to"), callbackUrl);
  const body = JSON.parse(requests[0].body);
  assert.equal(body.email, fixtureEmail);
  assert.equal(body.password, fixturePassword);
  assert.deepEqual(body.data, {
    nome: "Pessoa de teste offline",
    cargo_area_informado: "Área declarada",
    obra_referencia_informada: "Referência livre",
  });
  assert.equal(body.code_challenge_method, "s256");
  assert.equal(typeof body.code_challenge, "string");
  assert.ok(body.code_challenge.length > 0);
  assert.ok(Array.from(cookieJar).some(([name, value]) => name.endsWith("-code-verifier") && value.length > 0));
  for (const value of cookieJar.values()) assert.equal(value.includes(fixturePassword), false);
  const session = await client.auth.getSession();
  assert.equal(session.error, null);
  assert.equal(session.data.session, null);
  assert.equal(requests.length, 1, "Checking the empty session must not request a real endpoint.");
  assert.equal(result.state.status, "success");
  assert.equal(result.redirectTo, undefined);
  assert.match(result.state.message, /Confirme o e-mail antes de entrar/);
  safeResult(result);
});

test("signup without an authenticated session gives a neutral confirmation notice", async () => {
  const { deps } = harness({ signup: {
    data: { user: { id: "offline-user", email: fixtureEmail }, session: null }, error: null,
  } });
  const result = await requestAccess(form(), deps);
  assert.equal(result.state.status, "success");
  assert.equal(result.redirectTo, undefined);
  assert.match(result.state.message, /Se o cadastro puder ser processado/);
  assert.match(result.state.message, /Confirme o e-mail antes de entrar/);
  safeResult(result);
});

test("duplicate and provider-rejected signup results do not reveal account existence", async () => {
  const normal = await requestAccess(form(), harness().deps);
  for (const code of ["user_already_exists", "email_exists", "weak_password", "over_email_send_rate_limit"]) {
    const { deps } = harness({ signup: {
      data: { user: null, session: null }, error: { code, message: privateMarker },
    } });
    const result = await requestAccess(form(), deps);
    assert.deepEqual(result, normal);
    safeResult(result);
  }
});

test("signup with a provider session still leads only to pending administrative release", async () => {
  const { deps } = harness({ signup: {
    data: { user: { id: "offline-user", email: fixtureEmail, user_metadata: { status_acesso: "APROVADO" } }, session: {} },
    error: null,
  } });
  pendingResult(await requestAccess(form(), deps));
});

test("signup configuration and service exceptions produce safe errors without redirects", async () => {
  for (const overrides of [{ factoryThrow: true }, { signupThrow: true }, { callbackThrow: true }]) {
    const result = await requestAccess(form(), harness(overrides).deps);
    assert.equal(result.state.status, "error");
    assert.equal(result.redirectTo, undefined);
    safeResult(result);
  }
});

test("login uses the submitted platform password and sends no profile or approval parameters", async () => {
  const { calls, deps } = harness();
  const result = await signIn(form({ perfil: "ADMINISTRATIVO", status_acesso: "APROVADO" }), deps);
  assert.deepEqual(calls.signin, [[{ email: fixtureEmail, password: fixturePassword }]]);
  assert.equal(calls.rpc.length, 0);
  pendingResult(result);
});

test("provider rejection, unconfirmed email and unknown account share a generic login response", async () => {
  let expected;
  for (const code of ["invalid_credentials", "email_not_confirmed", "user_not_found"]) {
    const { deps } = harness({ signin: {
      data: { user: null, session: null }, error: { code, message: privateMarker },
    } });
    const result = await signIn(form(), deps);
    assert.equal(result.state.status, "error");
    assert.equal(result.redirectTo, undefined);
    if (expected) assert.deepEqual(result, expected);
    expected = result;
    safeResult(result);
  }
});

test("login fails closed for missing or noncorporate identities even if no provider error is returned", async () => {
  for (const user of [null, { id: "offline-user" }, { id: "offline-user", email: "person@attacker.invalid" }]) {
    const { deps } = harness({ signin: { data: { user, session: null }, error: null } });
    const result = await signIn(form(), deps);
    assert.equal(result.state.status, "error");
    assert.equal(result.redirectTo, undefined);
    safeResult(result);
  }
});

test("forged approved metadata cannot route an authenticated identity to operations", async () => {
  const { deps } = harness({ signin: {
    data: {
      user: {
        id: "offline-user", email: fixtureEmail,
        user_metadata: { status_acesso: "APROVADO", role: "ADMINISTRATIVO", approved: true },
        app_metadata: { status_acesso: "APROVADO", permissions: ["*"] },
      },
      session: {},
    },
    error: null,
  } });
  pendingResult(await signIn(form(), deps));
});

test("login initialization and network-like exceptions do not expose private details", async () => {
  for (const overrides of [{ factoryThrow: true }, { signinThrow: true }]) {
    const result = await signIn(form(), harness(overrides).deps);
    assert.equal(result.state.status, "error");
    assert.equal(result.redirectTo, undefined);
    safeResult(result);
  }
});

test("account destination denies operations for anonymous, pending and forged-approved identities", () => {
  assert.equal(accountDestination(null), "/entrar");
  assert.equal(accountDestination({ id: "", email: fixtureEmail }), "/entrar");
  assert.equal(accountDestination({ id: "offline-user", email: "person@sub.dialogo.com.br" }), "/entrar");
  assert.equal(accountDestination({ id: "offline-user", email: fixtureEmail }), "/aguardando-liberacao");
  assert.equal(accountDestination({
    id: "offline-user", email: fixtureEmail, status_acesso: "APROVADO",
    user_metadata: { role: "ADMINISTRATIVO" },
  }), "/aguardando-liberacao");
});

test("logout delegates current-session termination to the official SDK and redirects only on success", async () => {
  const { calls, deps } = harness();
  const result = await signOut(deps);
  assert.deepEqual(calls.signout, [[{ scope: "local" }]]);
  assert.equal(result.state.status, "success");
  assert.equal(result.redirectTo, "/entrar");
  safeResult(result);
});

test("logout failure is not presented as a terminated session or successful redirect", async () => {
  for (const overrides of [
    { signout: { error: { message: privateMarker } } }, { signoutThrow: true }, { factoryThrow: true },
  ]) {
    const result = await signOut(harness(overrides).deps);
    assert.equal(result.state.status, "error");
    assert.equal(result.redirectTo, undefined);
    safeResult(result);
  }
});

test("service errors never write credentials or provider details to console logs", async () => {
  const methods = ["log", "error", "warn"];
  const originals = new Map(methods.map((name) => [name, console[name]]));
  const emitted = [];
  for (const method of methods) console[method] = (...args) => emitted.push(args);
  try {
    await requestAccess(form(), harness({ signupThrow: true }).deps);
    await signIn(form(), harness({ signinThrow: true }).deps);
    await signOut(harness({ signoutThrow: true }).deps);
    assert.deepEqual(emitted, []);
  } finally {
    for (const [method, original] of originals) console[method] = original;
  }
});
