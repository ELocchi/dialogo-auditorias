import { createClient } from "@/lib/supabase/server";
import { readPublishedAuditComparison } from "@/lib/audits/comparison-service";
import { parseComparisonAuditIds, unavailableAuditComparison } from "@/lib/audits/comparison-contracts";
import { auditResponseHeaders as headers, readAuditRequestContext } from "@/lib/audits/request-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await readAuditRequestContext(request);
  if (!access.context) return Response.json(unavailableAuditComparison(), { status: access.status, headers });
  const query = new URL(request.url).searchParams;
  const ids = query.getAll("ids").length === 1 ? parseComparisonAuditIds(query.get("ids")?.split(",")) : null;
  if (!ids) return Response.json(unavailableAuditComparison(), { status: 400, headers });
  const snapshot = await readPublishedAuditComparison(await createClient(), access.context, ids);
  return Response.json(snapshot, { status: snapshot.available ? 200 : 503, headers });
}
