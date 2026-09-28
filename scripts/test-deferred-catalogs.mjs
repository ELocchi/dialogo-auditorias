import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { createDeferredCatalogLoader } from "../src/lib/catalogs/deferred-loader.ts";

const actor = { userId: "user-a", profile: "AUDITOR_QUALIDADE", engineeringScope: null, administrativeScope: null };
const empty = { available: false, versions: [] };
const version = (number = 1) => ({ available: true, versions: [{ id: "revision", modelId: "quality-f176", version: number,
  label: `R${number}`, criteria: [{ id: "criterion", text: "Conferir" }] }] });
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

test("does not fetch before demand; concurrent tabs share one request and reopening uses loaded data", async () => {
  const calls = [];
  let resolve;
  const loader = createDeferredCatalogLoader(actor, empty, (url, options) => {
    calls.push({ url, options }); return new Promise((r) => { resolve = r; });
  });
  assert.equal(calls.length, 0);
  assert.equal(loader.getSnapshot().status, "idle");
  const first = loader.load();
  assert.equal(first, loader.load());
  assert.equal(calls.length, 1);
  const query = new URL(calls[0].url, "https://test.local").searchParams;
  assert.equal(query.get("usuario"), actor.userId);
  assert.equal(query.get("perfil"), actor.profile);
  assert.equal(calls[0].options.cache, "no-store");
  resolve(response(version()));
  assert.deepEqual(await first, version());
  assert.deepEqual(await loader.load(), version());
  assert.equal(calls.length, 1);
});

test("starting a new audit explicitly refreshes the revision and never accepts a failed load as a bundled catalog", async () => {
  let calls = 0;
  const loader = createDeferredCatalogLoader(actor, version(), async () => ++calls === 1 ? response(version(2)) : response(empty, 503));
  assert.equal((await loader.load()).versions[0].version, 1);
  assert.equal(calls, 0);
  assert.equal((await loader.load(true)).versions[0].version, 2);
  await assert.rejects(loader.load(true), /carregar os roteiros/);
  assert.equal(loader.getSnapshot().status, "error");
});

test("errors permit retry and only the explicit missing-migration signal allows initial catalog fallback", async () => {
  let calls = 0;
  const loader = createDeferredCatalogLoader(actor, empty, async () => response(++calls === 1 ? empty : { ...empty, setupPending: true }));
  await assert.rejects(loader.load(), /confirmar os roteiros/);
  assert.equal(loader.getSnapshot().status, "error");
  assert.equal((await loader.load()).setupPending, true);
  assert.equal(loader.getSnapshot().status, "ready");
});

test("profile disposal discards late replies and a strict-mode restart can load again", async () => {
  let resolve, signal;
  let calls = 0;
  const loader = createDeferredCatalogLoader(actor, empty, (_url, options) => {
    signal = options.signal;
    if (++calls === 1) return new Promise((r) => { resolve = r; });
    return Promise.resolve(response(version(2)));
  });
  const cancelled = loader.load();
  loader.cancel();
  assert.equal(signal.aborted, true);
  resolve(response(version()));
  await assert.rejects(cancelled, { name: "AbortError" });
  assert.equal(loader.getSnapshot().status, "idle");
  assert.deepEqual(loader.getSnapshot().catalogs, empty);
  assert.equal((await loader.load()).versions[0].version, 2);
});

test("saving a catalog replaces cached data and an older request cannot overwrite the saved revision", async () => {
  let resolve;
  const loader = createDeferredCatalogLoader(actor, version(), () => new Promise((r) => { resolve = r; }));
  const stale = loader.load(true);
  loader.replace(version(3));
  resolve(response(version(2)));
  await assert.rejects(stale, { name: "AbortError" });
  assert.equal((await loader.load()).versions[0].version, 3);
});

const fixture = { status: 200, context: { profile: actor.profile }, snapshot: version(), clients: 0, reads: 0 };
globalThis.__catalogRouteFixture = fixture;
const modules = {
  "@/lib/supabase/server": "export async function createClient(){globalThis.__catalogRouteFixture.clients++;return 'session-client'}",
  "@/lib/catalogs/contracts": "export const unavailableCatalogs=()=>({available:false,versions:[]});",
  "@/lib/catalogs/service": "export async function readCatalogSnapshot(client,context){const f=globalThis.__catalogRouteFixture;if(client!=='session-client'||context!==f.context)throw Error('wrong access');f.reads++;return f.snapshot}",
  "@/lib/audits/request-context": "export const auditResponseHeaders={'Cache-Control':'private, no-store',Vary:'Cookie'};export async function readAuditRequestContext(){const f=globalThis.__catalogRouteFixture;return {context:f.status===200?f.context:null,status:f.status}}",
};
registerHooks({ resolve(specifier, context, next) {
  return modules[specifier] ? { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true } : next(specifier, context);
} });
const { GET } = await import("../src/app/api/catalogs/route.ts");

test("catalog endpoint fails closed before reading and keeps every response private", async () => {
  for (const status of [401, 403]) {
    fixture.status = status;
    const result = await GET(new Request("https://test.local/api/catalogs"));
    assert.equal(result.status, status);
    assert.equal(result.headers.get("cache-control"), "private, no-store");
    assert.equal(result.headers.get("vary"), "Cookie");
  }
  assert.equal(fixture.clients, 0);
  assert.equal(fixture.reads, 0);
  fixture.status = 200;
  for (const [snapshot, status] of [[version(), 200], [empty, 503], [{ ...empty, setupPending: true }, 200]]) {
    fixture.snapshot = snapshot;
    const result = await GET(new Request("https://test.local/api/catalogs"));
    assert.equal(result.status, status);
    assert.deepEqual(await result.json(), snapshot);
    assert.equal(result.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(fixture.reads, 3);
});
