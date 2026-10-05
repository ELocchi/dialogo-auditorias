import { requestSignal } from "../request-signal.ts";
import type { AgendaActorContext } from "../agenda/contracts.ts";
import type { CatalogSnapshot } from "./contracts.ts";

export type DeferredCatalogState = {
  status: "idle" | "loading" | "ready" | "error";
  catalogs: CatalogSnapshot;
  message?: string;
};

/** Session-local data: demand is deduplicated and discarded when the profile unmounts. */
export function createDeferredCatalogLoader(actor: AgendaActorContext, initial: CatalogSnapshot, fetcher: typeof fetch = fetch) {
  let state: DeferredCatalogState = { status: initial.available || initial.setupPending ? "ready" : "idle", catalogs: initial };
  const listeners = new Set<() => void>();
  let pending: { controller: AbortController; promise: Promise<CatalogSnapshot> } | undefined;
  const query = new URLSearchParams({ usuario: actor.userId, perfil: actor.profile,
    atuacao: actor.engineeringScope ?? "", administrativo: actor.administrativeScope ?? "" });
  const publish = (next: DeferredCatalogState) => { state = next; listeners.forEach((listener) => listener()); };
  const finish = (controller: AbortController) => { if (pending?.controller === controller) pending = undefined; };
  const load = (refresh = false): Promise<CatalogSnapshot> => {
    if (pending) return pending.promise;
    if (!refresh && state.status === "ready") return Promise.resolve(state.catalogs);
    const controller = new AbortController();
    publish({ ...state, status: "loading", message: undefined });
    const promise = (async () => {
      try {
        const response = await fetcher(`/api/catalogs?${query}`, { credentials: "same-origin", cache: "no-store", signal: requestSignal(controller.signal) });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403
          ? "Seu acesso aos roteiros mudou. Atualize a página."
          : "Não foi possível carregar os roteiros. Tente novamente.");
        const catalogs: unknown = await response.json();
        controller.signal.throwIfAborted();
        if (!validCatalogs(catalogs)) throw new Error("Não foi possível confirmar os roteiros. Tente novamente.");
        publish({ status: "ready", catalogs });
        return catalogs;
      } catch (cause) {
        if (!controller.signal.aborted) publish({ ...state, status: "error", message: cause instanceof Error ? cause.message : "Não foi possível carregar os roteiros." });
        throw cause;
      } finally {
        finish(controller);
      }
    })();
    pending = { controller, promise };
    return promise;
  };
  return {
    load,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    replace: (catalogs: CatalogSnapshot) => {
      pending?.controller.abort(); pending = undefined;
      publish({ status: catalogs.available || catalogs.setupPending ? "ready" : "error", catalogs });
    },
    cancel: () => {
      pending?.controller.abort(); pending = undefined;
      if (state.status === "loading") publish({ ...state, status: "idle" });
    },
  };
}

function validCatalogs(value: unknown): value is CatalogSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<CatalogSnapshot>;
  if (!(snapshot.available === true || (snapshot.available === false && snapshot.setupPending === true))
    || !Array.isArray(snapshot.versions) || snapshot.versions.length > 3) return false;
  if (snapshot.fvsWeights !== undefined && (!snapshot.fvsWeights || !Number.isInteger(snapshot.fvsWeights.version)
    || snapshot.fvsWeights.version < 0 || typeof snapshot.fvsWeights.label !== "string" || !Array.isArray(snapshot.fvsWeights.services)
    || snapshot.fvsWeights.services.length < 1 || snapshot.fvsWeights.services.length > 500
    || snapshot.fvsWeights.services.some((service) => !service || typeof service.document !== "string" || typeof service.service !== "string"
      || typeof service.label !== "string" || service.label !== `${service.document} - ${service.service}`
      || typeof service.weight !== "number" || service.weight < 1 || service.weight > 5))) return false;
  return snapshot.versions.every((version) => version && ["security-it07-r02", "quality-f175", "quality-f176"].includes(version.modelId)
    && Number.isInteger(version.version) && version.version >= 0 && typeof version.label === "string"
    && Array.isArray(version.criteria) && version.criteria.length > 0);
}
