import { createClient } from "@/lib/supabase/server";
import { auditResponseHeaders as headers, readAuditRequestContext } from "@/lib/audits/request-context";
import { unavailableFollowUpReportIndex } from "@/lib/follow-up/workspace-contracts";
import { readFollowUpReportIndex } from "@/lib/follow-up/workspace-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await readAuditRequestContext(request);
    if (!access.context) return Response.json(unavailableFollowUpReportIndex(), { status: access.status, headers });
    if (access.context.profile !== "ENGENHARIA") return Response.json(unavailableFollowUpReportIndex(), { status: 403, headers });
    const snapshot = await readFollowUpReportIndex(await createClient(), access.context);
    return Response.json(snapshot, { status: snapshot.available ? 200 : 503, headers });
  } catch { return Response.json(unavailableFollowUpReportIndex(), { status: 503, headers }); }
}
