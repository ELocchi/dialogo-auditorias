import { createClient } from "@/lib/supabase/server";
import { auditResponseHeaders, readAuditRequestContext } from "@/lib/audits/request-context";
import { publishedAuditBucket } from "@/lib/audits/service";
import { isModel, isRecord, isUuid } from "@/lib/catalogs/validation";
import { privatePhotoResponse } from "@/lib/photos/thumbnails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ auditId: string; fileName: string }> }) {
  const access = await readAuditRequestContext(request);
  if (!access.context) return new Response(null, { status: access.status, headers: auditResponseHeaders });
  const { auditId, fileName } = await params;
  if (!isUuid(auditId) || !/^p\d{2}-\d{2}\.png$/.test(fileName)) return new Response(null, { status: 400, headers: auditResponseHeaders });
  const context = access.context;
  const client = await createClient();
  return privatePhotoResponse(request, async () => {
    // The compact RPC enforces the exact selected profile and current assignment.
    // Storage limits this same authorized audit to its private work/audit prefix.
    const { data, error } = await client.rpc("read_published_audit_report", { p_audit_id: auditId,
      p_profile: context.profile, p_engineering_scope: context.engineeringScope,
      p_administrative_scope: context.administrativeScope });
    if (error || !isRecord(data) || data.id !== auditId.toLowerCase() || !isUuid(data.workId) || !isModel(data.modelId)
      || !context.works.some((work) => work.id === data.workId)
      || !context.user.workModuleScopes?.some((scope) => scope.workId === data.workId
        && scope.module === (data.modelId === "security-it07-r02" ? "safety" : "quality"))) return null;
    const path = `${data.workId}/${data.id}/${fileName}`;
    return { key: `${publishedAuditBucket}/${path}`, mimeType: "image/png", download: async () => {
      const result = await client.storage.from(publishedAuditBucket).download(path);
      return result.error ? null : result.data;
    } };
  });
}
