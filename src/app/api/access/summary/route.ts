import { verifiedUser, effectiveAccount } from "@/lib/auth/session";
import { readActiveProfileContext } from "@/lib/auth/active-profile-session";
import { createClient } from "@/lib/supabase/server";
import { readAccessSummary } from "@/lib/access/summary-service";
import { unavailableAccessSummary } from "@/lib/access/summary-contracts";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request) {
  const user = await verifiedUser();
  if (!user) return Response.json(unavailableAccessSummary(), { status: 401, headers });
  const account = await effectiveAccount(user);
  if (!account) return Response.json(unavailableAccessSummary(), { status: 403, headers });
  const selected = await readActiveProfileContext(user.id, account);
  if (!selected || selected.profile !== "ADMINISTRATIVO" || selected.administrativeScope !== "GERAL") {
    return Response.json(unavailableAccessSummary(), { status: 403, headers });
  }
  const query = new URL(request.url).searchParams;
  if ((query.has("usuario") && query.get("usuario") !== user.id)
    || (query.has("perfil") && query.get("perfil") !== selected.profile)
    || (query.has("atuacao") && query.get("atuacao") !== (selected.engineeringScope ?? ""))
    || (query.has("administrativo") && query.get("administrativo") !== selected.administrativeScope)) {
    return Response.json(unavailableAccessSummary(), { status: 403, headers });
  }
  const summary = await readAccessSummary(await createClient());
  return Response.json(summary, { status: summary.available ? 200 : 503, headers });
}
