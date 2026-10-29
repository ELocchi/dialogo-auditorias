import { changeRequestRoute, decideChange, readChangeEditor, readJsonBody, republishChange } from "@/lib/audits/change-requests";
import { PublicationError } from "@/lib/publications/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ requestId: string }> };

/** Administrativo: the requested item with its current observations. */
export function GET(request: Request, { params }: Params) {
  return changeRequestRoute(request, async (client, context) => readChangeEditor(client, context, (await params).requestId));
}

/** Administrativo: accept/refuse, or republish after editing the item observations. */
export function POST(request: Request, { params }: Params) {
  return changeRequestRoute(request, async (client, context) => {
    const { requestId } = await params;
    const body = await readJsonBody(request);
    if (body.action === "decide") return { request: await decideChange(client, context, requestId, body) };
    if (body.action === "republish") return { request: await republishChange(client, context, requestId, body) };
    throw new PublicationError("Operação não encontrada.", 404);
  });
}
