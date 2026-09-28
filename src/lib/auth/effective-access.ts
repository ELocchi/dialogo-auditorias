import type { SupabaseClient } from "@supabase/supabase-js";
import { corporateEmail } from "./validation.ts";
import { accessProfiles, type AccessProfile, type AdministrativeScope, type EngineeringScope } from "../access/contracts.ts";

export type EffectiveAccount = {
  auth_user_id: string;
  // Legacy primary profile is retained for historical compatibility only.
  perfil: AccessProfile;
  perfis: AccessProfile[];
  atuacao_engenharia: "EQUIPE_OBRA" | "COORDENACAO" | null;
  atuacoes_engenharia: EngineeringScope[];
  atuacao_administrativa: AdministrativeScope | null;
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
export async function readEffectiveAccount(client: Pick<SupabaseClient, "rpc">, user: Identity): Promise<EffectiveAccount | null> {
  if (!user.id || !corporateEmail(user.email) || !user.email_confirmed_at) return null;
  try {
    // One fresh database snapshot checks Auth bans/deletion, account and request.
    // Never reuse this result across requests or fall back to a stale authority.
    const { data: snapshot, error } = await client.rpc("read_current_access_account");
    if (error || !snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)
      || !snapshot.account || !snapshot.request) return null;
    const { account: data, request } = snapshot;
    if (data.auth_user_id !== user.id || request.auth_user_id !== user.id
      || request.status_acesso !== "APROVADO" || !request.email_confirmado_em
      || typeof request.email !== "string" || request.email.toLowerCase() !== user.email!.toLowerCase()
      || data.ativo !== true || !data.approved_at
      || !Array.isArray(data.perfis) || data.perfis.length < 1 || data.perfis.length > accessProfiles.length
      || data.perfis.some((profile: unknown) => !accessProfiles.includes(profile as AccessProfile))
      || new Set(data.perfis).size !== data.perfis.length) return null;
    const canonical = accessProfiles.filter((profile) => data.perfis.includes(profile));
    if (canonical.some((profile, index) => data.perfis[index] !== profile) || data.perfil !== canonical[0]) return null;
    if (!validEngineeringScopes(data.perfis, data.atuacao_engenharia, data.atuacoes_engenharia)) return null;
    let administrativeScope: AdministrativeScope | null = null;
    if (data.perfis.includes("ADMINISTRATIVO")) {
      if (!["SEGURANCA", "QUALIDADE", "GERAL"].includes(data.atuacao_administrativa)) return null;
      administrativeScope = data.atuacao_administrativa as AdministrativeScope;
    }
    return { auth_user_id: data.auth_user_id, perfil: data.perfil, perfis: data.perfis,
      atuacao_engenharia: data.atuacao_engenharia, atuacoes_engenharia: data.atuacoes_engenharia,
      atuacao_administrativa: administrativeScope, ativo: true, approved_at: data.approved_at } as EffectiveAccount;
  } catch { return null; }
}

export function effectiveDestination(account: EffectiveAccount | null) {
  if (!account) return "/aguardando-liberacao";
  return account.perfis.length > 1 ? "/escolher-perfil" : "/app";
}
