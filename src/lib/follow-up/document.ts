import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import { createPublicationClient } from "@/lib/publications/admin";
import { readArchivedReportPdf } from "@/lib/documents/archive";
import { readStandaloneReport } from "@/lib/follow-up/standalone-service";
import { readFollowUpReportDetail } from "@/lib/follow-up/visit-service";
import { jobService } from "@/lib/jobs/service";
import type { JobReceipt } from "@/lib/jobs/contracts";
export class DocumentPending extends Error {
  receipt: JobReceipt;
  constructor(receipt: JobReceipt) { super("PDF em processamento"); this.receipt = receipt; }
}
async function archived(context: ProfileWorkspaceContext, kind: "scheduled" | "standalone", reportId: string) {
  const bytes = await readArchivedReportPdf(createPublicationClient(), kind, reportId);
  if (bytes) return bytes;
  throw new DocumentPending(await jobService(context).enqueue(kind === "scheduled" ? "scheduled-pdf" : "standalone-pdf", reportId));
}

/** Authorization always happens before consulting the server-only archive. */
export async function standaloneDocument(client: SupabaseClient, context: ProfileWorkspaceContext, reportId: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const { available, report } = await readStandaloneReport(client, context, reportId);
  if (!available) throw new Error("Report unavailable");
  if (!report) return null;
  const bytes = await archived(context, "standalone", report.id);
  return { bytes, filename: `relatorio-${report.date}-${report.id}.pdf` };
}

export async function scheduledDocument(client: SupabaseClient, context: ProfileWorkspaceContext, visitId: string, reportId: string | null, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const detail = await readFollowUpReportDetail(client, context, visitId, reportId);
  if (!detail.available) throw new Error("Report unavailable");
  const { visit, report } = detail;
  const work = visit && context.works.find(entry => entry.id === visit.workId);
  if (!visit || !work || !report) return null;
  const bytes = await archived(context, "scheduled", report.id);
  const slug = report.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "relatorio";
  return { bytes, filename: `${slug}-${visit.date}-${report.id}.pdf` };
}
