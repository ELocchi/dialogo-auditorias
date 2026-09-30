import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createAuditDashboardReader } from "../src/lib/audits/dashboard-service.ts";
import { buildAuditDashboard } from "../src/lib/audits/dashboard.ts";
import { unavailableAuditDashboard } from "../src/lib/audits/dashboard-contracts.ts";

// Real reader/calculations with a disposable, per-test server cache. The RPC
// adapter represents one authorized database snapshot; no hosted data is used.
const uuid = (number) => `d1d70000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const context = () => ({ profile: "AUDITOR_QUALIDADE", engineeringScope: null, administrativeScope: null,
  user: { id: uuid(1), name: "Auditor", role: "quality-auditor", modules: ["quality"],
    workIds: [uuid(101), uuid(102)], workModuleScopes: [101, 102].map((number) => ({ workId: uuid(number), module: "quality" })) },
  works: [101, 102].map((number) => ({ id: uuid(number), name: `Obra ${number}`, isDemo: false, status: "Ativa", city: "São Paulo", engineer: "Engenheiro", coordinator: "Coordenação" })),
});
const audit = (number = 201, overrides = {}) => ({ id: uuid(number), workId: uuid(101), modelId: "quality-f176",
  date: "2026-09-23", auditorId: uuid(1), auditor: "Auditor", finalScore: 8,
  catalogRevisionId: null, catalogVersion: 1, catalogRevisionLabel: "F.176/00",
  status: "Publicada", isDemo: false, collectionStatus: "Coleta concluída", calculationStatus: "Disponível", ...overrides });
const finding = (record, overrides = {}) => ({ id: "item-1", auditId: record.id, workId: record.workId, modelId: record.modelId,
  auditDate: record.date, auditor: record.auditor, module: "quality", item: "02.04", criterionTitle: "Armazenamento",
  description: "Armazenamento — Contramarco", nonconformity: "Fora do especificado", serious: true, subitem: "Contramarco", ...overrides });
const overview = (audits = [audit()], findings = audits.map((record) => finding(record)), workFindings = []) => ({ audits, findings, workFindings });
const snapshot = (input) => ({ ...input, available: true, responses: {}, criteriaSnapshots: {} });
const token = (input) => createHash("md5").update(JSON.stringify(input)).digest("hex");
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function clientFor(input = overview()) {
  return {
    input, calls: [], error: null, response: undefined,
    async rpc(name, parameters) {
      assert.equal(name, "read_published_audit_overview_if_changed", "Never authorize then issue a second overview RPC");
      this.calls.push({ name, parameters });
      const revision = token(this.input);
      return { error: this.error, data: this.response ?? (parameters.p_known_revision === revision
        ? { revision, unchanged: true } : { revision, unchanged: false, ...this.input }) };
    },
    storage: { from() { throw new Error("A dashboard must never sign or retain evidence"); } },
  };
}

test("cache hits still authorize one conditional RPC per request and skip full history when unchanged", async () => {
  const reader = createAuditDashboardReader();
  const client = clientFor(); const ctx = context();
  const first = await reader(client, ctx);
  const second = await reader(client, ctx);
  assert.deepEqual(first, buildAuditDashboard(snapshot(client.input), ctx.works, ["quality"]));
  assert.deepEqual(second, first);
  assert.equal(client.calls.length, 2);
  assert.deepEqual(client.calls[0].parameters, { p_profile: "AUDITOR_QUALIDADE", p_engineering_scope: null,
    p_administrative_scope: null, p_known_revision: null });
  assert.equal(client.calls[1].parameters.p_known_revision, token(client.input));
  assert.equal("audits" in second, false); assert.equal("findings" in second, false);
});

test("new publication or narrower authorized projection replaces every cached aggregate", async () => {
  const reader = createAuditDashboardReader(); const client = clientFor(); const ctx = context();
  await reader(client, ctx);
  const added = audit(202, { workId: uuid(102), finalScore: 0 }); client.input = overview([audit(), added]);
  const changed = await reader(client, ctx);
  assert.deepEqual(changed, buildAuditDashboard(snapshot(client.input), ctx.works, ["quality"]));
  assert.equal(changed.publishedCount, 2); assert.equal(changed.mostRecurring[0].occurrences, 2);
  client.input = overview([added]);
  const narrowed = await reader(client, ctx);
  assert.equal(narrowed.publishedCount, 1); assert.equal(narrowed.mostRecurring.length, 0);
  assert.deepEqual(narrowed, await reader(client, ctx));
  assert.equal(client.calls.at(-1).parameters.p_known_revision, token(client.input));
});

test("RPC errors, exceptions and invalid revision responses never serve a stale summary", async () => {
  for (const scenario of ["error", "throw", "mismatch", "malformed", "false-empty"]) {
    const reader = createAuditDashboardReader(); const client = clientFor(); const ctx = context();
    await reader(client, ctx);
    const original = client.rpc;
    if (scenario === "error") client.error = { code: "42501", message: "Revoked" };
    if (scenario === "throw") client.rpc = async () => { throw new Error("Offline"); };
    if (scenario === "mismatch") client.response = { revision: "f".repeat(32), unchanged: true };
    if (scenario === "malformed") client.response = { revision: "invalid", unchanged: true };
    if (scenario === "false-empty") client.response = { revision: "e".repeat(32), unchanged: false };
    assert.deepEqual(await reader(client, ctx), unavailableAuditDashboard(), scenario);
    client.rpc = original; client.error = null; client.response = undefined;
    assert.equal((await reader(client, ctx)).publishedCount, 1);
    assert.equal(client.calls.at(-1).parameters.p_known_revision, null, `${scenario} must discard the former hint`);
  }
  const reader = createAuditDashboardReader(); const client = clientFor();
  client.response = { revision: token(client.input), unchanged: true };
  assert.deepEqual(await reader(client, context()), unavailableAuditDashboard(), "Unknown unchanged has no summary to return");
});

test("expired entries refetch full metadata before becoming reusable again", async () => {
  let time = 1000;
  const reader = createAuditDashboardReader({ ttlMs: 100, now: () => time }); const client = clientFor();
  await reader(client, context()); time += 99; await reader(client, context());
  assert.equal(client.calls.at(-1).parameters.p_known_revision, token(client.input));
  time += 101; await reader(client, context());
  assert.equal(client.calls.at(-1).parameters.p_known_revision, null);
});

test("changed snapshots cannot cache a partial subtotal after scope drift or invalid rows", async () => {
  const valid = audit();
  for (const input of [
    overview([valid, audit(202, { workId: uuid(999) })]),
    overview([valid, audit(202, { finalScore: "invalid" })]),
    overview([valid, valid], [finding(valid)]),
    overview([valid], [finding(valid), finding(audit(202))]),
    overview([valid], [finding(valid), finding(valid, { id: "" })]),
  ]) {
    const reader = createAuditDashboardReader(); const client = clientFor(); const ctx = context();
    await reader(client, ctx); client.input = input;
    assert.deepEqual(await reader(client, ctx), unavailableAuditDashboard());
    client.input = overview();
    assert.equal((await reader(client, ctx)).available, true);
    assert.equal(client.calls.at(-1).parameters.p_known_revision, null, "Incomplete projected rows must discard the prior cached hint");
  }
});

test("cache isolates actors, selected profiles, scopes, effective modules, grants and work names", async () => {
  const patches = [
    (ctx) => { ctx.user.id = uuid(2); },
    (ctx) => { ctx.profile = "ENGENHARIA"; ctx.engineeringScope = "EQUIPE_OBRA"; },
    (ctx) => { ctx.profile = "ENGENHARIA"; ctx.engineeringScope = "COORDENACAO"; },
    (ctx) => { ctx.profile = "ADMINISTRATIVO"; ctx.administrativeScope = "QUALIDADE"; },
    (ctx) => { ctx.profile = "ADMINISTRATIVO"; ctx.administrativeScope = "GERAL"; },
    (ctx) => { ctx.user.modules.push("safety"); },
    (ctx) => { ctx.user.workModuleScopes.push({ workId: uuid(101), module: "safety" }); },
    (ctx) => { ctx.works[0].name = "Obra renomeada"; },
    (ctx) => { ctx.works.pop(); ctx.user.workModuleScopes.pop(); ctx.user.workIds.pop(); },
  ];
  const reader = createAuditDashboardReader({ maximumEntries: 30 }); const client = clientFor();
  await reader(client, context());
  for (const patch of patches) {
    const ctx = context(); patch(ctx); const result = await reader(client, ctx);
    assert.equal(client.calls.at(-1).parameters.p_known_revision, null);
    assert.equal(result.available, true);
    if (ctx.works[0].name === "Obra renomeada") assert.equal(result.ranking.monthly["2026-09"].quality[0].workName, "Obra renomeada");
  }
  const same = context(); same.works.reverse(); same.user.workModuleScopes.reverse();
  await reader(client, same);
  assert.equal(client.calls.at(-1).parameters.p_known_revision, token(client.input), "Equivalent ordering should reuse the same contextual key");
});

test("cached outputs cannot be mutated by a caller and independent server processes cold-load safely", async () => {
  const reader = createAuditDashboardReader(); const client = clientFor(); const ctx = context();
  const first = await reader(client, ctx);
  first.publishedCount = 999; first.ranking.monthly["2026-09"].quality[0].workName = "Poisoned";
  first.mostSevere[0].references[0].workName = "Poisoned";
  const second = await reader(client, ctx);
  assert.deepEqual(second, buildAuditDashboard(snapshot(client.input), ctx.works, ["quality"]));
  const isolated = createAuditDashboardReader(); await isolated(client, ctx);
  assert.equal(client.calls.at(-1).parameters.p_known_revision, null);
});

test("entry and byte limits bound cache memory; oversized summaries remain correct without caching", async () => {
  const reader = createAuditDashboardReader({ maximumEntries: 2 }); const client = clientFor();
  const ctxA = context(), ctxB = context(), ctxC = context(); ctxB.user.id = uuid(2); ctxC.user.id = uuid(3);
  await reader(client, ctxA); await reader(client, ctxB); await reader(client, ctxA); await reader(client, ctxC);
  await reader(client, ctxA); assert.equal(client.calls.at(-1).parameters.p_known_revision, token(client.input));
  await reader(client, ctxB); assert.equal(client.calls.at(-1).parameters.p_known_revision, null);
  const tiny = createAuditDashboardReader({ maximumBytes: 100 }); const first = await tiny(client, ctxA);
  assert.equal(first.available, true); assert.deepEqual(await tiny(client, ctxA), first);
  assert.equal(client.calls.at(-1).parameters.p_known_revision, null);
});

test("byte accounting caches computed summaries without retaining the much larger overview", async () => {
  const audits = Array.from({ length: 80 }, (_, n) => audit(300 + n));
  const findings = audits.map((record, n) => finding(record, { item: `unique-${n}`, criterionTitle: `Unique ${n}`,
    description: "D".repeat(6000), nonconformity: "N".repeat(6000), serious: false }));
  const client = clientFor(overview(audits, findings)); const ctx = context();
  const expected = buildAuditDashboard(snapshot(client.input), ctx.works, ["quality"]);
  assert.ok(Buffer.byteLength(JSON.stringify(client.input)) > 500_000);
  assert.ok(Buffer.byteLength(JSON.stringify(expected)) < 32_000);
  const reader = createAuditDashboardReader({ maximumBytes: 32_000 });
  assert.deepEqual(await reader(client, ctx), expected); assert.deepEqual(await reader(client, ctx), expected);
  assert.equal(client.calls.at(-1).parameters.p_known_revision, token(client.input));
});

test("local overlays force full authorized input and never poison the cached persisted summary", async () => {
  const reader = createAuditDashboardReader(); const ctx = context(); const old = audit();
  const oldFindings = Array.from({ length: 6 }, (_, n) => finding(old, { id: `c${n}`, item: `0${n + 1}`, description: `Item ${n}`, criterionTitle: `Item ${n}` }));
  const client = clientFor(overview([old], oldFindings)); const base = await reader(client, ctx);
  const local = audit(901, { isDemo: true, finalScore: 10 });
  const overlay = { audits: [local], findings: [finding(local, { id: "c-new", item: "06", description: "Item 5", criterionTitle: "Item 5" })] };
  const merged = await reader(client, ctx, overlay);
  assert.equal(client.calls.at(-1).parameters.p_known_revision, null);
  assert.equal(merged.mostSevere[0].checklistItem, "06 · Item 5");
  assert.deepEqual(merged.ranking.monthly["2026-09"].quality, []);
  assert.deepEqual(merged.scoreMonths["2026-09"], { sum: 18, count: 2 });
  assert.deepEqual(await reader(client, ctx), base);
  assert.equal(client.calls.at(-1).parameters.p_known_revision, token(client.input));
  assert.deepEqual(await reader(client, ctx, { audits: [{ ...local, id: old.id }], findings: [] }), unavailableAuditDashboard());
  const count = client.calls.length;
  assert.deepEqual(await reader(client, ctx, { audits: [{ ...local, workId: uuid(999) }], findings: [] }), unavailableAuditDashboard());
  assert.equal(client.calls.length, count, "Malformed local input must be rejected before RPC");
});

test("concurrent readers each authorize and cache hints never substitute for their database snapshot", async () => {
  const reader = createAuditDashboardReader(); const ctx = context(); const old = overview();
  const latest = overview([audit(), audit(202, { workId: uuid(102) })]);
  const delayed = deferred(); const client = clientFor(old); let calls = 0;
  client.rpc = async function(name, parameters) {
    assert.equal(name, "read_published_audit_overview_if_changed"); this.calls.push({ name, parameters });
    if (++calls === 1) return delayed.promise;
    return { error: null, data: parameters.p_known_revision === token(latest)
      ? { revision: token(latest), unchanged: true } : { revision: token(latest), unchanged: false, ...latest } };
  };
  const first = reader(client, ctx); const second = await reader(client, ctx);
  assert.equal(second.publishedCount, 2);
  delayed.resolve({ error: null, data: { revision: token(old), unchanged: false, ...old } });
  assert.equal((await first).publishedCount, 1, "Earlier authorized snapshot remains its own response");
  assert.equal((await reader(client, ctx)).publishedCount, 2, "Latest RPC must repair any out-of-order cache hint");
  assert.equal(client.calls.length, 3);
});
