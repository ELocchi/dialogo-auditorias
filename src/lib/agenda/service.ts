import type { SupabaseClient } from "@supabase/supabase-js";
import { canAccessWorkModule, canManageAgenda, canReadVisit, canStartAudit, modelModule, moduleLabels, type DemoUser, type Visit } from "../../domain/prototype-access.ts";
import { auditModelLabels, formatAuditDate, type AuditModelId } from "../../domain/operational-records.ts";
import { isCalendarDate } from "../../domain/visit-calendar.ts";
import { uuidPattern } from "../access/validation.ts";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { unavailableAgenda, type AgendaActionResult, type AgendaNotification, type AgendaSnapshot, type ConfirmAgendaVisitInput, type CreateAgendaVisitInput, type RescheduleAgendaVisitInput } from "./contracts.ts";

type Client = Pick<SupabaseClient, "rpc">;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" && uuidPattern.test(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max && !value.includes("\u0000");
const timestamp = (value: unknown): value is string => typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const revision = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value < 2147483647;
const model = (value: unknown): value is AuditModelId => typeof value === "string" && Object.hasOwn(auditModelLabels, value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const failure = (message: string): AgendaActionResult => ({ status: "error", message });

export function parseCreateAgendaVisit(input: unknown): CreateAgendaVisitInput | null {
  if (!record(input) || !exactKeys(input, ["requestId", "workId", "module", "modelId", "auditorId", "date", "note"])
    || !uuid(input.requestId) || !uuid(input.workId) || !uuid(input.auditorId) || !model(input.modelId)
    || input.module !== modelModule(input.modelId) || typeof input.date !== "string" || !isCalendarDate(input.date)
    || !text(input.note, 2000)) return null;
  return { requestId: input.requestId.toLowerCase(), workId: input.workId.toLowerCase(), module: modelModule(input.modelId),
    modelId: input.modelId, auditorId: input.auditorId.toLowerCase(), date: input.date, note: input.note.trim() };
}

export function parseConfirmAgendaVisit(input: unknown): ConfirmAgendaVisitInput | null {
  if (!record(input) || !exactKeys(input, ["requestId", "visitId", "expectedRevision"])
    || !uuid(input.requestId) || !uuid(input.visitId) || !revision(input.expectedRevision)) return null;
  return { requestId: input.requestId.toLowerCase(), visitId: input.visitId.toLowerCase(), expectedRevision: input.expectedRevision };
}

export function parseRescheduleAgendaVisit(input: unknown): RescheduleAgendaVisitInput | null {
  if (!record(input) || !exactKeys(input, ["requestId", "visitId", "expectedRevision", "date", "note"])
    || typeof input.date !== "string" || !isCalendarDate(input.date) || !text(input.note, 2000)) return null;
  const base = parseConfirmAgendaVisit({ requestId: input.requestId, visitId: input.visitId, expectedRevision: input.expectedRevision });
  return base ? { ...base, date: input.date, note: input.note.trim() } : null;
}

function parseVisit(raw: unknown, context: ProfileWorkspaceContext): Visit | null {
  if (!record(raw) || !uuid(raw.id) || !uuid(raw.workId) || !uuid(raw.auditorId) || !uuid(raw.createdBy)
    || !model(raw.modelId) || raw.module !== modelModule(raw.modelId) || !text(raw.note, 2000)
    || typeof raw.date !== "string" || !isCalendarDate(raw.date) || !timestamp(raw.createdAt) || !revision(raw.revision)
    || !text(raw.auditorName, 200) || !text(raw.createdByName, 200) || !Array.isArray(raw.history)
    || !["pending_confirmation", "confirmed"].includes(String(raw.confirmationStatus))
    || (raw.confirmationStatus === "confirmed" ? !timestamp(raw.confirmedAt) : raw.confirmedAt !== null)) return null;
  const history: Visit["history"][number][] = [];
  for (const entry of raw.history) {
    if (!record(entry) || typeof entry.previousDate !== "string" || !isCalendarDate(entry.previousDate)
      || typeof entry.date !== "string" || !isCalendarDate(entry.date) || !text(entry.note, 2000)
      || !uuid(entry.changedBy) || !timestamp(entry.changedAt)) return null;
    history.push({ previousDate: entry.previousDate, date: entry.date, note: entry.note, changedBy: entry.changedBy, changedAt: entry.changedAt });
  }
  const visit: Visit = {
    id: raw.id, workId: raw.workId, module: modelModule(raw.modelId), modelId: raw.modelId, auditorId: raw.auditorId,
    date: raw.date, note: raw.note, createdBy: raw.createdBy, createdAt: raw.createdAt, history, revision: raw.revision,
    confirmationStatus: raw.confirmationStatus as Visit["confirmationStatus"], confirmedAt: raw.confirmedAt as string | null,
    auditorName: raw.auditorName, createdByName: raw.createdByName,
  };
  return context.works.some((work) => work.id === visit.workId) && canReadVisit(context.user, visit) ? visit : null;
}

function parseAuditor(raw: unknown, context: ProfileWorkspaceContext): DemoUser | null {
  if (!record(raw) || !uuid(raw.id) || !text(raw.name, 200) || !raw.name.trim()
    || (raw.role !== "safety-auditor" && raw.role !== "quality-auditor") || !Array.isArray(raw.workModuleScopes)) return null;
  const discipline = raw.role === "safety-auditor" ? "safety" : "quality";
  const scopes: { workId: string; module: typeof discipline }[] = [];
  for (const scope of raw.workModuleScopes) {
    if (!record(scope) || !uuid(scope.workId) || scope.module !== discipline
      || !context.works.some((work) => work.id === scope.workId) || !canAccessWorkModule(context.user, scope.workId, discipline)) return null;
    scopes.push({ workId: scope.workId, module: discipline });
  }
  if (!scopes.length || new Set(scopes.map((scope) => scope.workId)).size !== scopes.length) return null;
  const workIds = scopes.map((scope) => scope.workId);
  return { id: raw.id, name: raw.name, role: raw.role, modules: [discipline], workIds, agendaWorkIds: workIds, documentWorkIds: [], workModuleScopes: scopes };
}

function notificationsFor(visits: Visit[], context: ProfileWorkspaceContext): AgendaNotification[] {
  const items: AgendaNotification[] = [];
  for (const visit of visits) {
    const workName = context.works.find((work) => work.id === visit.workId)!.name;
    const createdAt = visit.history.at(-1)?.changedAt ?? visit.createdAt;
    const detail = `${moduleLabels[visit.module]} · ${formatAuditDate(visit.date)}`;
    const base = { workName, detail, href: `/app?secao=agenda&visita=${encodeURIComponent(visit.id)}` };
    if (canManageAgenda(context.user)) {
      items.push({ ...base, id: `${visit.id}:${visit.revision}:scheduled`, type: "visit_scheduled", createdAt });
      if (visit.confirmationStatus === "confirmed" && visit.confirmedAt) items.push({ ...base,
        detail: `${detail} · ${visit.auditorName}`, id: `${visit.id}:${visit.revision}:confirmed`, type: "visit_confirmed", createdAt: visit.confirmedAt });
    } else if (visit.auditorId === context.user.id && canStartAudit(context.user, visit.workId, visit.modelId) && visit.confirmationStatus === "pending_confirmation") {
      items.push({ ...base, id: `${visit.id}:${visit.revision}:pending`, type: "visit_confirmation_requested", createdAt });
    }
  }
  return items.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export async function readAgendaSnapshot(client: Client, context: ProfileWorkspaceContext): Promise<AgendaSnapshot> {
  try {
    const { data, error } = await client.rpc("read_audit_agenda", { p_profile: context.profile, p_engineering_scope: context.engineeringScope });
    if (error || !record(data) || !Array.isArray(data.visits) || !Array.isArray(data.auditors)
      || (!canManageAgenda(context.user) && data.auditors.length)) return unavailableAgenda();
    const visits: Visit[] = [];
    const auditors: DemoUser[] = [];
    for (const raw of data.visits) { const visit = parseVisit(raw, context); if (!visit) return unavailableAgenda(); visits.push(visit); }
    for (const raw of data.auditors) { const auditor = parseAuditor(raw, context); if (!auditor) return unavailableAgenda(); auditors.push(auditor); }
    if (new Set(visits.map((visit) => visit.id)).size !== visits.length
      || new Set(auditors.map((auditor) => `${auditor.id}:${auditor.role}`)).size !== auditors.length) return unavailableAgenda();
    visits.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
    return { available: true, visits, auditors, notifications: notificationsFor(visits, context) };
  } catch { return unavailableAgenda(); }
}

async function mutate(client: Client, context: ProfileWorkspaceContext, rpc: string, params: Record<string, unknown>, message: string): Promise<AgendaActionResult> {
  try {
    const { data, error } = await client.rpc(rpc, params);
    if (error) {
      if (error.code === "40001") return failure("A programação mudou. Atualize a agenda e confira a data antes de continuar.");
      if (error.code === "42501") return failure("Seu perfil não está autorizado para esta operação. Confira seus acessos.");
      if (error.code === "22023") return failure("Confira a obra, o auditor e os dados do agendamento antes de continuar.");
      return failure("Não foi possível confirmar a operação. Atualize a agenda e confira o registro antes de tentar novamente.");
    }
    if (!uuid(data)) return failure("A resposta não pôde ser confirmada. Atualize a agenda antes de tentar novamente.");
    const snapshot = await readAgendaSnapshot(client, context);
    if (rpc === "confirm_audit_visit" && snapshot.available) {
      const current = snapshot.visits.find((visit) => visit.id === data);
      if (!current || current.revision !== params.p_expected_revision || current.confirmationStatus !== "confirmed") {
        return { status: "error", message: "A programação mudou após sua confirmação. Confira a data atual na agenda.", visitId: data, snapshot };
      }
    }
    return { status: "success", message: snapshot.available ? message : `${message} Atualize a página para consultar a agenda.`, visitId: data, snapshot };
  } catch { return failure("Não foi possível confirmar a operação. Atualize a agenda e confira o registro antes de tentar novamente."); }
}

export async function createAgendaVisit(input: unknown, context: ProfileWorkspaceContext, client: Client): Promise<AgendaActionResult> {
  const value = parseCreateAgendaVisit(input);
  if (!value) return failure("Revise os campos do agendamento.");
  if (!canManageAgenda(context.user) || !context.works.some((work) => work.id === value.workId)
    || !canAccessWorkModule(context.user, value.workId, value.module)) return failure("Este perfil não pode agendar a visita nesta obra e disciplina.");
  return mutate(client, context, "create_audit_visit", {
    p_request_id: value.requestId, p_obra_id: value.workId, p_modulo: value.module === "safety" ? "SEGURANCA" : "QUALIDADE",
    p_modelo_id: value.modelId, p_auditor_auth_user_id: value.auditorId, p_data_prevista: value.date, p_observacao: value.note,
  }, "Auditoria agendada. O auditor recebeu uma notificação no aplicativo para confirmar a data.");
}

export async function rescheduleAgendaVisit(input: unknown, context: ProfileWorkspaceContext, client: Client): Promise<AgendaActionResult> {
  const value = parseRescheduleAgendaVisit(input);
  if (!value) return failure("Confira a data e reabra o agendamento para tentar novamente.");
  if (!canManageAgenda(context.user)) return failure("Somente o Administrativo pode reagendar visitas.");
  return mutate(client, context, "reschedule_audit_visit", {
    p_request_id: value.requestId, p_visit_id: value.visitId, p_expected_revision: value.expectedRevision,
    p_data_prevista: value.date, p_observacao: value.note,
  }, "Programação salva. Confira a data e o status de confirmação na agenda.");
}

export async function confirmAgendaVisit(input: unknown, context: ProfileWorkspaceContext, client: Client): Promise<AgendaActionResult> {
  const value = parseConfirmAgendaVisit(input);
  if (!value) return failure("Reabra o agendamento e confira a data antes de confirmar.");
  if (context.user.role !== "safety-auditor" && context.user.role !== "quality-auditor") return failure("Selecione o perfil de auditor responsável para confirmar a data.");
  const current = await readAgendaSnapshot(client, context);
  const visit = current.visits.find((entry) => entry.id === value.visitId);
  if (!current.available || !visit || visit.auditorId !== context.user.id || !canStartAudit(context.user, visit.workId, visit.modelId)) return failure("Esta confirmação não está disponível para o perfil selecionado. Atualize a agenda.");
  // The RPC checks the expected revision under a row lock, including on replay.
  return mutate(client, context, "confirm_audit_visit", {
    p_request_id: value.requestId, p_visit_id: value.visitId, p_expected_revision: value.expectedRevision,
  }, "Data confirmada. O Administrativo já pode consultar sua confirmação.");
}
