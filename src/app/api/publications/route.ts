import { headers, publicationRequest, readJson } from "@/lib/publications/http";
import { PublicationError } from "@/lib/publications/validation";
import { isUuid, isModel } from "@/lib/catalogs/validation";
import { createClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return publicationRequest(request, async service => {
    const params = new URL(request.url).searchParams, month = params.get("mes") ?? undefined;
    const ids = params.has("ids") ? params.get("ids")!.split(",").filter(Boolean) : undefined;
    if (month && !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month) || ids && (ids.length > 50 || ids.some(id => !isUuid(id)))) throw new PublicationError("Filtros inválidos.");
    return Response.json(await service.index(month, ids), { headers });
  });
}
export function POST(request: Request) {
  return publicationRequest(request, async service => {
    const body = await readJson(request);
    if (!isUuid(body.visitId) || !isModel(body.modelId)) throw new PublicationError("Agendamento inválido.");
    return Response.json(await service.start(body.visitId, await createClient(), body.modelId), { headers });
  });
}
