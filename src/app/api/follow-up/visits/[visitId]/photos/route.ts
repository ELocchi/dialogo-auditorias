import { createClient } from "@/lib/supabase/server";
import { uuidPattern } from "@/lib/access/validation";
import { auditResponseHeaders as headers, readAuditRequestContext } from "@/lib/audits/request-context";
import { unavailableFollowUpVisitPhotos } from "@/lib/follow-up/workspace-contracts";
import { readFollowUpVisitPhotos } from "@/lib/follow-up/workspace-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const access = await readAuditRequestContext(request);
    if (!access.context) return Response.json(unavailableFollowUpVisitPhotos(), { status: access.status, headers });
    if (!["AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE"].includes(access.context.profile))
      return Response.json(unavailableFollowUpVisitPhotos(), { status: 403, headers });
    const { visitId } = await params;
    if (!uuidPattern.test(visitId)) return Response.json(unavailableFollowUpVisitPhotos(), { status: 400, headers });
    const result = await readFollowUpVisitPhotos(await createClient(), access.context, visitId);
    return Response.json(result.snapshot, { status: result.status, headers });
  } catch { return Response.json(unavailableFollowUpVisitPhotos(), { status: 503, headers }); }
}
