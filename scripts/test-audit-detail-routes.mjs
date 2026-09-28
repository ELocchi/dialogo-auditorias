import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { activeProfileCookieName, encodeActiveProfileChoice } from "../src/lib/auth/active-profile.ts";

// Execute the actual auth/session guard, audit service and two HTTP handlers.
// Adapters isolate Auth, cookies, workspace lookup, PostgREST and private Storage.
// No environment files, real sessions, hosted database or network are accessed.
const userId = "d1a70000-0000-4000-8000-000000000001";
const otherUserId = "d1a70000-0000-4000-8000-000000000002";
const workId = "d1a70000-0000-4000-8000-000000000101";
const auditId = "d1a70000-0000-4000-8000-000000000201";
const otherAuditId = "d1a70000-0000-4000-8000-000000000202";
const emptyDetail = { available: false, audits: [], responses: {}, criteriaSnapshots: {} };
const absentDetail = { ...emptyDetail, available: true };
const emptyReport = { available: false };
const criterion = {
  id: "F176-Q01", code: "01.01", title: "Item", text: "Descrição", group: "1. Grupo", subgroup: "",
  source: "F176", locator: "linha 1", documentedWeight: null, orientations: [], verificationRule: "Conforme/Não Conforme",
};
const audit = {
  id: auditId, workId, modelId: "quality-f176", date: "2026-09-23", auditorId: userId,
  auditor: "Offline auditor", finalScore: 7, catalogRevisionId: null, catalogVersion: 1,
  catalogRevisionLabel: "F.176/00", criteria: [criterion],
  responses: { [criterion.id]: { note: "Pendência", answer: "Não conforme", photos: ["p01-01.png"] } },
  evidenceFiles: ["p01-01.png"], reportFileName: "report.pdf",
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
    rpcError: null, storageError: null, staleSignedDataOnError: false,
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
      assert.ok(["read_published_audit_detail", "read_published_audit_report"].includes(name), "No eager index or bulk read");
      assert.equal(parameters.p_profile, state.context.profile);
      assert.equal(parameters.p_engineering_scope, state.context.engineeringScope);
      assert.equal(parameters.p_administrative_scope, state.context.administrativeScope);
      if (state.rpcError) return { data: null, error: state.rpcError };
      const allowed = parameters.p_audit_id === auditId;
      return { data: name === "read_published_audit_detail" ? (allowed ? [audit] : [])
        : allowed ? { id: auditId, workId, modelId: audit.modelId, reportFileName: audit.reportFileName } : null, error: null };
    },
    storage: { from(bucket) {
      assert.equal(bucket, "published-audits");
      return {
        async createSignedUrls(paths) {
          state.signedFiles.push(...paths);
          return { data: state.storageError ? null : paths.map((item) => ({ signedUrl: `https://storage.offline.invalid/${item}` })), error: state.storageError };
        },
        async createSignedUrl(item, expiration) {
          assert.equal(expiration, 300);
          state.signedFiles.push(item);
          return { data: !state.storageError || state.staleSignedDataOnError ? { signedUrl: `https://storage.offline.invalid/${item}` } : null,
            error: state.storageError };
        },
      };
    } },
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
const { readAuditRequestContext } = await import("../src/lib/audits/request-context.ts");
const detail = await import("../src/app/api/audits/[auditId]/route.ts");
const report = await import("../src/app/api/audits/[auditId]/report/route.ts");
const endpoints = [{ name: "detail", ...detail, unavailable: emptyDetail }, { name: "report", ...report, unavailable: emptyReport }];
const params = (id = auditId) => ({ params: Promise.resolve({ auditId: id }) });
function request(endpoint = "detail", overrides = {}, includeIdentity = true, id = auditId) {
  const url = new URL(`https://offline.invalid/api/audits/${id}${endpoint === "report" ? "/report" : ""}`);
  if (includeIdentity) {
    const query = { usuario: userId, perfil: state.context.profile, atuacao: state.context.engineeringScope ?? "",
      administrativo: state.context.administrativeScope ?? "", ...overrides };
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  }
  return new Request(url);
}
function assertPrivate(response) {
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Cookie");
}
function assertNoAuditWork() {
  assert.equal(state.workspaceReads.length, 0);
  assert.equal(state.auditReads.length, 0);
  assert.equal(state.signedFiles.length, 0);
}
async function assertUnavailable(response, status, body) {
  assert.equal(response.status, status);
  assertPrivate(response);
  assert.equal(response.headers.get("Location"), null);
  assert.deepEqual(await response.json(), body);
}

test("both routes authenticate and reject pending, inactive or unselected sessions before audit reads", async () => {
  for (const endpoint of endpoints) {
    assert.equal(endpoint.dynamic, "force-dynamic");
    for (const [change, expected] of [
      [(s) => { s.user = null; }, 401],
      [(s) => { s.authError = { message: "Auth unavailable" }; }, 401],
      [(s) => { s.status = "PENDENTE_APROVACAO"; }, 403],
      [(s) => { s.active = false; }, 403],
      [(s) => { s.account.ativo = false; }, 403],
      [(s) => { s.cookieValues = []; }, 403],
    ]) {
      reset(); change(state);
      await assertUnavailable(await endpoint.GET(request(endpoint.name), params()), expected, endpoint.unavailable);
      assertNoAuditWork();
    }
  }
});

