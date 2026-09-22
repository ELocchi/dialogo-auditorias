import { securityCriteria, qualityModels, type Criterion } from "./catalogs.ts";
import { calculateAuditFinalScore, updateItemResponse, type AuditDrafts, type ItemResponse } from "./audit-draft.ts";
import { canBeginScheduledAudit, canStartAudit, canEditAudit, type DemoUser, type Visit } from "./prototype-access.ts";
import type { AuditRecord, AuditModelId, WorkRecord } from "./operational-records";

export interface PrototypeAuditState {
  audits: readonly AuditRecord[];
  responses: Record<string, AuditDrafts>;
  criteriaSnapshots?: Record<string, Criterion[]>;
}

export function criteriaForModel(modelId: AuditModelId): Criterion[] {
  if (modelId === "security-it07-r02") return securityCriteria;
  return qualityModels.find((model) => model.id === (modelId === "quality-f175" ? "F175" : "F176"))?.criteria ?? [];
}

export function criteriaForAudit(state: PrototypeAuditState, audit: AuditRecord): Criterion[] {
  return state.criteriaSnapshots?.[audit.id] ?? criteriaForModel(audit.modelId);
}

export function modelDisplayName(modelId: AuditModelId): string {
  if (modelId === "security-it07-r02") return "Segurança — IT.07 rev. 02";
  return qualityModels.find((model) => model.id === (modelId === "quality-f175" ? "F175" : "F176"))?.name ?? "Modelo indisponível";
}

type LocalAuditInput = { id: string; work: WorkRecord; modelId: AuditModelId; date: string; visit?: Visit;
  catalogRevision?: { id: string | null; version: number; label: string; criteria: Criterion[] } };

export function beginPrototypeAudit(state: PrototypeAuditState, user: DemoUser, input: LocalAuditInput) {
  return beginLocalAudit(state, user, input, false);
}

/** A temporary screen preview only: never persists or represents an official audit. */
export function beginWorkspacePreviewAudit(state: PrototypeAuditState, user: DemoUser, input: LocalAuditInput) {
  if (!user.workModuleScopes) throw new Error("O perfil e a obra precisam de um contexto autorizado.");
  return beginLocalAudit(state, user, input, true);
}

export function beginScheduledVisitAudit(state: PrototypeAuditState, user: DemoUser,
  input: { id: string; work: WorkRecord; visit: Visit; catalogRevision?: LocalAuditInput["catalogRevision"] }, today: string) {
  if (!canBeginScheduledAudit(user, input.visit, today) || !input.visit.modelId)
    throw new Error("Esta auditoria só pode ser iniciada pelo responsável na data confirmada.");
  return beginWorkspacePreviewAudit(state, user, {
    ...input, modelId: input.visit.modelId, date: input.visit.date,
  });
}

