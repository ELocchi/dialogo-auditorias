import { createClient } from "@/lib/supabase/server";
import { readPublishedAuditDetail } from "@/lib/audits/service";
import { unavailablePublishedAudits } from "@/lib/audits/contracts";
import { auditResponseHeaders as headers, readAuditRequestContext } from "@/lib/audits/request-context";
import { isUuid } from "@/lib/catalogs/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ auditId: string }> }) {
  const access = await readAuditRequestContext(request);
  if (!access.context) return Response.json(unavailablePublishedAudits(), { status: access.status, headers });
  const { auditId } = await params;
  if (!isUuid(auditId)) return Response.json(unavailablePublishedAudits(), { status: 400, headers });
  const snapshot = await readPublishedAuditDetail(await createClient(), access.context, auditId);
  return Response.json(snapshot, { status: !snapshot.available ? 503 : snapshot.audits.length ? 200 : 404, headers });
}
