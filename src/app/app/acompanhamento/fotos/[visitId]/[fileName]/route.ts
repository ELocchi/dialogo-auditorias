import { notFound } from "next/navigation";
import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { readAgendaSnapshot } from "@/lib/agenda/service";
import { readFindingDrafts } from "@/lib/follow-up/findings";
import { readFollowUpReports } from "@/lib/follow-up/service";
import { followUpPhotoBucket, parsePhotoFileName, photoPath, readVisitPhotos } from "@/lib/follow-up/photos";
import { canReadVisit } from "@/domain/prototype-access";
import { uuidPattern } from "@/lib/access/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ visitId: string; fileName: string }> }) {
  const { visitId, fileName } = await params;
  const parsed = parsePhotoFileName(fileName);
  if (!uuidPattern.test(visitId) || !parsed) notFound();
  const active = await requireActiveProfile();
  const context = await readWorkspaceContext(active);
  if (!context || (context.profile !== "AUDITOR_SEGURANCA" && context.profile !== "AUDITOR_QUALIDADE")) notFound();
  const client = await createClient();
  const [agenda, drafts, reports] = await Promise.all([
    readAgendaSnapshot(client, context), readFindingDrafts(client, context), readFollowUpReports(client, context),
  ]);
  const visit = agenda.visits.find((item) => item.id === visitId && item.kind === "follow_up"
    && item.auditorId === context.user.id && canReadVisit(context.user, item));
  const findingExists = [...(drafts.drafts.find((item) => item.visitId === visitId)?.findings ?? []),
    ...reports.reports.filter((item) => item.visitId === visitId).flatMap((item) => item.findings)]
    .some((finding) => finding.id === parsed.findingId);
  if (!agenda.available || !drafts.available || !reports.available || !visit || !findingExists) notFound();
  const photos = await readVisitPhotos(client, context.user.id, visitId);
  if (!photos?.some((photo) => photo.fileName === fileName)) notFound();
  const path = photoPath(context.user.id, visitId, fileName);
  if (!path) notFound();
  const { data, error } = await client.storage.from(followUpPhotoBucket).download(path);
  if (error || !data) notFound();
  return new Response(await data.arrayBuffer(), { headers: {
    "Content-Type": parsed.mimeType,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
