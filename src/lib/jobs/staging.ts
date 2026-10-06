import "server-only";
import { createHash } from "node:crypto";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import { createPublicationClient } from "@/lib/publications/admin";
import { publicationService } from "@/lib/publications/service";
import { PublicationError } from "@/lib/publications/validation";
import { jobService } from "./service";
export function shouldQueuePhotos(files: Map<string, File>) {
  return files.size > 2 || [...files.values()].reduce((sum, file) => sum + file.size, 0) > 8 * 1024 * 1024;
}
/** Uploading original bytes is I/O; decoding/resizing is deferred to the worker. */
export async function stageAuditSave(context: ProfileWorkspaceContext, id: string, revision: number,
  responses: unknown, files: Map<string, File>, closure: unknown) {
  const client = createPublicationClient();
  const draft = await publicationService(context, client).readAudit(id);
  if (draft.revision < revision) throw new PublicationError("O rascunho mudou. Reabra a auditoria.", 409);
  const staged: { ref: string; offset: number; length: number; type: string }[] = [];
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (const [ref, file] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    if (!file.size || file.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new PublicationError("Use fotos JPG, PNG ou WebP de até 8 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    staged.push({ ref, offset: size, length: bytes.length, type: file.type });
    chunks.push(bytes); size += bytes.length;
    if (size > 32 * 1024 * 1024) throw new PublicationError("O envio excede 32 MB.", 413);
  }
  const bytes = new Uint8Array(size);
  chunks.forEach((chunk, index) => bytes.set(chunk, staged[index].offset));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const path = `${context.user.id}/${id}/${revision}/${hash}`;
  const { error } = await client.storage.from("job-inputs").upload(path, bytes, { upsert: false, contentType: "application/octet-stream" });
  if (error) {
    if (!["400", "409"].includes(String(error.statusCode))) throw new PublicationError("Não foi possível enviar as fotos. Tente novamente.", 503);
    const existing = await client.storage.from("job-inputs").download(path);
    if (!existing.data || existing.error || createHash("sha256").update(new Uint8Array(await existing.data.arrayBuffer())).digest("hex") !== hash)
      throw new PublicationError("Não foi possível confirmar as fotos. Tente novamente.", 503);
  }
  return jobService(context, client).enqueue("save-audit", id, revision, { responses, closure: closure ?? null, files: staged, inputPath: path });
}
