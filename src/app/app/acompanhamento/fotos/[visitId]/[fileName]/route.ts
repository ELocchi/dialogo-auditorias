import { notFound } from "next/navigation";
import { auditResponseHeaders, readAuditRequestContext } from "@/lib/audits/request-context";
import { createClient } from "@/lib/supabase/server";
import { readAgendaSnapshot } from "@/lib/agenda/service";
import { readFindingDrafts } from "@/lib/follow-up/findings";
import { readFollowUpReports } from "@/lib/follow-up/service";
import { followUpPhotoBucket, parsePhotoFileName, photoPath, readVisitPhotos } from "@/lib/follow-up/photos";
import { canReadVisit } from "@/domain/prototype-access";
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
    const [agenda, drafts, reports] = await Promise.all([
      readAgendaSnapshot(client, context), readFindingDrafts(client, context), readFollowUpReports(client, context),
    ]);
    const visit = agenda.visits.find((item) => item.id === visitId && item.kind === "follow_up"
      && item.auditorId === context.user.id && canReadVisit(context.user, item));
    const findingExists = [...(drafts.drafts.find((item) => item.visitId === visitId)?.findings ?? []),
      ...reports.reports.filter((item) => item.visitId === visitId).flatMap((item) => item.findings)]
      .some((finding) => finding.id === parsed.findingId);
    if (!agenda.available || !drafts.available || !reports.available || !visit || !findingExists) return null;
    const photos = await readVisitPhotos(client, context.user.id, visitId);
    if (!photos?.some((photo) => photo.fileName === fileName)) return null;
    const path = photoPath(context.user.id, visitId, fileName);
    if (!path) return null;
    return { key: `${followUpPhotoBucket}/${path}`, mimeType: parsed.mimeType, download: async () => {
      const { data, error } = await client.storage.from(followUpPhotoBucket).download(path);
      return error ? null : data;
    } };
  });
}
