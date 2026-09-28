import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import {
  activeProfileCookieName, encodeActiveProfileChoice, parseActiveProfileChoice,
  resolveActiveProfile, resolveActiveProfileContext, validateProfileSelection, validateProfileSelectionContext, getProfileContexts,
} from "../src/lib/auth/active-profile.ts";

const userId = "d1a20000-0000-4000-8000-000000000001";
const otherId = "d1a20000-0000-4000-8000-000000000002";
const user = { id: userId, email: "profile.fixture@dialogo.com.br", email_confirmed_at: "2026-09-13T12:00:00Z" };
const account = {
  auth_user_id: userId, perfil: "ADMINISTRATIVO",
  perfis: ["ADMINISTRATIVO", "AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"],
  atuacao_engenharia: "COORDENACAO", atuacoes_engenharia: ["EQUIPE_OBRA", "COORDENACAO"], atuacao_administrativa: "GERAL", ativo: true, approved_at: "2026-09-13T13:00:00Z",
};
const choice = (profile = "ADMINISTRATIVO", identity = userId, scope = profile === "ENGENHARIA" ? "COORDENACAO" : null, adminScope = profile === "ADMINISTRATIVO" ? "GERAL" : null) => encodeActiveProfileChoice(identity, profile, scope, adminScope);
function form(...profiles) { const result = new FormData(); for (const profile of profiles) result.append("perfil", profile); return result; }

test("Every authorized profile round-trips as a versioned preference without credentials", () => {
  for (const profile of account.perfis) {
    assert.deepEqual(parseActiveProfileChoice(choice(profile)), { version: 3, userId, profile, engineeringScope: profile === "ENGENHARIA" ? "COORDENACAO" : null, administrativeScope: profile === "ADMINISTRATIVO" ? "GERAL" : null });
    assert.equal(resolveActiveProfile(account, userId, choice(profile)), profile);
  }
});

test("Malformed, oversized, unknown, and unversioned cookies never select a profile", () => {
  for (const raw of [undefined, null, {}, 1, "", "ADMINISTRATIVO", `v2.${userId}.ADMINISTRATIVO`,
    `v1.${userId}.SUPERADMIN`, `v1.${userId}.ADMINISTRATIVO.extra`, "x".repeat(101),
    `v1.${userId}.administrativo`, `v1.${userId}.ADMINISTRATIVO\n`, `v1.${userId}\n.ADMINISTRATIVO`, `v1.${userId}.ENGENHARIA/COORDENACAO`]) {
    assert.equal(parseActiveProfileChoice(raw), null);
    assert.equal(resolveActiveProfile(account, userId, raw), null);
  }
  assert.throws(() => encodeActiveProfileChoice("../different-account", "ADMINISTRATIVO"));
});

test("A preference belongs to the current identity and cannot activate an ungranted profile", () => {
  assert.equal(resolveActiveProfile(account, userId, choice("ADMINISTRATIVO", otherId)), null);
  assert.equal(resolveActiveProfile(account, otherId, choice()), null);
  const technical = { ...account, perfil: "AUDITOR_SEGURANCA", perfis: ["AUDITOR_SEGURANCA", "ENGENHARIA"] };
  assert.equal(resolveActiveProfile(technical, userId, choice("ADMINISTRATIVO")), null);
});

test("Revoked profiles and inactive or missing accounts invalidate an earlier choice", () => {
  assert.equal(resolveActiveProfile(account, userId, choice("AUDITOR_QUALIDADE")), "AUDITOR_QUALIDADE");
  assert.equal(resolveActiveProfile({ ...account, perfis: ["ADMINISTRATIVO", "ENGENHARIA"] }, userId, choice("AUDITOR_QUALIDADE")), null);
  for (const current of [null, { ...account, ativo: false }, { ...account, approved_at: null },
    { ...account, perfis: [] }, { ...account, perfis: ["ADMINISTRATIVO", "ADMINISTRATIVO"] }]) {
    assert.equal(resolveActiveProfile(current, userId, choice()), null);
  }
});

