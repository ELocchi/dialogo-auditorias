import "server-only";
import { readAuditRequestContext, auditResponseHeaders } from "@/lib/audits/request-context";
import { publicationService } from "./service";
import { PublicationError } from "./validation";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
export const headers = auditResponseHeaders;
export async function publicationRequest(request: Request, handle: (service: ReturnType<typeof publicationService>, context: ProfileWorkspaceContext) => Promise<Response>) {
  try {
    if (request.method !== "GET") {
      const origin = request.headers.get("origin");
      const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(request.url).origin;
      if (!origin || (origin !== expected && !(process.env.NODE_ENV === "development" && origin === new URL(request.url).origin))) {
        throw new PublicationError("Origem da solicitação inválida.", 403);
      }
    }
    const access = await readAuditRequestContext(request);
    if (!access.context) throw new PublicationError("Entre novamente para continuar.", access.status);
    return await handle(publicationService(access.context), access.context);
  } catch (error) {
    return Response.json({ message: error instanceof PublicationError ? error.message : "A publicação está indisponível. Confira a configuração do servidor e do banco." },
      { status: error instanceof PublicationError ? error.status : 503, headers });
  }
}
export async function limitedBody(request: Request, max: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > max) throw new PublicationError("O envio excede o tamanho permitido.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new PublicationError("Dados ausentes.");
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new PublicationError("O envio excede o tamanho permitido.", 413); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(await limitedBody(request, 2 * 1024 * 1024)));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch (e) { if (e instanceof PublicationError) throw e; throw new PublicationError("Dados inválidos."); }
}
export function revision(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new PublicationError("Versão de rascunho inválida.");
  return value;
}
