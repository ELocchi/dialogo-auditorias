import { notFound } from "next/navigation";
import { auditResponseHeaders, readAuditRequestContext } from "@/lib/audits/request-context";
import { createClient } from "@/lib/supabase/server";
import { followUpPhotoBucket, parsePhotoFileName, photoPath } from "@/lib/follow-up/photos";
import { uuidPattern } from "@/lib/access/validation";
import { privatePhotoResponse } from "@/lib/photos/thumbnails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ visitId: string; fileName: string }> }) {
  const { visitId, fileName } = await params;
  const parsed = parsePhotoFileName(fileName);
  if (!uuidPattern.test(visitId) || !parsed) notFound();
  const access = await readAuditRequestContext(request);
  if (!access.context) return new Response(null, { status: access.status, headers: auditResponseHeaders });
  const context = access.context;
  if (context.profile !== "AUDITOR_SEGURANCA" && context.profile !== "AUDITOR_QUALIDADE") notFound();
  const client = await createClient();
  return privatePhotoResponse(request, async () => {
    // Check one finding and its exact stored object, including warm thumbnail
    // hits. Deleted evidence must never survive as a cache-only authorization.
    const { data, error } = await client.rpc("can_read_follow_up_finding_photo", {
      p_visit_id: visitId.toLowerCase(), p_finding_id: parsed.findingId, p_file_name: fileName,
      p_profile: context.profile, p_engineering_scope: context.engineeringScope,
      p_administrative_scope: context.administrativeScope,
    });
    if (error || typeof data !== "boolean") throw new Error("Photo authorization unavailable");
    if (!data) return null;
    const path = photoPath(context.user.id, visitId, fileName);
    if (!path) return null;
    return { key: `${followUpPhotoBucket}/${path}`, mimeType: parsed.mimeType, download: async () => {
      const { data, error } = await client.storage.from(followUpPhotoBucket).download(path);
      return error ? null : data;
    } };
  });
}
