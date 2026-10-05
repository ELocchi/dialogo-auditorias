import { createClient } from "@/lib/supabase/server";
import { auditResponseHeaders as headers, readAuditRequestContext } from "@/lib/audits/request-context";
import { readStandaloneReports } from "@/lib/follow-up/standalone-service";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const unavailable = { available: false, reports: [] };
  try {
    const { context, status } = await readAuditRequestContext(request);
    if (!context) return Response.json(unavailable, { status, headers });
    if (!["AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"].includes(context.profile))
      return Response.json(unavailable, { status: 403, headers });
    const snapshot = await readStandaloneReports(await createClient(), context);
    return Response.json(snapshot, { status: snapshot.available ? 200 : 503, headers });
  } catch { return Response.json(unavailable, { status: 503, headers }); }
}
