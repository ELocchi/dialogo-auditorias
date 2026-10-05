"use server";

import { scheduledDocument, standaloneDocument } from "@/lib/follow-up/document";
import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { parseSaveFollowUp, readFollowUpReports, resolveReportFindings, saveFollowUpReport, type FollowUpSnapshot, type SaveFollowUpResult } from "@/lib/follow-up/service";
import { readFindingDrafts, saveFindingDrafts, type FindingDraftSnapshot, type SaveFindingDraftResult } from "@/lib/follow-up/findings";
import { detectPhotoType, followUpPhotoBucket, maxPhotoBytes, maxPhotosPerFinding,
  photoPath, readVisitPhotos, type FindingPhoto } from "@/lib/follow-up/photos";
import { readAgendaSnapshot } from "@/lib/agenda/service";
import { readFollowUpVisit } from "@/lib/follow-up/visit-service";
import { canReadVisit } from "@/domain/prototype-access";
import { getSaoPauloToday } from "@/domain/visit-calendar";
import { uuidPattern } from "@/lib/access/validation";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import { readStandaloneFindings, saveStandaloneReport } from "@/lib/follow-up/standalone-service";
import type { StandaloneSaveResult } from "@/lib/follow-up/standalone-contracts";

async function activeContext(expected: AgendaActorContext) {
  const active = await requireActiveProfile();
  if (!expected || expected.userId !== active.user.id || expected.profile !== active.profile
    || expected.engineeringScope !== active.engineeringScope || expected.administrativeScope !== active.administrativeScope) return null;
  return readWorkspaceContext(active);
}

export async function saveStandaloneReportAction(value: unknown, expected: AgendaActorContext): Promise<StandaloneSaveResult> {
  const context = await activeContext(expected);
  if (!context) return { status: "error", message: "Seu perfil mudou. Atualize a página antes de salvar." };
  const client = await createClient();
  const result = await saveStandaloneReport(client, context, value);
  if (result.status === "success") {
    try {
      if (!await standaloneDocument(client, context, result.reportId)) throw new Error("Report missing");
    } catch {
      // The immutable report record already exists. Keep its ID and retry PDF
      // preservation on download instead of encouraging a duplicate publication.
      return { ...result, archivePending: true };
    }
  }
  return result;
}

export async function readStandaloneFindingsAction(workId: string, expected: AgendaActorContext) {
  const context = await activeContext(expected);
  if (!context) return { available: false, findings: [] };
  return readStandaloneFindings(await createClient(), context, workId);
}

export type WorkFinding = { id: string; workId: string; module: "safety" | "quality"; location: string; description: string;
  correction: string; serious: boolean; photoFileName: string; createdAt: string };
type WorkFindingRow = { id: string; work_id: string; modulo: "SEGURANCA" | "QUALIDADE"; location: string; description: string;
  correction: string; serious: boolean; photo_file_name: string; created_at: string };
const toWorkFinding = (row: WorkFindingRow): WorkFinding => ({ id: row.id, workId: row.work_id,
  module: row.modulo === "SEGURANCA" ? "safety" : "quality",
  location: row.location, description: row.description, correction: row.correction, serious: row.serious,
  photoFileName: row.photo_file_name, createdAt: row.created_at });

const findingModule = (profile: string) => profile === "AUDITOR_SEGURANCA" ? "SEGURANCA" : profile === "AUDITOR_QUALIDADE" ? "QUALIDADE" : null;

export async function readWorkFindingsAction(expected: AgendaActorContext): Promise<{ available: boolean; findings: WorkFinding[] }> {
  const context = await activeContext(expected);
  const findingDiscipline = context ? findingModule(context.profile) : null;
  if (!context || !findingDiscipline) return { available: false, findings: [] };
  const { data, error } = await (await createClient()).from("follow_up_work_findings")
    .select("id,work_id,modulo,location,description,correction,serious,photo_file_name,created_at")
    .eq("auditor_auth_user_id", context.user.id).eq("modulo", findingDiscipline).is("completed_at", null).order("created_at", { ascending: false }).limit(1000);
  if (error || !data) return { available: false, findings: [] };
  const authorized = new Set(context.works.map((work) => work.id));
  return { available: true, findings: (data as WorkFindingRow[]).filter((row) => authorized.has(row.work_id)).map(toWorkFinding) };
}

