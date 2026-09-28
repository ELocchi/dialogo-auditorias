import sharp from "sharp";
import { detectPhotoType } from "./photos.ts";

export type ReportPhoto = { findingId: string; mimeType: "image/jpeg" | "image/png"; bytes: Uint8Array };
export type PdfPhotoSource = { findingId: string; download: (signal: AbortSignal) => Promise<Blob | null> };
export type PdfPhotosForFinding = (findingId: string) => AsyncIterable<ReportPhoto>;

const maximumSourceBytes = 16 * 1024 * 1024;
const maximumPdfPhotoBytes = 32 * 1024 * 1024;

/** Derivatives only: Storage originals are never written or replaced. */
export async function resizeFollowUpPdfPhoto(source: Blob): Promise<Uint8Array> {
  if (!source.size || source.size > maximumSourceBytes) throw new Error("Invalid PDF photo size");
  const bytes = await source.arrayBuffer();
  if (!detectPhotoType(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 8))))
    throw new Error("Unsupported PDF photo format");
  return new Uint8Array(await sharp(bytes, { limitInputPixels: 40_000_000, animated: false, failOn: "warning" })
    .rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).timeout({ seconds: 8 }).toBuffer());
}

/**
 * Hold a process-wide slot for the whole PDF, including embedding/save. Each
 * document consumes one source at a time, so neither originals nor derivatives
 * accumulate in an unbounded Promise.all. No image or authorization is cached.
 */
export function createFollowUpPdfPhotoPipeline(options: {
  concurrentReports?: number; maximumPending?: number; timeoutMs?: number;
  maximumPhotoBytes?: number; resize?: (source: Blob) => Promise<Uint8Array>;
} = {}) {
  const concurrentReports = options.concurrentReports ?? 2;
  const maximumPending = options.maximumPending ?? 6;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maximumPhotoBytes = options.maximumPhotoBytes ?? maximumPdfPhotoBytes;
  const resize = options.resize ?? resizeFollowUpPdfPhoto;
  if (!Number.isInteger(concurrentReports) || concurrentReports < 1 || !Number.isInteger(maximumPending)
    || maximumPending < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0
    || !Number.isFinite(maximumPhotoBytes) || maximumPhotoBytes <= 0) throw new Error("Invalid PDF processing limits");
  let active = 0;
  const queue: Array<() => void> = [];

  return function run<T>(sources: readonly PdfPhotoSource[], render: (photos: PdfPhotosForFinding) => Promise<T>,
    signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new Error("PDF request cancelled"));
    if (active >= concurrentReports && queue.length >= maximumPending)
      return Promise.reject(new Error("PDF processing is busy"));
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    const check = () => { if (controller.signal.aborted) throw new Error("PDF request cancelled or timed out"); };

    return new Promise<T>((resolve, reject) => {
      let started = false;
      const cancelled = () => {
        if (!started) {
          const index = queue.indexOf(start);
          if (index >= 0) queue.splice(index, 1);
          cleanup();
        }
        // A running job keeps its slot until its real download/resize settles.
        reject(new Error("PDF request cancelled or timed out"));
      };
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        controller.signal.removeEventListener("abort", cancelled);
      };
      const start = () => {
        started = true;
        active++;
        const job = async () => {
          check();
          let photoBytes = 0;
          let loading = false;
          const photos: PdfPhotosForFinding = async function* (findingId) {
            for (const source of sources) {
              if (source.findingId !== findingId) continue;
              check();
              if (loading) throw new Error("PDF photos must be consumed sequentially");
              loading = true;
              try {
                const original = await source.download(controller.signal);
                check();
                if (!original) throw new Error("PDF photo unavailable");
                const bytes = await resize(original);
                check();
                photoBytes += bytes.byteLength;
                if (!bytes.byteLength || photoBytes > maximumPhotoBytes) throw new Error("PDF photos exceed memory budget");
                yield { findingId, mimeType: "image/jpeg", bytes };
              } finally { loading = false; }
            }
          };
          const result = await render(photos);
          check();
          return result;
        };
        void job().then(resolve, reject).finally(() => {
          cleanup();
          active--;
          queue.shift()?.();
        });
      };
      controller.signal.addEventListener("abort", cancelled, { once: true });
      if (active < concurrentReports) start(); else queue.push(start);
    });
  };
}

export const processFollowUpPdfPhotos = createFollowUpPdfPhotoPipeline();
