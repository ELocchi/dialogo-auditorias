import type { PdfJob, PdfWorkerResult } from "./types.ts";

/** One worker per preview lets leaving the screen cancel CPU work and image requests. */
export function generatePdf(job: PdfJob, signal: AbortSignal): Promise<Uint8Array> {
  if (signal.aborted) return Promise.reject(signal.reason);
  const fallback = async () => {
    const { runPdfJob } = await import("./run-job.ts");
    signal.throwIfAborted();
    // Let the browser paint the progress state in browsers without worker support.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return runPdfJob(job, signal);
  };
  if (typeof Worker === "undefined") return fallback();
  let worker: Worker;
  try {
    worker = new Worker(new URL("./report.worker.ts", import.meta.url));
  } catch {
    return fallback();
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => { cleanup(); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<PdfWorkerResult>) => {
      cleanup();
      if ("error" in event.data) reject(new Error(event.data.error));
      else resolve(event.data.bytes);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      cleanup();
      // A browser policy or unavailable worker chunk must not block publication.
      void fallback().then(resolve, reject);
    };
    worker.onmessageerror = () => { cleanup(); reject(new Error("Não foi possível ler o PDF gerado.")); };
    try { worker.postMessage(job); }
    catch (error) { cleanup(); reject(error); }
  });
}
