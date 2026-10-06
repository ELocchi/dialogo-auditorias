import { createClient } from "@/lib/supabase/server";
import { readAuditRequestContext, auditResponseHeaders as headers } from "@/lib/audits/request-context";
import { readFollowUpPhotoBatch } from "@/lib/follow-up/photo-batch-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const access = await readAuditRequestContext(request);
    if (!access.context) return Response.json({available:false,photos:[]},{status:access.status,headers});
    const ids = new URL(request.url).searchParams.getAll("visitId");
    if (!ids.length) return Response.json({available:false,photos:[]},{status:400,headers});
    const result = await readFollowUpPhotoBatch(await createClient(),access.context,ids);
    return Response.json(result.snapshot,{status:result.status,headers});
  } catch { return Response.json({available:false,photos:[]},{status:503,headers}); }
}
