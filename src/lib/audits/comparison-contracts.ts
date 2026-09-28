import type { AuditModelId } from "../../domain/operational-records.ts";

/** Only the fields used by the previous-audit verification marks. */
export type AuditComparison = {
  id: string;
  workId: string;
  modelId: AuditModelId;
  date: string;
  answers: Record<string, string>;
};

export type AuditComparisonSnapshot = {
  available: boolean;
  audits: AuditComparison[];
};

export const unavailableAuditComparison = (): AuditComparisonSnapshot => ({ available: false, audits: [] });

export function parseComparisonAuditIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3
    || value.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return null;
  const ids = (value as string[]).map((id) => id.toLowerCase());
  return new Set(ids).size === ids.length ? ids : null;
}
