import assert from "node:assert/strict";
import test from "node:test";
import { createAuditDetailLoader } from "../src/lib/audits/detail-loader.ts";

const audit = { id: "b1760000-2026-4923-8000-000000000001", workId: "work-a", modelId: "quality-f176", status: "Publicada", isDemo: false };
const actor = { userId: "user-a", profile: "ENGENHARIA", engineeringScope: "EQUIPE_OBRA", administrativeScope: null };
const initial = { available: true, audits: [audit], responses: {}, criteriaSnapshots: {} };
const detail = { ...initial, responses: { [audit.id]: { [audit.modelId]: { item: { note: "Pendência" } } } },
  criteriaSnapshots: { [audit.id]: [{ id: "item" }] } };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test("opening an audit fetches once, reuses concurrent demand and sends the active profile", async () => {
  const request = deferred();
  let calls = 0;
  const applied = [];
  const loader = createAuditDetailLoader({ actor, initial, onLoaded: (value) => applied.push(value), fetcher: async (url, options) => {
    calls += 1;
    const parsed = new URL(url, "https://app.example");
    assert.equal(parsed.pathname, `/api/audits/${audit.id}`);
    assert.equal(parsed.searchParams.get("usuario"), actor.userId);
    assert.equal(parsed.searchParams.get("perfil"), actor.profile);
    assert.equal(parsed.searchParams.get("atuacao"), actor.engineeringScope);
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "same-origin");
    return request.promise;
  } });
  assert.equal(calls, 0);
  const first = loader.loadAudit(audit.id);
  const second = loader.loadAudit(audit.id);
  assert.equal(first, second);
  request.resolve(json(detail));
  await first;
  await loader.loadAudit(audit.id);
  assert.equal(calls, 1);
  assert.deepEqual(applied, [detail]);
  assert.equal(loader.getSnapshot()[audit.id].status, "loaded");
});

test("changing profile cancels pending details and cannot apply a late response", async () => {
  const request = deferred();
  let signal;
  const applied = [];
  const loader = createAuditDetailLoader({ actor, initial, onLoaded: (value) => applied.push(value), fetcher: async (_, options) => {
    signal = options.signal;
    return request.promise;
  } });
  const pending = loader.loadAudit(audit.id);
  loader.cancel();
  assert.equal(signal.aborted, true);
  request.resolve(json(detail));
  await pending;
  assert.deepEqual(applied, []);
  assert.equal(loader.getSnapshot()[audit.id], undefined);
});

test("failed detail loading keeps an explicit error and allows a successful retry", async () => {
  let calls = 0;
  const loader = createAuditDetailLoader({ actor, initial, onLoaded: () => {},
    fetcher: async () => ++calls === 1 ? json({}, 503) : json(detail) });
  await assert.rejects(loader.loadAudit(audit.id), /Tente novamente/);
  assert.equal(loader.getSnapshot()[audit.id].status, "error");
  await loader.loadAudit(audit.id);
  assert.equal(loader.getSnapshot()[audit.id].status, "loaded");
  assert.equal(calls, 2);
});

test("mismatching or incomplete audit details cannot replace the selected audit", async () => {
  for (const value of [{ ...detail, audits: [{ ...audit, workId: "another-work" }] },
    { ...detail, audits: [{ ...audit, id: "another-audit" }] }, { ...detail, responses: {} },
    { ...detail, criteriaSnapshots: {} }, { ...detail, available: false }]) {
    let applied = false;
    const loader = createAuditDetailLoader({ actor, initial, onLoaded: () => { applied = true; }, fetcher: async () => json(value) });
    await assert.rejects(loader.loadAudit(audit.id));
    assert.equal(applied, false);
  }
});

test("a profile owns its own cache and unavailable audit IDs cause no request", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return json(detail); };
  const first = createAuditDetailLoader({ actor, initial, onLoaded: () => {}, fetcher });
  await first.loadAudit(audit.id);
  const other = createAuditDetailLoader({ actor: { ...actor, engineeringScope: "COORDENACAO" }, initial, onLoaded: () => {}, fetcher });
  await other.loadAudit(audit.id);
  assert.equal(calls, 2);
  await assert.rejects(other.loadAudit("unlisted-audit"));
  assert.equal(calls, 2);
});
