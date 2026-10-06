import type { SupabaseClient } from "@supabase/supabase-js";

export const reportArchiveBucket = "orientative-report-pdfs";
export type ReportArchiveKind = "scheduled" | "standalone";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumBytes = 40 * 1024 * 1024;

export function checkPdf(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > maximumBytes || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    throw new Error("Invalid archived PDF");
  return bytes;
}

export async function readArchivedReportPdf(client: Pick<SupabaseClient, "storage">, kind: ReportArchiveKind, reportId: string) {
  if (!["scheduled", "standalone"].includes(kind) || !uuid.test(reportId)) throw new Error("Invalid report identity");
  const { data, error } = await client.storage.from(reportArchiveBucket).download(`${kind}/${reportId.toLowerCase()}.pdf`);
  if (!error && data) return checkPdf(new Uint8Array(await data.arrayBuffer()));
  if (String(error?.statusCode) === "404" && !error?.message?.toLowerCase().includes("bucket")) return null;
  throw new Error("Report archive unavailable");
}

/** Server callers MUST authorize the report using the user's session before
 * accessing this private archive. Never accept a storage path from the browser.
 * A fixed key and upsert:false make simultaneous requests converge on one PDF.
 * Storage outages must never be treated as a missing document. */
export async function archivedReportPdf(client: Pick<SupabaseClient, "storage">,
  kind: ReportArchiveKind, reportId: string, generate: () => Promise<Uint8Array>): Promise<Uint8Array> {
  if (!["scheduled", "standalone"].includes(kind) || !uuid.test(reportId)) throw new Error("Invalid report identity");
  const path = `${kind}/${reportId.toLowerCase()}.pdf`;
  const bucket = client.storage.from(reportArchiveBucket);
  const existing = await bucket.download(path);
  if (!existing.error && existing.data) return checkPdf(new Uint8Array(await existing.data.arrayBuffer()));
  const error = existing.error as { statusCode?: string | number; message?: string } | null;
  if (String(error?.statusCode) !== "404" || error?.message?.toLowerCase().includes("bucket"))
    throw new Error("Report archive unavailable");
  const bytes = checkPdf(await generate());
  const saved = await bucket.upload(path, bytes, { contentType: "application/pdf", upsert: false, cacheControl: "0" });
  if (saved.error && !["409", "400"].includes(String(saved.error.statusCode)))
    throw new Error("Could not preserve the report PDF");
  // Read the winner, including when another request created the object first.
  // A failed upload is not success unless the immutable object really exists.
  const stored = await bucket.download(path);
  if (stored.error || !stored.data) throw new Error("Could not verify the report PDF");
  return checkPdf(new Uint8Array(await stored.data.arrayBuffer()));
}
