import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import { readAuditRequestContext, auditResponseHeaders } from "@/lib/audits/request-context";
import { createClient } from "@/lib/supabase/server";
import { createPublicationClient } from "@/lib/publications/admin";
import { extractPublicationFindings, PublicationError } from "@/lib/publications/validation";
import { createAuditReviewPdf } from "@/lib/pdf/audit-report";
import type { PdfAssets } from "@/lib/pdf/types";
import { applicationUrl } from "@/lib/auth/site-url";
import { isConflictCode } from "@/lib/db-errors";
import { isModel, isRecord, isUuid } from "@/lib/catalogs/validation";
import { modelDisplayName } from "@/domain/prototype-audits";
import type { Criterion } from "@/domain/catalogs";
import type { ItemResponse } from "@/domain/audit-draft";
import type { SafetyClosure } from "@/domain/safety-audit";
import {
  applyItemNotes, editableItem, parseAuditChangeRequest, rebuildPlanRows, validChangeText,
  type AuditChangeEditableItem, type AuditChangeItem, type AuditChangeRequest,
} from "@/domain/audit-change";

type Client = SupabaseClient;
const bucket = "published-audits";
const evidencePattern = /^(?:p\d{2}-\d{2}\.png|[a-f0-9]{64}\.jpg)$/;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const auditorProfiles = ["AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE"];

const rpcMessages: Record<string, [string, number]> = {
  action_plan_already_published: ["O plano de ação desta auditoria já foi publicado. A alteração não pode ser feita.", 409],
  audit_change_already_open: ["Já existe um chamado em aberto para esta auditoria.", 409],
  audit_change_revision_conflict: ["O chamado mudou em outra sessão. Atualize a página e confira a situação.", 409],
  audit_change_item_required: ["Escolha um item desta auditoria.", 400],
  audit_change_reason_required: ["Descreva o motivo com pelo menos 5 caracteres.", 400],
  audit_change_refusal_reason_required: ["Informe o motivo da recusa com pelo menos 5 caracteres.", 400],
  audit_change_only_item_notes: ["Somente as observações do item pedido podem ser alteradas.", 400],
  audit_change_plan_rows_required: ["O rascunho do plano de ação precisa ser atualizado junto. Tente novamente.", 409],
  publication_file_missing: ["Não foi possível confirmar o novo PDF. Tente publicar novamente.", 503],
};

function rpcFailure(error: { code?: string; message?: string }): never {
  const known = error.message ? rpcMessages[error.message] : undefined;
  if (known) throw new PublicationError(known[0], known[1]);
  if (isConflictCode(error.code) || error.code === "23505") throw new PublicationError(rpcMessages.audit_change_revision_conflict[0], 409);
  if (error.code === "42501") throw new PublicationError("Seu perfil não tem permissão para este chamado.", 403);
  console.error("[audit-change] rpc_failed", { code: error.code });
  throw new PublicationError("Não foi possível concluir a operação. Tente novamente.", 503);
}

async function rpc<T>(client: Client, name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, params);
  if (error) rpcFailure(error);
  return data as T;
}

function parseRequest(raw: unknown): AuditChangeRequest {
  const request = parseAuditChangeRequest(raw);
  if (!request) throw new PublicationError("Resposta inválida do servidor.", 503);
  return request;
}

const profileParameters = (context: ProfileWorkspaceContext) => ({ p_profile: context.profile,
  p_engineering_scope: context.engineeringScope, p_administrative_scope: context.administrativeScope });

function requireAdministrative(context: ProfileWorkspaceContext) {
  if (context.profile !== "ADMINISTRATIVO" || !context.administrativeScope) throw new PublicationError("Somente o Administrativo decide o chamado.", 403);
  return context.administrativeScope;
}

export async function readChangeRequests(client: Client, context: ProfileWorkspaceContext, auditIds?: string[]) {
  if (auditIds && (auditIds.length > 50 || auditIds.some((id) => !isUuid(id)))) throw new PublicationError("Lista de auditorias inválida.");
  if (context.profile !== "ADMINISTRATIVO" && !auditorProfiles.includes(context.profile)) return [];
  const data = await rpc<unknown>(client, "read_audit_change_requests", { ...profileParameters(context), p_audit_ids: auditIds ?? null });
  if (!Array.isArray(data)) throw new PublicationError("Resposta inválida do servidor.", 503);
  return data.map(parseRequest);
}

