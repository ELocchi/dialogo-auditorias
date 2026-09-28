import { createClient } from "@/lib/supabase/server";
import { readPublishedAuditHistory } from "@/lib/audits/history-service";
import { normalizeAuditHistoryQuery, unavailableAuditHistory } from "@/lib/audits/history-contracts";
import { auditResponseHeaders as headers, readAuditRequestContext } from "@/lib/audits/request-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await readAuditRequestContext(request);
  if (!access.context) return Response.json(unavailableAuditHistory(), { status: access.status, headers });
  const parameters = new URL(request.url).searchParams;
  const raw: Record<string, string> = {};
  for (const key of ["page", "pageSize", "workId", "module", "modelId", "dateFrom", "dateTo", "auditId", "excludeAuditId", "onlyWithFindings", "includeFindings"]) {
    const values = parameters.getAll(key);
    if (values.length > 1) return Response.json(unavailableAuditHistory(), { status: 400, headers });
    if (values.length) raw[key] = values[0];
  }
  const query = normalizeAuditHistoryQuery(raw);
  if (!query) return Response.json(unavailableAuditHistory(), { status: 400, headers });
  const snapshot = await readPublishedAuditHistory(await createClient(), access.context, query);
  return Response.json(snapshot, { status: snapshot.available ? 200 : 503, headers });
}
