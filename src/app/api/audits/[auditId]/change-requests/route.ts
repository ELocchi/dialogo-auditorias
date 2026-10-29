import { changeRequestRoute, readChangeItems, readJsonBody, requestChange } from "@/lib/audits/change-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ auditId: string }> };

/** Owner auditor: items available in the change request dialog. */
export function GET(request: Request, { params }: Params) {
  return changeRequestRoute(request, async (client, context) => ({ items: await readChangeItems(client, context, (await params).auditId) }));
}

/** Owner auditor: opens a change request for one item. */
export function POST(request: Request, { params }: Params) {
  return changeRequestRoute(request, async (client, context) => {
    const { auditId } = await params;
    return { request: await requestChange(client, context, auditId, await readJsonBody(request)) };
  });
}
