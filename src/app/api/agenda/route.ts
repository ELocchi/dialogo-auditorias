import { getSaoPauloToday } from "@/domain/visit-calendar";
import { verifiedUser, effectiveAccount } from "@/lib/auth/session";
import { readActiveProfileContext } from "@/lib/auth/active-profile-session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { readAgendaUpdate } from "@/lib/agenda/service";
import { isAgendaRevision, unavailableAgenda } from "@/lib/agenda/contracts";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, If-None-Match" };

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
    || (query.has("atuacao") && query.get("atuacao") !== (selected.engineeringScope ?? ""))
    || (query.has("administrativo") && query.get("administrativo") !== (selected.administrativeScope ?? ""))) {
    return Response.json(unavailableAgenda(), { status: 403, headers });
  }
  const context = await readWorkspaceContext({ user, account, ...selected });
  if (!context) return Response.json(unavailableAgenda(), { status: 403, headers });
  const month = query.get("mes") ?? getSaoPauloToday().slice(0, 7);
  if (month !== null && !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) return Response.json(unavailableAgenda(), { status: 400, headers });
  const candidate = request.headers.get("If-None-Match")?.match(/^"([a-f0-9]{32})"$/)?.[1];
  // Calendar reads always have a month boundary; visit prose/history is read by ID.
  const result = await readAgendaUpdate(await createClient(), context, isAgendaRevision(candidate) ? candidate : null,
    query.get("formato") === "compacto", month ?? undefined);
  if (result.unchanged) return new Response(null, { status: 304, headers: { ...headers, ETag: `"${result.revision}"` } });
  const { snapshot } = result;
  return Response.json(snapshot, { status: snapshot.available ? 200 : 503,
    headers: snapshot.available && snapshot.revision ? { ...headers, ETag: `"${snapshot.revision}"` } : headers });
}
