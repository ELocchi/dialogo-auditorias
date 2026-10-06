import sharp from "sharp";
import { createPublicationClient } from "@/lib/publications/admin";
import { publicationService } from "@/lib/publications/service";
import { archivedReportPdf } from "@/lib/documents/archive";
import { processFollowUpPdfPhotos } from "@/lib/follow-up/pdf-photos";
import { createFollowUpReportPdf } from "@/lib/follow-up/report-pdf";
import { parseReport } from "@/lib/follow-up/service";
import { parseStandaloneReport } from "@/lib/follow-up/standalone-contracts";
import { photoPath } from "@/lib/follow-up/photos";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import type { JobKind } from "@/lib/jobs/contracts";

export type ClaimedJob = { id: string; lease_token: string; actor: string; profile: string; scope: string; admin: string;
  target: string; revision: number; kind: JobKind; result?: { revision?: number }; attempts: number; payload: Record<string, unknown> };
export async function executeJob(job: ClaimedJob, client = createPublicationClient()) {
  sharp.cache(false); sharp.concurrency(1); // This module runs only in the isolated job process.
  const command = async (operation: string, payload = {}) => {
    const { data, error } = await client.rpc("background_job_worker", { p_operation: operation, p_id: job.id, p_token: job.lease_token, p_payload: payload });
    if (error) throw Object.assign(new Error("Job operation failed"), { code: error.code });
    return data;
  };
  const progress = async (stage: string) => { await command("progress", { stage });
    console.info(JSON.stringify({ event: "job_progress", jobId: job.id, kind: job.kind, stage, attempt: job.attempts })); };
  const source = await command("source"); // Fresh permissions, never a persisted session token.
  if (job.kind === "save-audit" && job.result?.revision != null) {
    await command("complete", job.result); return job.result;
  }
  let result: { url?: string; revision?: number };
  if (job.kind === "publish-audit" || job.kind === "publish-plan" || job.kind === "save-audit") {
    const context = { user: { id: job.actor }, profile: job.profile, engineeringScope: job.scope || null, administrativeScope: job.admin || null } as ProfileWorkspaceContext;
    // Fence every database publication with the current lease in the SAME transaction.
    const fenced = { storage: client.storage, rpc: async (_name: string, args: Record<string, unknown>) =>
      client.rpc("background_job_worker", { p_operation: "publication", p_id: job.id, p_token: job.lease_token,
        p_payload: { operation: args.p_operation, payload: args.p_payload } }) };
    const service = publicationService(context, fenced as unknown as typeof client, progress);
    if (job.kind === "publish-audit") {
      await service.publishAudit(job.target, job.revision);
      result = { url: `/api/publications/${job.target}/audit-report` };
    } else if (job.kind === "publish-plan") {
      await service.publishPlan(job.target, job.revision);
      result = { url: `/api/publications/${job.target}/plan-report` };
    } else {
      const files = new Map<string, File>();
      await progress("evidence");
      const inputPath = job.payload.inputPath;
      if (typeof inputPath !== "string" || !inputPath.startsWith(`${job.actor}/${job.target}/`)) throw new Error("Invalid staged input");
      const downloaded = await client.storage.from("job-inputs").download(inputPath);
      if (downloaded.error || !downloaded.data) throw new Error("Staged input unavailable");
      for (const file of job.payload.files as { ref: string; offset: number; length: number; type: string }[]) {
        if (!Number.isSafeInteger(file.offset) || file.offset < 0 || !Number.isSafeInteger(file.length) || file.length < 1 || file.offset + file.length > downloaded.data.size) throw new Error("Invalid staged range");
        files.set(file.ref, new File([downloaded.data.slice(file.offset, file.offset + file.length)], "photo", { type: file.type }));
      }
      result = await service.saveAudit(job.target, job.revision, job.payload.responses, files, job.payload.closure);
    }
  } else {
    const standalone = job.kind === "standalone-pdf";
    const report = standalone ? parseStandaloneReport(source) : parseReport(source.report);
    if (!report) throw Object.assign(new Error("Invalid report"), { code: "22023" });
    const author = standalone ? source.auditorId : source.visit.auditorId;
    const photos: { findingId: string; fileName: string; scopeId: string }[] = standalone
      ? source.photos.map((p: { findingId: string; fileName: string }) => ({ ...p, scopeId: source.workId })) : source.photos;
    await progress("evidence");
    await archivedReportPdf(client, standalone ? "standalone" : "scheduled", job.target, async () => {
      const bytes = await processFollowUpPdfPhotos(photos.map(photo => ({ findingId: photo.findingId,
        async download(signal) {
          const path = photoPath(author, photo.scopeId, photo.fileName);
          if (!path) throw new Error("Invalid photo");
          const { data, error } = await client.storage.from("follow-up-photos").download(path, {}, { signal });
          if (error) throw new Error("Photo unavailable");
          return data;
        } })), async photosForFinding => {
        await progress("pdf");
        return createFollowUpReportPdf({ report, workName: source.workName,
          visitDate: standalone ? source.date : source.visit.date,
          auditorName: standalone ? source.auditorName : source.visit.auditorName, photosForFinding });
      });
      await command("source"); // Revalidate before archiving; immutable upload on a fixed key.
      await progress("storage");
      return bytes;
    });
    result = { url: standalone ? `/app/acompanhamento/relatorio/avulso/${job.target}/pdf`
      : `/app/acompanhamento/relatorio/${source.visit.id}/pdf?relatorio=${job.target}` };
  }
  await command("complete", result);
  return result;
}

if (process.send) process.once("message", async (job: ClaimedJob) => {
  try { await executeJob(job); process.send?.({ ok: true, peakRssKb: process.resourceUsage().maxRSS }); }
  catch (error) {
    const value = error as { code?: string; status?: number };
    process.send?.({ ok: false, code: value.code ?? (value.status ? `http_${value.status}` : "processing_failed"),
      retryable: !["42501", "22023", "23514", "54000", "40001"].includes(value.code ?? "") && ![400, 403, 404, 409, 413].includes(value.status ?? 0) });
  } finally { process.disconnect?.(); }
});