export async function readChangeItems(client: Client, context: ProfileWorkspaceContext, auditId: string): Promise<AuditChangeItem[]> {
  if (!isUuid(auditId) || !auditorProfiles.includes(context.profile)) throw new PublicationError("Somente o auditor responsável pede alteração.", 403);
  const data = await rpc<unknown>(client, "read_audit_change_items", { p_profile: context.profile, p_audit_id: auditId });
  if (!Array.isArray(data)) throw new PublicationError("Resposta inválida do servidor.", 503);
  return data.flatMap((item) => isRecord(item) && typeof item.id === "string" && typeof item.code === "string"
    ? [{ id: item.id, code: item.code, title: typeof item.title === "string" ? item.title : item.code }] : []);
}

export async function requestChange(client: Client, context: ProfileWorkspaceContext, auditId: string, body: Record<string, unknown>) {
  if (!isUuid(auditId) || !auditorProfiles.includes(context.profile)) throw new PublicationError("Somente o auditor responsável pede alteração.", 403);
  if (typeof body.criterionId !== "string" || !body.criterionId || body.criterionId.length > 200) throw new PublicationError(rpcMessages.audit_change_item_required[0]);
  if (!validChangeText(body.reason)) throw new PublicationError(rpcMessages.audit_change_reason_required[0]);
  return parseRequest(await rpc(client, "request_audit_change", { p_profile: context.profile, p_audit_id: auditId,
    p_criterion_id: body.criterionId, p_reason: body.reason.trim() }));
}

export async function decideChange(client: Client, context: ProfileWorkspaceContext, requestId: string, body: Record<string, unknown>) {
  const scope = requireAdministrative(context);
  if (!isUuid(requestId) || !Number.isSafeInteger(body.revision) || typeof body.accept !== "boolean") throw new PublicationError("Dados inválidos.");
  if (!body.accept && !validChangeText(body.refusalReason)) throw new PublicationError(rpcMessages.audit_change_refusal_reason_required[0]);
  return parseRequest(await rpc(client, "decide_audit_change", { p_administrative_scope: scope, p_request_id: requestId,
    p_expected_revision: body.revision, p_accept: body.accept, p_refusal_reason: body.accept ? null : (body.refusalReason as string).trim() }));
}

type ChangeSource = {
  request: AuditChangeRequest;
  audit: { id: string; workId: string; workName: string; modelId: string; date: string; auditor: string; criteria: Criterion[];
    responses: Record<string, ItemResponse>; evidenceFiles: string[]; safetyClosure: SafetyClosure | null; reportFileName: string; contentRevision: number };
  planPublished: boolean;
  planDraft: { rows: Record<string, unknown>[]; revision: number } | null;
};

async function readSource(client: Client, scope: string, requestId: string): Promise<ChangeSource> {
  const data = await rpc<Record<string, unknown>>(client, "read_audit_change_source", { p_administrative_scope: scope, p_request_id: requestId });
  const audit = isRecord(data) ? data.audit : null;
  if (!isRecord(audit) || !isUuid(audit.id) || !isUuid(audit.workId) || !isModel(audit.modelId) || !Array.isArray(audit.criteria)
    || !isRecord(audit.responses) || !Array.isArray(audit.evidenceFiles) || typeof audit.reportFileName !== "string")
    throw new PublicationError("Resposta inválida do servidor.", 503);
  const plan = isRecord(data.planDraft) && Array.isArray(data.planDraft.rows) ? data.planDraft as ChangeSource["planDraft"] : null;
  return { request: parseRequest(data.request), audit: audit as unknown as ChangeSource["audit"], planPublished: data.planPublished === true, planDraft: plan };
}

/** Form data for the Administrativo: only the requested item, never the whole audit. */
export async function readChangeEditor(client: Client, context: ProfileWorkspaceContext, requestId: string):
  Promise<{ request: AuditChangeRequest; item: AuditChangeEditableItem; planPublished: boolean }> {
  const scope = requireAdministrative(context);
  if (!isUuid(requestId)) throw new PublicationError("Chamado inválido.");
  const source = await readSource(client, scope, requestId);
  const criterion = source.audit.criteria.find((entry) => entry.id === source.request.criterionId);
  if (!criterion) throw new PublicationError("O item pedido não existe mais nesta auditoria.", 409);
  return { request: source.request, item: editableItem(criterion, source.audit.responses[criterion.id]), planPublished: source.planPublished };
}

