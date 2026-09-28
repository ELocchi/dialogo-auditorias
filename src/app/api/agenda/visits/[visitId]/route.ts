import { verifiedUser, effectiveAccount } from "@/lib/auth/session";
import { readActiveProfileContext } from "@/lib/auth/active-profile-session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { readAgendaVisitDetail } from "@/lib/agenda/detail-service";
import { matchesAgendaDetailActor } from "@/lib/agenda/detail-client";
import { uuidPattern } from "@/lib/access/validation";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const unavailable = (status: number) => Response.json({ available: false }, { status, headers });

export async function GET(request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const user = await verifiedUser();
  if (!user) return unavailable(401);
  const account = await effectiveAccount(user);
  if (!account) return unavailable(403);
  const selected = await readActiveProfileContext(user.id, account);
  if (!selected) return unavailable(403);
  const { visitId } = await params;
  if (!uuidPattern.test(visitId)) return unavailable(400);
  const context = await readWorkspaceContext({ user, account, ...selected });
  if (!context || !matchesAgendaDetailActor(new URL(request.url).searchParams, context.user)) return unavailable(403);
  const result = await readAgendaVisitDetail(await createClient(), context, visitId);
  if (!result.available) return unavailable(result.forbidden ? 403 : 503);
  if (!result.visit) return unavailable(404);
  return Response.json(result, { headers });
}
