import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { validateAccountEdit, validateApproval, validateWork } from "../src/lib/access/validation.ts";
import { approveRequest, registerWork, updateAccountAccess } from "../src/lib/access/service.ts";
import { countActiveAccounts } from "../src/lib/access/account-count.ts";

// Offline only: no environment, real identities, account creation or email.
const actor = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
const workA = "33333333-3333-4333-8333-333333333333";
const workB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const decision = "55555555-5555-4555-8555-555555555555";
const allProfiles = ["ADMINISTRATIVO", "AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"];
const grant = (perfil = "ENGENHARIA", obra_id = workA, modulo = "SEGURANCA") => ({ perfil, obra_id, modulo });
const engineeringGrants = [grant(), grant("ENGENHARIA", workA, "QUALIDADE"), grant("ENGENHARIA", workB), grant("ENGENHARIA", workB, "QUALIDADE")];
const originalFetch = globalThis.fetch;
let attemptedNetwork = 0;
before(() => { globalThis.fetch = async () => { attemptedNetwork++; throw new Error("NETWORK_FORBIDDEN"); }; });
after(() => { globalThis.fetch = originalFetch; assert.equal(attemptedNetwork, 0); });

test("cartão conta cada conta ativa uma vez, mesmo com vários perfis", async () => {
  let queries = 0;
  const client = {
    rpc: async () => ({ data: true, error: null }),
    from: (table) => {
      queries++;
      assert.equal(table, "access_accounts");
      return { select: (columns, options) => {
        assert.equal(columns, "auth_user_id");
        assert.deepEqual(options, { count: "exact", head: true });
        return { eq: async (column, value) => {
          assert.equal(column, "ativo");
          assert.equal(value, true);
          return { count: 3, error: null };
        } };
      } };
    },
  };
  assert.equal(await countActiveAccounts(client), 3);
  assert.equal(queries, 1);
});

test("cartão não mostra total parcial sem autorização ou com falha de leitura", async () => {
  let reads = 0;
  const unauthorized = { rpc: async () => ({ data: false, error: null }), from: () => { reads++; throw new Error("Não deve consultar contas"); } };
  assert.equal(await countActiveAccounts(unauthorized), null);
  assert.equal(reads, 0);
  const unavailable = { rpc: async () => ({ data: true, error: null }), from: () => ({ select: () => ({ eq: async () => ({ count: null, error: new Error("Indisponível") }) }) }) };
  assert.equal(await countActiveAccounts(unavailable), null);
});

function form(overrides = {}) {
  const data = new FormData();
  const values = { authUserId: target, perfis: ["ENGENHARIA"], atuacaoEngenharia: "EQUIPE_OBRA", grants: JSON.stringify(engineeringGrants), reason: "Equipe responsável pelas obras informadas.", confirmation: "SIM", ...overrides };
  if (Array.isArray(values.perfis) && values.perfis.includes("ADMINISTRATIVO") && !Object.hasOwn(overrides, "atuacaoAdministrativa")) values.atuacaoAdministrativa = "GERAL";
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => data.append(key, item));
    else data.set(key, value);
  }
  return data;
}
function harness(result = { data: decision, error: null }) {
  const calls = [];
  let factories = 0;
  return { calls, get factories() { return factories; }, deps: { actorId: actor, createClient: async () => { factories++; return { rpc: async (...args) => { calls.push(args); if (result instanceof Error) throw result; return result; } }; } } };
}

function editForm(overrides = {}) {
  const data = new FormData();
  const values = {
    authUserId: target,
    perfis: ["ENGENHARIA"],
    atuacoesEngenharia: ["EQUIPE_OBRA"],
    atuacaoAdministrativa: null,
    grants: JSON.stringify(engineeringGrants),
    status: "ATIVO",
    reason: "Edição administrativa dos acessos do usuário.",
    confirmation: "SIM",
    ...overrides,
  };
  if (Array.isArray(values.perfis) && values.perfis.includes("ADMINISTRATIVO") && !Object.hasOwn(overrides, "atuacaoAdministrativa")) values.atuacaoAdministrativa = "GERAL";
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => data.append(key, item));
    else data.set(key, value);
  }
  return data;
}