/** Rebuilds the PDF with the edited notes, stores it by hash and commits the republication. */
export async function republishChange(client: Client, context: ProfileWorkspaceContext, requestId: string, body: Record<string, unknown>,
  storage: Client = createPublicationClient()) {
  const scope = requireAdministrative(context);
  if (!isUuid(requestId) || !Number.isSafeInteger(body.revision)) throw new PublicationError("Dados inválidos.");
  const source = await readSource(client, scope, requestId);
  const { request, audit } = source;
  if (request.status !== "accepted" || request.revision !== body.revision) throw new PublicationError(rpcMessages.audit_change_revision_conflict[0], 409);
  if (source.planPublished) throw new PublicationError(rpcMessages.action_plan_already_published[0], 409);
  let responses: Record<string, ItemResponse>;
  try { responses = applyItemNotes(audit.responses, request.criterionId, body.note, body.checkNotes); }
  catch (error) { throw new PublicationError((error as Error).message); }

  let origin: URL | null = null;
  try { origin = applicationUrl(); } catch { /* Sem endereço configurado, as fotos ficam sem link no PDF. */ }
  const assets: PdfAssets = { logo: new Uint8Array(await readFile(path.join(process.cwd(), "public/logo-relatorio-orientativo.png"))), photos: {} };
  let total = 0;
  for (const name of audit.evidenceFiles) {
    if (!evidencePattern.test(name)) throw new PublicationError("Referência de evidência inválida.", 503);
    const { data, error } = await storage.storage.from(bucket).download(`${audit.workId}/${audit.id}/${name}`);
    if (error || !data) throw new PublicationError("Uma evidência publicada não está disponível. Tente novamente.", 503);
    const bytes = new Uint8Array(await data.arrayBuffer());
    total += bytes.length;
    if (total > 32 * 1024 * 1024) throw new PublicationError("As evidências excedem 32 MB.", 413);
    assets.photos[name] = { bytes, mimeType: name.endsWith(".png") ? "image/png" : "image/jpeg",
      ...(origin ? { url: new URL(`/api/audits/${audit.id}/photos/${name}`, origin).href } : {}) };
  }
  const pdf = await createAuditReviewPdf({ model: modelDisplayName(audit.modelId as never), modelId: audit.modelId, workName: audit.workName,
    details: { date: audit.date, auditor: audit.auditor }, criteria: audit.criteria, drafts: { [audit.modelId]: responses },
    safetyClosure: audit.safetyClosure ?? undefined }, assets);
  if (pdf.length > 40 * 1024 * 1024) throw new PublicationError("O PDF excede o limite de 40 MB.", 413);
  const reportFileName = `${hash(pdf)}.pdf`;
  const target = `${audit.workId}/${audit.id}/${reportFileName}`;
  const upload = await storage.storage.from(bucket).upload(target, pdf, { upsert: false, contentType: "application/pdf" });
  if (upload.error && !["409", "400"].includes(String((upload.error as { statusCode?: unknown }).statusCode))) throw new PublicationError("Não foi possível gravar o novo PDF. Tente novamente.", 503);
  const planRows = source.planDraft ? rebuildPlanRows(extractPublicationFindings(audit.criteria, responses), source.planDraft.rows as { id: string }[]) : null;
  return parseRequest(await rpc(client, "republish_audit_change", { p_administrative_scope: scope, p_request_id: requestId,
    p_expected_revision: request.revision, p_responses: responses, p_report_file_name: reportFileName, p_plan_rows: planRows }));
}

/** Same session and origin checks as the publication routes. */
export async function changeRequestRoute(request: Request, handle: (client: Client, context: ProfileWorkspaceContext) => Promise<unknown>) {
  try {
    if (request.method !== "GET") {
      const origin = request.headers.get("origin");
      const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(request.url).origin;
      if (!origin || (origin !== expected && !(process.env.NODE_ENV === "development" && origin === new URL(request.url).origin)))
        throw new PublicationError("Origem da solicitação inválida.", 403);
    }
    const access = await readAuditRequestContext(request);
    if (!access.context) throw new PublicationError("Entre novamente para continuar.", access.status);
    return Response.json(await handle(await createClient(), access.context), { headers: auditResponseHeaders });
  } catch (error) {
    return Response.json({ message: error instanceof PublicationError ? error.message : "O chamado está indisponível no momento. Tente novamente." },
      { status: error instanceof PublicationError ? error.status : 503, headers: auditResponseHeaders });
  }
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > 64 * 1024) throw new PublicationError("O envio excede o tamanho permitido.", 413);
  try {
    const text = await request.text();
    if (text.length > 64 * 1024) throw new Error();
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) throw new Error();
    return value;
  } catch { throw new PublicationError("Dados inválidos."); }
}
