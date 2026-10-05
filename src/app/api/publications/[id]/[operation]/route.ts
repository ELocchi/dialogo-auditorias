import { headers, publicationRequest, readJson, limitedBody, revision } from "@/lib/publications/http";
import { PublicationError } from "@/lib/publications/validation";
import { isUuid } from "@/lib/catalogs/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; operation: string }> };
export function GET(request: Request, { params }: Params) {
  return publicationRequest(request, async service => {
    const { id, operation } = await params;
    if (!isUuid(id)) throw new PublicationError("Documento inválido.");
    if (operation === "plan") return Response.json(await service.readPlan(id), { headers });
    if (operation === "photo") {
      const bytes = await service.photo(id, new URL(request.url).searchParams.get("file") ?? "");
      return new Response(Uint8Array.from(bytes), { headers: { ...headers, "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff" } });
    }
    if (operation === "audit-report") {
      const bytes = await service.auditReport(id);
      return new Response(Uint8Array.from(bytes), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="auditoria-${id}.pdf"` } });
    }
    if (operation === "plan-report") {
      const bytes = await service.planReport(id);
      return new Response(Uint8Array.from(bytes), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="plano-de-acao-${id}.pdf"` } });
    }
    throw new PublicationError("Operação não encontrada.", 404);
  });
}
export function POST(request: Request, { params }: Params) {
  return publicationRequest(request, async service => {
    const { id, operation } = await params;
    if (!isUuid(id)) throw new PublicationError("Documento inválido.");
    if (operation === "save-audit") {
      const bytes = await limitedBody(request, 32 * 1024 * 1024);
      let form: FormData;
      try { form = await new Response(Uint8Array.from(bytes), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData(); }
      catch { throw new PublicationError("Envio inválido."); }
      let input: unknown, refs: unknown, closure: unknown;
      try { closure = JSON.parse(String(form.get("safetyClosure") ?? "null")); input = JSON.parse(String(form.get("responses"))); refs = JSON.parse(String(form.get("photoRefs"))); }
      catch { throw new PublicationError("Rascunho inválido."); }
      if (!Array.isArray(refs) || refs.length > 100 || refs.some(r => typeof r !== "string") || new Set(refs).size !== refs.length) throw new PublicationError("Fotos inválidas.");
      const files = new Map<string, File>();
      refs.forEach((ref, i) => { const file = form.get(`photo${i}`); if (!(file instanceof File)) throw new PublicationError("Foto ausente."); files.set(ref, file); });
      return Response.json(await service.saveAudit(id, revision(Number(form.get("revision"))), input, files, closure), { headers });
    }
    const body = await readJson(request);
    const current = revision(body.revision);
    if (operation === "publish-audit") return Response.json(await service.publishAudit(id, current), { headers });
    if (operation === "save-plan") return Response.json(await service.savePlan(id, current, body.rows), { headers });
    if (operation === "publish-plan") return Response.json(await service.publishPlan(id, current), { headers });
    throw new PublicationError("Operação não encontrada.", 404);
  });
}