test("engineering requires an explicit subtype and both modules for every selected work", () => {
  assert.equal(validateApproval(form({ atuacaoEngenharia: null })).ok, false);
  assert.equal(validateApproval(form({ grants: JSON.stringify([grant()]) })).ok, false);
  assert.equal(validateApproval(form({ grants: JSON.stringify([grant("ENGENHARIA", workA, "QUALIDADE")]) })).ok, false);
  const parsed = validateApproval(form());
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.data.perfis, ["ENGENHARIA"]);
  assert.deepEqual(parsed.data.grants, engineeringGrants);
});
test("administrator alone receives management, with no technical grants or engineering subtype", () => {
  assert.equal(validateApproval(form({ perfis: ["ADMINISTRATIVO"], atuacaoEngenharia: null, grants: "[]" })).ok, true);
  assert.equal(validateApproval(form({ perfis: ["ADMINISTRATIVO"], atuacaoEngenharia: null })).ok, false);
  assert.equal(validateApproval(form({ perfis: ["ADMINISTRATIVO"], grants: "[]" })).ok, false);
  assert.equal(validateApproval(form({ perfis: allProfiles, grants: JSON.stringify([grant("ADMINISTRATIVO")]) })).ok, false);
});
test("administrative approval requires exactly one Safety, Quality or General activity", () => {
  for (const scope of ["SEGURANCA", "QUALIDADE", "GERAL"]) {
    const parsed = validateApproval(form({ perfis: ["ADMINISTRATIVO"], atuacaoEngenharia: null, atuacaoAdministrativa: scope, grants: "[]" }));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.atuacaoAdministrativa, scope);
  }
  for (const scope of [null, "TODOS", "engenharia"]) {
    assert.equal(validateApproval(form({ perfis: ["ADMINISTRATIVO"], atuacaoEngenharia: null, atuacaoAdministrativa: scope, grants: "[]" })).ok, false);
  }
  assert.equal(validateApproval(form({ atuacaoAdministrativa: "GERAL" })).ok, false);
});
test("an administrator can also have independently scoped auditor or engineering access", () => {
  for (const perfis of [["ADMINISTRATIVO", "AUDITOR_SEGURANCA"], ["ADMINISTRATIVO", "ENGENHARIA"]]) {
    const profile = perfis[1];
    const grants = profile === "ENGENHARIA" ? [grant(profile), grant(profile, workA, "QUALIDADE")] : [grant(profile)];
    const parsed = validateApproval(form({ perfis, atuacaoEngenharia: profile === "ENGENHARIA" ? "COORDENACAO" : null, grants: JSON.stringify(grants) }));
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data.perfis, perfis);
    assert.deepEqual(parsed.data.grants, grants);
  }
});
test("all four profiles preserve separate permissions, including the same work/module in two profiles", () => {
  const grants = [grant("AUDITOR_SEGURANCA"), grant("AUDITOR_QUALIDADE", workB, "QUALIDADE"), ...engineeringGrants];
  const parsed = validateApproval(form({ perfis: [...allProfiles].reverse(), atuacaoEngenharia: "COORDENACAO", grants: JSON.stringify(grants) }));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.data.perfis, allProfiles);
  assert.deepEqual(parsed.data.grants, grants);
});
test("every selected technical profile requires at least one permission of its own", () => {
  for (const perfis of [allProfiles, ["AUDITOR_SEGURANCA", "ENGENHARIA"], ["AUDITOR_QUALIDADE", "ENGENHARIA"]]) {
    assert.equal(validateApproval(form({ perfis })).ok, false);
  }
});
test("adding engineering does not let an auditor inherit the other auditor module", () => {
  for (const [profile, module] of [["AUDITOR_SEGURANCA", "QUALIDADE"], ["AUDITOR_QUALIDADE", "SEGURANCA"]]) {
    assert.equal(validateApproval(form({ perfis: allProfiles, grants: JSON.stringify([grant(profile, workA, module), ...engineeringGrants]) })).ok, false);
  }
  assert.equal(validateApproval(form({ perfis: ["AUDITOR_QUALIDADE"], atuacaoEngenharia: null, grants: JSON.stringify([grant("AUDITOR_QUALIDADE", workA, "QUALIDADE")]) })).ok, true);
});
test("permissions cannot claim a profile outside the selected combination", () => {
  for (const perfil of ["AUDITOR_SEGURANCA", "ADMINISTRATIVO", "SUPERADMIN", null, ["ENGENHARIA"]]) {
    assert.equal(validateApproval(form({ grants: JSON.stringify([grant(perfil)]) })).ok, false);
  }
});
test("requires one or more unique whitelisted profiles and rejects the legacy singular field", () => {
  for (const perfis of [[], ["SUPERADMIN"], ["ENGENHARIA", "ENGENHARIA"], [" ENGENHARIA "], ["engenharia"], new Blob(["ENGENHARIA"])]) assert.equal(validateApproval(form({ perfis })).ok, false);
  assert.equal(validateApproval(form({ perfil: "ADMINISTRATIVO" })).ok, false);
  assert.equal(validateApproval(form({ perfis: null, perfil: "ENGENHARIA" })).ok, false);
});
test("rejects unreviewed approval and short or oversized reasons", () => {
  for (const overrides of [{ confirmation: null }, { confirmation: "NAO" }, { reason: "curto" }, { reason: "x".repeat(1001) }]) assert.equal(validateApproval(form(overrides)).ok, false);
});
test("rejects forged, incomplete, duplicated, malformed and excessive grants", () => {
  const invalidGrants = ["not-json", "null", "{}", "[]", JSON.stringify([{ obra_id: workA, modulo: "SEGURANCA" }]), JSON.stringify([grant("ENGENHARIA", "*")]), JSON.stringify([grant("ENGENHARIA", workA, "TODOS")]), JSON.stringify([{ ...grant(), actor_id: target }]), JSON.stringify([grant("ENGENHARIA", workB), grant("ENGENHARIA", workB.toUpperCase())]), JSON.stringify(Array.from({ length: 401 }, () => grant()))];
  for (const grants of invalidGrants) assert.equal(validateApproval(form({ grants })).ok, false, grants.slice(0, 90));
});
test("accepts 400 distinct grants without truncating the approved scope", () => {
  const grants = Array.from({ length: 200 }, (_, index) => [grant("ENGENHARIA", `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`), grant("ENGENHARIA", `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`, "QUALIDADE")]).flat();
  const parsed = validateApproval(form({ grants: JSON.stringify(grants) }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.grants.length, 400);
});
test("duplicate scalar security fields and binary fields fail closed", () => {
  for (const key of ["authUserId", "atuacaoEngenharia", "grants", "reason", "confirmation"]) {
    const data = form(); data.append(key, data.get(key));
    assert.equal(validateApproval(data).ok, false, key);
  }
  assert.equal(validateApproval(form({ grants: new Blob(["[]"]) })).ok, false);
  assert.equal(validateApproval(form({ perfis: ["ADMINISTRATIVO"], atuacaoEngenharia: new Blob([""]), grants: "[]" })).ok, false);
});
test("invalid and self approval never instantiate a database client", async () => {
  for (const data of [form({ authUserId: actor }), form({ authUserId: actor, perfis: allProfiles }), form({ grants: "[]" })]) {
    const env = harness();
    assert.equal((await approveRequest(data, env.deps)).status, "error");
    assert.equal(env.factories, 0);
    assert.equal(env.calls.length, 0);
  }
});
test("v3 sends the selected administrative activity and exact grants, ignoring actor claims", async () => {
  const env = harness();
  const result = await approveRequest(form({ actor_id: target, status_acesso: "APROVADO" }), env.deps);
  assert.equal(result.status, "success");
  assert.equal(result.recordId, decision);
  assert.deepEqual(env.calls, [["approve_access_request_v3", { p_auth_user_id: target, p_perfis: ["ENGENHARIA"], p_atuacao_engenharia: "EQUIPE_OBRA", p_atuacao_administrativa: null, p_grants: engineeringGrants, p_reason: "Equipe responsável pelas obras informadas." }]]);
});
test("v3 retains four-profile scopes without cross-profile or cross-work expansion", async () => {
  const env = harness();
  const grants = [grant("AUDITOR_SEGURANCA"), grant("AUDITOR_QUALIDADE", workB, "QUALIDADE"), grant("ENGENHARIA", workB, "SEGURANCA"), grant("ENGENHARIA", workB, "QUALIDADE")];
  const result = await approveRequest(form({ perfis: allProfiles, grants: JSON.stringify(grants) }), env.deps);
  assert.equal(result.status, "success");
  assert.deepEqual(env.calls[0][1].p_perfis, allProfiles);
  assert.deepEqual(env.calls[0][1].p_grants, grants);
  assert.equal(env.calls[0][1].p_atuacao_administrativa, "GERAL");
  assert.equal(env.calls[0][1].p_perfil, undefined);
});
test("provider errors and unconfirmed responses cannot masquerade as successful approvals", async () => {
  for (const outcome of [{ data: decision, error: { message: "PRIVATE_DATABASE_DETAIL" } }, { data: null, error: null }, { data: "not-an-id", error: null }, new Error("PRIVATE_DATABASE_DETAIL")]) {
    const result = await approveRequest(form(), harness(outcome).deps);
    assert.equal(result.status, "error");
    assert.equal(result.recordId, undefined);
    assert.equal(result.message.includes("PRIVATE_DATABASE_DETAIL"), false);
  }
});
test("account editing validates status, profiles, activities and exact work access", () => {
  const parsed = validateAccountEdit(editForm());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.ativo, true);
  assert.deepEqual(parsed.data.atuacoesEngenharia, ["EQUIPE_OBRA"]);
  assert.equal(validateAccountEdit(editForm({ status: "BLOQUEADO" })).ok, false);
  assert.equal(validateAccountEdit(editForm({ atuacoesEngenharia: [] })).ok, false);
  assert.equal(validateAccountEdit(editForm({ grants: JSON.stringify([grant()]) })).ok, false);
  assert.equal(validateAccountEdit(editForm({ perfis: ["ADMINISTRATIVO"], atuacoesEngenharia: [], grants: "[]", status: "INATIVO" })).ok, true);
});
test("account editing sends only validated authorization fields to the protected RPC", async () => {
  const env = harness();
  const result = await updateAccountAccess(editForm({ actor_id: target, ativo: false }), env.deps);
  assert.equal(result.status, "success");
  assert.deepEqual(env.calls, [["update_access_account", {
    p_auth_user_id: target,
    p_perfis: ["ENGENHARIA"],
    p_atuacoes_engenharia: ["EQUIPE_OBRA"],
    p_atuacao_administrativa: null,
    p_grants: engineeringGrants,
    p_ativo: true,
    p_reason: "Edição administrativa dos acessos do usuário.",
  }]]);
});
test("invalid account edits fail before opening a database client", async () => {
  for (const data of [editForm({ confirmation: null }), editForm({ perfis: [] }), editForm({ grants: "[]" })]) {
    const env = harness();
    assert.equal((await updateAccountAccess(data, env.deps)).status, "error");
    assert.equal(env.factories, 0);
  }
});
test("work registration validates genuine name input and ignores client owner claims", async () => {
  for (const nome of [" ", "a", "x".repeat(161)]) assert.equal(validateWork(form({ nome })).ok, false);
  const env = harness();
  const result = await registerWork(form({ nome: "  Obra de teste offline  ", created_by: target }), env.deps);
  assert.equal(result.status, "success");
  assert.deepEqual(env.calls, [["create_access_work", { p_nome: "Obra de teste offline" }]]);
});
test("failed or uncertain work registration never claims success or leaks provider text", async () => {
  for (const outcome of [{ data: null, error: null }, { data: null, error: { message: "PRIVATE_DATABASE_DETAIL" } }, new Error("PRIVATE_DATABASE_DETAIL")]) {
    const result = await registerWork(form({ nome: "Obra de teste offline" }), harness(outcome).deps);
    assert.equal(result.status, "error");
    assert.equal(result.message.includes("PRIVATE_DATABASE_DETAIL"), false);
  }
});
