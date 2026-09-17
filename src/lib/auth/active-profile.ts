import { accessProfiles, type AccessProfile, type AdministrativeScope, type EngineeringScope } from "../access/contracts.ts";
import { validEngineeringScopes, type EffectiveAccount } from "./effective-access.ts";

// A preference is never an authorization credential. Every use is checked
// against the verified identity and its current database authorization.
export const activeProfileCookieName = "dialogo_active_profile";
const identityPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const validIdentity = (value: unknown): value is string => typeof value === "string" && value.length === 36 && identityPattern.test(value);
const engineeringScopes = ["EQUIPE_OBRA", "COORDENACAO"] as const;
const administrativeScopes = ["GERAL", "SEGURANCA", "QUALIDADE"] as const;
export type ActiveProfileContext = { profile: AccessProfile; engineeringScope: EngineeringScope | null; administrativeScope: AdministrativeScope | null };
type ActiveProfileChoice = ActiveProfileContext & { userId: string; version: 1 | 2 | 3 };

export function encodeActiveProfileChoice(userId: string, profile: AccessProfile, engineeringScope: EngineeringScope | null = null, administrativeScope: AdministrativeScope | null = null): string {
  if (!validIdentity(userId) || !accessProfiles.includes(profile)
    || (profile === "ENGENHARIA" ? !engineeringScopes.includes(engineeringScope as EngineeringScope) : engineeringScope !== null)
    || (profile === "ADMINISTRATIVO" ? !administrativeScopes.includes(administrativeScope as AdministrativeScope) : administrativeScope !== null)) throw new Error("Perfil inválido.");
  return `v3.${userId}.${profile}.${engineeringScope ?? "NONE"}.${administrativeScope ?? "NONE"}`;
}

export function parseActiveProfileChoice(raw: unknown): ActiveProfileChoice | null {
  if (typeof raw !== "string" || raw.length > 110) return null;
  const parts = raw.split(".");
  if (!validIdentity(parts[1]) || !accessProfiles.includes(parts[2] as AccessProfile)) return null;
  const profile = parts[2] as AccessProfile;
  if (parts.length === 3 && parts[0] === "v1") return { version: 1, userId: parts[1], profile, engineeringScope: null, administrativeScope: null };
  if (parts.length === 4 && parts[0] === "v2") {
    if (profile === "ENGENHARIA" ? !engineeringScopes.includes(parts[3] as EngineeringScope) : parts[3] !== "NONE") return null;
    return { version: 2, userId: parts[1], profile, engineeringScope: profile === "ENGENHARIA" ? parts[3] as EngineeringScope : null, administrativeScope: null };
  }
  if (parts.length !== 5 || parts[0] !== "v3"
    || (profile === "ENGENHARIA" ? !engineeringScopes.includes(parts[3] as EngineeringScope) : parts[3] !== "NONE")
    || (profile === "ADMINISTRATIVO" ? !administrativeScopes.includes(parts[4] as AdministrativeScope) : parts[4] !== "NONE")) return null;
  return { version: 3, userId: parts[1], profile, engineeringScope: profile === "ENGENHARIA" ? parts[3] as EngineeringScope : null,
    administrativeScope: profile === "ADMINISTRATIVO" ? parts[4] as AdministrativeScope : null };
}

function isCurrentAccount(account: EffectiveAccount | null, userId: string): account is EffectiveAccount {
  if (!account || !validIdentity(userId) || account.auth_user_id !== userId || account.ativo !== true
    || !account.approved_at || !Array.isArray(account.perfis) || account.perfis.length < 1
    || account.perfis.length > accessProfiles.length || new Set(account.perfis).size !== account.perfis.length
    || account.perfis.some((profile) => !accessProfiles.includes(profile))
    || !validEngineeringScopes(account.perfis, account.atuacao_engenharia, account.atuacoes_engenharia)) return false;
  return true;
}

export function getProfileContexts(account: EffectiveAccount): ActiveProfileContext[] {
  return account.perfis.flatMap((profile): ActiveProfileContext[] => profile === "ENGENHARIA"
    ? account.atuacoes_engenharia.map((engineeringScope) => ({ profile, engineeringScope, administrativeScope: null }))
    : profile === "ADMINISTRATIVO"
      ? (account.atuacao_administrativa === "GERAL" ? administrativeScopes : [account.atuacao_administrativa])
        .filter((scope): scope is AdministrativeScope => scope !== null)
        .map((administrativeScope) => ({ profile, engineeringScope: null, administrativeScope }))
      : [{ profile, engineeringScope: null, administrativeScope: null }]);
}

export function validateProfileSelectionContext(form: FormData, account: EffectiveAccount | null, userId: string): ActiveProfileContext | null {
  const choices = form.getAll("perfil");
  const scopes = form.getAll("atuacao_engenharia");
  const adminScopes = form.getAll("atuacao_administrativa");
  if (!isCurrentAccount(account, userId) || choices.length !== 1 || typeof choices[0] !== "string") return null;
  const profile = choices[0] as AccessProfile;
  if (!accessProfiles.includes(profile) || !account.perfis.includes(profile)) return null;
  if (profile === "ADMINISTRATIVO") {
    if (scopes.length !== 0 || adminScopes.length !== 1 || typeof adminScopes[0] !== "string") return null;
    const administrativeScope = adminScopes[0] as AdministrativeScope;
    return getProfileContexts(account).some((entry) => entry.profile === profile && entry.administrativeScope === administrativeScope)
      ? { profile, engineeringScope: null, administrativeScope } : null;
  }
  if (profile !== "ENGENHARIA") return scopes.length === 0 && adminScopes.length === 0 ? { profile, engineeringScope: null, administrativeScope: null } : null;
  if (adminScopes.length !== 0) return null;
  if (scopes.length !== 1 || typeof scopes[0] !== "string" || !account.atuacoes_engenharia.includes(scopes[0] as EngineeringScope)) return null;
  return { profile, engineeringScope: scopes[0] as EngineeringScope, administrativeScope: null };
}

export function validateProfileSelection(form: FormData, account: EffectiveAccount | null, userId: string): AccessProfile | null {
  return validateProfileSelectionContext(form, account, userId)?.profile ?? null;
}

export function resolveActiveProfileContext(account: EffectiveAccount | null, userId: string, raw: unknown): ActiveProfileContext | null {
  if (!isCurrentAccount(account, userId)) return null;
  const contexts = getProfileContexts(account);
  if (contexts.length === 1) return contexts[0];
  const choice = parseActiveProfileChoice(raw);
  if (!choice || choice.userId !== userId || !account.perfis.includes(choice.profile)) return null;
  // Legacy choices mean the historically selected primary scope, never all
  // Engineering scopes. The primary must still be authorized on this request.
  const engineeringScope = choice.profile === "ENGENHARIA" && choice.version === 1 ? account.atuacao_engenharia : choice.engineeringScope;
  const administrativeScope = choice.profile === "ADMINISTRATIVO" && choice.version !== 3 ? account.atuacao_administrativa : choice.administrativeScope;
  return contexts.find((entry) => entry.profile === choice.profile && entry.engineeringScope === engineeringScope && entry.administrativeScope === administrativeScope) ?? null;
}

export function resolveActiveProfile(account: EffectiveAccount | null, userId: string, raw: unknown): AccessProfile | null {
  return resolveActiveProfileContext(account, userId, raw)?.profile ?? null;
}
