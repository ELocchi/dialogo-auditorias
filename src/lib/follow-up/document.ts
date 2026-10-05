import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import { createPublicationClient } from "@/lib/publications/admin";
import { archivedReportPdf } from "@/lib/documents/archive";
import { readStandaloneReport } from "@/lib/follow-up/standalone-service";
import { readFollowUpReportDetail } from "@/lib/follow-up/visit-service";
import { createFollowUpReportPdf } from "@/lib/follow-up/report-pdf";
import { processFollowUpPdfPhotos } from "@/lib/follow-up/pdf-photos";
import { followUpPhotoBucket, photoPath, readVisitPhotos } from "@/lib/follow-up/photos";

/** Authorization always happens before consulting the server-only archive. */
export async function standaloneDocument(client: SupabaseClient, context: ProfileWorkspaceContext, reportId: string, signal?: AbortSignal) {
  const { available, report } = await readStandaloneReport(client, context, reportId);
  if (!available) throw new Error("Report unavailable");
  if (!report) return null;
  const bytes = await archivedReportPdf(createPublicationClient(), "standalone", report.id, () =>
    processFollowUpPdfPhotos(report.photos.map(photo => ({ findingId: photo.findingId,
      async download(photoSignal) {
        const path = photoPath(report.auditorId, report.workId, photo.fileName);
        if (!path) throw new Error("Invalid report photo");
        const { data, error } = await client.storage.from(followUpPhotoBucket).download(path, {}, { signal: photoSignal });
        return error ? null : data;
      },
    })), photosForFinding => createFollowUpReportPdf({ report, workName: report.workName,
      visitDate: report.date, auditorName: report.auditorName, photosForFinding }), signal));
  return { bytes, filename: `relatorio-${report.date}-${report.id}.pdf` };
}

export async function scheduledDocument(client: SupabaseClient, context: ProfileWorkspaceContext, visitId: string, reportId: string | null, signal?: AbortSignal) {
  const detail = await readFollowUpReportDetail(client, context, visitId, reportId);
  if (!detail.available) throw new Error("Report unavailable");
  const { visit, report } = detail;
  const work = visit && context.works.find(entry => entry.id === visit.workId);
  if (!visit || !work || !report) return null;
  const bytes = await archivedReportPdf(createPublicationClient(), "scheduled", report.id, async () => {
    const allPhotos = await readVisitPhotos(client, visit.auditorId, visitId, { missingBucketIsEmpty: false });
    if (!allPhotos) throw new Error("Report photos unavailable");
    const findingIds = new Set(report.findings.map(finding => finding.id));
    const photos = [...allPhotos.filter(photo => findingIds.has(photo.findingId))
      .map(photo => ({ findingId: photo.findingId, fileName: photo.fileName, scopeId: visitId })), ...detail.workPhotos];
    return processFollowUpPdfPhotos(photos.map(photo => ({ findingId: photo.findingId,
      async download(photoSignal) {
        const path = photoPath(visit.auditorId, photo.scopeId, photo.fileName);
        if (!path) throw new Error("Invalid report photo");
        const { data, error } = await client.storage.from(followUpPhotoBucket).download(path, {}, { signal: photoSignal });
        return error ? null : data;
      },
    })), photosForFinding => createFollowUpReportPdf({ report, workName: work.name,
      visitDate: visit.date, auditorName: visit.auditorName ?? "Profissional responsável", photosForFinding }), signal);
  });
  const slug = report.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "relatorio";
  return { bytes, filename: `${slug}-${visit.date}-${report.id}.pdf` };
}
