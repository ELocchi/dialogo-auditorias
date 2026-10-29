import type { ItemResponse } from "./audit-draft.ts";

// Chamado de alteração de auditoria publicada (decisão de 29/10/2026): o auditor
// pede, o Administrativo da disciplina aceita ou recusa e, ao aceitar, edita
// somente as observações do item pedido e publica novamente.

export type AuditChangeStatus = "pending" | "accepted" | "refused" | "republished";

export type AuditChangeRequest = {
  id: string;
  auditId: string;
  workId: string;
  workName: string;
  auditDate: string;
  module: "safety" | "quality";
  criterionId: string;
  criterionCode: string;
  criterionTitle: string;
  reason: string;
  status: AuditChangeStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  refusalReason: string | null;
  republishedBy: string | null;
  republishedAt: string | null;
  previousContentRevision: number | null;
  revision: number;
};

export type AuditChangeItem = { id: string; code: string; title: string };

/** What the Administrativo edits after accepting: the item note and, when quantitative, each verified check note. */
export type AuditChangeEditableItem = {
  criterionId: string;
  code: string;
  title: string;
  note: string;
  checks: { id: string; label: string; note: string }[];
};

export const auditChangeStatusLabels: Record<AuditChangeStatus, string> = {
  pending: "Aguardando o Administrativo",
  accepted: "Aceito · aguardando nova publicação",
  refused: "Recusado",
  republished: "Auditoria publicada novamente",
};

export const changeReasonLimits = { min: 5, max: 2000 } as const;
export const changeNoteLimit = 2000;

export function validChangeText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= changeReasonLimits.min
    && value.trim().length <= changeReasonLimits.max && !value.includes("\0");
}

