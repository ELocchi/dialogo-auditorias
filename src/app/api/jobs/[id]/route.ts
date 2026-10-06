import { publicationRequest, headers } from "@/lib/publications/http";
import { jobService } from "@/lib/jobs/service";
import { PublicationError } from "@/lib/publications/validation";
import { isUuid } from "@/lib/catalogs/validation";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export function GET(request: Request, { params }: Params) {
  return publicationRequest(request, async (_service, context) => {
    const { id } = await params;
    if (!isUuid(id)) throw new PublicationError("Processamento inválido.", 400);
    return Response.json(await jobService(context).get(id), { headers });
  });
}
export function POST(request: Request, { params }: Params) {
  return publicationRequest(request, async (_service, context) => {
    const { id } = await params;
    if (!isUuid(id)) throw new PublicationError("Processamento inválido.", 400);
    return Response.json(await jobService(context).retry(id), { headers });
  });
}
