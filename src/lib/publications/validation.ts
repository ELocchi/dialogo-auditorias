import { safetyScore, validateSafetyClosure } from "../../domain/safety-audit.ts";
import type { AuditDrafts, DraftAnswer, ItemResponse } from "../../domain/audit-draft.ts";
import { calculateAuditFinalScore } from "../../domain/audit-draft.ts";
import type { Criterion } from "../../domain/catalogs.ts";
import type { ActionPlanFinding, ActionPlanRow } from "../pdf/types.ts";
import type { AuditDraftRecord } from "./contracts.ts";

export class PublicationError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
const invalid = (message = "Confira os dados do rascunho."): never => { throw new PublicationError(message); };
export const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max && !v.includes("\0");
const photos = (v: unknown): string[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 12 || v.some(x => !text(x, 500) || !x.length) || new Set(v).size !== v.length) return invalid("Confira as fotos anexadas.");
  return v;
};
export function normalizeResponses(value: unknown, draft: Pick<AuditDraftRecord, "model_id" | "criteria" | "fvs_services">, complete = false): AuditDrafts {
  if (!record(value) || Object.keys(value).some(k => k !== draft.model_id)) return invalid();
  const input = value[draft.model_id] ?? {};
  if (!record(input) || Object.keys(input).some(k => !draft.criteria.some(c => c.id === k))) return invalid();
  const result: Record<string, ItemResponse> = Object.create(null);
  for (const criterion of draft.criteria) {
    const raw = input[criterion.id];
    if (raw === undefined && !complete) continue;
    if (!record(raw) || !text(raw.note, 10000) || (raw.serious !== undefined && typeof raw.serious !== "boolean")) return invalid(`Confira o item ${criterion.code}.`);
    const quantitative = criterion.verificationRule === "Dividido pela quantidade verificada";
    const allowsNA = draft.model_id === "security-it07-r02" || criterion.verificationRule === "Conforme/Não Conforme/Não Aplicável" || criterion.sourceNote?.toLowerCase().includes("não aplic");
    const answers = draft.model_id === "security-it07-r02" ? ["0", "5", "10", "N/A"] : ["Conforme", "Não conforme", ...(allowsNA ? ["N/A"] : [])];
    if (raw.answer !== undefined && (typeof raw.answer !== "string" || !answers.includes(raw.answer))) return invalid(`Resposta inválida no item ${criterion.code}.`);
    const response: ItemResponse = { note: raw.note, ...(raw.autoGroupNA === true && raw.answer === "N/A" ? { autoGroupNA: true } : {}), serious: raw.serious === true, photos: photos(raw.photos),
      ...(raw.answer !== undefined ? { answer: raw.answer as DraftAnswer } : {}) };
    if (quantitative) {
      // Quantitative items are always determined by checks, never by a forged N/A.
      delete response.answer;
      if (raw.checks !== undefined && !Array.isArray(raw.checks)) return invalid();
      const checks = (raw.checks ?? []) as unknown[];
      if (checks.length > 150) return invalid("Limite de verificações excedido.");
      const ids = new Set<string>();
      response.checks = checks.map(check => {
        if (!record(check) || !text(check.id, 200) || !check.id || ids.has(check.id) || !text(check.label, 500)
          || ![true, false, null].includes(check.compliant as boolean | null) || (check.note !== undefined && !text(check.note, 10000))) return invalid();
        ids.add(check.id);
        const isFvs = /\bfvs\b/i.test(`${criterion.title} ${criterion.text}`);
        const service = draft.fvs_services.find(s => s.label === check.label);
        if (complete && (!check.label.trim() || check.compliant === null || (isFvs && !service))) return invalid(`Conclua as verificações do item ${criterion.code}.`);
        const evidence = photos(check.photos);
        if (complete && check.compliant === false && !evidence.length) return invalid(`Adicione as evidências do item ${criterion.code}.`);
        return { id: check.id, label: check.label, compliant: check.compliant as boolean | null, note: (check.note ?? "") as string,
          photos: evidence, ...(isFvs && service ? { weight: service.weight } : { weight: 1 }) };
      });
      if (complete && !response.checks.length) return invalid(`Conclua as verificações do item ${criterion.code}.`);
    } else {
      if (Array.isArray(raw.checks) && raw.checks.length) return invalid();
      if (complete && response.answer === undefined) return invalid(`Responda o item ${criterion.code}.`);
      if (complete && ["0", "5", "Não conforme"].includes(response.answer ?? "") && !response.photos?.length) return invalid(`Adicione uma foto ao item ${criterion.code}.`);
    }
    result[criterion.id] = response;
  }
  return { [draft.model_id]: result };
}
export function publicationScore(draft: Pick<AuditDraftRecord, "model_id" | "criteria" | "fvs_services" | "responses" | "safety_closure" | "audit_date">): number | null {
  const responses = normalizeResponses(draft.responses, draft, true);
  if (draft.model_id === "security-it07-r02") {
    try { const closure = validateSafetyClosure(draft.safety_closure, draft.audit_date); return safetyScore(draft.criteria, responses, draft.model_id, closure).final; }
    catch (error) { return invalid((error as Error).message); }
  }
  const score = calculateAuditFinalScore(draft.criteria, responses, draft.model_id);
  if (score === null || !Number.isFinite(score) || score < 0 || score > 10.00001) return invalid("Não foi possível calcular a nota com o roteiro desta auditoria.");
  // Match the existing report formatter exactly, including binary rounding boundaries.
  return Number(score.toFixed(2));
}
export function mapPhotos(drafts: AuditDrafts, resolve: (reference: string) => string): AuditDrafts {
  return Object.fromEntries(Object.entries(drafts).map(([model, responses]) => [model, Object.fromEntries(Object.entries(responses).map(([id, r]) => [id,
    { ...r, photos: (r.photos ?? []).map(resolve), ...(r.checks ? { checks: r.checks.map(c => ({ ...c, photos: (c.photos ?? []).map(resolve) })) } : {}) }]))]));
}
export function extractPublicationFindings(criteria: Criterion[], responses: Record<string, ItemResponse>): ActionPlanFinding[] {
  const evidence = (refs?: string[]) => (refs ?? []).map(name => ({ name }));
  return criteria.flatMap(c => {
    const r = responses[c.id]; if (!r) return [];
    const base = { item: c.code, criterionTitle: c.title || c.text, itemDescription: c.text,
      verificationCriterion: c.verificationRule, serious: r.serious === true };
    const checks = (r.checks ?? []).filter(x => x.compliant === false).map(x => ({ ...base, id: `${c.id}:${x.id}`,
      description: `${c.title || c.text} — ${x.label}`, subitem: x.label, status: "Não conforme",
      nonconformity: x.note?.trim() || `Verificação “${x.label}” registrada como não conforme.`, evidencePhotos: evidence(x.photos) }));
    if (checks.length) return checks;
    const note = r.note.trim();
    return ["0", "5", "Não conforme"].includes(r.answer ?? "") || Boolean(note && !/^aprovado\.?$/i.test(note)) || r.serious
      ? [{ ...base, id: c.id, description: c.title || c.text, status: r.answer ?? "Com apontamento", nonconformity: note || c.text, evidencePhotos: evidence(r.photos) }] : [];
  });
}
const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
export function normalizePlanRows(input: unknown, findings: readonly ActionPlanFinding[], complete = false): ActionPlanRow[] {
  if (!Array.isArray(input) || input.length !== findings.length || new Set(input.map(r => record(r) && r.id)).size !== input.length) return invalid("O plano deve conter todos os apontamentos da auditoria.");
  if (complete && !findings.length) return invalid("A auditoria não tem apontamentos para um plano de ação.");
  return findings.map(f => {
    const raw = input.find(r => record(r) && r.id === f.id);
    if (!record(raw) || !text(raw.correctiveAction, 10000) || !text(raw.responsible, 500) || !text(raw.startDate, 10) || !text(raw.dueDate, 10)) return invalid();
    if (complete && (!raw.correctiveAction.trim() || !raw.responsible.trim() || !raw.startDate || !raw.dueDate)) return invalid("Preencha a ação, o responsável e as datas de todos os apontamentos.");
    if ((raw.startDate && !validDate(raw.startDate)) || (raw.dueDate && !validDate(raw.dueDate)) || (raw.startDate && raw.dueDate && raw.dueDate < raw.startDate)) return invalid("A data final deve ser igual ou posterior à data de início.");
    // Source descriptions, IDs, photos and severity always come from the immutable audit.
    return { ...f, correctiveAction: raw.correctiveAction, responsible: raw.responsible, startDate: raw.startDate, dueDate: raw.dueDate };
  });
}