export async function readEngineeringWorkFindingsAction(module: "safety" | "quality", expected: AgendaActorContext): Promise<{ available: boolean; findings: WorkFinding[] }> {
  const context = await activeContext(expected);
  if (!context || context.profile !== "ENGENHARIA" || !["safety", "quality"].includes(module))
    return { available: false, findings: [] };
  const authorized = new Set(context.works.map((work) => work.id));
  const { data, error } = await (await createClient()).from("follow_up_work_findings")
    .select("id,work_id,modulo,location,description,correction,serious,photo_file_name,created_at")
    .eq("modulo", module === "safety" ? "SEGURANCA" : "QUALIDADE")
    .is("completed_at", null).order("created_at", { ascending: false }).limit(1000);
  if (error || !data) return { available: false, findings: [] };
  return { available: true, findings: (data as WorkFindingRow[])
    .filter((row) => authorized.has(row.work_id)).map(toWorkFinding) };
}

export async function createWorkFindingAction(formData: FormData, expected: AgendaActorContext): Promise<{
  status: "success" | "error"; message: string; finding?: WorkFinding;
}> {
  const context = await activeContext(expected);
  const findingDiscipline = context ? findingModule(context.profile) : null;
  const workId = formData.get("workId");
  const location = formData.get("location");
  const description = formData.get("description");
  const correction = formData.get("correction");
  const serious = formData.get("serious");
  const photo = formData.get("photo");
  if (!context || !findingDiscipline
    || typeof workId !== "string" || !uuidPattern.test(workId) || !context.works.some((work) => work.id === workId)
    || typeof location !== "string" || location.length > 200
    || typeof description !== "string" || description.trim().length < 5 || description.length > 2000
    || typeof correction !== "string" || correction.trim().length < 5 || correction.length > 2000
    || (serious !== "true" && serious !== "false")
    || !(photo instanceof File) || photo.size === 0 || photo.size > maxPhotoBytes)
    return { status: "error", message: "Confira a obra, os textos e a foto do apontamento." };
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const kind = detectPhotoType(bytes);
  if (!kind || photo.type !== kind) return { status: "error", message: "Envie uma foto JPG ou PNG de até 3 MB." };
  const id = crypto.randomUUID();
  const fileName = `${id}_${crypto.randomUUID()}.${kind === "image/png" ? "png" : "jpg"}`;
  const path = photoPath(context.user.id, workId, fileName);
  if (!path) return { status: "error", message: "Não foi possível preparar a foto." };
  const client = await createClient({ writableCookies: true });
  const upload = await client.storage.from(followUpPhotoBucket).upload(path, bytes,
    { contentType: kind, cacheControl: "3600", upsert: false });
  if (upload.error) return { status: "error", message: "Não foi possível enviar a foto. Confira o armazenamento do projeto." };
  const { data, error } = await client.from("follow_up_work_findings").insert({
    id, work_id: workId, modulo: findingDiscipline, auditor_auth_user_id: context.user.id, location: location.trim(),
    description: description.trim(), correction: correction.trim(), serious: serious === "true", photo_file_name: fileName,
  }).select("id,work_id,modulo,location,description,correction,serious,photo_file_name,created_at").single();
  if (error || !data) {
    await client.storage.from(followUpPhotoBucket).remove([path]);
    return { status: "error", message: "Não foi possível salvar o apontamento. Confira a atualização do banco de dados." };
  }
  return { status: "success", message: "Apontamento e foto salvos na plataforma.", finding: toWorkFinding(data as WorkFindingRow) };
}

