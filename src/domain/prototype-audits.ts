import { securityCriteria, qualityModels, type Criterion } from "./catalogs.ts";
import { updateItemResponse, type AuditDrafts, type ItemResponse } from "./audit-draft.ts";
import { canStartAudit, canEditAudit, type DemoUser, type Visit } from "./prototype-access.ts";
import type { AuditRecord, AuditModelId, WorkRecord } from "./operational-records";

export interface PrototypeAuditState {
  audits: readonly AuditRecord[];
  responses: Record<string, AuditDrafts>;
}

export function criteriaForModel(modelId: AuditModelId): Criterion[] {
  if (modelId === "security-it07-r02") return securityCriteria;
  return qualityModels.find((model) => model.id === (modelId === "quality-f175" ? "F175" : "F176"))?.criteria ?? [];
}

export function modelDisplayName(modelId: AuditModelId): string {
  if (modelId === "security-it07-r02") return "Segurança — IT.07 rev. 02";
  return qualityModels.find((model) => model.id === (modelId === "quality-f175" ? "F175" : "F176"))?.name ?? "Modelo indisponível";
}

type LocalAuditInput = { id: string; work: WorkRecord; modelId: AuditModelId; date: string; visit?: Visit };

export function beginPrototypeAudit(state: PrototypeAuditState, user: DemoUser, input: LocalAuditInput) {
  return beginLocalAudit(state, user, input, false);
}

/** A temporary screen preview only: never persists or represents an official audit. */
export function beginWorkspacePreviewAudit(state: PrototypeAuditState, user: DemoUser, input: LocalAuditInput) {
  if (!user.workModuleScopes) throw new Error("O perfil e a obra precisam de um contexto autorizado.");
  return beginLocalAudit(state, user, input, true);
}

function beginLocalAudit(state: PrototypeAuditState, user: DemoUser, input: LocalAuditInput, registeredWorkPreview: boolean): { state: PrototypeAuditState; auditId: string } {
  if ((!input.work.isDemo && !registeredWorkPreview) || !canStartAudit(user, input.work.id, input.modelId)) throw new Error("Este perfil não pode iniciar essa auditoria.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(`${input.date}T12:00:00Z`)) || new Date(`${input.date}T12:00:00Z`).toISOString().slice(0, 10) !== input.date) throw new Error("Informe uma data válida para a inspeção.");
  if (input.visit) {
    if (input.visit.auditorId !== user.id || input.visit.workId !== input.work.id || input.visit.modelId !== input.modelId) throw new Error("A visita pertence a outro responsável ou contexto.");
    const existing = state.audits.find((audit) => audit.visitId === input.visit!.id);
    if (existing) {
      if (!canEditAudit(user, existing)) throw new Error("A auditoria desta visita não está disponível para edição.");
      return { state, auditId: existing.id };
    }
  }
  if (!input.id || state.audits.some((audit) => audit.id === input.id)) throw new Error("Identificação da auditoria já utilizada.");
  const audit: AuditRecord = { id: input.id, workId: input.work.id, modelId: input.modelId, date: input.date, auditor: user.name, auditorId: user.id, status: "Em preenchimento", collectionStatus: "Em preenchimento", calculationStatus: "Aguardando configuração", finalScore: null, isDemo: true, ...(input.visit ? { visitId: input.visit.id } : {}) };
  return { state: { audits: [...state.audits, audit], responses: { ...state.responses, [audit.id]: {} } }, auditId: audit.id };
}

export function updatePrototypeResponse(state: PrototypeAuditState, user: DemoUser, auditId: string, criterion: Criterion, response: ItemResponse): PrototypeAuditState {
  const audit = state.audits.find((entry) => entry.id === auditId);
  if (!audit || !canEditAudit(user, audit)) throw new Error("Sem permissão para editar esta auditoria.");
  if (!criteriaForModel(audit.modelId).some((entry) => entry.id === criterion.id)) throw new Error("O item não pertence à versão desta auditoria.");
  const allowedAnswers = audit.modelId === "security-it07-r02" ? ["0", "5", "10", "N/A"] : ["Não verificado", "Constatação qualitativa"];
  if (response.answer !== undefined && !allowedAnswers.includes(response.answer)) throw new Error("Resposta incompatível com o modelo.");
  return { ...state, responses: { ...state.responses, [audit.id]: updateItemResponse(state.responses[audit.id] ?? {}, audit.modelId, criterion, response) } };
}

export function updatePrototypeAuditDate(state: PrototypeAuditState, user: DemoUser, auditId: string, date: string): PrototypeAuditState {
  const audit = state.audits.find((entry) => entry.id === auditId);
  if (!audit || !canEditAudit(user, audit)) throw new Error("Sem permissão para editar esta auditoria.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("Informe uma data válida para a inspeção.");
  return { ...state, audits: state.audits.map((entry) => entry.id === auditId ? { ...entry, date } : entry) };
}
