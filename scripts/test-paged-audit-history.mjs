import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { activeProfileCookieName, encodeActiveProfileChoice } from "../src/lib/auth/active-profile.ts";

// Execute the actual session guard, history service and HTTP handler.
// Adapters isolate Auth, cookies, workspace lookup, PostgREST and private Storage.
// No environment files, real sessions, hosted database or network are accessed.
const userId = "d1a70000-0000-4000-8000-000000000001";
const otherUserId = "d1a70000-0000-4000-8000-000000000002";
const workId = "d1a70000-0000-4000-8000-000000000101";
const auditId = "d1a70000-0000-4000-8000-000000000201";
const otherAuditId = "d1a70000-0000-4000-8000-000000000202";
const unavailable = { available: false, total: 0, page: 1, pageSize: 10, audits: [], findings: [] };
const audit = {
  id: auditId, workId, modelId: "quality-f176", date: "2026-09-23", auditorId: userId,
  auditor: "Offline auditor", finalScore: 7, catalogRevisionId: null, catalogVersion: 1,
  catalogRevisionLabel: "F.176/00",
};
const findingFor = (row) => ({ id: "c1", auditId: row.id, workId: row.workId, auditDate: row.date,
  auditor: row.auditor, modelId: row.modelId, module: "quality", item: "01.01", description: "Item",
  criterionTitle: "Item", serious: false, nonconformity: "Pendência" });
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
    rpcError: null, historyRows: [audit], historyPayload: null,
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
      if (name === "read_current_access_account") return { data: state.active === true ? { account: state.account,
        request: { auth_user_id: userId, status_acesso: state.status, email: state.user?.email,
          email_confirmado_em: state.user?.email_confirmed_at } } : null, error: null };
      state.auditReads.push({ name, parameters });
      assert.equal(name, "read_published_audit_history", "Must not read full overview or detail");
      if (state.rpcError) return { data: null, error: state.rpcError };
      const rows = state.historyRows.slice((parameters.p_page - 1) * parameters.p_page_size, parameters.p_page * parameters.p_page_size);
      return { data: state.historyPayload ?? { total: state.historyRows.length,
        page: parameters.p_page, pageSize: parameters.p_page_size, audits: rows,
        findings: parameters.p_include_findings ? rows.map(findingFor) : [],
      }, error: null };
    },
    storage: { from() { throw new Error("Paged history must never access private Storage"); } },
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
const { GET, dynamic } = await import("../src/app/api/audits/history/route.ts");
const { readPublishedAuditHistory } = await import("../src/lib/audits/history-service.ts");
const { normalizeAuditHistoryQuery } = await import("../src/lib/audits/history-contracts.ts");
function request(query = {}, identity = {}) {
  const url = new URL("https://offline.invalid/api/audits/history");
  for (const [key, value] of Object.entries({ usuario: userId, perfil: state.context.profile,
    atuacao: state.context.engineeringScope ?? "", administrativo: state.context.administrativeScope ?? "", ...query, ...identity }))
    url.searchParams.set(key, String(value));
  return new Request(url);
}
async function responseBody(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Cookie");
  return response.json();
}

test("history authenticates active selected identity before any history RPC", async () => {
  assert.equal(dynamic, "force-dynamic");
  for (const [change, status] of [
    [(s) => { s.user = null; }, 401], [(s) => { s.authError = {}; }, 401],
    [(s) => { s.active = false; }, 403], [(s) => { s.account.ativo = false; }, 403],
    [(s) => { s.status = "PENDENTE_APROVACAO"; }, 403], [(s) => { s.cookieValues = []; }, 403],
  ]) {
    reset(); change(state);
    assert.deepEqual(await responseBody(await GET(request()), status), unavailable);
    assert.equal(state.auditReads.length, 0);
    assert.equal(state.workspaceReads.length, 0);
  }
  for (const identity of [{ usuario: otherUserId }, { perfil: "AUDITOR_QUALIDADE" }, { atuacao: "COORDENACAO" }, { administrativo: "GERAL" }]) {
    reset();
    assert.deepEqual(await responseBody(await GET(request({}, identity)), 403), unavailable);
    assert.equal(state.auditReads.length, 0);
  }
  reset(); state.contextAvailable = false;
  assert.deepEqual(await responseBody(await GET(request()), 403), unavailable);
  assert.equal(state.auditReads.length, 0);
});

test("history query validates sizes, dates, filters, booleans and duplicate fields before RPC", async () => {
  for (const query of [{ page: 0 }, { page: -1 }, { page: 1.5 }, { page: 2147483648 }, { pageSize: 0 }, { pageSize: 51 },
    { workId: "invalid" }, { auditId: "invalid" }, { excludeAuditId: "invalid" }, { module: "invalid" },
    { modelId: "invalid" }, { onlyWithFindings: 1 }, { includeFindings: "yes" }, { dateFrom: "2026-02-30" },
    { dateTo: "0000-01-01" }, { dateFrom: "2026-10-01", dateTo: "2026-09-01" }]) {
    reset();
    assert.deepEqual(await responseBody(await GET(request(query)), 400), unavailable);
    assert.equal(state.auditReads.length, 0);
  }
  reset();
  const repeated = new URL(request({ page: 1 }).url); repeated.searchParams.append("page", "2");
  assert.deepEqual(await responseBody(await GET(new Request(repeated)), 400), unavailable);
  assert.equal(state.auditReads.length, 0);
  assert.deepEqual(normalizeAuditHistoryQuery({ workId: workId.toUpperCase(), pageSize: "3", includeFindings: "false" }),
    { page: 1, pageSize: 3, onlyWithFindings: false, includeFindings: false, workId });
});

