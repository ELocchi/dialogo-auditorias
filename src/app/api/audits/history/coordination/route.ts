import { createClient } from "@/lib/supabase/server";
import { readPublishedAuditHistory } from "@/lib/audits/history-service";
import { normalizeAuditHistoryQuery, unavailableAuditHistory } from "@/lib/audits/history-contracts";
import { auditResponseHeaders as headers, readAuditRequestContext } from "@/lib/audits/request-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await readAuditRequestContext(request);
  const unavailable = { quality: unavailableAuditHistory(), safety: unavailableAuditHistory() };
  if (!access.context) return Response.json(unavailable, { status: access.status, headers });
  if (access.context.profile !== "ENGENHARIA" || access.context.engineeringScope !== "COORDENACAO")
    return Response.json(unavailable, { status: 403, headers });
  const parameters = new URL(request.url).searchParams;
  const raw: Record<string, string> = {};
  for (const key of ["page", "pageSize", "workId", "dateFrom", "dateTo", "auditId", "excludeAuditId", "onlyWithFindings", "includeFindings"]) {
    const values = parameters.getAll(key);
    if (values.length > 1) return Response.json(unavailable, { status: 400, headers });
    if (values.length) raw[key] = values[0];
  }
  if (parameters.has("module") || parameters.has("modelId")) return Response.json(unavailable, { status: 400, headers });
  const base = normalizeAuditHistoryQuery(raw);
  if (!base) return Response.json(unavailable, { status: 400, headers });
  const client = await createClient();
  const [quality, safety] = await Promise.all([
    readPublishedAuditHistory(client, access.context, { ...base, module: "quality" }),
    readPublishedAuditHistory(client, access.context, { ...base, module: "safety" }),
  ]);
  const available = quality.available && safety.available;
  return Response.json({ quality, safety }, { status: available ? 200 : 503, headers });
}
