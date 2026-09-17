import type { AuditModelId } from "./operational-records";

/** Política de demonstração local. Não substitui autenticação ou autorização no servidor. */
export type AppModule = "quality" | "safety";
export type Role = "quality-auditor" | "safety-auditor" | "engineering" | "administrative";
export type EngineeringActivity = "site-team" | "coordination";

export interface DemoUser {
  id: string;
  name: string;
  role: Role;
  activity?: EngineeringActivity;
  modules: readonly AppModule[];
  workIds: readonly string[];
  agendaWorkIds: readonly string[];
  documentWorkIds: readonly string[];
  /** Exact scopes supplied for a selected, server-verified profile. Optional only for legacy local fixtures. */
  workModuleScopes?: readonly { workId: string; module: AppModule }[];
}

export const roleLabels: Record<Role, string> = {
  "quality-auditor": "Auditor de Qualidade",
  "safety-auditor": "Auditor de Segurança",
  engineering: "Engenharia",
  administrative: "Administrativo",
};

export const moduleLabels: Record<AppModule, string> = { quality: "Qualidade", safety: "Segurança" };

// Identidades fictícias para a ferramenta “Simulação de perfil — não é autenticação”.
// As duas atuações de Engenharia pertencem ao mesmo perfil principal.
export const demoUsers: readonly DemoUser[] = [
  { id: "auditor-safety", name: "Marina Costa", role: "safety-auditor", modules: ["safety"], workIds: ["horizonte", "jardim-norte"], agendaWorkIds: ["horizonte", "jardim-norte"], documentWorkIds: [] },
  { id: "auditor-quality", name: "Marina Costa", role: "quality-auditor", modules: ["quality"], workIds: ["horizonte", "jardim-norte"], agendaWorkIds: ["horizonte", "jardim-norte"], documentWorkIds: [] },
  { id: "auditor-safety-other", name: "Rafael Santos", role: "safety-auditor", modules: ["safety"], workIds: ["horizonte"], agendaWorkIds: ["horizonte"], documentWorkIds: [] },
  { id: "engineering-site", name: "Equipe de teste", role: "engineering", activity: "site-team", modules: ["quality", "safety"], workIds: ["horizonte"], agendaWorkIds: ["horizonte"], documentWorkIds: [] },
  { id: "engineering-coordination", name: "Coordenação de teste", role: "engineering", activity: "coordination", modules: ["quality", "safety"], workIds: ["horizonte", "jardim-norte"], agendaWorkIds: ["horizonte"], documentWorkIds: [] },
  { id: "administrative", name: "Administrativo de teste", role: "administrative", modules: ["quality", "safety"], workIds: ["horizonte", "jardim-norte"], agendaWorkIds: ["horizonte", "jardim-norte"], documentWorkIds: [] },
];

export function modelModule(modelId: AuditModelId): AppModule {
  switch (modelId) {
    case "security-it07-r02": return "safety";
    case "quality-f175":
    case "quality-f176": return "quality";
    default: throw new Error("Modelo de auditoria desconhecido.");
  }
}

export function canAccessWork(user: DemoUser, workId: string): boolean {
  return user.workIds.includes(workId);
}

export function canAccessModule(user: DemoUser, module: AppModule): boolean {
  if (!user.modules.includes(module)) return false;
  if (user.role === "quality-auditor") return module === "quality";
  if (user.role === "safety-auditor") return module === "safety";
  return user.role === "administrative" || (user.role === "engineering" && (user.activity === "site-team" || user.activity === "coordination"));
}

/** UI context predicate; real data/mutations must also enforce server/RLS authorization. */
export function canAccessWorkModule(user: DemoUser, workId: string, module: AppModule): boolean {
  return canAccessWork(user, workId) && canAccessModule(user, module)
    && (user.workModuleScopes === undefined || user.workModuleScopes.some((scope) => scope.workId === workId && scope.module === module));
}

/** D01: a edição da agenda de visitas pertence exclusivamente ao Administrativo. */
export function canManageAgenda(user: DemoUser): boolean {
  return user.role === "administrative";
}

export function canConsultAgenda(user: DemoUser, workId: string, module: AppModule): boolean {
  if (!canAccessWorkModule(user, workId, module)) return false;
  return user.role !== "engineering" || user.activity !== "coordination" || user.agendaWorkIds.includes(workId);
}

export function canStartAudit(user: DemoUser, workId: string, modelId: AuditModelId): boolean {
  return (user.role === "quality-auditor" || user.role === "safety-auditor")
    && canAccessWorkModule(user, workId, modelModule(modelId));
}

export function canBeginScheduledAudit(user: DemoUser, visit: Visit, today: string): boolean {
  return visit.kind === "audit" && visit.modelId !== null
    && visit.auditorId === user.id && visit.confirmationStatus === "confirmed"
    && visit.date === today && modelModule(visit.modelId) === visit.module
    && canReadVisit(user, visit) && canStartAudit(user, visit.workId, visit.modelId);
}

export interface AuditAccessTarget {
  workId: string;
  modelId: AuditModelId;
  auditorId: string;
  status: "Agendada" | "Em preenchimento" | "Em discussão com a obra" | "Publicada";
}

export function canEditAudit(user: DemoUser, audit: AuditAccessTarget): boolean {
  return audit.status !== "Publicada" && audit.auditorId === user.id && canStartAudit(user, audit.workId, audit.modelId);
}

