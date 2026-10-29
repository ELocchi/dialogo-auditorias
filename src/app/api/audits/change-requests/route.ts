import { changeRequestRoute, readChangeRequests } from "@/lib/audits/change-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bell (no ids) or cards (?ids=a,b): change requests visible to the selected profile. */
export function GET(request: Request) {
  return changeRequestRoute(request, async (client, context) => {
    const ids = new URL(request.url).searchParams.get("ids");
    return { requests: await readChangeRequests(client, context, ids ? ids.split(",").filter(Boolean) : undefined) };
  });
}