test("Every account with a single assigned profile is automatic", () => {
  assert.equal(resolveActiveProfile(account, userId, undefined), null);
  for (const profile of account.perfis) {
    const single = { ...account, perfil: profile, perfis: [profile], atuacao_engenharia: profile === "ENGENHARIA" ? "COORDENACAO" : null, atuacoes_engenharia: profile === "ENGENHARIA" ? ["COORDENACAO"] : [] };
    assert.equal(resolveActiveProfile(single, userId, undefined), profile);
    assert.equal(resolveActiveProfile(single, userId, choice("ADMINISTRATIVO", otherId)), profile);
  }
});

test("Form selection rejects duplicate, missing, unknown, file, or ungranted values", () => {
  for (const submitted of [form(), form("ADMINISTRATIVO", "ENGENHARIA"), form("ADMINISTRATIVO", "ADMINISTRATIVO"),
    form("SUPERADMIN"), form(" ADMINISTRATIVO"), form(new Blob(["ADMINISTRATIVO"]))]) {
    assert.equal(validateProfileSelection(submitted, account, userId), null);
  }
  assert.equal(validateProfileSelection(form("ADMINISTRATIVO"), { ...account, perfis: ["AUDITOR_SEGURANCA"] }, userId), null);
  assert.equal(validateProfileSelection(form("ADMINISTRATIVO"), account, otherId), null);
});

test("Choosing Engineering cannot modify the approved Engineering scope or supply a redirect", () => {
  const current = { ...account, atuacao_engenharia: "EQUIPE_OBRA", atuacoes_engenharia: ["EQUIPE_OBRA"] };
  const submitted = form("ENGENHARIA");
  submitted.set("atuacao_engenharia", "COORDENACAO");
  submitted.set("redirectTo", "https://example.invalid");
  assert.equal(validateProfileSelection(submitted, current, userId), null);
  submitted.set("atuacao_engenharia", "EQUIPE_OBRA");
  assert.deepEqual(validateProfileSelectionContext(submitted, current, userId), { profile: "ENGENHARIA", engineeringScope: "EQUIPE_OBRA", administrativeScope: null });
  assert.equal(current.atuacao_engenharia, "EQUIPE_OBRA");
});

test("General administration and both approved Engineering scopes produce seven distinct choices", () => {
  assert.deepEqual(getProfileContexts(account), [
    { profile: "ADMINISTRATIVO", engineeringScope: null, administrativeScope: "GERAL" },
    { profile: "ADMINISTRATIVO", engineeringScope: null, administrativeScope: "SEGURANCA" },
    { profile: "ADMINISTRATIVO", engineeringScope: null, administrativeScope: "QUALIDADE" },
    { profile: "AUDITOR_SEGURANCA", engineeringScope: null, administrativeScope: null },
    { profile: "AUDITOR_QUALIDADE", engineeringScope: null, administrativeScope: null },
    { profile: "ENGENHARIA", engineeringScope: "EQUIPE_OBRA", administrativeScope: null },
    { profile: "ENGENHARIA", engineeringScope: "COORDENACAO", administrativeScope: null },
  ]);
  for (const scope of account.atuacoes_engenharia) {
    assert.deepEqual(resolveActiveProfileContext(account, userId, choice("ENGENHARIA", userId, scope)), { profile: "ENGENHARIA", engineeringScope: scope, administrativeScope: null });
  }
});

test("General administrator can select both discipline views, but scoped administrators cannot widen access", () => {
  for (const scope of ["GERAL", "SEGURANCA", "QUALIDADE"]) {
    const submitted = form("ADMINISTRATIVO"); submitted.set("atuacao_administrativa", scope);
    assert.deepEqual(validateProfileSelectionContext(submitted, account, userId),
      { profile: "ADMINISTRATIVO", engineeringScope: null, administrativeScope: scope });
    assert.deepEqual(resolveActiveProfileContext(account, userId, choice("ADMINISTRATIVO", userId, null, scope)),
      { profile: "ADMINISTRATIVO", engineeringScope: null, administrativeScope: scope });
  }
  const safety = { ...account, atuacao_administrativa: "SEGURANCA" };
  assert.equal(resolveActiveProfileContext(safety, userId, choice("ADMINISTRATIVO", userId, null, "QUALIDADE")), null);
  assert.equal(resolveActiveProfileContext(safety, userId, choice("ADMINISTRATIVO", userId, null, "GERAL")), null);
  for (const values of [[], ["GERAL", "SEGURANCA"], ["ROOT"], [new Blob(["GERAL"])]]) {
    const submitted = form("ADMINISTRATIVO");
    for (const value of values) submitted.append("atuacao_administrativa", value);
    assert.equal(validateProfileSelectionContext(submitted, account, userId), null);
  }
});

