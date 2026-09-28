import { createClient } from "@/lib/supabase/server";
import { auditResponseHeaders as headers, readAuditRequestContext } from "@/lib/audits/request-context";
import { unavailableFollowUpWorkspace } from "@/lib/follow-up/workspace-contracts";
import { readFollowUpWorkspace } from "@/lib/follow-up/workspace-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await readAuditRequestContext(request);
    if (!access.context) return Response.json(unavailableFollowUpWorkspace(), { status: access.status, headers });
    if (!["AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE"].includes(access.context.profile))
      return Response.json(unavailableFollowUpWorkspace(), { status: 403, headers });
    const snapshot = await readFollowUpWorkspace(await createClient(), access.context);
    return Response.json(snapshot, { status: snapshot.available ? 200 : 503, headers });
  } catch { return Response.json(unavailableFollowUpWorkspace(), { status: 503, headers }); }
}
