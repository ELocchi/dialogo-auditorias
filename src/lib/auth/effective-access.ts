import type { SupabaseClient } from "@supabase/supabase-js";
import { corporateEmail } from "./validation.ts";
import { accessProfiles, type AccessProfile, type EngineeringScope } from "../access/contracts.ts";

export type EffectiveAccount = {
  auth_user_id: string;
  // Legacy primary profile is retained for historical compatibility only.
  perfil: AccessProfile;
  perfis: AccessProfile[];
  atuacao_engenharia: "EQUIPE_OBRA" | "COORDENACAO" | null;
  atuacoes_engenharia: EngineeringScope[];
  ativo: boolean;
  approved_at: string;
};
type Identity = { id: string; email?: string; email_confirmed_at?: string };

export function validEngineeringScopes(profiles: readonly AccessProfile[], primary: unknown, scopes: unknown): scopes is EngineeringScope[] {
  if (!Array.isArray(scopes)) return false;
  if (!profiles.includes("ENGENHARIA")) return primary === null && scopes.length === 0;
  const canonical = (["EQUIPE_OBRA", "COORDENACAO"] as const).filter((scope) => scopes.includes(scope));
  return scopes.length > 0 && scopes.length <= 2 && canonical.length === scopes.length
    && canonical.every((scope, index) => scopes[index] === scope) && scopes.includes(primary);
}

// Database reads use the caller's session and RLS. Metadata never supplies a role.
// No cross-request cache: the next server request observes current authorization.
export async function readEffectiveAccount(client: Pick<SupabaseClient, "from" | "rpc">, user: Identity): Promise<EffectiveAccount | null> {
  if (!user.id || !corporateEmail(user.email) || !user.email_confirmed_at) return null;
  try {
    const [account, request, active] = await Promise.all([
      client.from("access_accounts")
        .select("auth_user_id,perfil,perfis,atuacao_engenharia,atuacoes_engenharia,ativo,approved_at")
        .eq("auth_user_id", user.id).maybeSingle(),
      client.from("access_requests").select("auth_user_id,status_acesso,email,email_confirmado_em")
        .eq("auth_user_id", user.id).maybeSingle(),
      // Auth bans/deletion and current request state are verified in PostgreSQL,
      // including for accounts with an already-issued browser session.
      client.rpc("is_current_access_active"),
    ]);
    if (account.error || request.error || active.error || active.data !== true || !account.data || !request.data) return null;
    const data = account.data;
    if (data.auth_user_id !== user.id || request.data.auth_user_id !== user.id
      || request.data.status_acesso !== "APROVADO" || !request.data.email_confirmado_em
      || request.data.email.toLowerCase() !== user.email!.toLowerCase()
      || data.ativo !== true || !data.approved_at
      || !Array.isArray(data.perfis) || data.perfis.length < 1 || data.perfis.length > accessProfiles.length
      || data.perfis.some((profile: unknown) => !accessProfiles.includes(profile as AccessProfile))
      || new Set(data.perfis).size !== data.perfis.length) return null;
    const canonical = accessProfiles.filter((profile) => data.perfis.includes(profile));
    if (canonical.some((profile, index) => data.perfis[index] !== profile) || data.perfil !== canonical[0]) return null;
    if (!validEngineeringScopes(data.perfis, data.atuacao_engenharia, data.atuacoes_engenharia)) return null;
    return data as EffectiveAccount;
  } catch { return null; }
}

export function effectiveDestination(account: EffectiveAccount | null) {
  if (!account) return "/aguardando-liberacao";
  return account.perfis.length > 1 || account.atuacoes_engenharia.length > 1 ? "/escolher-perfil" : "/app";
}
