import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { AuthApiError, AuthError, AuthRetryableFetchError, AuthUnknownError } from "@supabase/supabase-js";
import { classifyLoginFailure, loginDiagnosticCodes, loginRejectedMessage } from "../src/lib/auth/login-diagnostics.ts";
import { signIn } from "../src/lib/auth/service.ts";

// No environment, account, session, network or live password is used here.
const privateMarker = "SYNTHETIC_SECRET_MUST_NOT_ESCAPE_DIAGNOSTICS";
const originalFetch = globalThis.fetch;
let attemptedNetwork = 0;
before(() => {
  globalThis.fetch = async () => {
    attemptedNetwork++;
    throw new Error("NETWORK_FORBIDDEN_IN_LOGIN_DIAGNOSTIC_TESTS");
  };
});
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(attemptedNetwork, 0);
});

function classify(error, stage = "password_sign_in") {
  const result = classifyLoginFailure(error, stage);
  assert.deepEqual(Object.keys(result).sort(), ["code", "message"]);
  assert.ok(loginDiagnosticCodes.includes(result.code));
  assert.equal(JSON.stringify(result).includes(privateMarker), false);
  return result;
}

test("account existence, confirmation and credentials have the same public result", () => {
  for (const code of ["invalid_credentials", "email_not_confirmed", "user_not_found", "user_banned", "phone_not_confirmed", "email_address_not_authorized", "email_address_invalid"]) {
    for (const status of [400, 401, 403, 404, 422, 500]) {
      assert.deepEqual(classify(new AuthApiError(privateMarker, status, code)), {
        code: "LOGIN_REJECTED", message: loginRejectedMessage,
      });
    }
  }
});

test("SDK retryable failures distinguish connection from provider failure", () => {
  assert.equal(classify(new AuthRetryableFetchError(privateMarker, 0)).code, "LOGIN_CONNECTION_FAILED");
  for (const status of [500, 502, 503, 504, 530, 599]) {
    assert.equal(classify(new AuthRetryableFetchError(privateMarker, status)).code, "LOGIN_PROVIDER_FAILED");
    assert.equal(classify(new AuthApiError(privateMarker, status, privateMarker)).code, "LOGIN_PROVIDER_FAILED");
  }
});

test("rate limits use only SDK numeric status or the fixed provider code allowlist", () => {
  assert.equal(classify(new AuthApiError(privateMarker, 429, privateMarker)).code, "LOGIN_RATE_LIMITED");
  for (const code of ["over_request_rate_limit", "over_email_send_rate_limit", "over_sms_send_rate_limit"]) {
    assert.equal(classify(new AuthApiError(privateMarker, 400, code)).code, "LOGIN_RATE_LIMITED");
  }
  for (const status of ["429", "503", NaN, Infinity, -1, 0, 600, 500.5]) {
    assert.equal(classify(new AuthError(privateMarker, status, privateMarker)).code, "LOGIN_UNEXPECTED_FAILED");
  }
});

test("the cookie failure sentinel requires the exact internal non-provider Error", () => {
  const sentinel = "Não foi possível manter a sessão.";
  for (const stage of ["client_setup", "password_sign_in"]) {
    assert.equal(classify(new Error(sentinel), stage).code, "LOGIN_SESSION_FAILED");
  }
  assert.equal(classify({ message: sentinel }).code, "LOGIN_UNEXPECTED_FAILED");
  assert.equal(classify(new Error(`${sentinel} ${privateMarker}`)).code, "LOGIN_UNEXPECTED_FAILED");
  assert.equal(classify(new AuthApiError(sentinel, 400, privateMarker)).code, "LOGIN_REJECTED");
});

