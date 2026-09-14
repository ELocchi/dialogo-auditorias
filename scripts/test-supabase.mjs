import assert from "node:assert/strict";
import test from "node:test";
import { getSupabaseConfig } from "../src/lib/supabase/config.ts";
import { checkSupabase } from "./check-supabase.mjs";

// Artificial fixtures only. Never load .env files or contact a real service.
const URL_NAME = "NEXT_PUBLIC_SUPABASE_URL";
const KEY_NAME = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const fixtureUrl = "https://supabase-fixture.invalid";
const fixtureKey = "sb_publishable_example";
const privateMarker = "ARTIFICIAL_REMOTE_DETAIL_MUST_NOT_ESCAPE";

async function isolated(action, { url = fixtureUrl, key = fixtureKey } = {}) {
  const previous = new Map([URL_NAME, KEY_NAME].map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let unexpectedNetwork = 0;
  for (const [name, value] of [[URL_NAME, url], [KEY_NAME, key]]) {
    if (value === null) delete process.env[name];
    else process.env[name] = value;
  }
  globalThis.fetch = async () => {
    unexpectedNetwork++;
    throw new Error("NETWORK_FORBIDDEN_IN_OFFLINE_TEST");
  };
  try {
    await action();
    assert.equal(unexpectedNetwork, 0, "The SDK must not perform a network request for an empty session.");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function safeResult(result, expectedStatus) {
  assert.deepEqual(Object.keys(result).sort(), [
    "authReachable", "clientsInitialized", "publishableKeyConfigured", "session", "status", "urlConfigured",
  ]);
  assert.equal(result.status, expectedStatus);
  const output = JSON.stringify(result);
  for (const forbidden of [fixtureUrl, fixtureKey, privateMarker]) {
    assert.equal(output.includes(forbidden), false, "Diagnostic must contain statuses only.");
  }
}

test("missing or blank public configuration fails without echoing the supplied value", async () => {
  for (const values of [
    { url: null }, { key: null }, { url: "  " }, { key: "  " }, { url: null, key: null },
  ]) {
    await isolated(async () => {
      assert.throws(getSupabaseConfig, { message: "Configuração pública do Supabase incompleta." });
      let requests = 0;
      const result = await checkSupabase({ fetcher: async () => { requests++; throw new Error(privateMarker); } });
      safeResult(result, "configuration_error");
      assert.equal(requests, 0);
      assert.equal(result.clientsInitialized, false);
      assert.equal(result.authReachable, false);
      assert.equal(result.session, "not_checked");
      assert.equal(result.urlConfigured, !!process.env[URL_NAME]?.trim());
      assert.equal(result.publishableKeyConfigured, !!process.env[KEY_NAME]?.trim());
    }, values);
  }
});

test("invalid URLs and non-public credentials fail with a fixed configuration error", async () => {
  const invalid = [
    { url: "invalid-url" },
    { url: "http://supabase-fixture.invalid" },
    { url: "ftp://supabase-fixture.invalid" },
    { url: "https://example:fake@supabase-fixture.invalid" },
    { url: `${fixtureUrl}/unexpected` },
    { url: `${fixtureUrl}/?detail=${privateMarker}` },
    { url: `${fixtureUrl}/#${privateMarker}` },
    { key: "sb_secret_artificial_fixture" },
    { key: "eyJhbGciOiJub25lIn0.artificial.fixture" },
    { key: "service_role_artificial_fixture" },
    { key: "sb_publishable_" },
    { key: "sb_publishable_example with space" },
  ];
  for (const values of invalid) {
    await isolated(async () => {
      assert.throws(getSupabaseConfig, { message: "Configuração pública do Supabase inválida." });
      const result = await checkSupabase({ fetcher: async () => { assert.fail("Invalid configuration must not reach Auth."); } });
      safeResult(result, "configuration_error");
      assert.equal(result.clientsInitialized, false);
      assert.equal(result.authReachable, false);
    }, values);
  }
});

test("valid public configuration is normalized and local HTTP is limited to loopback", async () => {
  await isolated(async () => {
    assert.deepEqual(getSupabaseConfig(), { url: fixtureUrl, publishableKey: fixtureKey });
  }, { url: ` ${fixtureUrl}/ `, key: ` ${fixtureKey} ` });
  for (const url of ["http://localhost:54321", "http://127.0.0.1:54321", "http://[::1]:54321"]) {
    await isolated(async () => assert.equal(getSupabaseConfig().url, url), { url });
  }
  await isolated(async () => {
    assert.throws(getSupabaseConfig, { message: "Configuração pública do Supabase inválida." });
  }, { url: "http://localhost.attacker.invalid" });
});

test("empty session alone is not a connection: rejected Auth request remains disconnected", async () => {
  await isolated(async () => {
    let requests = 0;
    const result = await checkSupabase({ fetcher: async () => {
      requests++;
      return Response.json({ detail: privateMarker }, { status: 401 });
    } });
    safeResult(result, "connection_error");
    assert.equal(requests, 1);
    assert.equal(result.clientsInitialized, true);
    assert.equal(result.session, "none");
    assert.equal(result.authReachable, false);
  });
});

test("HTTP 200 with valid Auth settings confirms connection without disclosing settings", async () => {
  await isolated(async () => {
    let requests = 0;
    const result = await checkSupabase({ fetcher: async (url, options) => {
      requests++;
      assert.equal(url.href, `${fixtureUrl}/auth/v1/settings`);
      assert.equal(options.method, "GET");
      assert.equal(options.headers.apikey, fixtureKey);
      assert.equal(options.headers.Accept, "application/json");
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "error");
      assert(options.signal instanceof AbortSignal);
      assert.equal(options.signal.aborted, false);
      return Response.json({ disable_signup: true, detail: privateMarker });
    } });
    safeResult(result, "connected");
    assert.equal(requests, 1);
    assert.equal(result.clientsInitialized, true);
    assert.equal(result.authReachable, true);
    assert.equal(result.session, "none");
  });
});

test("Auth settings accepting signup also represent a successful read-only response", async () => {
  await isolated(async () => {
    const result = await checkSupabase({ fetcher: async () => Response.json({ disable_signup: false }) });
    safeResult(result, "connected");
    assert.equal(result.authReachable, true);
  });
});

test("unexpected HTTP statuses do not confirm a connection even with a valid-looking body", async () => {
  for (const status of [201, 202, 206, 301, 401, 403, 429, 500, 503]) {
    await isolated(async () => {
      const result = await checkSupabase({ fetcher: async () => Response.json({ disable_signup: false }, { status }) });
      safeResult(result, "connection_error");
      assert.equal(result.authReachable, false);
      assert.equal(result.session, "none");
    });
  }
});

test("HTML, malformed JSON, missing fields and wrong field types are not Auth success", async () => {
  const responses = [
    () => new Response(`<html>${privateMarker}</html>`, { headers: { "Content-Type": "text/html" } }),
    () => new Response("{ invalid json", { headers: { "Content-Type": "application/json" } }),
    () => Response.json(null),
    () => Response.json({}),
    () => Response.json({ detail: privateMarker }),
    () => Response.json({ disable_signup: "false" }),
    () => Response.json({ disable_signup: 0 }),
    () => Response.json([{ disable_signup: false }]),
  ];
  for (const response of responses) {
    await isolated(async () => {
      const result = await checkSupabase({ fetcher: async () => response() });
      safeResult(result, "connection_error");
      assert.equal(result.authReachable, false);
    });
  }
});

test("network failure and simulated timeout return safe failure statuses without raw errors", async () => {
  for (const error of [
    new Error(`${privateMarker} ${fixtureUrl} ${fixtureKey}`),
    new DOMException(privateMarker, "TimeoutError"),
    new DOMException(privateMarker, "AbortError"),
  ]) {
    await isolated(async () => {
      const result = await checkSupabase({ fetcher: async () => { throw error; } });
      safeResult(result, "connection_error");
      assert.equal(result.authReachable, false);
      assert.equal(result.clientsInitialized, true);
      assert.equal(result.session, "none");
    });
  }
});

test("diagnostic returns statuses without logging response bodies or credentials", async () => {
  await isolated(async () => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const emitted = [];
    console.log = (...args) => emitted.push(args);
    console.error = (...args) => emitted.push(args);
    console.warn = (...args) => emitted.push(args);
    try {
      const result = await checkSupabase({ fetcher: async () => { throw new Error(privateMarker); } });
      safeResult(result, "connection_error");
      assert.deepEqual(emitted, []);
    } finally {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }
  });
});
