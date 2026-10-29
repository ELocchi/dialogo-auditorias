import { createClient } from "@/lib/supabase/server";
import { readPublishedAuditReport } from "@/lib/audits/service";
import { auditResponseHeaders as headers, readAuditRequestContext } from "@/lib/audits/request-context";
import { isUuid } from "@/lib/catalogs/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ auditId: string }> }) {
  const access = await readAuditRequestContext(request);
  if (!access.context) return Response.json({ available: false }, { status: access.status, headers });
  const { auditId } = await params;
  const version = new URL(request.url).searchParams.get("versao");
  if (!isUuid(auditId) || (version !== null && !/^\d{1,4}$/.test(version))) return Response.json({ available: false }, { status: 400, headers });
  const report = await readPublishedAuditReport(await createClient(), access.context, auditId, version === null ? undefined : Number(version));
  if (!report.available || !report.url) return Response.json({ available: false }, { status: report.available ? 404 : 503, headers });
  return new Response(null, { status: 302, headers: { ...headers, Location: report.url } });
}
