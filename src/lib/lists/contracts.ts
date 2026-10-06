import { isCalendarDate } from "../../domain/visit-calendar.ts";
import { uuidPattern } from "../access/validation.ts";

export const listSizes = [10, 20, 50] as const;
export type ListKind = "reports" | "standalone-reports" | "findings" | "work-findings";
export type ListCursor = { at: string; key: string };
export type ListQuery = { kind: ListKind; visitId?: string; size: number; workId: string; module: "quality" | "safety" | ""; search: string; cursor: ListCursor | null };
export type ListItem = { key: string; at: string; id: string; workId: string; module: "quality" | "safety"; workName: string;
  visitId?: string; date?: string; title?: string; auditorName?: string; source?: "work" | "report" | "saved";
  location?: string; description?: string; correction?: string; serious?: boolean; photoFileName?: string; createdAt?: string };
export type ListPage = { available: boolean; items: ListItem[]; hasMore: boolean; nextCursor: ListCursor | null };
export const unavailableList = (): ListPage => ({ available: false, items: [], hasMore: false, nextCursor: null });
export const isListCursor = (v: unknown): v is ListCursor => {
  if (!v || typeof v !== "object") return false;
  const c = v as ListCursor;
  return typeof c.at === "string" && c.at.length <= 40 && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(c.at) && Number.isFinite(Date.parse(c.at))
    && typeof c.key === "string" && /^(?:work|visit|scheduled|standalone):[0-9a-f:-]{36,73}$/.test(c.key);
};
export function parseListQuery(params: URLSearchParams, kind: ListKind): ListQuery | null {
  const size = Number(params.get("size") ?? 20), workId = params.get("workId") ?? "", discipline = params.get("module") ?? "";
  const visitId = params.get("visitId") ?? "";
  if (visitId && !uuidPattern.test(visitId)) return null;
  const search = (params.get("search") ?? "").trim();
  if (!(listSizes as readonly number[]).includes(size) || (workId && !uuidPattern.test(workId))
    || !["", "quality", "safety"].includes(discipline) || search.length > 120 || search.includes("\0")) return null;
  let cursor: ListCursor | null = null;
  if (params.has("cursor")) {
    try { const raw = params.get("cursor")!; if (raw.length > 250) return null; cursor = JSON.parse(raw); } catch { return null; }
    if (!isListCursor(cursor)) return null;
  }
  return { kind, ...(visitId ? { visitId: visitId.toLowerCase() } : {}), size, workId: workId.toLowerCase(), module: discipline as ListQuery["module"], search, cursor };
}
export function isListPage(value: unknown): value is ListPage {
  if (!value || typeof value !== "object") return false;
  const p = value as ListPage;
  if (p.available !== true || !Array.isArray(p.items) || p.items.length > 50 || typeof p.hasMore !== "boolean"
    || (p.hasMore ? !isListCursor(p.nextCursor) || !p.items.length : p.nextCursor !== null)) return false;
  const keys = new Set<string>();
  for (const item of p.items) {
    if (!item || !isListCursor(item) || !uuidPattern.test(item.id) || !uuidPattern.test(item.workId)
      || !["quality", "safety"].includes(item.module) || typeof item.workName !== "string" || keys.has(item.key)) return false;
    if (item.title !== undefined) {
      if (typeof item.title !== "string" || typeof item.date !== "string" || !isCalendarDate(item.date) || typeof item.auditorName !== "string") return false;
    } else if (![item.description, item.location, item.correction].every(x => typeof x === "string") || typeof item.serious !== "boolean"
      || !["work", "report", "saved"].includes(item.source ?? "")) return false;
    if (item.source === "work" && (item.key !== `work:${item.id}` || typeof item.photoFileName !== "string"
      || item.photoFileName.includes("/") || item.photoFileName.length > 200 || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt)))) return false;
    if ((item.source === "saved" || item.source === "report") && (!item.visitId || typeof item.date !== "string" || !isCalendarDate(item.date))) return false;
    if (item.visitId !== undefined && !uuidPattern.test(item.visitId)) return false;
    keys.add(item.key);
  }
  const last = p.items.at(-1);
  return !p.hasMore || (p.nextCursor?.at === last?.at && p.nextCursor?.key === last?.key);
}
