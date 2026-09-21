import { notFound } from "next/navigation";
import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { readAgendaSnapshot } from "@/lib/agenda/service";
import { readFollowUpReports } from "@/lib/follow-up/service";
import { createFollowUpReportPdf } from "@/lib/follow-up/report-pdf";
import { detectPhotoType, followUpPhotoBucket, parsePhotoFileName, photoPath, readVisitPhotos } from "@/lib/follow-up/photos";
import { canReadVisit } from "@/domain/prototype-access";
import { uuidPattern } from "@/lib/access/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  const reportId = new URL(request.url).searchParams.get("relatorio");
  if (!uuidPattern.test(visitId)) notFound();
  if (reportId && !uuidPattern.test(reportId)) notFound();
  const active = await requireActiveProfile();
  const context = await readWorkspaceContext(active);
  if (!context || !["AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"].includes(context.profile)) notFound();
  const client = await createClient();
  const [agenda, reports] = await Promise.all([readAgendaSnapshot(client, context), readFollowUpReports(client, context)]);
  if (!agenda.available || !reports.available) return new Response("Relatório indisponível.", { status: 503 });
  const engineering = context.profile === "ENGENHARIA";
  const visit = agenda.visits.find((entry) => entry.id === visitId && entry.kind === "follow_up"
    && (engineering || entry.auditorId === context.user.id) && canReadVisit(context.user, entry));
  const work = visit && context.works.find((entry) => entry.id === visit.workId);
  const visitReports = reports.reports.filter((entry) => entry.visitId === visitId);
  const report = reportId ? visitReports.find((entry) => entry.id === reportId)
    : visitReports.length === 1 ? visitReports[0] : undefined;
  if (!visit || !work || !report) notFound();
  const allPhotos = await readVisitPhotos(client, visit.auditorId, visitId);
  if (!allPhotos) return new Response("Relatório indisponível.", { status: 503 });
  const findingIds = new Set(report.findings.map((finding) => finding.id));
  const { data: workRows, error: workError } = await client.from("follow_up_work_findings")
    .select("id,photo_file_name").eq("work_id", work.id).eq("auditor_auth_user_id", visit.auditorId)
    .in("id", [...findingIds]).limit(30);
  if (workError && !["42P01", "PGRST205"].includes(workError.code))
    return new Response("Não foi possível carregar as fotos do relatório.", { status: 503 });
  const selectedPhotos = [
    ...allPhotos.filter((photo) => findingIds.has(photo.findingId))
      .map((photo) => ({ findingId: photo.findingId, fileName: photo.fileName, scopeId: visitId })),
    ...(workRows ?? []).filter((row) => parsePhotoFileName(row.photo_file_name)?.findingId === row.id)
      .map((row) => ({ findingId: row.id, fileName: row.photo_file_name, scopeId: work.id })),
  ];
  const photos = await Promise.all(selectedPhotos.map(async (photo) => {
    const path = photoPath(visit.auditorId, photo.scopeId, photo.fileName);
    if (!path) return null;
    const { data, error } = await client.storage.from(followUpPhotoBucket).download(path);
    if (error || !data) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const mimeType = detectPhotoType(bytes);
    return mimeType ? { findingId: photo.findingId, mimeType, bytes } : null;
  }));
  if (photos.some((photo) => !photo)) return new Response("Não foi possível carregar as fotos do relatório.", { status: 503 });
  const bytes = await createFollowUpReportPdf({ report, workName: work.name,
    visitDate: visit.date, auditorName: visit.auditorName ?? "Profissional responsável", photos: photos.filter((photo) => photo !== null) });
  const titleSlug = report.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "relatorio";
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `${new URL(request.url).searchParams.get("visualizar") === "1" ? "inline" : "attachment"}; filename="${titleSlug}-${visit.date}-${report.id}.pdf"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