test("unknown failures remain closed and setup has a fixed diagnostic", () => {
  const errors = [undefined, null, privateMarker, false, new Error(privateMarker), { status: 503, code: privateMarker }, new AuthUnknownError(privateMarker, { cause: privateMarker })];
  for (const error of errors) {
    assert.equal(classify(error).code, "LOGIN_UNEXPECTED_FAILED");
  }
  for (const error of [undefined, null, privateMarker, new Error(privateMarker), { code: privateMarker }]) {
    assert.equal(classify(error, "client_setup").code, "LOGIN_SETUP_FAILED");
  }
});

test("raw messages, stacks, causes and arbitrary codes never enter results or logs", () => {
  const emitted = [];
  const originals = Object.fromEntries(["log", "warn", "error"].map((key) => [key, console[key]]));
  try {
    for (const key of Object.keys(originals)) console[key] = (...args) => emitted.push(args);
    const errors = [new Error(privateMarker, { cause: { password: privateMarker } }), new AuthApiError(privateMarker, 503, privateMarker), new AuthError(privateMarker, 400, privateMarker)];
    for (const error of errors) {
      error.stack = privateMarker;
      error.body = { access_token: privateMarker };
      error.cause = { cookie: privateMarker };
      classify(error);
    }
    assert.deepEqual(emitted, []);
  } finally {
    for (const [key, method] of Object.entries(originals)) console[key] = method;
  }
});

test("malformed error accessors cannot throw or disclose their thrown details", () => {
  const malformed = { __isAuthError: true, get code() { throw new Error(privateMarker); } };
  assert.equal(classify(malformed).code, "LOGIN_UNEXPECTED_FAILED");
  assert.equal(classify(malformed, "client_setup").code, "LOGIN_SETUP_FAILED");
  const proxy = new Proxy({}, { has() { throw new Error(privateMarker); } });
  assert.equal(classify(proxy).code, "LOGIN_UNEXPECTED_FAILED");
});

test("returned diagnostics do not share mutable result objects", () => {
  const error = new AuthRetryableFetchError(privateMarker, 0);
  const first = classify(error);
  first.message = privateMarker;
  first.code = privateMarker;
  assert.equal(classify(error).code, "LOGIN_CONNECTION_FAILED");
});

function offlineLoginForm() {
  const form = new FormData();
  form.set("email", "fixture.offline@dialogo.com.br");
  form.set("password", privateMarker);
  return form;
}

test("signIn reports one fixed code without passing the error or submitted credentials", async () => {
  for (const error of [new AuthRetryableFetchError(privateMarker, 0), new AuthApiError(privateMarker, 400, "invalid_credentials")]) {
    const reported = [];
    const result = await signIn(offlineLoginForm(), {
      createClient: async () => ({ auth: { signInWithPassword: async () => ({ data: { user: null }, error }) } }),
      reportFailure: (...args) => reported.push(args),
    });
    assert.deepEqual(reported, [[classify(error).code]]);
    assert.equal(JSON.stringify({ result, reported }).includes(privateMarker), false);
    assert.equal(result.state.status, "error");
    assert.equal(result.redirectTo, undefined);
  }
});

test("a broken diagnostic reporter cannot change the safe login rejection", async () => {
  const result = await signIn(offlineLoginForm(), {
    createClient: async () => ({ auth: { signInWithPassword: async () => ({ data: { user: null }, error: new AuthApiError(privateMarker, 400, "invalid_credentials") }) } }),
    reportFailure: () => { throw new Error(privateMarker); },
  });
  assert.deepEqual(result, { state: { status: "error", message: loginRejectedMessage } });
});

test("successful signIn reports nothing and preserves the pending access redirect", async () => {
  const reported = [];
  const result = await signIn(offlineLoginForm(), {
    createClient: async () => ({ auth: { signInWithPassword: async () => ({ data: { user: { id: "offline-only", email: "fixture.offline@dialogo.com.br" }, session: {} }, error: null }) } }),
    reportFailure: (...args) => reported.push(args),
  });
  assert.deepEqual(reported, []);
  assert.equal(result.state.status, "success");
  assert.equal(result.redirectTo, "/aguardando-liberacao");
});
