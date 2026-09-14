import "server-only";

import { createClient } from "../supabase/server";
import { ownAccessRequest, type requireActiveProfile } from "../auth/session";
import { buildWorkspaceContext, type WorkspaceWork } from "./workspace-context";
import type { AccessGrant } from "./contracts";

/** Caller must have a verified current account and a currently granted selection.
 * Read through the user's session/RLS; never a privileged service client.
 */
export async function readWorkspaceContext({ user, account, profile, engineeringScope }: Awaited<ReturnType<typeof requireActiveProfile>>) {
  try {
    const client = await createClient();
    const request = await ownAccessRequest(user.id);
    if (!request || request.status_acesso !== "APROVADO") return null;
    let grants: AccessGrant[] = [];
    if (profile !== "ADMINISTRATIVO") {
      const result = await client.from("access_grants").select("perfil,obra_id,modulo")
        .eq("auth_user_id", user.id).eq("perfil", profile).limit(400);
      if (result.error || !result.data) return null;
      grants = result.data as AccessGrant[];
    }
    const workIds = [...new Set(grants.map((grant) => grant.obra_id))];
    let works: WorkspaceWork[] = [];
    if (profile === "ADMINISTRATIVO" || workIds.length > 0) {
      let query = client.from("access_works").select("id,nome,ativo,cidade,uf,logradouro,numero,responsavel_tecnico,coordenacao").eq("ativo", true).order("nome").limit(1000);
      if (profile !== "ADMINISTRATIVO") query = query.in("id", workIds);
      const result = await query;
      if (result.error || !result.data) return null;
      works = result.data as WorkspaceWork[];
    }
    // Only the selected profile's work/module pairs are serialized to the UI.
    return buildWorkspaceContext({ account, profile, engineeringScope, identity: { id: user.id, name: request.nome, email: user.email! }, works, grants });
  } catch { return null; }
}


