import { notFound } from "next/navigation";
import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { readFollowUpReportDetail } from "@/lib/follow-up/visit-service";
import { createFollowUpReportPdf } from "@/lib/follow-up/report-pdf";
import { processFollowUpPdfPhotos } from "@/lib/follow-up/pdf-photos";
import { followUpPhotoBucket, photoPath, readVisitPhotos } from "@/lib/follow-up/photos";
import { uuidPattern } from "@/lib/access/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const unavailable = () => new Response("Não foi possível gerar o relatório completo. Tente novamente.", { status: 503, headers: privateHeaders });

export async function GET(request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  const reportId = new URL(request.url).searchParams.get("relatorio");
  if (!uuidPattern.test(visitId)) notFound();
  if (reportId !== null && !uuidPattern.test(reportId)) notFound();
  const active = await requireActiveProfile();
  const context = await readWorkspaceContext(active);
  if (!context || !["AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"].includes(context.profile)) notFound();
  const client = await createClient();
  const detail = await readFollowUpReportDetail(client, context, visitId, reportId);
  if (!detail.available) return unavailable();
  const { visit, report } = detail;
  const work = visit && context.works.find((entry) => entry.id === visit.workId);
  if (!visit || !work || !report) notFound();
  const allPhotos = await readVisitPhotos(client, visit.auditorId, visitId, { missingBucketIsEmpty: false });
  if (!allPhotos) return unavailable();
  const findingIds = new Set(report.findings.map((finding) => finding.id));
  const selectedPhotos = [
    ...allPhotos.filter((photo) => findingIds.has(photo.findingId))
      .map((photo) => ({ findingId: photo.findingId, fileName: photo.fileName, scopeId: visitId })),
    ...detail.workPhotos,
  ];
  let bytes: Uint8Array;
  try {
    bytes = await processFollowUpPdfPhotos(selectedPhotos.map((photo) => ({
      findingId: photo.findingId,
      async download(signal) {
        const path = photoPath(visit.auditorId, photo.scopeId, photo.fileName);
        if (!path) throw new Error("Invalid report photo");
        const { data, error } = await client.storage.from(followUpPhotoBucket).download(path, {}, { signal });
        return error ? null : data;
      },
    })), (photosForFinding) => createFollowUpReportPdf({ report, workName: work.name,
      visitDate: visit.date, auditorName: visit.auditorName ?? "Profissional responsável", photosForFinding }), request.signal);
  } catch { return unavailable(); }
  const titleSlug = report.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "relatorio";
  return new Response(new Uint8Array(bytes), { headers: {
    ...privateHeaders,
    "Content-Type": "application/pdf",
    "Content-Disposition": `${new URL(request.url).searchParams.get("visualizar") === "1" ? "inline" : "attachment"}; filename="${titleSlug}-${visit.date}-${report.id}.pdf"`,
  } });
}
