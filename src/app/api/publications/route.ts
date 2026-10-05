import { headers, publicationRequest, readJson } from "@/lib/publications/http";
import { PublicationError } from "@/lib/publications/validation";
import { isUuid, isModel } from "@/lib/catalogs/validation";
import { createClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return publicationRequest(request, async service => Response.json(await service.index(), { headers }));
}
export function POST(request: Request) {
  return publicationRequest(request, async service => {
    const body = await readJson(request);
    if (!isUuid(body.visitId) || !isModel(body.modelId)) throw new PublicationError("Agendamento inválido.");
    return Response.json(await service.start(body.visitId, await createClient(), body.modelId), { headers });
  });
}