const statuses: readonly AuditChangeStatus[] = ["pending", "accepted", "refused", "republished"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const optionalText = (value: unknown, max: number) => value === null || text(value, max);

/** Strict parse of one row from the read/decide/request RPCs. */
export function parseAuditChangeRequest(raw: unknown): AuditChangeRequest | null {
  if (!isRecord(raw) || !text(raw.id, 36) || !uuid.test(raw.id) || !text(raw.auditId, 36) || !uuid.test(raw.auditId)
    || !text(raw.workId, 36) || !uuid.test(raw.workId) || !text(raw.workName, 200) || !text(raw.auditDate, 10)
    || !/^\d{4}-\d{2}-\d{2}$/.test(raw.auditDate) || (raw.module !== "safety" && raw.module !== "quality")
    || !text(raw.criterionId, 200) || !text(raw.criterionCode, 80) || !text(raw.criterionTitle, 1000)
    || !text(raw.reason, 2000) || !statuses.includes(raw.status as AuditChangeStatus) || !text(raw.requestedBy, 200)
    || !text(raw.requestedAt, 40) || !optionalText(raw.decidedBy, 200) || !optionalText(raw.decidedAt, 40)
    || !optionalText(raw.refusalReason, 2000) || !optionalText(raw.republishedBy, 200) || !optionalText(raw.republishedAt, 40)
    || !(raw.previousContentRevision === null || (Number.isSafeInteger(raw.previousContentRevision) && (raw.previousContentRevision as number) >= 0))
    || !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1) return null;
  return {
    id: raw.id, auditId: raw.auditId, workId: raw.workId, workName: raw.workName, auditDate: raw.auditDate,
    module: raw.module, criterionId: raw.criterionId, criterionCode: raw.criterionCode, criterionTitle: raw.criterionTitle,
    reason: raw.reason, status: raw.status as AuditChangeStatus, requestedBy: raw.requestedBy, requestedAt: raw.requestedAt,
    decidedBy: raw.decidedBy as string | null, decidedAt: raw.decidedAt as string | null,
    refusalReason: raw.refusalReason as string | null, republishedBy: raw.republishedBy as string | null,
    republishedAt: raw.republishedAt as string | null, previousContentRevision: raw.previousContentRevision as number | null,
    revision: raw.revision as number,
  };
}

export function editableItem(criterion: { id: string; code: string; title?: string; text?: string }, response: ItemResponse | undefined): AuditChangeEditableItem {
  return {
    criterionId: criterion.id, code: criterion.code, title: criterion.title || criterion.text || criterion.code,
    note: response?.note ?? "",
    checks: (response?.checks ?? []).map((check) => ({ id: check.id, label: check.label || "Item verificado", note: check.note ?? "" })),
  };
}

/** New responses with only the item note and its check notes replaced; everything else stays identical. */
export function applyItemNotes(responses: Record<string, ItemResponse>, criterionId: string, note: unknown,
  checkNotes: unknown): Record<string, ItemResponse> {
  const current = responses[criterionId];
  if (!current) throw new RangeError("O item pedido não tem resposta registrada nesta auditoria.");
  if (typeof note !== "string" || note.length > changeNoteLimit || note.includes("\0")) throw new RangeError("Confira a observação do item.");
  const notes = isRecord(checkNotes) ? checkNotes : {};
  const checks = current.checks?.map((check) => {
    const value = notes[check.id];
    if (value === undefined) return check;
    if (typeof value !== "string" || value.length > changeNoteLimit || value.includes("\0")) throw new RangeError("Confira as observações dos itens verificados.");
    return { ...check, note: value.trim() };
  });
  if (Object.keys(notes).some((id) => !current.checks?.some((check) => check.id === id))) throw new RangeError("Item verificado inexistente.");
  return { ...responses, [criterionId]: { ...current, note: note.trim(), ...(checks ? { checks } : {}) } };
}

/** Rebuild the plan draft from the new findings, keeping what the site team already filled for the same finding. */
export function rebuildPlanRows<F extends { id: string }, R extends { id: string; correctiveAction?: unknown; responsible?: unknown; startDate?: unknown; dueDate?: unknown }>(
  findings: readonly F[], previous: readonly R[]) {
  const byId = new Map(previous.map((row) => [row.id, row]));
  const field = (value: unknown) => typeof value === "string" ? value : "";
  return findings.map((finding) => {
    const row = byId.get(finding.id);
    return { ...finding, correctiveAction: field(row?.correctiveAction), responsible: field(row?.responsible),
      startDate: field(row?.startDate), dueDate: field(row?.dueDate) };
  });
}

export type AuditChangeNotice = {
  id: string;
  type: "audit_change_requested" | "audit_change_accepted" | "audit_change_refused" | "audit_change_republished";
  workName: string;
  createdAt: string;
  detail: string;
  href: string;
};

/** Bell notices: the Administrativo sees what to decide or republish; the auditor sees each answer. */
export function auditChangeNotices(requests: readonly AuditChangeRequest[], administrative: boolean): AuditChangeNotice[] {
  const date = (value: string) => value.split("-").reverse().join("/");
  return requests.flatMap((request): AuditChangeNotice[] => {
    const item = `Item ${request.criterionCode} · auditoria de ${date(request.auditDate)}`;
    if (administrative) {
      if (request.status === "pending") return [{ id: `${request.id}:${request.revision}`, type: "audit_change_requested", workName: request.workName,
        createdAt: request.requestedAt, detail: `${item}\n${request.requestedBy}: ${request.reason}`, href: "/app?secao=relatorios" }];
      if (request.status === "accepted" && request.decidedAt) return [{ id: `${request.id}:${request.revision}`, type: "audit_change_accepted", workName: request.workName,
        createdAt: request.decidedAt, detail: `${item}\nEdite a observação e publique novamente.`, href: "/app?secao=relatorios" }];
      return [];
    }
    if (request.status === "accepted" && request.decidedAt) return [{ id: `${request.id}:${request.revision}`, type: "audit_change_accepted", workName: request.workName,
      createdAt: request.decidedAt, detail: `${item}\nAceito por ${request.decidedBy ?? "Administrativo"}.`, href: "/app?secao=auditorias" }];
    if (request.status === "refused" && request.decidedAt) return [{ id: `${request.id}:${request.revision}`, type: "audit_change_refused", workName: request.workName,
      createdAt: request.decidedAt, detail: `${item}\nMotivo: ${request.refusalReason ?? ""}`, href: "/app?secao=auditorias" }];
    if (request.status === "republished" && request.republishedAt) return [{ id: `${request.id}:${request.revision}`, type: "audit_change_republished", workName: request.workName,
      createdAt: request.republishedAt, detail: `${item}\nNovo PDF publicado.`, href: "/app?secao=auditorias" }];
    return [];
  });
}
