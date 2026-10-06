import { auditResponseHeaders as headers, readAuditRequestContext } from "@/lib/audits/request-context";
export const dynamic = "force-dynamic";
/** Older tabs must reload to use the paged contract; never return a partial history. */
export async function GET(request: Request) {
 const access = await readAuditRequestContext(request);
 return Response.json({ ...{ available: false, reports: [], drafts: [], completed: [], workFindings: [] }, message: "Atualize a página para consultar as listas." }, { status: access.context ? 410 : access.status, headers });
}