export async function completeWorkFindingAction(id: string, expected: AgendaActorContext): Promise<boolean> {
  const context = await activeContext(expected);
  const findingDiscipline = context ? findingModule(context.profile) : null;
  if (!context || !findingDiscipline || !uuidPattern.test(id)) return false;
  const { data, error } = await (await createClient({ writableCookies: true })).from("follow_up_work_findings")
    .update({ completed_at: new Date().toISOString() }).eq("id", id)
    .eq("auditor_auth_user_id", context.user.id).eq("modulo", findingDiscipline).is("completed_at", null).select("id").single();
  return !error && !!data;
}

export async function readFollowUpReportsAction(expected: AgendaActorContext): Promise<FollowUpSnapshot> {
  const context = await activeContext(expected);
  if (!context) return { available: false, reports: [], message: "Seu acesso mudou. Atualize a página." };
  return readFollowUpReports(await createClient(), context);
}

export async function saveFollowUpReportAction(input: unknown, expected: AgendaActorContext): Promise<SaveFollowUpResult> {
  const context = await activeContext(expected);
  if (!context) return { status: "error", message: "Seu acesso mudou. Atualize a página." };
  if (input && typeof input === "object" && !Array.isArray(input) && !("title" in input))
    return { status: "error", message: "Esta página está desatualizada. Atualize-a para informar o nome do relatório antes de salvar." };
  const value = parseSaveFollowUp(input);
  if (!value) return { status: "error", message: "Confira o nome, os textos e os apontamentos selecionados antes de salvar." };
  const client = await createClient({ writableCookies: true });
  const snapshot = await readFollowUpVisit(client, context, value.visitId);
  if (!snapshot.available) return { status: "error", message: "Não foi possível conferir os apontamentos. Atualize a página." };
  const visit = snapshot.visit;
  if (!visit) return { status: "error", message: "A visita não está disponível para este perfil." };
  if (visit.confirmationStatus !== "confirmed" || visit.date > getSaoPauloToday())
    return { status: "error", message: "Para criar o relatório, confirme a visita e aguarde a data agendada." };
  const previousFindings = snapshot.reports.flatMap((entry) => entry.findings);
  const workFindings = snapshot.workFindings.map(({ id, location, description, correction, serious }) => ({ id, location, description, correction, serious }));
  const findings = resolveReportFindings(value.findings, previousFindings, [...(snapshot.draft?.findings ?? []), ...workFindings]);
  if (!findings) return { status: "error", message: value.findings.length
    ? "Os apontamentos mudaram. Atualize a página e selecione novamente."
    : "Selecione pelo menos um apontamento para incluir no relatório." };
  const result = await saveFollowUpReport(client, context, { ...value, findings });
  if (result.status === "success" && result.report) {
    try {
      if (!await scheduledDocument(client, context, value.visitId, result.report.id)) throw new Error("Report missing");
    } catch {
      return { ...result, message: "Relatório salvo. O PDF ainda não pôde ser preservado; tente abrir o documento novamente." };
    }
  }
  return result;
}

export async function readFindingDraftsAction(expected: AgendaActorContext): Promise<FindingDraftSnapshot> {
  const context = await activeContext(expected);
  if (!context) return { available: false, drafts: [], message: "Seu acesso mudou. Atualize a página." };
  return readFindingDrafts(await createClient(), context);
}

export async function saveFindingDraftsAction(input: unknown, expected: AgendaActorContext): Promise<SaveFindingDraftResult> {
  const context = await activeContext(expected);
  if (!context) return { status: "error", message: "Seu acesso mudou. Atualize a página." };
  return saveFindingDrafts(await createClient({ writableCookies: true }), context, input);
}