export function canReadAudit(user: DemoUser, audit: AuditAccessTarget): boolean {
  const auditModule = modelModule(audit.modelId);
  if (!canAccessWorkModule(user, audit.workId, auditModule)) return false;
  if (audit.status === "Publicada") return canReadOperationalDocuments(user, audit.workId, auditModule);
  if (user.role === "engineering") return user.activity === "site-team" && audit.status === "Em discussão com a obra";
  return (user.role === "quality-auditor" || user.role === "safety-auditor") && user.id === audit.auditorId;
}

export function canReadTechnicalWeights(user: DemoUser, module: AppModule): boolean {
  return user.role !== "engineering" && canAccessModule(user, module);
}

export function canReadOperationalDocuments(user: DemoUser, workId: string, module: AppModule): boolean {
  if (!canAccessWorkModule(user, workId, module)) return false;
  return user.role !== "administrative" || user.documentWorkIds.includes(workId);
}

/** P08 continua pendente; D01 não concede edição da reunião/ata do comitê. */
export function canEditCommitteeSchedule(user: DemoUser): boolean {
  void user;
  return false;
}

export interface Visit {
  id: string;
  workId: string;
  module: AppModule;
  kind: "audit" | "follow_up";
  modelId: AuditModelId | null;
  auditorId: string;
  date: string;
  note: string;
  createdBy: string;
  createdAt: string;
  /** Persisted agenda records carry these fields; legacy preview fixtures do not. */
  revision?: number;
  confirmationStatus?: "pending_confirmation" | "confirmed";
  confirmedAt?: string | null;
  auditorName?: string;
  createdByName?: string;
  history: readonly { previousDate: string; date: string; note: string; changedBy: string; changedAt: string }[];
}

export type VisitInput = Pick<Visit, "workId" | "module" | "kind" | "modelId" | "auditorId" | "date" | "note">;

export const initialVisits: readonly Visit[] = [
  { id: "VISITA-TESTE-001", workId: "horizonte", module: "safety", kind: "audit", modelId: "security-it07-r02", auditorId: "auditor-safety", date: "2026-09-15", note: "Visita demonstrativa de Segurança.", createdBy: "administrative", createdAt: "2026-09-12T12:00:00.000Z", history: [] },
  { id: "VISITA-TESTE-002", workId: "jardim-norte", module: "quality", kind: "audit", modelId: "quality-f175", auditorId: "auditor-quality", date: "2026-09-16", note: "Visita demonstrativa de Qualidade.", createdBy: "administrative", createdAt: "2026-09-12T12:00:00.000Z", history: [] },
];

export function canReadVisit(user: DemoUser, visit: Visit): boolean {
  if ((visit.kind !== "audit" && visit.kind !== "follow_up")
    || (visit.kind === "audit" && (!visit.modelId || modelModule(visit.modelId) !== visit.module))
    || (visit.kind === "follow_up" && visit.modelId !== null)
    || !canConsultAgenda(user, visit.workId, visit.module)) return false;
  return (user.role !== "quality-auditor" && user.role !== "safety-auditor") || visit.auditorId === user.id;
}

function validateDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) < 1) throw new Error("Informe uma data válida no formato AAAA-MM-DD.");
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("A data informada não existe no calendário.");
}

function validateNote(note: string): void {
  if (typeof note !== "string" || note.length > 2000) throw new Error("A observação deve conter até 2.000 caracteres.");
}

function validateTimestamp(now: string): void {
  if (typeof now !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(now) || !Number.isFinite(Date.parse(now))) {
    throw new Error("Informe data e horário válidos para registrar a autoria.");
  }
}

function assertAgendaAccess(user: DemoUser, workId: string, module: AppModule): void {
  if (!canManageAgenda(user)) throw new Error("Somente o Administrativo pode agendar visitas.");
  if (!canAccessWorkModule(user, workId, module)) throw new Error("Obra ou módulo não autorizado para este Administrativo.");
}

export function createVisit(user: DemoUser, input: VisitInput, users: readonly DemoUser[], workIds: readonly string[], meta: { id: string; now: string }): Visit {
  assertAgendaAccess(user, input.workId, input.module);
  if (!workIds.includes(input.workId)) throw new Error("A obra informada não está cadastrada.");
  if (input.kind === "audit" ? !input.modelId || modelModule(input.modelId) !== input.module : input.kind !== "follow_up" || input.modelId !== null) {
    throw new Error("O roteiro da auditoria deve pertencer à disciplina; acompanhamento não usa roteiro.");
  }
  const auditor = users.find((entry) => entry.id === input.auditorId);
  if (!auditor || (input.kind === "audit" ? !input.modelId || !canStartAudit(auditor, input.workId, input.modelId)
    : !["quality-auditor", "safety-auditor"].includes(auditor.role) || !canAccessWorkModule(auditor, input.workId, input.module))) {
    throw new Error("Selecione um profissional autorizado para a disciplina e a obra.");
  }
  validateDate(input.date);
  validateNote(input.note);
  validateTimestamp(meta.now);
  if (typeof meta.id !== "string" || !meta.id.trim()) throw new Error("A visita precisa de uma identificação.");
  return {
    id: meta.id, workId: input.workId, module: input.module, kind: input.kind, modelId: input.modelId, auditorId: input.auditorId,
    date: input.date, note: input.note, createdBy: user.id, createdAt: meta.now, history: [],
  };
}
