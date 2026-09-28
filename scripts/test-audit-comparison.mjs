import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { activeProfileCookieName, encodeActiveProfileChoice } from "../src/lib/auth/active-profile.ts";

// Execute the actual session guard, comparison service and HTTP handler.
// Adapters isolate Auth, cookies, workspace lookup, PostgREST and private Storage.
// No environment files, real sessions, hosted database or network are accessed.
const userId = "d1a70000-0000-4000-8000-000000000001";
const otherUserId = "d1a70000-0000-4000-8000-000000000002";
const workId = "d1a70000-0000-4000-8000-000000000101";
const auditId = "d1a70000-0000-4000-8000-000000000201";
const otherAuditId = "d1a70000-0000-4000-8000-000000000202";
const unavailable = { available: false, audits: [] };
const audit = {
  id: auditId, workId, modelId: "quality-f176", date: "2026-09-23",
  answers: { c1: "Não conforme", c2: "Conforme", c3: "N/A", c4: "0", c5: "5", c6: "10", c7: "", c8: "  Literal original  " },
};
let state;
function reset(profile = "ENGENHARIA", engineeringScope = "EQUIPE_OBRA") {
  if (profile !== "ENGENHARIA") engineeringScope = null;
  const administrativeScope = profile === "ADMINISTRATIVO" ? "GERAL" : null;
  state = {
    user: { id: userId, email: "audit.routes.fixture@dialogo.com.br", email_confirmed_at: "2026-09-14T12:00:00Z" },
    account: { auth_user_id: userId, perfil: "ADMINISTRATIVO",
      perfis: ["ADMINISTRATIVO", "AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"],
      atuacao_engenharia: "EQUIPE_OBRA", atuacoes_engenharia: ["EQUIPE_OBRA", "COORDENACAO"],
      atuacao_administrativa: "GERAL", ativo: true, approved_at: "2026-09-14T12:00:00Z" },
    status: "APROVADO", active: true, authError: null, contextAvailable: true,
    cookieValues: [{ value: encodeActiveProfileChoice(userId, profile, engineeringScope, administrativeScope) }],
    context: { profile, engineeringScope, administrativeScope, email: "audit.routes.fixture@dialogo.com.br",
      user: { id: userId, name: "Trusted identity", role: "engineering", activity: "site-team", modules: ["quality"],
        workIds: [workId], workModuleScopes: [{ workId, module: "quality" }] },
      works: [{ id: workId, name: "Trusted work" }] },
    rpcError: null, comparisonRows: null,
    workspaceReads: [], auditReads: [], signedFiles: [], clients: [],
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
    async rpc(name, parameters) {
      if (name === "is_current_access_active") return { data: state.active, error: null };
      state.auditReads.push({ name, parameters });
      assert.equal(name, "read_published_audit_comparison", "Must not read full details or history");
      if (state.rpcError) return { data: null, error: state.rpcError };
      return { data: state.comparisonRows ?? (parameters.p_audit_ids.includes(auditId) ? [audit] : []), error: null };
    },
    storage: { from() { throw new Error("Comparisons must never access private Storage"); } },
  };
  globalThis.__auditRouteFixture = state;
}
const stubModules = {
  "server-only": "export {};",
  "next/headers": "export async function cookies() { return globalThis.__auditRouteFixture.cookieStore; }",
  "next/navigation": "export function redirect(destination) { throw Object.assign(new Error('redirect'), { destination }); }",
  "supabase/server": "export async function createClient(options) { const s = globalThis.__auditRouteFixture; s.clients.push(options); return s.client; }",
  "access/workspace": "export async function readWorkspaceContext(input) { const s = globalThis.__auditRouteFixture; s.workspaceReads.push(input); return s.contextAvailable ? s.context : null; }",
};
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    const key = ["supabase/server", "access/workspace"].find((suffix) =>
      specifier.endsWith(suffix) || specifier.endsWith(`${suffix}.ts`)) ?? specifier;
    if (Object.hasOwn(stubModules, key)) return {
      url: `data:text/javascript,${encodeURIComponent(stubModules[key])}`, shortCircuit: true,
    };
    if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(projectRoot, "src", `${specifier.slice(2)}.ts`)).href, context);
    return nextResolve(specifier, context);
  },
});
const { GET, dynamic } = await import("../src/app/api/audits/comparison/route.ts");
const { readPublishedAuditComparison } = await import("../src/lib/audits/comparison-service.ts");
const { parseComparisonAuditIds } = await import("../src/lib/audits/comparison-contracts.ts");
function request(ids = auditId, overrides = {}) {
  const url = new URL("https://offline.invalid/api/audits/comparison");
  if (ids !== null) url.searchParams.set("ids", ids);
  for (const [name, value] of Object.entries({ usuario: userId,
    perfil: state.context.profile, atuacao: state.context.engineeringScope ?? "",
    administrativo: state.context.administrativeScope ?? "", ...overrides })) url.searchParams.set(name, value);
  return new Request(url);
}
async function assertResponse(response, status, body) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Cookie");
  assert.equal(response.headers.get("Location"), null);
  assert.deepEqual(await response.json(), body);
}