test("stale identity, profile, activity and administrative scope never reach workspace or audit DAL", async () => {
  for (const endpoint of endpoints) {
    for (const mismatch of [{ usuario: otherUserId }, { perfil: "AUDITOR_QUALIDADE" }, { atuacao: "COORDENACAO" }, { administrativo: "QUALIDADE" }]) {
      reset();
      await assertUnavailable(await endpoint.GET(request(endpoint.name, mismatch), params()), 403, endpoint.unavailable);
      assertNoAuditWork();
    }
    reset("ADMINISTRATIVO");
    await assertUnavailable(await endpoint.GET(request(endpoint.name, { administrativo: "SEGURANCA" }), params()), 403, endpoint.unavailable);
    assertNoAuditWork();
  }
});

test("request context is rebuilt from the verified account and cookie, including requests without identity query", async () => {
  for (const includeIdentity of [true, false]) {
    reset("ENGENHARIA", "COORDENACAO");
    const access = await readAuditRequestContext(request("detail", {}, includeIdentity));
    assert.equal(access.status, 200);
    assert.equal(access.context, state.context);
    assert.deepEqual(state.workspaceReads, [{ user: state.user, account: state.account,
      profile: "ENGENHARIA", engineeringScope: "COORDENACAO", administrativeScope: null }]);
    assert.equal(state.auditReads.length, 0);
  }
});

test("workspace revocation and malformed audit IDs fail before detail or report storage work", async () => {
  for (const endpoint of endpoints) {
    reset(); state.contextAvailable = false;
    await assertUnavailable(await endpoint.GET(request(endpoint.name), params()), 403, endpoint.unavailable);
    assert.equal(state.workspaceReads.length, 1);
    assert.equal(state.auditReads.length, 0);
    reset();
    await assertUnavailable(await endpoint.GET(request(endpoint.name, {}, true, "not-an-id"), params("not-an-id")), 400, endpoint.unavailable);
    assert.equal(state.auditReads.length, 0);
    assert.equal(state.signedFiles.length, 0);
  }
});

test("detail GET uses exactly the selected audit and verified profile, with private response and evidence", async () => {
  reset();
  const response = await detail.GET(request(), params());
  assert.equal(response.status, 200);
  assertPrivate(response);
  const snapshot = await response.json();
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.audits.length, 1);
  assert.equal(snapshot.audits[0].id, auditId);
  assert.deepEqual(state.auditReads, [{ name: "read_published_audit_detail", parameters: {
    p_profile: "ENGENHARIA", p_engineering_scope: "EQUIPE_OBRA", p_administrative_scope: null, p_audit_id: auditId,
  } }]);
  assert.deepEqual(state.signedFiles, [`${workId}/${auditId}/p01-01.png`]);
  assert.deepEqual(state.workspaceReads, [{ user: state.user, account: state.account,
    profile: "ENGENHARIA", engineeringScope: "EQUIPE_OBRA", administrativeScope: null }]);
});

test("an inaccessible audit is a private 404 and cannot reveal another publication or sign its files", async () => {
  for (const endpoint of endpoints) {
    reset();
    await assertUnavailable(await endpoint.GET(request(endpoint.name, {}, true, otherAuditId), params(otherAuditId)),
      404, endpoint.name === "detail" ? absentDetail : emptyReport);
    assert.equal(state.auditReads.length, 1);
    assert.equal(state.auditReads[0].parameters.p_audit_id, otherAuditId);
    assert.equal(state.signedFiles.length, 0);
  }
});

test("RPC and Storage failures return private 503 responses without redirecting", async () => {
  for (const endpoint of endpoints) {
    for (const source of ["rpcError", "storageError"]) {
      reset(); state[source] = { message: "Offline unavailable" };
      await assertUnavailable(await endpoint.GET(request(endpoint.name), params()), 503, endpoint.unavailable);
      if (source === "rpcError") assert.equal(state.signedFiles.length, 0);
    }
  }
});

test("a report signing error cannot redirect even when the adapter also returns stale signed data", async () => {
  reset(); state.storageError = { message: "Signing rejected" }; state.staleSignedDataOnError = true;
  await assertUnavailable(await report.GET(request("report"), params()), 503, emptyReport);
});

test("report GET signs only the requested PDF after authorization and redirects without caching", async () => {
  reset("ENGENHARIA", "COORDENACAO");
  const response = await report.GET(request("report"), params());
  assert.equal(response.status, 302);
  assertPrivate(response);
  assert.equal(response.headers.get("Location"), `https://storage.offline.invalid/${workId}/${auditId}/report.pdf`);
  assert.equal(await response.text(), "");
  assert.deepEqual(state.auditReads, [{ name: "read_published_audit_report", parameters: {
    p_profile: "ENGENHARIA", p_engineering_scope: "COORDENACAO", p_administrative_scope: null, p_audit_id: auditId,
  } }]);
  assert.deepEqual(state.signedFiles, [`${workId}/${auditId}/report.pdf`]);
});
