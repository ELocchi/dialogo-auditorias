import type { AuditModelId, AuditRecord } from "../../domain/operational-records.ts";
import type { AppModule } from "../../domain/prototype-access.ts";
import type { PublishedAuditFinding } from "./contracts.ts";

export type AuditHistoryQuery = {
  page?: number;
  pageSize?: number;
  workId?: string;
  module?: AppModule;
  modelId?: AuditModelId;
  dateFrom?: string;
  dateTo?: string;
  auditId?: string;
  excludeAuditId?: string;
  onlyWithFindings?: boolean;
  includeFindings?: boolean;
};
export type ResolvedAuditHistoryQuery = AuditHistoryQuery & {
  page: number; pageSize: number; onlyWithFindings: boolean; includeFindings: boolean;
};
export type AuditHistorySnapshot = {
  available: boolean;
  total: number;
  page: number;
  pageSize: number;
  audits: AuditRecord[];
  findings: PublishedAuditFinding[];
};

export const unavailableAuditHistory = (query: Pick<AuditHistoryQuery, "page" | "pageSize"> = {}): AuditHistorySnapshot => ({
  available: false, total: 0, page: query.page ?? 1, pageSize: query.pageSize ?? 10, audits: [], findings: [],
});

/** Shared request validation without server or catalog dependencies. */
export function normalizeAuditHistoryQuery(value: unknown): ResolvedAuditHistoryQuery | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const integer = (input: unknown, fallback: number, max: number) => {
    const number = input === undefined ? fallback : typeof input === "string" && /^[1-9]\d*$/.test(input) ? Number(input) : input;
    return typeof number === "number" && Number.isInteger(number) && number >= 1 && number <= max ? number : null;
  };
  const boolean = (input: unknown, fallback: boolean) => input === undefined ? fallback
    : input === true || input === "true" ? true : input === false || input === "false" ? false : null;
  const page = integer(raw.page, 1, 2_147_483_647);
  const pageSize = integer(raw.pageSize, 10, 50);
  const onlyWithFindings = boolean(raw.onlyWithFindings, false);
  const includeFindings = boolean(raw.includeFindings, true);
  if (page === null || pageSize === null || onlyWithFindings === null || includeFindings === null) return null;
  const query: ResolvedAuditHistoryQuery = { page, pageSize, onlyWithFindings, includeFindings };
  for (const field of ["workId", "auditId", "excludeAuditId"] as const) {
    if (raw[field] === undefined) continue;
    if (typeof raw[field] !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw[field])) return null;
    query[field] = raw[field].toLowerCase();
  }
  if (raw.module !== undefined) {
    if (raw.module !== "safety" && raw.module !== "quality") return null;
    query.module = raw.module;
  }
  if (raw.modelId !== undefined) {
    if (raw.modelId !== "security-it07-r02" && raw.modelId !== "quality-f175" && raw.modelId !== "quality-f176") return null;
    query.modelId = raw.modelId;
  }
  for (const field of ["dateFrom", "dateTo"] as const) {
    const date = raw[field];
    if (date === undefined) continue;
    if (typeof date !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(Date.parse(`${date}T12:00:00Z`))
      || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) return null;
    query[field] = date;
  }
  if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) return null;
  return query;
}
