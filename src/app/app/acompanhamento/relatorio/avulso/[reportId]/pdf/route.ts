import { notFound } from "next/navigation";
import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { readStandaloneReport } from "@/lib/follow-up/standalone-service";
import { createFollowUpReportPdf } from "@/lib/follow-up/report-pdf";
import { processFollowUpPdfPhotos } from "@/lib/follow-up/pdf-photos";
import { followUpPhotoBucket, photoPath } from "@/lib/follow-up/photos";
import { uuidPattern } from "@/lib/access/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const unavailable = () => new Response("Não foi possível gerar o relatório completo. Tente novamente.", { status: 503, headers });

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  if (!uuidPattern.test(reportId)) notFound();
  const context = await readWorkspaceContext(await requireActiveProfile());
  if (!context || !["AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"].includes(context.profile)) notFound();
  const client = await createClient();
  const { available, report } = await readStandaloneReport(client, context, reportId);
  if (!available) return unavailable();
  if (!report) notFound();
  try {
    const bytes = await processFollowUpPdfPhotos(report.photos.map(photo => ({ findingId: photo.findingId,
      async download(signal) {
        const path = photoPath(report.auditorId, report.workId, photo.fileName);
        if (!path) throw new Error("Invalid report photo");
        const { data, error } = await client.storage.from(followUpPhotoBucket).download(path, {}, { signal });
        return error ? null : data;
      },
    })), photosForFinding => createFollowUpReportPdf({ report, workName: report.workName,
      visitDate: report.date, auditorName: report.auditorName, photosForFinding }), request.signal);
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "application/pdf",
      "Content-Disposition": `${new URL(request.url).searchParams.get("visualizar") === "1" ? "inline" : "attachment"}; filename="relatorio-${report.date}-${report.id}.pdf"` } });
  } catch { return unavailable(); }
}
