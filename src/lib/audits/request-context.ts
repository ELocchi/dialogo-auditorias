import { verifiedUser, effectiveAccount } from "@/lib/auth/session";
import { readActiveProfileContext } from "@/lib/auth/active-profile-session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";

export const auditResponseHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function readAuditRequestContext(request: Request): Promise<
  { context: ProfileWorkspaceContext; status: 200 } | { context: null; status: 401 | 403 }
> {
  const user = await verifiedUser();
  if (!user) return { context: null, status: 401 };
  const account = await effectiveAccount(user);
  if (!account) return { context: null, status: 403 };
  const selected = await readActiveProfileContext(user.id, account);
  if (!selected) return { context: null, status: 403 };
  const query = new URL(request.url).searchParams;
  if ((query.has("usuario") && query.get("usuario") !== user.id)
    || (query.has("perfil") && query.get("perfil") !== selected.profile)
    || (query.has("atuacao") && query.get("atuacao") !== (selected.engineeringScope ?? ""))
    || (query.has("administrativo") && query.get("administrativo") !== (selected.administrativeScope ?? ""))) {
    return { context: null, status: 403 };
  }
  const context = await readWorkspaceContext({ user, account, ...selected });
  return context ? { context, status: 200 } : { context: null, status: 403 };
}