function beginLocalAudit(state: PrototypeAuditState, user: DemoUser, input: LocalAuditInput, registeredWorkPreview: boolean): { state: PrototypeAuditState; auditId: string } {
  if ((!input.work.isDemo && !registeredWorkPreview) || !canStartAudit(user, input.work.id, input.modelId)) throw new Error("Este perfil não pode iniciar essa auditoria.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(`${input.date}T12:00:00Z`)) || new Date(`${input.date}T12:00:00Z`).toISOString().slice(0, 10) !== input.date) throw new Error("Informe uma data válida para a inspeção.");
  if (input.visit) {
    if (input.visit.kind !== "audit" || input.visit.auditorId !== user.id
      || input.visit.workId !== input.work.id || input.visit.modelId !== input.modelId || input.visit.date !== input.date) throw new Error("A visita não é uma auditoria ou pertence a outro responsável ou contexto.");
    const existing = state.audits.find((audit) => audit.visitId === input.visit!.id);
    if (existing) {
      if (!canEditAudit(user, existing)) throw new Error("A auditoria desta visita não está disponível para edição.");
      return { state, auditId: existing.id };
    }
  }
  if (!input.id || state.audits.some((audit) => audit.id === input.id)) throw new Error("Identificação da auditoria já utilizada.");
  const revision = input.catalogRevision;
  const snapshot = structuredClone(revision?.criteria ?? criteriaForModel(input.modelId));
  if (!snapshot.length || new Set(snapshot.map((item) => item.id)).size !== snapshot.length) throw new Error("Roteiro indisponível para iniciar a auditoria.");
  const audit: AuditRecord = { catalogRevisionId: revision?.id ?? null, catalogVersion: revision?.version ?? 0, catalogRevisionLabel: revision?.label ?? (input.modelId === "security-it07-r02" ? "02" : "00"), id: input.id, workId: input.work.id, modelId: input.modelId, date: input.date, auditor: user.name, auditorId: user.id, status: "Em preenchimento", collectionStatus: "Em preenchimento", calculationStatus: "Aguardando configuração", finalScore: null, isDemo: true, ...(input.visit ? { visitId: input.visit.id } : {}) };
  return { state: { ...state, audits: [...state.audits, audit], responses: { ...state.responses, [audit.id]: {} }, criteriaSnapshots: { ...state.criteriaSnapshots, [audit.id]: snapshot } }, auditId: audit.id };
}

export function updatePrototypeResponse(state: PrototypeAuditState, user: DemoUser, auditId: string, criterion: Criterion, response: ItemResponse): PrototypeAuditState {
  const audit = state.audits.find((entry) => entry.id === auditId);
  if (!audit || !canEditAudit(user, audit)) throw new Error("Sem permissão para editar esta auditoria.");
  const pinnedCriterion = criteriaForAudit(state, audit).find((entry) => entry.id === criterion.id);
  if (!pinnedCriterion) throw new Error("O item não pertence à versão desta auditoria.");
  const allowsNotApplicable = pinnedCriterion.verificationRule === "Conforme/Não Conforme/Não Aplicável" || pinnedCriterion.sourceNote?.toLocaleLowerCase("pt-BR").includes("não aplic");
  const allowedAnswers = audit.modelId === "security-it07-r02" ? ["0", "5", "10", "N/A"] : allowsNotApplicable ? ["Não conforme", "Conforme", "N/A"] : ["Não conforme", "Conforme"];
  if (response.answer !== undefined && !allowedAnswers.includes(response.answer)) throw new Error("Resposta incompatível com o modelo.");
  return { ...state, responses: { ...state.responses, [audit.id]: updateItemResponse(state.responses[audit.id] ?? {}, audit.modelId, pinnedCriterion, response) } };
}

export function validatePrototypeAuditCompletion(state: PrototypeAuditState, user: DemoUser, auditId: string): void {
  const audit = state.audits.find((entry) => entry.id === auditId);
  if (!audit || !canEditAudit(user, audit)) throw new Error("Sem permissão para fechar esta auditoria.");
  const responses = state.responses[audit.id]?.[audit.modelId] ?? {};
  for (const criterion of criteriaForAudit(state, audit)) {
    const response = responses[criterion.id];
    if (!response) throw new Error(`Responda o item ${criterion.code} antes de fechar o relatório.`);
    if (criterion.verificationRule === "Dividido pela quantidade verificada") {
      if (!response.checks?.length || response.checks.some((check) => check.compliant === null)) throw new Error(`Conclua as verificações do item ${criterion.code}.`);
      if (response.checks.some((check) => check.compliant === false && !check.photos?.length)) throw new Error(`Adicione uma foto em cada verificação não conforme do item ${criterion.code}.`);
    } else {
      if (response.answer === undefined) throw new Error(`Responda o item ${criterion.code} antes de fechar o relatório.`);
      if ((response.answer === "Não conforme" || response.answer === "0" || response.answer === "5") && !response.photos?.length) throw new Error(`Adicione uma foto ao item não conforme ${criterion.code}.`);
    }
  }
}

export function completePrototypeAudit(state: PrototypeAuditState, user: DemoUser, auditId: string): PrototypeAuditState {
  validatePrototypeAuditCompletion(state, user, auditId);
  const audit = state.audits.find((entry) => entry.id === auditId)!;
  const finalScore = calculateAuditFinalScore(criteriaForAudit(state, audit), state.responses[audit.id] ?? {}, audit.modelId);
  if (finalScore === null) throw new Error("Não foi possível calcular a nota final desta auditoria.");
  return {
    ...state,
    audits: state.audits.map((entry) => entry.id === auditId ? { ...entry, status: "Publicada", collectionStatus: "Coleta concluída", calculationStatus: "Disponível", finalScore } : entry),
  };
}

export function updatePrototypeAuditDate(state: PrototypeAuditState, user: DemoUser, auditId: string, date: string): PrototypeAuditState {
  const audit = state.audits.find((entry) => entry.id === auditId);
  if (!audit || !canEditAudit(user, audit)) throw new Error("Sem permissão para editar esta auditoria.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("Informe uma data válida para a inspeção.");
  return { ...state, audits: state.audits.map((entry) => entry.id === auditId ? { ...entry, date } : entry) };
}
