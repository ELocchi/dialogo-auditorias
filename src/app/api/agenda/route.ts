import { verifiedUser, effectiveAccount } from "@/lib/auth/session";
import { readActiveProfileContext } from "@/lib/auth/active-profile-session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { readAgendaSnapshot } from "@/lib/agenda/service";
import { unavailableAgenda } from "@/lib/agenda/contracts";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  const user = await verifiedUser();
  if (!user) return Response.json(unavailableAgenda(), { status: 401, headers });
  const account = await effectiveAccount(user);
  if (!account) return Response.json(unavailableAgenda(), { status: 403, headers });
  const selected = await readActiveProfileContext(user.id, account);
  if (!selected) return Response.json(unavailableAgenda(), { status: 403, headers });
  const query = new URL(request.url).searchParams;
  if ((query.has("usuario") && query.get("usuario") !== user.id)
    || (query.has("perfil") && query.get("perfil") !== selected.profile)
    || (query.has("atuacao") && query.get("atuacao") !== (selected.engineeringScope ?? ""))) {
    return Response.json(unavailableAgenda(), { status: 403, headers });
  }
  const context = await readWorkspaceContext({ user, account, ...selected });
  if (!context) return Response.json(unavailableAgenda(), { status: 403, headers });
  const snapshot = await readAgendaSnapshot(await createClient(), context);
  return Response.json(snapshot, { status: snapshot.available ? 200 : 503, headers });
}