export async function completeFindingAction(visitId: string, findingId: string, expected: AgendaActorContext): Promise<{
  status: "success" | "error"; message: string; draft?: FindingDraftSnapshot["drafts"][number];
}> {
  const context = await activeContext(expected);
  if (!context || !uuidPattern.test(visitId) || !uuidPattern.test(findingId))
    return { status: "error", message: "Não foi possível concluir o apontamento." };
  const client = await createClient({ writableCookies: true });
  const snapshot = await readFollowUpVisit(client, context, visitId);
  if (!snapshot.available || !snapshot.visit) return { status: "error", message: "Atualize a página e tente novamente." };
  const draft = snapshot.draft ?? undefined;
  const reportFindings = snapshot.reports.flatMap((entry) => entry.findings);
  if (![...(draft?.findings ?? []), ...reportFindings].some((item) => item.id === findingId))
    return { status: "error", message: "O apontamento não está mais disponível. Atualize a página." };
  const inReport = reportFindings.some((item) => item.id === findingId);
  let updatedDraft = draft;
  if (draft?.findings.some((item) => item.id === findingId)) {
    const result = await saveFindingDrafts(client, context, { visitId, expectedRevision: draft.revision,
      findings: draft.findings.filter((item) => item.id !== findingId) });
    if (result.status !== "success" || !result.draft) return { status: "error", message: `${result.message} Atualize a página para conferir a pendência.` };
    updatedDraft = result.draft;
  }
  if (inReport) {
    const { error } = await client.from("follow_up_finding_completions").upsert({
      visit_id: visitId, finding_id: findingId, auditor_auth_user_id: context.user.id,
    }, { onConflict: "visit_id,finding_id", ignoreDuplicates: true });
    if (error) return { status: "error", message: "A conclusão estará disponível após a atualização do banco de dados." };
  }
  const photoList = !inReport ? await readVisitPhotos(client, context.user.id, visitId) : null;
  if (photoList) {
    const paths = photoList.filter((photo) => photo.findingId === findingId)
      .flatMap((photo) => photoPath(context.user.id, visitId, photo.fileName) ?? []);
    if (paths.length) await client.storage.from(followUpPhotoBucket).remove(paths);
  }
  return { status: "success", message: "Pendência concluída e removida da lista ativa.", draft: updatedDraft };
}

export async function readCompletedFindingsAction(expected: AgendaActorContext): Promise<string[] | null> {
  const context = await activeContext(expected);
  if (!context) return null;
  const { data, error } = await (await createClient()).from("follow_up_finding_completions")
    .select("visit_id,finding_id").eq("auditor_auth_user_id", context.user.id);
  if (error || !data) return null;
  return data.map((item) => `${item.visit_id}:${item.finding_id}`);
}

type PhotoResult = { status: "success" | "error"; message: string; photos?: FindingPhoto[] };
export async function readFindingPhotosAction(visitIds: string[], expected: AgendaActorContext): Promise<{
  available: boolean; photos: FindingPhoto[]; message?: string;
}> {
  const context = await activeContext(expected);
  if (!context || !Array.isArray(visitIds) || visitIds.length > 100
    || visitIds.some((id) => !uuidPattern.test(id))) return { available: false, photos: [], message: "Não foi possível consultar as fotos." };
  const agenda = await readAgendaSnapshot(await createClient(), context);
  if (!agenda.available) return { available: false, photos: [], message: "Não foi possível consultar as fotos." };
  const authorized = new Set(agenda.visits.filter((visit) => visit.kind === "follow_up"
    && visit.auditorId === context.user.id && canReadVisit(context.user, visit)).map((visit) => visit.id));
  if (visitIds.some((id) => !authorized.has(id))) return { available: false, photos: [], message: "Não foi possível consultar as fotos." };
  const client = await createClient();
  const lists = await Promise.all([...new Set(visitIds)].map((id) => readVisitPhotos(client, context.user.id, id)));
  if (lists.some((list) => !list)) return { available: false, photos: [], message: "As fotos estarão disponíveis após a atualização do armazenamento." };
  return { available: true, photos: lists.flatMap((list) => list ?? []) };
}

