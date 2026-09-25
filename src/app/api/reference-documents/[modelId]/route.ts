import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { verifiedUser, effectiveAccount } from "@/lib/auth/session";
import { readActiveProfileContext } from "@/lib/auth/active-profile-session";
import { createClient } from "@/lib/supabase/server";
import { getReferenceDocument } from "@/domain/reference-documents";
import { modelModule } from "@/domain/prototype-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "frame-ancestors 'self'",
  "X-Frame-Options": "SAMEORIGIN",
};

export async function GET(request: Request, { params }: { params: Promise<{ modelId: string }> }) {
  const user = await verifiedUser();
  if (!user) return Response.json({ message: "Entre novamente para consultar o documento." }, { status: 401, headers });
  const account = await effectiveAccount(user);
  if (!account) return Response.json({ message: "Consulta não autorizada." }, { status: 403, headers });
  const selected = await readActiveProfileContext(user.id, account);
  if (!selected || !["ADMINISTRATIVO", "AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"].includes(selected.profile))
    return Response.json({ message: "Consulta não autorizada neste perfil." }, { status: 403, headers });

  const { modelId } = await params;
  const document = getReferenceDocument(modelId);
  if (!document) return Response.json({ message: "Documento não encontrado." }, { status: 404, headers });
  const documentModule = modelModule(document.id);
  if (selected.profile === "ADMINISTRATIVO" && selected.administrativeScope !== "GERAL" && documentModule !== (selected.administrativeScope === "SEGURANCA" ? "safety" : "quality"))
    return Response.json({ message: "Consulta não autorizada nesta disciplina." }, { status: 403, headers });
  if (selected.profile === "AUDITOR_SEGURANCA" && documentModule !== "safety" || selected.profile === "AUDITOR_QUALIDADE" && documentModule !== "quality")
    return Response.json({ message: "Consulta não autorizada nesta disciplina." }, { status: 403, headers });
  if (selected.profile === "ADMINISTRATIVO") {
    let authorized = false;
    try {
      const { data, error } = await (await createClient()).rpc("is_current_access_administrator");
      authorized = !error && data === true;
    } catch { /* Provider failures must not release a document. */ }
    if (!authorized) return Response.json({ message: "Consulta não autorizada." }, { status: 403, headers });
  }
  if (selected.profile === "ENGENHARIA") {
    const client = await createClient();
    const grants = await client.from("access_grants").select("obra_id")
      .eq("auth_user_id", user.id).eq("perfil", "ENGENHARIA")
      .eq("modulo", documentModule === "safety" ? "SEGURANCA" : "QUALIDADE").limit(400);
    if (grants.error || !grants.data?.length || grants.data.length > 400)
      return Response.json({ message: "Consulta não autorizada nesta disciplina." }, { status: 403, headers });
    const workIds = [...new Set(grants.data.map((grant) => grant.obra_id))];
    const works = await client.from("access_works").select("id").in("id", workIds).eq("ativo", true).limit(1);
    if (works.error || !works.data?.length)
      return Response.json({ message: "Consulta não autorizada." }, { status: 403, headers });
  }
  const query = new URL(request.url).searchParams;
  const download = query.get("download");
  if (download !== null && download !== "pdf" && download !== "original") return Response.json({ message: "Formato de download inválido." }, { status: 400, headers });
  const original = download === "original";
  const attachment = download === "pdf" || original;
  const revision = query.get("revision");
  if (revision && revision !== "bundled" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(revision)) return Response.json({ message: "Revisão inválida." }, { status: 400, headers });
  const filename = original ? document.originalFile : document.pdfFile;
  try {
    // For auditors this RPC also validates an active grant before bundled bytes are read.
    const auditorDocument = selected.profile === "AUDITOR_SEGURANCA" || selected.profile === "AUDITOR_QUALIDADE"
      ? await (await createClient()).rpc("read_auditor_catalog_document", {
        p_profile: selected.profile, p_model_id: modelId, p_original: original,
        p_revision_id: revision && revision !== "bundled" ? revision : null,
      }) : null;
    if (auditorDocument?.error) {
      if (auditorDocument.error.code === "42501") return Response.json({ message: "Consulta não autorizada." }, { status: 403, headers });
      if (!["PGRST202", "42883"].includes(auditorDocument.error.code) || revision && revision !== "bundled")
        throw new Error("Document unavailable");
      // The bundled reference works before the new RPC is installed. Both
      // reads use the caller's RLS session and require an active granted work.
      const client = await createClient();
      const grants = await client.from("access_grants").select("obra_id")
        .eq("auth_user_id", user.id).eq("perfil", selected.profile)
        .eq("modulo", documentModule === "safety" ? "SEGURANCA" : "QUALIDADE").limit(400);
      if (grants.error || !grants.data || grants.data.length === 0 || grants.data.length > 400)
        return Response.json({ message: "Consulta não autorizada." }, { status: 403, headers });
      const workIds = [...new Set(grants.data.map((grant) => grant.obra_id))];
      const works = await client.from("access_works").select("id")
        .in("id", workIds).eq("ativo", true).limit(1);
      if (works.error || !works.data?.length)
        return Response.json({ message: "Consulta não autorizada." }, { status: 403, headers });
    }
    if (revision !== "bundled") {
      const { data, error } = auditorDocument ?? await (await createClient()).rpc("read_audit_catalog_document", {
        p_model_id: modelId, p_original: original, p_revision_id: revision,
      });
      if (error && !(["PGRST202", "42883"].includes(error.code) && !revision)) throw new Error("Document unavailable");
      if (!error && data !== null) {
        if (!data || typeof data.name !== "string" || data.name.length > 180 || typeof data.base64 !== "string" || data.base64.length > 8 * 1024 * 1024
          || !["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(data.contentType)
          || (!original && data.contentType !== "application/pdf")) throw new Error("Invalid document response");
        const bytes = Buffer.from(data.base64, "base64");
        const pdf = data.contentType === "application/pdf";
        if (bytes.length > (pdf ? 5 : 2) * 1024 * 1024 || (pdf ? bytes.subarray(0, 5).toString("ascii") !== "%PDF-" : bytes.subarray(0, 4).toString("hex") !== "504b0304")) throw new Error("Invalid document content");
        return new Response(new Uint8Array(bytes), { headers: {
          ...headers, "Content-Type": data.contentType, "Content-Length": String(bytes.length),
          "Content-Disposition": (attachment ? "attachment" : "inline") + '; filename="' + modelId + '.' + (pdf ? "pdf" : "docx") + '"; filename*=UTF-8' + "''" + encodeURIComponent(data.name),
        } });
      }
      if (revision) throw new Error("Revision document unavailable");
    }
    // Only allowlisted, bundled files are served. Request paths never reach fs.
    const bytes = await readFile(join(process.cwd(), "private", "reference-documents", filename));
    const downloadName = original ? document.originalName : filename;
    return new Response(new Uint8Array(bytes), { headers: {
      ...headers,
      "Content-Type": original ? document.originalContentType : "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${attachment ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    } });
  } catch {
    return Response.json({ message: "O documento está indisponível no momento. Tente novamente." }, { status: 503, headers });
  }
}
