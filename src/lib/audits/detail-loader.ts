import type { AuditRecord } from "../../domain/operational-records.ts";
import type { AgendaActorContext } from "../agenda/contracts.ts";
import type { PublishedAuditSnapshot } from "./contracts.ts";

export type AuditDetailState = { status: "loading" | "loaded" | "error"; message?: string };
export type AuditDetailStates = Record<string, AuditDetailState>;

/** A cache owned by one mounted profile. No audit details survive a profile change. */
export function createAuditDetailLoader({ actor, initial, onLoaded, fetcher = fetch }: {
  actor: AgendaActorContext;
  initial: PublishedAuditSnapshot;
  onLoaded: (snapshot: PublishedAuditSnapshot) => void;
  fetcher?: typeof fetch;
}) {
  const audits = new Map(initial.audits.map((audit) => [audit.id, audit]));
  const listeners = new Set<() => void>();
  const pending = new Map<string, { promise: Promise<void>; controller: AbortController }>();
  let states: AuditDetailStates = Object.fromEntries(initial.audits
    .filter((audit) => initial.responses[audit.id]?.[audit.modelId] && initial.criteriaSnapshots?.[audit.id])
    .map((audit) => [audit.id, { status: "loaded" as const }]));
  const query = new URLSearchParams({ usuario: actor.userId, perfil: actor.profile,
    atuacao: actor.engineeringScope ?? "", administrativo: actor.administrativeScope ?? "" });
  const publish = (id: string, state: AuditDetailState) => {
    states = { ...states, [id]: state };
    listeners.forEach((listener) => listener());
  };
  const loadAudit = (id: string): Promise<void> => {
    const audit = audits.get(id);
    if (audit?.isDemo || states[id]?.status === "loaded") return Promise.resolve();
    const existing = pending.get(id);
    if (existing) return existing.promise;
    if (!audit) {
      const message = "Auditoria indisponível neste perfil.";
      publish(id, { status: "error", message });
      return Promise.reject(new Error(message));
    }
    const controller = new AbortController();
    publish(id, { status: "loading" });
    const promise = (async () => {
      try {
        const response = await fetcher(`/api/audits/${encodeURIComponent(id)}?${query}`, {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 || response.status === 404
          ? "Esta auditoria não está disponível para o perfil atual."
          : "Não foi possível carregar os detalhes da auditoria. Tente novamente.");
        const snapshot: unknown = await response.json();
        if (controller.signal.aborted) return;
        if (!matchesAudit(snapshot, audit)) throw new Error("Não foi possível confirmar os detalhes da auditoria. Tente novamente.");
        onLoaded(snapshot);
        publish(id, { status: "loaded" });
      } catch (cause) {
        if (controller.signal.aborted) return;
        const message = cause instanceof Error ? cause.message : "Não foi possível carregar a auditoria.";
        publish(id, { status: "error", message });
        throw new Error(message);
      } finally {
        if (pending.get(id)?.controller === controller) pending.delete(id);
      }
    })();
    pending.set(id, { promise, controller });
    return promise;
  };
  return {
    loadAudit,
    getSnapshot: () => states,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel: () => {
      pending.forEach(({ controller }) => controller.abort());
      pending.clear();
      states = Object.fromEntries(Object.entries(states).filter(([, state]) => state.status !== "loading"));
    },
  };
}

function matchesAudit(value: unknown, expected: AuditRecord): value is PublishedAuditSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<PublishedAuditSnapshot>;
  if (snapshot.available !== true || !Array.isArray(snapshot.audits) || snapshot.audits.length !== 1) return false;
  const audit = snapshot.audits[0];
  const criteria = snapshot.criteriaSnapshots?.[expected.id];
  const responses = snapshot.responses?.[expected.id]?.[expected.modelId];
  return audit.id === expected.id && audit.workId === expected.workId && audit.modelId === expected.modelId
    && audit.status === "Publicada" && Array.isArray(criteria) && criteria.length > 0
    && !!responses && criteria.every((criterion) => responses[criterion.id]);
}