export async function uploadFindingPhotosAction(formData: FormData, expected: AgendaActorContext): Promise<PhotoResult> {
  const context = await activeContext(expected);
  const visitId = formData.get("visitId");
  const findingId = formData.get("findingId");
  const files = formData.getAll("photos");
  if (!context || (context.profile !== "AUDITOR_SEGURANCA" && context.profile !== "AUDITOR_QUALIDADE")
    || typeof visitId !== "string" || !uuidPattern.test(visitId)
    || typeof findingId !== "string" || !uuidPattern.test(findingId)
    || !files.length || files.length > maxPhotosPerFinding || files.some((file) => typeof file === "string"))
    return { status: "error", message: "Selecione uma foto JPG ou PNG." };
  const client = await createClient({ writableCookies: true });
  const snapshot = await readFollowUpVisit(client, context, visitId);
  const visit = snapshot.visit;
  if (!snapshot.available || !visit || visit.confirmationStatus !== "confirmed" || visit.date > getSaoPauloToday())
    return { status: "error", message: "O apontamento não está disponível para receber fotos. Atualize a página." };
  if (snapshot.reports.some((entry) => entry.findings.some((item) => item.id === findingId)))
    return { status: "error", message: "A foto deste relatório fechado não pode ser alterada." };
  if (!snapshot.draft?.findings.some((item) => item.id === findingId))
    return { status: "error", message: "O apontamento não está disponível para receber fotos. Atualize a página." };
  const existing = await readVisitPhotos(client, context.user.id, visitId);
  if (!existing) return { status: "error", message: "As fotos estarão disponíveis após a atualização do armazenamento." };
  if (existing.filter((photo) => photo.findingId === findingId).length + files.length > maxPhotosPerFinding)
    return { status: "error", message: "Cada apontamento aceita uma foto." };
  const uploaded: string[] = [];
  try {
    for (const entry of files) {
      if (typeof entry === "string" || entry.size === 0 || entry.size > maxPhotoBytes)
        throw new Error("Cada foto deve ter no máximo 3 MB.");
      const bytes = new Uint8Array(await entry.arrayBuffer());
      const kind = detectPhotoType(bytes);
      if (!kind || entry.type !== kind) throw new Error("Envie apenas fotos JPG ou PNG.");
      const fileName = `${findingId}_${crypto.randomUUID()}.${kind === "image/png" ? "png" : "jpg"}`;
      const path = photoPath(context.user.id, visitId, fileName);
      if (!path) throw new Error("Não foi possível preparar a foto.");
      const { error } = await client.storage.from(followUpPhotoBucket).upload(path, bytes,
        { contentType: kind, cacheControl: "3600", upsert: false });
      if (error) throw new Error("Não foi possível enviar as fotos. Confira o armazenamento do projeto.");
      uploaded.push(path);
    }
  } catch (reason) {
    if (uploaded.length) await client.storage.from(followUpPhotoBucket).remove(uploaded);
    return { status: "error", message: reason instanceof Error ? reason.message : "Não foi possível enviar as fotos." };
  }
  const photos = await readVisitPhotos(client, context.user.id, visitId);
  return photos ? { status: "success", message: "Fotos salvas na plataforma.", photos }
    : { status: "error", message: "As fotos foram enviadas, mas não puderam ser confirmadas. Atualize a página." };
}

export async function deleteFindingPhotosAction(visitId: string, findingId: string,
  expected: AgendaActorContext): Promise<boolean> {
  const context = await activeContext(expected);
  if (!context || !uuidPattern.test(visitId) || !uuidPattern.test(findingId)) return false;
  const client = await createClient({ writableCookies: true });
  const snapshot = await readFollowUpVisit(client, context, visitId);
  if (!snapshot.available || !snapshot.visit) return false;
  const stillUsed = [...(snapshot.draft?.findings ?? []),
    ...snapshot.reports.flatMap((entry) => entry.findings)].some((item) => item.id === findingId);
  if (stillUsed) return false;
  const photos = await readVisitPhotos(client, context.user.id, visitId);
  if (!photos) return false;
  const paths = photos.filter((photo) => photo.findingId === findingId)
    .flatMap((photo) => photoPath(context.user.id, visitId, photo.fileName) ?? []);
  if (!paths.length) return true;
  const { error } = await client.storage.from(followUpPhotoBucket).remove(paths);
  return !error;
}