test("Engineering with two scopes enters its registered primary scope when it is the only profile", () => {
  const engineering = { ...account, perfil: "ENGENHARIA", perfis: ["ENGENHARIA"] };
  assert.deepEqual(resolveActiveProfileContext(engineering, userId, undefined), { profile: "ENGENHARIA", engineeringScope: "COORDENACAO", administrativeScope: null });
  assert.deepEqual(resolveActiveProfileContext(engineering, userId, choice("ENGENHARIA", userId, "EQUIPE_OBRA")), { profile: "ENGENHARIA", engineeringScope: "COORDENACAO", administrativeScope: null });
});

test("Version 2 requires an explicit valid Engineering scope and rejects scopes for other profiles", () => {
  for (const raw of [`v2.${userId}.ENGENHARIA.NONE`, `v2.${userId}.ENGENHARIA.SUPERADMIN`,
    `v2.${userId}.ENGENHARIA`, `v2.${userId}.ADMINISTRATIVO.COORDENACAO`, `v2.${userId}.ENGENHARIA.COORDENACAO.extra`]) {
    assert.equal(parseActiveProfileChoice(raw), null);
    assert.equal(resolveActiveProfileContext(account, userId, raw), null);
  }
  assert.throws(() => encodeActiveProfileChoice(userId, "ENGENHARIA"));
  assert.throws(() => encodeActiveProfileChoice(userId, "ADMINISTRATIVO", "COORDENACAO"));
});

test("Legacy v1 Engineering selects only its existing authorized primary scope", () => {
  assert.deepEqual(resolveActiveProfileContext(account, userId, `v1.${userId}.ENGENHARIA`), { profile: "ENGENHARIA", engineeringScope: "COORDENACAO", administrativeScope: null });
  const team = { ...account, atuacao_engenharia: "EQUIPE_OBRA", atuacoes_engenharia: ["EQUIPE_OBRA"] };
  assert.deepEqual(resolveActiveProfileContext(team, userId, `v1.${userId}.ENGENHARIA`), { profile: "ENGENHARIA", engineeringScope: "EQUIPE_OBRA", administrativeScope: null });
  assert.equal(resolveActiveProfileContext(team, userId, choice("ENGENHARIA", userId, "COORDENACAO")), null);
});

test("Engineering forms reject absent, duplicate, malformed and ungranted scopes", () => {
  for (const scopeValues of [[], ["SUPERADMIN"], ["COORDENACAO", "EQUIPE_OBRA"], ["COORDENACAO", "COORDENACAO"], [new Blob(["COORDENACAO"])]]) {
    const submitted = form("ENGENHARIA");
    for (const value of scopeValues) submitted.append("atuacao_engenharia", value);
    assert.equal(validateProfileSelectionContext(submitted, account, userId), null);
  }
  const submitted = form("ADMINISTRATIVO"); submitted.append("atuacao_engenharia", "COORDENACAO");
  assert.equal(validateProfileSelectionContext(submitted, account, userId), null);
});

