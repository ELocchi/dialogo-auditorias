import { requestSignal } from "../request-signal.ts";
export type ReportPdfSnapshot =
  | { status: "idle" | "loading" | "error"; url: null; fileName: null }
  | { status: "ready"; url: string; fileName: string };

type PdfResourceOptions = {
  href: string;
  fallbackFileName: string;
  fetchPdf?: typeof fetch;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
};

/** A single mounted report owns this resource. No PDF or authorization is shared between sessions. */
export function createReportPdfResource({ href, fallbackFileName, fetchPdf = fetch,
  createUrl = (blob) => URL.createObjectURL(blob), revokeUrl = (url) => URL.revokeObjectURL(url),
}: PdfResourceOptions) {
  const empty: ReportPdfSnapshot = { status: "idle", url: null, fileName: null };
  let snapshot: ReportPdfSnapshot = empty;
  let generation = 0;
  let controller: AbortController | null = null;
  let pending: Promise<ReportPdfSnapshot | null> | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: ReportPdfSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const load = (): Promise<ReportPdfSnapshot | null> => {
    if (pending) return pending;
    if (snapshot.status === "ready") return Promise.resolve(snapshot);
    const version = ++generation;
    const request = new AbortController();
    controller = request;
    publish({ status: "loading", url: null, fileName: null });
    pending = Promise.resolve().then(async () => {
      try {
        if (generation !== version || request.signal.aborted) return null;
        const response = await fetchPdf(href, { credentials: "same-origin", cache: "no-store", signal: requestSignal(request.signal, 90_000) });
        if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/pdf") {
          throw new Error("PDF unavailable");
        }
        const blob = await response.blob();
        if (await blob.slice(0, 5).text() !== "%PDF-") throw new Error("Invalid PDF");
        if (generation !== version || request.signal.aborted) return null;
        const providedName = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/i)?.[1];
        const fileName = providedName && !/[\\/\u0000-\u001f\u007f]/.test(providedName) && /\.pdf$/i.test(providedName)
          ? providedName : fallbackFileName;
        const ready: ReportPdfSnapshot = { status: "ready", url: createUrl(blob), fileName };
        publish(ready);
        return ready;
      } catch {
        if (generation === version && !request.signal.aborted) publish({ status: "error", url: null, fileName: null });
        return null;
      } finally {
        if (generation === version) { pending = null; controller = null; }
      }
    });
    return pending;
  };
  return {
    load,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => empty,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() {
      generation++;
      controller?.abort();
      controller = null;
      pending = null;
      if (snapshot.url) revokeUrl(snapshot.url);
      publish(empty);
    },
  };
}
