import { requestSignal } from "../request-signal.ts";
import type { AuditRecord } from "../../domain/operational-records.ts";
import type { AgendaActorContext } from "../agenda/contracts.ts";
import { parseComparisonAuditIds, type AuditComparison } from "./comparison-contracts.ts";

export type ComparisonReference = Pick<AuditRecord, "id" | "date" | "workId" | "modelId">;
export type ComparisonState = { status: "loading" } | { status: "loaded"; audit: AuditComparison }
  | { status: "error"; message: string };
export type ComparisonStates = Readonly<Record<string, ComparisonState>>;
const unavailable = "Não foi possível consultar parte do histórico anterior. Tente novamente.";

/** Small, bounded answer-only cache owned by one profile; never a detail cache. */
export function createAuditComparisonLoader(actor: AgendaActorContext, fetcher: typeof fetch = fetch) {
  const listeners = new Set<() => void>();
  const pending = new Map<string, { promise: Promise<void>; controller: AbortController }>();
  const touched = new Map<string, number>();
  let sequence = 0;
  let states: ComparisonStates = {};
  const publish = (updates: Record<string, ComparisonState>, protectedIds: readonly string[]) => {
    const next = { ...states, ...updates };
    const removable = Object.keys(next).filter((id) => !protectedIds.includes(id) && !pending.has(id))
      .sort((a, b) => (touched.get(a) ?? 0) - (touched.get(b) ?? 0));
    while (Object.keys(next).length > 12 && removable.length) {
      const id = removable.shift()!;
      delete next[id]; touched.delete(id);
    }
    states = next;
    listeners.forEach((listener) => listener());
  };
  const loadAudits = async (references: readonly ComparisonReference[]): Promise<void> => {
    if (!references.length) return;
    const ids = parseComparisonAuditIds(references.map((audit) => audit.id));
    if (!ids) throw new Error(unavailable);
    const refs = references.map((audit, index) => ({ ...audit, id: ids[index] }));
    for (const id of ids) touched.set(id, ++sequence);
    const waiting = ids.flatMap((id) => pending.has(id) ? [pending.get(id)!.promise] : []);
    const missing = refs.filter((audit) => {
      const state = states[audit.id];
      return !pending.has(audit.id) && !(state?.status === "loaded" && matches(state.audit, audit));
    });
    if (missing.length) {
      const controller = new AbortController();
      const query = new URLSearchParams({ usuario: actor.userId, perfil: actor.profile,
        atuacao: actor.engineeringScope ?? "", administrativo: actor.administrativeScope ?? "",
        ids: missing.map((audit) => audit.id).join(",") });
      publish(Object.fromEntries(missing.map((audit) => [audit.id, { status: "loading" }])), ids);
      const promise = Promise.resolve().then(async () => {
        try {
          if (controller.signal.aborted) return;
          const response = await fetcher(`/api/audits/comparison?${query}`, {
            credentials: "same-origin", cache: "no-store", signal: requestSignal(controller.signal),
          });
          if (!response.ok) throw new Error(unavailable);
          const value: unknown = await response.json();
          if (controller.signal.aborted) return;
          const comparisons = parseResults(value, missing);
          if (!comparisons) throw new Error(unavailable);
          const updates: Record<string, ComparisonState> = {};
          for (const audit of missing) {
            const comparison = comparisons.get(audit.id);
            updates[audit.id] = comparison ? { status: "loaded", audit: comparison }
              : { status: "error", message: unavailable };
          }
          publish(updates, ids);
        } catch {
          if (!controller.signal.aborted) {
            publish(Object.fromEntries(missing.map((audit) => [audit.id, { status: "error", message: unavailable }])), ids);
          }
        } finally {
          for (const audit of missing) if (pending.get(audit.id)?.controller === controller) pending.delete(audit.id);
        }
      });
      for (const audit of missing) pending.set(audit.id, { promise, controller });
      waiting.push(promise);
    }
    await Promise.all(waiting);
  };
  return {
    loadAudits,
    getSnapshot: () => states,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel: () => {
      pending.forEach(({ controller }) => controller.abort());
      pending.clear(); touched.clear(); states = {};
    },
  };
}

function matches(value: ComparisonReference, expected: ComparisonReference) {
  return value.id === expected.id && value.workId === expected.workId
    && value.modelId === expected.modelId && value.date === expected.date;
}

function parseResults(value: unknown, expected: readonly ComparisonReference[]): Map<string, AuditComparison> | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as { available?: unknown; audits?: unknown };
  if (snapshot.available !== true || !Array.isArray(snapshot.audits) || snapshot.audits.length > expected.length) return null;
  const result = new Map<string, AuditComparison>();
  for (const raw of snapshot.audits) {
    if (!raw || typeof raw !== "object") return null;
    const audit = raw as AuditComparison;
    const reference = expected.find((entry) => entry.id === audit.id);
    if (!reference || result.has(audit.id) || !matches(audit, reference) || !audit.answers
      || typeof audit.answers !== "object" || Array.isArray(audit.answers)
      || Object.entries(audit.answers).some(([id, answer]) => !id || typeof answer !== "string")) return null;
    result.set(audit.id, { id: audit.id, date: audit.date, workId: audit.workId, modelId: audit.modelId,
      answers: Object.fromEntries(Object.entries(audit.answers)) });
  }
  return result;
}