// Exercise the actual Server Actions and guards with offline framework/Auth
// adapters. Nothing below connects to Supabase or uses an existing session.
let state;
function reset() {
  state = {
    user: structuredClone(user), account: structuredClone(account), requestStatus: "APROVADO",
    active: true, administrator: true, cookies: [], writes: [], revalidated: [], authError: null, signOutError: null,
  };
  state.cookieStore = {
    getAll(name) { assert.equal(name, activeProfileCookieName); return state.cookies; },
    set(name, value, options) { state.writes.push({ name, value, options }); state.cookies = value ? [{ name, value }] : []; },
  };
  state.client = {
    auth: {
      async getUser() { return { data: { user: state.user }, error: null }; },
      async signInWithPassword() { return { data: { user: state.user }, error: state.authError }; },
      async signOut() { return { error: state.signOutError }; },
    },
    from(table) { return {
      select() { return this; }, eq() { return this; },
      async maybeSingle() {
        const request = { auth_user_id: userId, status_acesso: state.requestStatus, email: user.email, email_confirmado_em: user.email_confirmed_at };
        return { data: table === "access_accounts" ? state.account : request, error: null };
      },
    }; },
    async rpc(name) {
      if (name === "read_current_access_account") return { data: state.active === true ? { account: state.account,
        request: { auth_user_id: userId, status_acesso: state.requestStatus, email: state.user?.email,
          email_confirmado_em: state.user?.email_confirmed_at } } : null, error: null };
      return { data: name === "is_current_access_active" ? state.active : state.administrator, error: null };
    },
  };
  globalThis.__activeProfileFixture = state;
}
const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const stubs = {
  "server-only": "export {};",
  "next/headers": "export async function cookies() { return globalThis.__activeProfileFixture.cookieStore; }",
  "next/navigation": "export function redirect(destination) { throw Object.assign(new Error('redirect'), { destination }); }",
  "next/cache": "export function revalidatePath(...args) { globalThis.__activeProfileFixture.revalidated.push(args); }",
  "supabase/server": "export async function createClient() { return globalThis.__activeProfileFixture.client; }",
  "login-report": "export function reportLoginFailure() {}",
};
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = specifier.includes("supabase/server") ? "supabase/server" : specifier.endsWith("login-report") ? "login-report" : specifier;
    if (stubs[stub]) return { url: dataModule(stubs[stub]), shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(projectRoot, "src", specifier.slice(2) + ".ts")).href, context);
    return nextResolve(specifier, context);
  },
});
const { requireActiveProfile, requireAdministrator } = await import("../src/lib/auth/session.ts");
const { selectProfileAction } = await import("../src/app/escolher-perfil/actions.ts");
const { signInAction, signOutAction } = await import("../src/app/auth/actions.ts");
const { writeActiveProfileChoice } = await import("../src/lib/auth/active-profile-session.ts");
const redirected = (destination) => (error) => error.destination === destination;

test("Protected workspace rejects anonymous and pending sessions and asks multi-profile users to choose", async () => {
  reset(); state.user = null;
  await assert.rejects(requireActiveProfile(), redirected("/entrar"));
  reset(); state.requestStatus = "PENDENTE_APROVACAO";
  await assert.rejects(requireActiveProfile(), redirected("/aguardando-liberacao"));
  reset();
  await assert.rejects(requireActiveProfile(), redirected("/escolher-perfil"));
});

test("A single approved profile reaches the protected workspace without a preference cookie", async () => {
  reset(); state.account = { ...state.account, perfil: "ENGENHARIA", perfis: ["ENGENHARIA"], atuacao_engenharia: "EQUIPE_OBRA", atuacoes_engenharia: ["EQUIPE_OBRA"] };
  const result = await requireActiveProfile();
  assert.equal(result.profile, "ENGENHARIA");
  assert.equal(result.account.atuacao_engenharia, "EQUIPE_OBRA");
  assert.equal(state.writes.length, 0);
});

test("Protected workspace rechecks current grants, identity and Auth activity on every entry", async () => {
  reset(); state.cookies = [{ value: choice("AUDITOR_SEGURANCA") }];
  assert.equal((await requireActiveProfile()).profile, "AUDITOR_SEGURANCA");
  state.account.perfis = ["ADMINISTRATIVO", "ENGENHARIA"];
  await assert.rejects(requireActiveProfile(), redirected("/escolher-perfil"));
  reset(); state.cookies = [{ value: choice("ADMINISTRATIVO", otherId) }];
  await assert.rejects(requireActiveProfile(), redirected("/escolher-perfil"));
  reset(); state.cookies = [{ value: choice() }]; state.active = false;
  await assert.rejects(requireActiveProfile(), redirected("/aguardando-liberacao"));
});

