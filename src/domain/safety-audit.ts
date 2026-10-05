import { calculateSecurityFinalScore, type AuditDrafts } from "./audit-draft.ts";
import type { Criterion } from "./catalogs.ts";

export type SafetyAccident = { date: string; type: "common" | "leave"; event: string; justification: string };
export type SafetyClosure = { hadAccidents: boolean; accidents: SafetyAccident[] };
export function validateSafetyClosure(value: unknown, auditDate: string): SafetyClosure {
  if (!value || typeof value !== "object") throw new Error("Informe se houve acidente antes de fechar a auditoria.");
  const raw = value as SafetyClosure;
  if (typeof raw.hadAccidents !== "boolean" || !Array.isArray(raw.accidents) || raw.accidents.length > 100
    || (raw.hadAccidents ? raw.accidents.length === 0 : raw.accidents.length !== 0)) throw new Error("Confira a declaração de acidentes.");
  return { hadAccidents: raw.hadAccidents, accidents: raw.accidents.map((entry) => {
    if (!entry || typeof entry !== "object" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
      || !Number.isFinite(Date.parse(entry.date)) || new Date(entry.date).toISOString().slice(0, 10) !== entry.date
      || entry.date.slice(0, 7) !== auditDate.slice(0, 7)) throw new Error("A data do acidente deve estar no mês da auditoria.");
    if (!["common", "leave"].includes(entry.type)) throw new Error("Selecione o tipo do acidente.");
    for (const key of ["event", "justification"] as const) {
      if (typeof entry[key] !== "string" || !entry[key].trim() || entry[key].length > 10000 || entry[key].includes("\0")) throw new Error("Preencha acontecimento e justificativa de cada acidente.");
    }
    return { date: entry.date, type: entry.type, event: entry.event.trim(), justification: entry.justification.trim() };
  }) };
}
export function safetyScore(criteria: Criterion[], drafts: AuditDrafts, model: string, closure?: SafetyClosure | null) {
  const raw = calculateSecurityFinalScore(criteria, drafts, model);
  const penalty = closure?.accidents.reduce((sum, a) => sum + (a.type === "leave" ? 2 : 1), 0) ?? 0;
  return { raw, penalty, final: raw === null ? null : Math.round((Math.max(0, raw - penalty) + 1e-12) * 100) / 100 };
}

/** Only blank answers are changed. A marker records exactly which answers can be restored. */
export function toggleGroupNA(drafts: AuditDrafts, model: string, criteria: Criterion[], group: string): AuditDrafts {
  const items = criteria.filter(c => c.group === group);
  const responses = { ...drafts[model] };
  const restoring = items.some(c => responses[c.id]?.autoGroupNA);
  for (const c of items) {
    const r = responses[c.id] ?? { note: "" };
    if (restoring && r.autoGroupNA) {
      const restored = { ...r }; delete restored.autoGroupNA; delete restored.answer;
      responses[c.id] = restored;
    } else if (!restoring && r.answer === undefined) responses[c.id] = { ...r, answer: "N/A", autoGroupNA: true };
  }
  return { ...drafts, [model]: responses };
}
export function reactivateGroupAfterAnswer(drafts: AuditDrafts, model: string, criteria: Criterion[], group: string): AuditDrafts {
  const responses = { ...drafts[model] };
  for (const c of criteria.filter(c => c.group === group)) {
    if (responses[c.id]?.autoGroupNA) { const r = { ...responses[c.id] }; delete r.autoGroupNA; responses[c.id] = r; }
  }
  return { ...drafts, [model]: responses };
}
