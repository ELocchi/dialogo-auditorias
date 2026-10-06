import { readWorkHistory } from "@/lib/works/queries";
import { readActiveProfileContext } from "@/lib/auth/active-profile-session";
import { verifiedUser, effectiveAccount } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { uuidPattern } from "@/lib/access/validation";
import { auditResponseHeaders as headers } from "@/lib/audits/request-context";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const fail = (status: number) => Response.json({ available: false }, { status, headers });
  try {
    const user = await verifiedUser();
    if (!user) return fail(401);
    const account = await effectiveAccount(user);
    if (!account) return fail(403);
    const selected = await readActiveProfileContext(user.id, account);
    if (selected?.profile !== "ADMINISTRATIVO" || selected.administrativeScope !== "GERAL") return fail(403);
    const params = new URL(request.url).searchParams;
    const page = Number(params.get("page") ?? 1), search = (params.get("search") ?? "").trim(), id = params.get("userId");
    if (!Number.isSafeInteger(page) || page < 1 || page > 999999 || search.length > 120 || (id && !uuidPattern.test(id))) return fail(400);
    const client = await createClient();
    if (params.has("workId")) {
      const workId = params.get("workId")!;
      if (!uuidPattern.test(workId)) return fail(400);
      const access = await client.rpc("is_current_access_administrator");
      if (access.error || access.data !== true) return fail(403);
      const history = await readWorkHistory(workId, page);
      return Response.json({ ...history, page }, { status: history.error ? 503 : 200, headers });
    }
    const { data, error } = id ? await client.rpc("read_access_decision_page", { p_user_id: id, p_page: page })
      : await client.rpc("read_team_profile_page", { p_search: search, p_page: page });
    if (error) return fail(error.code === "42501" ? 403 : 503);
    if (!data?.available) return fail(503);
    return Response.json(data, { headers });
  } catch { return fail(503); }
}
