import { createClient } from "@/lib/supabase/server";
import { readAuditRequestContext, auditResponseHeaders as headers } from "@/lib/audits/request-context";
import { parseListQuery, unavailableList, type ListKind } from "@/lib/lists/contracts";
import { readListPage } from "@/lib/lists/service";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { context, status } = await readAuditRequestContext(request);
    if (!context) return Response.json(unavailableList(), { status, headers });
    if (!["AUDITOR_QUALIDADE", "AUDITOR_SEGURANCA", "ENGENHARIA"].includes(context.profile))
      return Response.json(unavailableList(), { status: 403, headers });
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind") ?? "findings";
    const query = ["reports", "standalone-reports", "findings", "work-findings"].includes(kind) ? parseListQuery(params, kind as ListKind) : null;
    if (!query) return Response.json(unavailableList(), { status: 400, headers });
    const page = await readListPage(await createClient(), context, query);
    return Response.json(page, { status: page.available ? 200 : 503, headers });
  } catch { return Response.json(unavailableList(), { status: 503, headers }); }
}