test("paged history reads one limited RPC with all filters and only compact findings", async () => {
  reset("ENGENHARIA", "COORDENACAO");
  const body = await responseBody(await GET(request({ pageSize: 3, workId: workId.toUpperCase(), module: "quality",
    modelId: "quality-f176", dateFrom: audit.date, dateTo: audit.date, onlyWithFindings: true,
    auditId, excludeAuditId: otherAuditId })), 200);
  assert.equal(body.available, true);
  assert.equal(body.total, 1);
  assert.equal(body.audits.length, 1);
  assert.equal(body.audits[0].status, "Publicada");
  assert.equal(body.audits[0].isDemo, false);
  assert.match(body.audits[0].reportUrl, new RegExp(`/api/audits/${auditId}/report`));
  assert.deepEqual(body.findings, [findingFor(audit)]);
  assert.equal(Object.hasOwn(body, "responses"), false);
  assert.deepEqual(state.auditReads, [{ name: "read_published_audit_history", parameters: {
    p_profile: "ENGENHARIA", p_engineering_scope: "COORDENACAO", p_administrative_scope: null,
    p_page: 1, p_page_size: 3, p_work_id: workId, p_module: "quality", p_model_id: "quality-f176",
    p_date_from: audit.date, p_date_to: audit.date, p_only_with_findings: true, p_include_findings: true,
    p_audit_id: auditId, p_exclude_audit_id: otherAuditId,
  } }]);
});

test("paged history preserves complete totals across pages with no off-page findings", async () => {
  reset();
  state.historyRows = Array.from({ length: 23 }, (_, index) => ({ ...audit,
    id: `d1a70000-0000-4000-8000-${String(300 - index).padStart(12, "0")}` }));
  const seen = new Set();
  for (let page = 1; page <= 4; page += 1) {
    const body = await responseBody(await GET(request({ page })), 200);
    assert.equal(body.total, 23);
    assert.equal(body.page, page);
    assert.equal(body.audits.length, page < 3 ? 10 : page === 3 ? 3 : 0);
    const ids = new Set(body.audits.map((row) => row.id));
    assert.ok(body.findings.every((finding) => ids.has(finding.auditId)));
    for (const id of ids) { assert.equal(seen.has(id), false); seen.add(id); }
  }
  assert.equal(seen.size, 23);
});

test("metadata-only comparison lookup and absent records have exact totals without Storage", async () => {
  reset();
  const body = await responseBody(await GET(request({ workId, modelId: "quality-f176", pageSize: 3, includeFindings: false })), 200);
  assert.equal(body.total, 1);
  assert.deepEqual(body.findings, []);
  assert.equal(body.audits.length, 1);
  for (const filter of [{ auditId: otherAuditId }, { workId: otherUserId }]) {
    reset(); state.historyRows = [];
    assert.deepEqual(await responseBody(await GET(request(filter)), 200), { ...unavailable, available: true });
  }
});

test("history service rejects count, sorting, scope and filter mismatches without partial data", async () => {
  const valid = { total: 1, page: 1, pageSize: 10, audits: [audit], findings: [findingFor(audit)] };
  for (const payload of [
    { ...valid, total: -1 }, { ...valid, total: 1.5 }, { ...valid, total: "1" }, { ...valid, page: 2 },
    { ...valid, total: 2 }, { ...valid, pageSize: 50 }, { ...valid, audits: [{ ...audit, workId: otherUserId }] },
    { ...valid, audits: [{ ...audit, modelId: "security-it07-r02" }] },
    { ...valid, findings: [{ ...findingFor(audit), auditId: otherAuditId }] },
    { ...valid, total: 2, audits: [audit, { ...audit, id: otherAuditId }], findings: [] },
  ]) {
    reset(); state.historyPayload = payload;
    assert.deepEqual(await responseBody(await GET(request()), 503), unavailable);
  }
  for (const query of [{ auditId: otherAuditId }, { excludeAuditId: auditId }, { workId: otherUserId },
    { module: "safety" }, { modelId: "quality-f175" }, { dateFrom: "2026-10-01" }, { dateTo: "2026-09-01" }]) {
    reset();
    assert.deepEqual(await responseBody(await GET(request(query)), 503), unavailable);
  }
  reset(); state.historyPayload = { ...valid, findings: [] };
  assert.deepEqual(await responseBody(await GET(request({ onlyWithFindings: true })), 503), unavailable);
  reset(); state.historyPayload = valid;
  assert.deepEqual(await responseBody(await GET(request({ includeFindings: false })), 503), unavailable);
});

test("history service failure stays private and never invokes an eager fallback", async () => {
  reset(); state.rpcError = { message: "Unavailable" };
  assert.deepEqual(await responseBody(await GET(request({ page: 3, pageSize: 5 })), 503), { ...unavailable, page: 3, pageSize: 5 });
  assert.equal(state.auditReads.length, 1);
  reset(); state.client.rpc = async () => { throw new Error("Offline"); };
  assert.deepEqual(await readPublishedAuditHistory(state.client, state.context), unavailable);
  reset();
  assert.deepEqual(await readPublishedAuditHistory(state.client, state.context, { pageSize: 51 }), unavailable);
  assert.equal(state.auditReads.length, 0);
});
