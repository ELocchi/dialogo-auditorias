import { requestSignal } from "../request-signal.ts";
import type { AuditRecord } from "../../domain/operational-records.ts";
import type { PublishedAuditFinding } from "./contracts.ts";
import type { AgendaActorContext } from "../agenda/contracts.ts";
import { normalizeAuditHistoryQuery, type AuditHistoryQuery, type AuditHistorySnapshot, type ResolvedAuditHistoryQuery } from "./history-contracts.ts";

export type AuditHistoryState = {
  status: "idle" | "loading" | "ready" | "error";
  snapshot?: AuditHistorySnapshot;
  message?: string;
};
export const idleAuditHistory: AuditHistoryState = { status: "idle" };
const unavailable = "Não foi possível carregar o histórico. Tente novamente.";
const denied = "Seu acesso ao histórico mudou. Atualize a página.";
const maxCachedPages = 12;
const cacheLifetimeMs = 60_000;

/** Canonical keys make equivalent filter objects share the same request. */
export function auditHistoryKey(input: AuditHistoryQuery): string {
  const query = normalizeAuditHistoryQuery(input);
  if (!query) throw new Error("Filtros do histórico inválidos.");
  return JSON.stringify(query);
}

/** One profile owns this bounded metadata cache; full responses never enter it. */
export function createAuditHistoryLoader(actor: AgendaActorContext, fetcher: typeof fetch = fetch, now = Date.now) {
  const states = new Map<string, AuditHistoryState>();
  const pending = new Map<string, { controller: AbortController; promise: Promise<void>; query: ResolvedAuditHistoryQuery; handledBy?: string }>();
  const listeners = new Map<string, Set<() => void>>();
  const accessed = new Map<string, number>();
  const loadedAt = new Map<string, number>();
  let sequence = 0;
  const notify = (key: string) => listeners.get(key)?.forEach((listener) => listener());
  const trim = () => {
    const removable = [...states.keys()].filter((key) => !pending.has(key) && !listeners.get(key)?.size)
      .sort((a, b) => (accessed.get(a) ?? 0) - (accessed.get(b) ?? 0));
    while (states.size > maxCachedPages && removable.length) {
      const key = removable.shift()!;
      states.delete(key); accessed.delete(key); loadedAt.delete(key);
    }
  };
  const publish = (key: string, state: AuditHistoryState) => {
    states.set(key, state); accessed.set(key, ++sequence); trim(); notify(key);
  };
  const abortPage = (key: string) => {
    const request = pending.get(key);
    if (!request) return;
    request.controller.abort(); pending.delete(key);
    const snapshot = states.get(key)?.snapshot;
    if (snapshot) publish(key, { status: "ready", snapshot });
    else { states.delete(key); accessed.delete(key); notify(key); }
  };
  const clear = () => {
    pending.forEach(({ controller }) => controller.abort()); pending.clear();
    states.clear(); accessed.clear(); loadedAt.clear();
    listeners.forEach((_, key) => notify(key));
  };
  const loadPage = (input: AuditHistoryQuery, refresh = false): Promise<void> => {
    const query = normalizeAuditHistoryQuery(input);
    if (!query) return Promise.reject(new Error("Filtros do histórico inválidos."));
    const key = auditHistoryKey(query);
    accessed.set(key, ++sequence);
    const current = states.get(key);
    const existing = pending.get(key);
    if (existing) return existing.promise;
    if (!refresh && current?.status === "ready" && now() - (loadedAt.get(key) ?? 0) < cacheLifetimeMs) return Promise.resolve();
    const controller = new AbortController();
    const parametersFor = (entry: ResolvedAuditHistoryQuery) => {
      const parameters = new URLSearchParams({ usuario: actor.userId, perfil: actor.profile,
        atuacao: actor.engineeringScope ?? "", administrativo: actor.administrativeScope ?? "" });
      for (const [name, value] of Object.entries(entry)) parameters.set(name, String(value));
      return parameters;
    };
    const compatibleCoordinationPair = () => {
      if (actor.profile !== "ENGENHARIA" || actor.engineeringScope !== "COORDENACAO"
        || (query.module !== "quality" && query.module !== "safety")) return undefined;
      const signature = ({ module: _module, ...rest }: ResolvedAuditHistoryQuery) => JSON.stringify(rest);
      return [...pending.entries()].find(([otherKey, request]) => otherKey !== key && !request.handledBy
        && request.query.module !== query.module && (request.query.module === "quality" || request.query.module === "safety")
        && signature(request.query) === signature(query));
    };
    // Schedule the request after registration so synchronous failures and reentrant
    // subscriptions cannot leave a stale promise or duplicate the same page.
    const promise = Promise.resolve().then(async () => {
      const request = pending.get(key);
      if (request?.handledBy) {
        await pending.get(request.handledBy)?.promise;
        return;
      }
      let pairedKey: string | undefined;
      try {
        if (controller.signal.aborted) return;
        const pair = compatibleCoordinationPair();
        if (pair) {
          const [otherKey, otherRequest] = pair;
          pairedKey = otherKey;
          otherRequest.handledBy = key;
          const common = { ...query };
          delete common.module;
          const response = await fetcher(`/api/audits/history/coordination?${parametersFor(common)}`, {
            credentials: "same-origin", cache: "no-store", signal: requestSignal(controller.signal),
          });
          if (controller.signal.aborted) return;
          if (response.status === 401 || response.status === 403) {
            clear();
            publish(key, { status: "error", message: denied });
            publish(otherKey, { status: "error", message: denied });
            return;
          }
          if (!response.ok) throw new Error(unavailable);
          const value: unknown = await response.json();
          if (controller.signal.aborted) return;
          if (!isRecord(value)) throw new Error(unavailable);
          const parsed = ([[key, request], [otherKey, otherRequest]] as const).map(([entryKey, entryRequest]) => {
            if (!entryRequest || entryRequest.controller.signal.aborted) return null;
            const module = entryRequest.query.module;
            const snapshot = module && parseAuditHistoryPage(value[module], entryRequest.query);
            if (!snapshot) throw new Error(unavailable);
            return [entryKey, snapshot] as const;
          });
          for (const entry of parsed) {
            if (!entry) continue;
            const [entryKey, snapshot] = entry;
            loadedAt.set(entryKey, now());
            publish(entryKey, { status: "ready", snapshot });
          }
          return;
        }
        const response = await fetcher(`/api/audits/history?${parametersFor(query)}`, {
          credentials: "same-origin", cache: "no-store", signal: requestSignal(controller.signal),
        });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          clear(); publish(key, { status: "error", message: denied }); return;
        }
        if (!response.ok) throw new Error(unavailable);
        const value: unknown = await response.json();
        if (controller.signal.aborted) return;
        const snapshot = parseAuditHistoryPage(value, query);
        if (!snapshot) throw new Error(unavailable);
        loadedAt.set(key, now());
        publish(key, { status: "ready", snapshot });
      } catch {
        if (!controller.signal.aborted) {
          publish(key, { status: "error", snapshot: current?.snapshot, message: unavailable });
          if (pairedKey) {
            const pairedState = states.get(pairedKey);
            publish(pairedKey, { status: "error", snapshot: pairedState?.snapshot, message: unavailable });
          }
        }
      } finally {
        if (pending.get(key)?.controller === controller) pending.delete(key);
        for (const [otherKey, request] of pending) {
          if (request.handledBy === key) pending.delete(otherKey);
        }
        trim();
      }
    });
    pending.set(key, { controller, promise, query });
    publish(key, { status: "loading", snapshot: current?.snapshot });
    return promise;
  };
  return {
    loadPage,
    getState: (key: string) => states.get(key) ?? idleAuditHistory,
    subscribe: (key: string, listener: () => void) => {
      const subscribers = listeners.get(key) ?? new Set<() => void>();
      subscribers.add(listener); listeners.set(key, subscribers);
      return () => {
        subscribers.delete(listener);
        // React StrictMode immediately subscribes again; only the last actual
        // consumer leaving a page should cancel a shared pending request.
        queueMicrotask(() => {
          if (!listeners.get(key)?.size) { listeners.delete(key); abortPage(key); trim(); }
        });
      };
    },
    cancel: clear,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}