test("Protected workspace observes scope removal and returns only the selected Engineering activity", async () => {
  reset(); state.cookies = [{ value: choice("ENGENHARIA", userId, "EQUIPE_OBRA") }];
  assert.equal((await requireActiveProfile()).engineeringScope, "EQUIPE_OBRA");
  state.account.atuacoes_engenharia = ["COORDENACAO"];
  await assert.rejects(requireActiveProfile(), redirected("/escolher-perfil"));
  state.cookies = [{ value: choice("ENGENHARIA", userId, "COORDENACAO") }];
  assert.equal((await requireActiveProfile()).engineeringScope, "COORDENACAO");
});

test("Duplicate preference cookies fail closed for multiple profiles", async () => {
  reset(); state.cookies = [{ value: choice() }, { value: choice("ENGENHARIA") }];
  await assert.rejects(requireActiveProfile(), redirected("/escolher-perfil"));
});

test("Administration requires the active Administrative view and the independent database check", async () => {
  reset(); state.cookies = [{ value: choice("AUDITOR_SEGURANCA") }];
  await assert.rejects(requireAdministrator(), redirected("/app"));
  state.cookies = [{ value: choice("ADMINISTRATIVO", userId, null, "SEGURANCA") }];
  await assert.rejects(requireAdministrator(), redirected("/app"));
  state.cookies = [{ value: choice() }];
  assert.equal((await requireAdministrator()).id, userId);
  state.administrator = false;
  await assert.rejects(requireAdministrator(), redirected("/minha-conta?acesso=restrito"));
});

test("Profile action writes only a current approved choice and always redirects inside the workspace", async () => {
  reset();
  const submitted = form("ENGENHARIA"); submitted.set("atuacao_engenharia", "COORDENACAO"); submitted.set("redirectTo", "https://example.invalid");
  await assert.rejects(selectProfileAction(submitted), redirected("/app"));
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].value, choice("ENGENHARIA"));
  assert.deepEqual(state.revalidated, [["/", "layout"]]);
  reset();
  await assert.rejects(selectProfileAction(form("ADMINISTRATIVO", "ENGENHARIA")), redirected("/escolher-perfil?erro=perfil"));
  assert.equal(state.writes.length, 0);
  state.active = false;
  await assert.rejects(selectProfileAction(form("ADMINISTRATIVO")), redirected("/aguardando-liberacao"));
  assert.equal(state.writes.length, 0);
});

test("Preference cookies are HttpOnly, local-preview compatible and Secure for HTTPS", async () => {
  const previous = process.env.APP_URL;
  try {
    for (const [url, secure] of [["http://127.0.0.1:3001", false], ["https://auditoria.example.invalid", true], ["http://external.example.invalid", true]]) {
      reset(); process.env.APP_URL = url;
      await writeActiveProfileChoice(userId, "ENGENHARIA", "COORDENACAO");
      assert.deepEqual(state.writes[0].options, { httpOnly: true, sameSite: "lax", path: "/", secure });
      assert.equal(state.writes[0].name, activeProfileCookieName);
    }
  } finally { if (previous === undefined) delete process.env.APP_URL; else process.env.APP_URL = previous; }
});

test("Successful login clears the previous choice without changing the validated pending checkpoint", async () => {
  reset(); state.cookies = [{ value: choice() }];
  const submitted = new FormData(); submitted.set("email", user.email); submitted.set("password", "Synthetic-password-123!");
  await assert.rejects(signInAction({ status: "idle", message: "" }, submitted), redirected("/aguardando-liberacao"));
  assert.equal(state.cookies.length, 0);
  assert.equal(state.writes[0].options.maxAge, 0);
  reset(); state.cookies = [{ value: choice() }]; state.authError = { status: 400, code: "invalid_credentials" };
  const failure = await signInAction({ status: "idle", message: "" }, submitted);
  assert.equal(failure.status, "error");
  assert.equal(state.writes.length, 0);
});

test("Successful logout clears the choice, while a failed logout leaves the session context unchanged", async () => {
  reset(); state.cookies = [{ value: choice() }];
  await assert.rejects(signOutAction(), redirected("/entrar"));
  assert.equal(state.cookies.length, 0);
  reset(); state.cookies = [{ value: choice() }]; state.signOutError = { status: 503 };
  const result = await signOutAction();
  assert.equal(result.status, "error");
  assert.equal(state.writes.length, 0);
});
