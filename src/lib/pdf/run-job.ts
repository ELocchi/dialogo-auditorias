import { requestSignal } from "../request-signal.ts";
import { createAuditReviewPdf } from "./audit-report.ts";
import { generateActionPlanPdf } from "./action-plan.ts";
import type { PdfAssets, PdfJob } from "./types.ts";

/** Runs in a dedicated worker. Only the legacy-browser fallback runs this on the page. */
export async function runPdfJob(job: PdfJob, signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted();
  const assets: PdfAssets = { logo: null, photos: Object.create(null) };
  const logoTask = fetch(new URL("/logo-relatorio-orientativo.png", job.baseUrl), { signal: requestSignal(signal) })
    .then(async (response) => { if (response.ok) assets.logo = new Uint8Array(await response.arrayBuffer()); })
    .catch(() => { /* Preserve the report even if the optional logo is unavailable. */ });
  // Limit downloads to keep large reports from saturating the connection or memory.
  const sources = [...new Map(job.photos.map((photo) => [photo.reference, photo])).values()];
  for (let offset = 0; offset < sources.length; offset += 4) {
    signal?.throwIfAborted();
    await Promise.all(sources.slice(offset, offset + 4).map(async (photo) => {
      try {
        let blob = photo.file;
        if (!blob && photo.url) {
          const response = await fetch(new URL(photo.url, job.baseUrl), { signal: requestSignal(signal) });
          if (response.ok) blob = await response.blob();
        }
        if (!blob) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
        assets.photos[photo.reference] = { bytes, mimeType: png ? "image/png" : blob.type || "image/jpeg", url: photo.url };
      } catch { /* File names remain in the report if an evidence image cannot be loaded. */ }
    }));
  }
  await logoTask;
  signal?.throwIfAborted();
  return job.kind === "audit" ? createAuditReviewPdf(job.input, assets) : generateActionPlanPdf(job.input, assets);
}
