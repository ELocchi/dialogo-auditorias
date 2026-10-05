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
  const auditor = context.profile === "AUDITOR_SEGURANCA" || context.profile === "AUDITOR_QUALIDADE";
  const engineering = context.profile === "ENGENHARIA"
    && (context.engineeringScope === "EQUIPE_OBRA" || context.engineeringScope === "COORDENACAO");
  if ((!auditor && !engineering)
    || !context.works.some((work) => work.id === workId)) notFound();
  const client = await createClient();
  return privatePhotoResponse(request, async () => {
    // RLS checks the authenticated reader. The selected profile must also match
    // the finding's discipline, including on every warm thumbnail request.
    let query = client.from("follow_up_work_findings")
      .select("id,auditor_auth_user_id,modulo").eq("id", parsed.findingId).eq("work_id", workId)
      .eq("photo_file_name", fileName);
    if (auditor) query = query.eq("auditor_auth_user_id", context.user.id);
    const { data: finding, error: findingError } = await query.maybeSingle();
    if (findingError) throw new Error("Photo authorization unavailable");
    if (!finding || finding.id !== parsed.findingId || !uuidPattern.test(finding.auditor_auth_user_id)) return null;
    const findingModule = finding.modulo === "QUALIDADE" ? "quality" : finding.modulo === "SEGURANCA" ? "safety" : null;
    if (!findingModule || !context.user.workModuleScopes?.some(scope => scope.workId === workId && scope.module === findingModule)) return null;
    if (auditor && (finding.auditor_auth_user_id !== context.user.id
      || context.profile !== (findingModule === "quality" ? "AUDITOR_QUALIDADE" : "AUDITOR_SEGURANCA"))) return null;
    // Engineering reads the original publisher's file, never its own user folder.
    const path = photoPath(finding.auditor_auth_user_id, workId, fileName);
    if (!path) return null;
    return { key: `${followUpPhotoBucket}/${path}`, mimeType: parsed.mimeType, download: async () => {
      const { data, error } = await client.storage.from(followUpPhotoBucket).download(path);
      return error ? null : data;
    } };
  });
}