test("comparison authenticates and rejects inactive, pending or unselected sessions before RPC", async () => {
  assert.equal(dynamic, "force-dynamic");
  for (const [change, expected] of [
    [(s) => { s.user = null; }, 401],
    [(s) => { s.authError = { message: "Offline unavailable" }; }, 401],
    [(s) => { s.status = "PENDENTE_APROVACAO"; }, 403],
    [(s) => { s.active = false; }, 403],
    [(s) => { s.account.ativo = false; }, 403],
    [(s) => { s.cookieValues = []; }, 403],
  ]) {
    reset(); change(state);
    await assertResponse(await GET(request()), expected, unavailable);
    assert.equal(state.workspaceReads.length, 0);
    assert.equal(state.auditReads.length, 0);
  }
});

test("comparison rejects stale identity, profile, engineering and administrative scopes", async () => {
  for (const mismatch of [{ usuario: otherUserId }, { perfil: "AUDITOR_QUALIDADE" }, { atuacao: "COORDENACAO" }, { administrativo: "QUALIDADE" }]) {
    reset();
    await assertResponse(await GET(request(auditId, mismatch)), 403, unavailable);
    assert.equal(state.workspaceReads.length, 0);
    assert.equal(state.auditReads.length, 0);
  }
  reset("ADMINISTRATIVO");
  await assertResponse(await GET(request(auditId, { administrativo: "SEGURANCA" })), 403, unavailable);
  assert.equal(state.auditReads.length, 0);
  reset(); state.contextAvailable = false;
  await assertResponse(await GET(request()), 403, unavailable);
  assert.equal(state.auditReads.length, 0);
});

test("comparison IDs accept at most three distinct UUIDs and normalize case", async () => {
  const thirdId = "d1a70000-0000-4000-8000-000000000203";
  assert.deepEqual(parseComparisonAuditIds([auditId.toUpperCase(), otherAuditId, thirdId]), [auditId, otherAuditId, thirdId]);
  for (const ids of [null, "", "invalid", `${auditId},`, `${auditId},${auditId.toUpperCase()}`, `${auditId},${otherAuditId},${thirdId},${userId}`]) {
    reset();
    await assertResponse(await GET(request(ids)), 400, unavailable);
    assert.equal(state.auditReads.length, 0);
  }
  reset();
  const duplicateQuery = new URL(request().url); duplicateQuery.searchParams.append("ids", otherAuditId);
  await assertResponse(await GET(new Request(duplicateQuery)), 400, unavailable);
  assert.equal(state.auditReads.length, 0);
});

test("one compact RPC uses selected profile and exact IDs without Storage, preserving answer strings", async () => {
  for (const [profile, scope] of [["ENGENHARIA", "EQUIPE_OBRA"], ["ENGENHARIA", "COORDENACAO"], ["AUDITOR_QUALIDADE", null], ["ADMINISTRATIVO", null]]) {
    reset(profile, scope);
    await assertResponse(await GET(request(`${auditId.toUpperCase()},${otherAuditId}`)), 200, { available: true, audits: [audit] });
    assert.deepEqual(state.auditReads, [{ name: "read_published_audit_comparison", parameters: {
      p_audit_ids: [auditId, otherAuditId], p_profile: profile, p_engineering_scope: scope,
      p_administrative_scope: profile === "ADMINISTRATIVO" ? "GERAL" : null,
    } }]);
  }
});

test("unknown or individually denied audits remain absent, not loaded empty responses", async () => {
  reset();
  await assertResponse(await GET(request(otherAuditId)), 200, { available: true, audits: [] });
  reset(); state.comparisonRows = [{ ...audit, answers: {} }];
  await assertResponse(await GET(request()), 200, { available: true, audits: [{ ...audit, answers: {} }] });
});

test("service rejects malformed or unrequested rows and scoped work/module mismatches", async () => {
  for (const change of [
    { id: otherAuditId }, { workId: otherUserId }, { modelId: "security-it07-r02" }, { modelId: "unknown" },
    { date: "2026-02-30" }, { date: "invalid" }, { answers: [] }, { answers: { c1: 5 } }, { answers: { "": "Conforme" } },
  ]) {
    reset(); state.comparisonRows = [{ ...audit, ...change }];
    assert.deepEqual(await readPublishedAuditComparison(state.client, state.context, [auditId]), unavailable);
  }
  reset(); state.comparisonRows = [audit, audit];
  assert.deepEqual(await readPublishedAuditComparison(state.client, state.context, [auditId, otherAuditId]), unavailable);
  reset(); state.context.user.workModuleScopes = [];
  assert.deepEqual(await readPublishedAuditComparison(state.client, state.context, [auditId]), unavailable);
  reset();
  assert.deepEqual(await readPublishedAuditComparison(state.client, state.context, []), unavailable);
  assert.equal(state.auditReads.length, 0);
});

test("service projects only five fields and failures never include partial comparison data", async () => {
  reset(); state.comparisonRows = [{ ...audit, criteria: ["private"], responses: "private", photos: ["private.png"] }];
  await assertResponse(await GET(request()), 200, { available: true, audits: [audit] });
  reset(); state.rpcError = { message: "Unavailable" };
  await assertResponse(await GET(request()), 503, unavailable);
  reset(); state.client.rpc = async () => { throw new Error("Offline"); };
  assert.deepEqual(await readPublishedAuditComparison(state.client, state.context, [auditId]), unavailable);
});
