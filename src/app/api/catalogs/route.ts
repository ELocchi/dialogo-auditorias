import { createClient } from "@/lib/supabase/server";
import { readCatalogSnapshot } from "@/lib/catalogs/service";
import { unavailableCatalogs } from "@/lib/catalogs/contracts";
import { readAuditRequestContext, auditResponseHeaders as headers } from "@/lib/audits/request-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await readAuditRequestContext(request);
  if (!access.context) return Response.json(unavailableCatalogs(), { status: access.status, headers });
  const snapshot = await readCatalogSnapshot(await createClient(), access.context);
  return Response.json(snapshot, { status: snapshot.available || snapshot.setupPending ? 200 : 503, headers });
}
