import { notFound } from "next/navigation";
import { auditResponseHeaders, readAuditRequestContext } from "@/lib/audits/request-context";
import { createClient } from "@/lib/supabase/server";
import { followUpPhotoBucket, parsePhotoFileName, photoPath } from "@/lib/follow-up/photos";
import { uuidPattern } from "@/lib/access/validation";
import { privatePhotoResponse } from "@/lib/photos/thumbnails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ workId: string; fileName: string }> }) {
  const { workId, fileName } = await params;
  const parsed = parsePhotoFileName(fileName);
  if (!uuidPattern.test(workId) || !parsed) notFound();
  const access = await readAuditRequestContext(request);
  if (!access.context) return new Response(null, { status: access.status, headers: auditResponseHeaders });
  const context = access.context;
  if ((context.profile !== "AUDITOR_SEGURANCA" && context.profile !== "AUDITOR_QUALIDADE")
    || !context.works.some((work) => work.id === workId)) notFound();
  const client = await createClient();
  return privatePhotoResponse(request, async () => {
    const { data: finding, error: findingError } = await client.from("follow_up_work_findings")
      .select("id").eq("id", parsed.findingId).eq("work_id", workId)
      .eq("auditor_auth_user_id", context.user.id).eq("photo_file_name", fileName).maybeSingle();
    if (findingError || !finding) return null;
    const path = photoPath(context.user.id, workId, fileName);
    if (!path) return null;
    return { key: `${followUpPhotoBucket}/${path}`, mimeType: parsed.mimeType, download: async () => {
      const { data, error } = await client.storage.from(followUpPhotoBucket).download(path);
      return error ? null : data;
    } };
  });
}
