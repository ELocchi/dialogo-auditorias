import { getSaoPauloToday } from "@/domain/visit-calendar";
import { safetyScore, validateSafetyClosure } from "@/domain/safety-audit";
import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import { readCatalogSnapshot } from "@/lib/catalogs/service";
import { bundledFvsWeights, catalogVersion } from "@/lib/catalogs/contracts";
import { modelDisplayName } from "@/domain/prototype-audits";
import type { AuditModelId } from "@/domain/operational-records";
import type { ItemResponse } from "@/domain/audit-draft";
import type { Criterion } from "@/domain/catalogs";
import { auditPhotoReferences } from "@/lib/audits/photo-store";
import { createAuditReviewPdf } from "@/lib/pdf/audit-report";
import { generateActionPlanPdf } from "@/lib/pdf/action-plan";
import type { ActionPlanRow, PdfAssets } from "@/lib/pdf/types";
import { createPublicationClient } from "./admin";
import { draftPhotoUrl, type AuditDraftRecord, type PersistedAudit, type PlanRecord } from "./contracts";
import { extractPublicationFindings, mapPhotos, normalizePlanRows, normalizeResponses, publicationScore, PublicationError } from "./validation";

type Client = Pick<SupabaseClient, "rpc" | "storage">;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const filePattern = /^[a-f0-9]{64}\.jpg$/;
export function publicationService(context: ProfileWorkspaceContext, client: Client = createPublicationClient(), progress: (stage: string) => Promise<void> = async () => {}) {
  async function command<T>(operation: string, id: string | null = null, revision: number | null = null, payload: unknown = {}): Promise<T> {
    const { data, error } = await client.rpc("publication_command", { p_actor: context.user.id, p_profile: context.profile,
      p_scope: context.engineeringScope, p_admin: context.administrativeScope, p_operation: operation,
      p_id: id, p_revision: revision, p_payload: payload });
    if (error) {
      if (["40001", "23505"].includes(error.code)) throw new PublicationError("O rascunho mudou em outra sessão. Reabra a auditoria ou o plano antes de continuar.", 409);
      if (error.code === "42501") throw new PublicationError("Seu perfil não tem mais permissão para esta operação. Confira a visita e os acessos.", 403);
      if (error.code === "55000") throw new PublicationError("Este documento já foi publicado e não pode ser alterado.", 409);
      console.error("[publications] command_failed", { operation, code: error.code });
      if (operation === "list") throw new PublicationError("Não foi possível carregar as auditorias e os planos. Tente novamente.", 503);
      if (operation.startsWith("read-")) throw new PublicationError("Não foi possível carregar o documento. Tente novamente.", 503);
      throw new PublicationError("Não foi possível confirmar a gravação. Confira a configuração do banco e tente novamente.", 503);
    }
    return data as T;
  }
  async function upload(bucket: string, file: string, bytes: Uint8Array, contentType: string) {
    const result = await client.storage.from(bucket).upload(file, bytes, { upsert: false, contentType });
    if (result.error && !["409", "400"].includes(String(result.error.statusCode))) throw new PublicationError("Não foi possível gravar os arquivos. Tente novamente.", 503);
    if (result.error) {
      // Same hash may already exist after a retry. Verify bytes instead of trusting a conflict.
      const existing = await download(bucket, file);
      if (hash(existing) !== hash(bytes)) throw new PublicationError("Não foi possível confirmar o arquivo gravado.", 503);
    }
  }
  async function download(bucket: string, file: string): Promise<Uint8Array> {
    const { data, error } = await client.storage.from(bucket).download(file);
    if (error || !data) throw new PublicationError("Uma evidência não está disponível. Reanexe a foto antes de publicar.", 503);
    return new Uint8Array(await data.arrayBuffer());
  }
  function toClient(d: AuditDraftRecord): PersistedAudit {
    const published = Boolean(d.published_at);
    return { safetyClosure: d.safety_closure ?? undefined, workName: d.work_name, audit: { id: d.id, visitId: d.visit_id, workId: d.work_id, modelId: d.model_id, date: d.audit_date,
      auditor: d.auditor_name, auditorId: d.auditor_auth_user_id, status: published ? "Publicada" : "Em preenchimento",
      collectionStatus: published ? "Coleta concluída" : "Em preenchimento", calculationStatus: published ? "Disponível" : "Aguardando configuração",
      finalScore: published ? d.final_score ?? null : null, isDemo: false, catalogRevisionId: d.catalog_revision_id,
      catalogVersion: d.catalog_version, catalogRevisionLabel: d.catalog_revision_label,
      ...(published ? { reportUrl: `/api/publications/${d.id}/audit-report` } : {}) },
      responses: mapPhotos(d.responses, ref => draftPhotoUrl(d.id, resolvePhoto(d, ref))), criteria: d.criteria,
      revision: d.revision, fvsServices: d.fvs_services };
  }
  function resolvePhoto(d: AuditDraftRecord, ref: string) {
    const existing = Object.entries(d.photos).find(([, file]) => draftPhotoUrl(d.id, file) === ref);
    const file = d.photos[ref] ?? existing?.[1];
    if (!file || !filePattern.test(file)) throw new PublicationError("Uma foto ainda não foi salva. Aguarde o salvamento ou anexe-a novamente.");
    return file;
  }
  async function verifyImages(assets: PdfAssets) {
    const document = await PDFDocument.create();
    for (const [name, asset] of Object.entries(assets.photos)) {
      if (filePattern.test(name) && `${hash(asset.bytes)}.jpg` !== name) throw new PublicationError("Uma evidência não corresponde ao arquivo salvo.", 503);
      try {
        if (asset.mimeType === "image/png") await document.embedPng(asset.bytes);
        else await document.embedJpg(asset.bytes);
      } catch { throw new PublicationError("Uma evidência não pôde ser incluída no PDF. Confira a foto antes de publicar."); }
    }
  }
  async function logo(): Promise<Uint8Array> { return readFile(path.join(process.cwd(), "public/logo-relatorio-orientativo.png")); }
  type PlanSource = { audit: { id: string; work_id: string; model_id: AuditModelId; audit_date: string; final_score: number;
    criteria: Criterion[]; responses: Record<string, ItemResponse>; evidence_files: string[] }; draft: PlanRecord | null; workName: string; authorName: string;
    publication?: { audit_id: string; work_id: string; report_file_name: string; published_at: string } };
  async function planSource(id: string) { return command<PlanSource>("read-plan", id); }
  const findings = (source: PlanSource) => extractPublicationFindings(source.audit.criteria, source.audit.responses);
  return {
    async index(month = getSaoPauloToday().slice(0, 7), ids?: string[]) {
      const data = await command<{ drafts: AuditDraftRecord[]; plans: { auditId: string; workId: string; module: "quality" | "safety" }[] }>("list", null, null, { month, ...(ids ? { ids } : {}) });
      return { drafts: data.drafts.map(toClient), plans: data.plans };
    },
    async readAudit(id: string) { return toClient(await command<AuditDraftRecord>("read-audit", id)); },
    async start(visitId: string, userClient: SupabaseClient, model: AuditModelId) {
      const snapshot = await readCatalogSnapshot(userClient, context);
      if (!snapshot.available) throw new PublicationError("Não foi possível conferir o roteiro vigente. Tente novamente.", 503);
      const version = catalogVersion(snapshot, model);
      return toClient(await command<AuditDraftRecord>("start-audit", visitId, null, {
        modelId: model, criteria: version.criteria, label: version.label, fvsServices: (snapshot.fvsWeights ?? bundledFvsWeights()).services }));
    },
    async saveAudit(id: string, revision: number, input: unknown, files: Map<string, File>, closure?: unknown) {
      const d = await command<AuditDraftRecord>("read-audit", id);
      if (d.published_at || d.revision !== revision) throw new PublicationError("O rascunho mudou ou já foi publicado. Reabra a auditoria.", 409);
      const responses = normalizeResponses(input, d);
      let safetyClosure = null;
      if (d.model_id === "security-it07-r02" && closure != null) {
        try { safetyClosure = validateSafetyClosure(closure, d.audit_date); } catch (e) { throw new PublicationError((e as Error).message); }
      }
      const refs = auditPhotoReferences([responses]);
      if (refs.size > 200 || files.size > 100) throw new PublicationError("Limite de fotos por auditoria excedido.");
      const photoMap: Record<string, string> = Object.create(null);
      // Sequential processing keeps decoded image memory bounded.
      for (const ref of refs) {
        const file = files.get(ref);
        if (!file) { photoMap[ref] = resolvePhoto(d, ref); continue; }
        if (!file.size || file.size > 8 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new PublicationError("Use fotos JPG, PNG ou WebP de até 8 MB.");
        let bytes: Buffer;
        try { bytes = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000, animated: false })
          .timeout({ seconds: 10 }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer(); }
        catch { throw new PublicationError("Uma foto não pôde ser processada. Confira o arquivo."); }
        const name = `${hash(bytes)}.jpg`;
        await upload("audit-drafts", `${d.auditor_auth_user_id}/${id}/${name}`, bytes, "image/jpeg");
        photoMap[ref] = name;
      }
      const saved = await command<AuditDraftRecord>("save-audit", id, revision, { responses, photos: photoMap, safetyClosure });
      return { revision: saved.revision };
    },
    async publishAudit(id: string, revision: number) {
      const d = await command<AuditDraftRecord>("read-audit", id);
      if (d.published_at) return toClient(d);
      if (revision !== d.revision) throw new PublicationError("O rascunho mudou. Reabra a auditoria antes de publicar.", 409);
      d.responses = normalizeResponses(d.responses, d, true);
      const score = publicationScore(d);
      const responses = mapPhotos(d.responses, ref => resolvePhoto(d, ref));
      const assets: PdfAssets = { logo: await logo(), photos: {} };
      const evidenceFiles = [...auditPhotoReferences([responses])];
      await progress("evidence");
      let total = 0;
      for (const name of evidenceFiles) {
        const bytes = await download("audit-drafts", `${d.auditor_auth_user_id}/${id}/${name}`);
        total += bytes.length;
        if (total > 32 * 1024 * 1024) throw new PublicationError("As evidências excedem 32 MB. Reduza a quantidade de fotos antes de publicar.");
        assets.photos[name] = { bytes, mimeType: "image/jpeg" };
        await upload("published-audits", `${d.work_id}/${id}/${name}`, bytes, "image/jpeg");
      }
      await progress("pdf");
      await verifyImages(assets);
      const pdf = await createAuditReviewPdf({ model: modelDisplayName(d.model_id), modelId: d.model_id,
        workName: d.work_name, details: { date: d.audit_date, auditor: d.auditor_name }, criteria: d.criteria, drafts: responses, safetyClosure: d.safety_closure ?? undefined }, assets);
      if (pdf.length > 40 * 1024 * 1024) throw new PublicationError("O PDF excede o limite de 40 MB.");
      await progress("storage");
      const reportFileName = `${hash(pdf)}.pdf`;
      await upload("published-audits", `${d.work_id}/${id}/${reportFileName}`, pdf, "application/pdf");
      await progress("finalizing");
      return toClient(await command<AuditDraftRecord>("publish-audit", id, revision,
        { score, safetyClosure: d.safety_closure ?? null, rawScore: d.model_id === "security-it07-r02" ? safetyScore(d.criteria, d.responses, d.model_id, d.safety_closure).raw : score, penalty: d.model_id === "security-it07-r02" ? safetyScore(d.criteria, d.responses, d.model_id, d.safety_closure).penalty : 0, responses: responses[d.model_id], evidenceFiles, reportFileName }));
    },
    async auditReport(id: string) {
      const d = await command<AuditDraftRecord>("read-audit", id);
      if (!d.published_at || !d.report_file_name || !/^[a-f0-9]{64}\.pdf$/.test(d.report_file_name)) throw new PublicationError("Auditoria ainda não publicada.", 404);
      return download("published-audits", `${d.work_id}/${id}/${d.report_file_name}`);
    },
    async photo(id: string, file: string) {
      const d = await command<AuditDraftRecord>("read-audit", id);
      if (!filePattern.test(file) || !Object.values(d.photos).includes(file)) throw new PublicationError("Foto não encontrada.", 404);
      return download("audit-drafts", `${d.auditor_auth_user_id}/${id}/${file}`);
    },
    async readPlan(id: string) {
      const source = await planSource(id);
      if (source.publication) return { published: true, url: `/api/publications/${id}/plan-report` };
      const rows = source.draft?.rows ?? findings(source).map(f => ({ ...f, correctiveAction: "", responsible: "", startDate: "", dueDate: "" }));
      return { published: false, revision: source.draft?.revision ?? 0, metadata: { workName: source.workName, auditDate: source.audit.audit_date, auditScore: source.audit.final_score, authorName: source.authorName, module: source.audit.model_id === "security-it07-r02" ? "safety" : "quality" }, rows: rows.map(row => ({ ...row,
        evidencePhotos: row.evidencePhotos?.map(photo => ({ name: photo.name,
          url: `/api/audits/${id}/photos/${encodeURIComponent(photo.name)}` })) })) };
    },
    async savePlan(id: string, revision: number, input: unknown) {
      const source = await planSource(id);
      if (source.publication) throw new PublicationError("O plano já foi publicado.", 409);
      const rows = normalizePlanRows(input, findings(source));
      return command<PlanRecord>("save-plan", id, revision, { rows });
    },
    async publishPlan(id: string, revision: number) {
      const source = await planSource(id);
      if (source.publication) return { published: true };
      if (!source.draft || source.draft.revision !== revision) throw new PublicationError("O plano mudou. Reabra-o antes de publicar.", 409);
      const rows: ActionPlanRow[] = normalizePlanRows(source.draft.rows, findings(source), true);
      const assets: PdfAssets = { logo: await logo(), photos: {} };
      const photos = new Set(rows.flatMap(r => (r.evidencePhotos ?? []).map(p => p.name)));
      await progress("evidence");
      let total = 0;
      for (const name of photos) {
        if (!source.audit.evidence_files.includes(name) || !/^(?:p\d{2}-\d{2}\.png|[a-f0-9]{64}\.jpg)$/.test(name)) throw new PublicationError("Referência de evidência inválida.");
        const bytes = await download("published-audits", `${source.audit.work_id}/${id}/${name}`);
        total += bytes.length;
        if (total > 32 * 1024 * 1024) throw new PublicationError("As evidências excedem o limite do plano.");
        assets.photos[name] = { bytes, mimeType: name.endsWith(".png") ? "image/png" : "image/jpeg" };
      }
      // PDF engine resolves images by URL; use immutable storage filenames as asset keys.
      const pdfRows = rows.map(r => ({ ...r, evidencePhotos: r.evidencePhotos?.map(p => ({ ...p, url: p.name })) }));
      await progress("pdf");
      await verifyImages(assets);
      const pdf = await generateActionPlanPdf({ workName: source.workName, auditDate: source.audit.audit_date,
        auditScore: source.audit.final_score, module: source.audit.model_id === "security-it07-r02" ? "safety" : "quality",
        authorName: source.authorName, rows: pdfRows }, assets);
      if (pdf.length > 40 * 1024 * 1024) throw new PublicationError("O PDF excede o limite de 40 MB.");
      await progress("storage");
      const reportFileName = `${hash(pdf)}.pdf`;
      await upload("action-plans", `${source.audit.work_id}/${id}/${reportFileName}`, pdf, "application/pdf");
      await progress("finalizing");
      await command("publish-plan", id, revision, { reportFileName });
      return { published: true };
    },
    async planReport(id: string) {
      const source = await planSource(id);
      if (!source.publication) throw new PublicationError("Plano ainda não publicado.", 404);
      return download("action-plans", `${source.publication.work_id}/${id}/${source.publication.report_file_name}`);
    },
  };
}
