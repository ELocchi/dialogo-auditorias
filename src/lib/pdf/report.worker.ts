import { runPdfJob } from "./run-job.ts";
import type { PdfJob, PdfWorkerResult } from "./types.ts";

// Keep worker types local: adding the global webworker lib conflicts with React's DOM types.
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<PdfJob>) => void) | null;
  postMessage: (message: PdfWorkerResult, transfer?: Transferable[]) => void;
};

worker.onmessage = (event) => {
  void runPdfJob(event.data).then((bytes) => {
    worker.postMessage({ bytes }, [bytes.buffer as ArrayBuffer]);
  }).catch((error: unknown) => {
    worker.postMessage({ error: error instanceof Error ? error.message : "Não foi possível gerar o PDF." });
  });
};
