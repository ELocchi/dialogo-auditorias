import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveProfileContext } from "../auth/active-profile.ts";
import { getProfileContexts } from "../auth/active-profile.ts";
import type { EffectiveAccount } from "../auth/effective-access.ts";
import { buildWorkspaceContext, type ProfileWorkspaceContext } from "./workspace-context.ts";

export type WorkspaceSelection = ActiveProfileContext & {
  user: { id: string; email?: string };
  account: EffectiveAccount;
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Revalidate the selected profile and read only its grants/works in one snapshot. */
export async function readSelectedWorkspace(client: Pick<SupabaseClient, "rpc">,
  { user, account, profile, engineeringScope, administrativeScope }: WorkspaceSelection): Promise<ProfileWorkspaceContext | null> {
  try {
    if (account.auth_user_id !== user.id || account.ativo !== true || !user.email
      || !getProfileContexts(account).some((entry) => entry.profile === profile
        && entry.engineeringScope === engineeringScope && entry.administrativeScope === administrativeScope)) return null;
    const { data, error } = await client.rpc("read_current_access_workspace", {
      p_profile: profile, p_engineering_scope: engineeringScope, p_administrative_scope: administrativeScope,
    });
    if (error || !record(data) || !record(data.identity) || data.identity.id !== user.id
      || typeof data.identity.name !== "string" || typeof data.identity.email !== "string"
      || data.identity.email.toLowerCase() !== user.email.toLowerCase()
      || !Array.isArray(data.works) || !Array.isArray(data.grants)) return null;
    if (data.works.some((work) => !record(work) || work.ativo !== true)
      || data.grants.some((grant) => !record(grant) || grant.perfil !== profile)) return null;
    const works = new Set(data.works.map((work) => work.id));
    const grantedWorks = new Set(data.grants.map((grant) => grant.obra_id));
    const pairs = new Set(data.grants.map((grant) => `${grant.obra_id}/${grant.modulo}`));
    if (pairs.size !== data.grants.length || data.grants.some((grant) => !works.has(grant.obra_id))) return null;
    if (profile === "ADMINISTRATIVO" ? data.grants.length !== 0
      : data.works.some((work) => !grantedWorks.has(work.id))) return null;
    return buildWorkspaceContext({ account, profile, engineeringScope, administrativeScope,
      identity: { id: user.id, name: data.identity.name, email: user.email }, works: data.works, grants: data.grants });
  } catch { return null; }
}
