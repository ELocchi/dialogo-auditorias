import { createClient } from "@/lib/supabase/server";
import { readAuditDashboard } from "@/lib/audits/dashboard-service";
import { unavailableAuditDashboard } from "@/lib/audits/dashboard-contracts";
import { parseAuditDashboardOverlay } from "@/lib/audits/dashboard-overlay";
import { auditResponseHeaders as headers, readAuditRequestContext } from "@/lib/audits/request-context";

export const dynamic = "force-dynamic";
const maximumBodyBytes = 8 * 1024 * 1024;

export async function GET(request: Request) {
  const access = await readAuditRequestContext(request);
  if (!access.context) return Response.json(unavailableAuditDashboard(), { status: access.status, headers });
  const snapshot = await readAuditDashboard(await createClient(), access.context);
  return Response.json(snapshot, { status: snapshot.available ? 200 : 503, headers });
}

export async function POST(request: Request) {
  const access = await readAuditRequestContext(request);
  if (!access.context) return Response.json(unavailableAuditDashboard(), { status: access.status, headers });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return Response.json(unavailableAuditDashboard(), { status: 415, headers });
  const reader = request.body?.getReader();
  let overlay: unknown;
  try {
    if (!reader) throw new Error("Empty body");
    let size = 0;
    let body = "";
    const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximumBodyBytes) {
        await reader.cancel();
        return Response.json(unavailableAuditDashboard(), { status: 413, headers });
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    overlay = JSON.parse(body);
  } catch { return Response.json(unavailableAuditDashboard(), { status: 400, headers }); }
  if (!parseAuditDashboardOverlay(overlay, access.context))
    return Response.json(unavailableAuditDashboard(), { status: 400, headers });
  const snapshot = await readAuditDashboard(await createClient(), access.context, overlay);
  return Response.json(snapshot, { status: snapshot.available ? 200 : 503, headers });
}