function date(value: unknown): value is string {
  return typeof value === "string" && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

/** Validate the exact page/filter boundary, then discard unrequested fields. */
function parseAuditHistoryPage(value: unknown, query: ResolvedAuditHistoryQuery): AuditHistorySnapshot | null {
  if (!isRecord(value) || value.available !== true || value.page !== query.page || value.pageSize !== query.pageSize
    || !Number.isSafeInteger(value.total) || Number(value.total) < 0 || !Array.isArray(value.audits)
    || value.audits.length !== Math.min(query.pageSize, Math.max(0, Number(value.total) - (query.page - 1) * query.pageSize))
    || !Array.isArray(value.findings)) return null;
  const audits: AuditRecord[] = [];
  const seen = new Set<string>();
  for (const raw of value.audits) {
    if (!isRecord(raw) || !uuid(raw.id) || seen.has(raw.id) || !uuid(raw.workId) || !uuid(raw.auditorId)
      || !["security-it07-r02", "quality-f175", "quality-f176"].includes(String(raw.modelId))
      || !date(raw.date) || typeof raw.auditor !== "string" || raw.status !== "Publicada" || raw.isDemo !== false
      || !["Coleta concluída", "Em preenchimento", "Rascunho"].includes(String(raw.collectionStatus))
      || !["Aguardando configuração", "Nota pendente", "Disponível"].includes(String(raw.calculationStatus))
      || !(raw.finalScore === null || (typeof raw.finalScore === "number" && Number.isFinite(raw.finalScore)))
      || (raw.reportUrl !== undefined && typeof raw.reportUrl !== "string")
      || (query.workId && raw.workId !== query.workId) || (query.modelId && raw.modelId !== query.modelId)
      || (query.module && (raw.modelId === "security-it07-r02" ? "safety" : "quality") !== query.module)
      || (query.auditId && raw.id !== query.auditId) || raw.id === query.excludeAuditId
      || (query.dateFrom && raw.date < query.dateFrom) || (query.dateTo && raw.date > query.dateTo)) return null;
    const previous = audits[audits.length - 1];
    if (previous && (previous.date < raw.date || (previous.date === raw.date && previous.id < raw.id))) return null;
    seen.add(raw.id);
    audits.push({ id: raw.id, workId: raw.workId, modelId: raw.modelId as AuditRecord["modelId"], date: raw.date,
      auditor: raw.auditor, auditorId: raw.auditorId, status: "Publicada", isDemo: false,
      collectionStatus: raw.collectionStatus as AuditRecord["collectionStatus"],
      calculationStatus: raw.calculationStatus as AuditRecord["calculationStatus"], finalScore: raw.finalScore as number | null,
      ...(typeof raw.reportUrl === "string" ? { reportUrl: raw.reportUrl } : {}),
      ...(typeof raw.visitId === "string" ? { visitId: raw.visitId } : {}),
      ...(typeof raw.catalogVersion === "number" ? { catalogVersion: raw.catalogVersion } : {}),
      ...(typeof raw.catalogRevisionLabel === "string" ? { catalogRevisionLabel: raw.catalogRevisionLabel } : {}),
      ...(typeof raw.catalogRevisionId === "string" || raw.catalogRevisionId === null ? { catalogRevisionId: raw.catalogRevisionId } : {}),
    });
  }
  const findings: PublishedAuditFinding[] = [];
  const findingIds = new Set<string>();
  for (const raw of value.findings) {
    if (!query.includeFindings || !isRecord(raw)) return null;
    const audit = audits.find((entry) => entry.id === raw.auditId);
    if (!audit || raw.workId !== audit.workId || raw.modelId !== audit.modelId || raw.auditDate !== audit.date
      || raw.module !== (audit.modelId === "security-it07-r02" ? "safety" : "quality")
      || typeof raw.id !== "string" || !raw.id || findingIds.has(`${audit.id}:${raw.id}`)
      || typeof raw.auditor !== "string" || typeof raw.item !== "string" || typeof raw.description !== "string"
      || typeof raw.criterionTitle !== "string" || typeof raw.nonconformity !== "string" || typeof raw.serious !== "boolean"
      || (raw.subitem !== undefined && typeof raw.subitem !== "string")) return null;
    findingIds.add(`${audit.id}:${raw.id}`);
    findings.push({ id: raw.id, auditId: audit.id, workId: audit.workId, modelId: audit.modelId, auditDate: audit.date,
      module: audit.modelId === "security-it07-r02" ? "safety" : "quality", auditor: raw.auditor, item: raw.item, description: raw.description,
      criterionTitle: raw.criterionTitle, nonconformity: raw.nonconformity, serious: raw.serious,
      ...(typeof raw.subitem === "string" ? { subitem: raw.subitem } : {}),
    });
  }
  if (query.onlyWithFindings && query.includeFindings && audits.some((audit) => !findings.some((finding) => finding.auditId === audit.id))) return null;
  return { available: true, total: Number(value.total), page: query.page, pageSize: query.pageSize, audits, findings };
}
