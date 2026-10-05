import { notFound } from "next/navigation";
import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { scheduledDocument } from "@/lib/follow-up/document";
import { uuidPattern } from "@/lib/access/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  if (!uuidPattern.test(visitId)) notFound();
  const reportId = new URL(request.url).searchParams.get("relatorio");
  if (reportId !== null && !uuidPattern.test(reportId)) notFound();
  const context = await readWorkspaceContext(await requireActiveProfile());
  if (!context || !["AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"].includes(context.profile)) notFound();
  let document;
  try {
    document = await scheduledDocument(await createClient(), context, visitId, reportId, request.signal);
  } catch {
    return new Response("Não foi possível carregar o relatório completo. Tente novamente.", { status: 503, headers });
  }
  if (!document) notFound();
  return new Response(new Uint8Array(document.bytes), { headers: { ...headers, "Content-Type": "application/pdf",
    "Content-Disposition": `${new URL(request.url).searchParams.get("visualizar") === "1" ? "inline" : "attachment"}; filename="${document.filename}"` } });
}
