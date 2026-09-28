import type { AgendaActorContext } from "../agenda/contracts.ts";
import { uuidPattern } from "../access/validation.ts";
import { parsePhotoFileName, type FindingPhoto } from "./photos.ts";

export type FollowUpPhotoState = {
  status: "idle" | "loading" | "ready" | "error";
  photos: FindingPhoto[];
  message?: string;
};
const idle: FollowUpPhotoState = { status: "idle", photos: [] };
const denied: FollowUpPhotoState = { status: "error", photos: [], message: "Seu acesso às fotos mudou. Atualize a página." };
const unavailable = "Não foi possível carregar as fotos. Tente novamente.";
const maxCachedVisits = 64;
const lifetimeMs = 60_000;

function parsePhotos(value: unknown, visitId: string): FindingPhoto[] | null {
  if (!value || typeof value !== "object" || !("available" in value) || value.available !== true
    || !("photos" in value) || !Array.isArray(value.photos) || value.photos.length >= 1000) return null;
  const photos: FindingPhoto[] = [];
  const names = new Set<string>();
  for (const raw of value.photos) {
    if (!raw || typeof raw !== "object" || raw.visitId !== visitId || typeof raw.fileName !== "string"
      || names.has(raw.fileName)) return null;
    const parsed = parsePhotoFileName(raw.fileName);
    if (!parsed || parsed.findingId !== raw.findingId) return null;
    names.add(raw.fileName);
    photos.push({ visitId, findingId: parsed.findingId, fileName: raw.fileName });
  }
  return photos;
}

/** A mounted workspace owns this cache. Visibility leases share one request per
 * visit; at most two Storage listings run at once, even when many rows appear. */
export function createFollowUpPhotoLoader(actor: AgendaActorContext, fetcher: typeof fetch = fetch, now = Date.now) {
  const states = new Map<string, FollowUpPhotoState>();
  const listeners = new Map<string, Set<() => void>>();
  const demand = new Map<string, Set<symbol>>();
  const loadedAt = new Map<string, number>();
  const queue = new Set<string>();
  const pending = new Map<string, AbortController>();
  let running = 0;
  let accessDenied = false;
  const notify = (id: string) => listeners.get(id)?.forEach((listener) => listener());
  const trim = () => {
    for (const id of states.keys()) {
      if (states.size <= maxCachedVisits) break;
      if (!demand.get(id)?.size && !pending.has(id) && !queue.has(id)) {
        states.delete(id); loadedAt.delete(id); notify(id);
      }
    }
  };
  const publish = (id: string, state: FollowUpPhotoState) => {
    states.delete(id); states.set(id, state); notify(id); trim();
  };
  const cancelVisit = (id: string) => {
    queue.delete(id);
    const controller = pending.get(id);
    pending.delete(id); controller?.abort();
    if (states.get(id)?.status === "loading") { states.delete(id); notify(id); }
  };
  const clear = () => {
    queue.clear();
    const controllers = [...pending.values()];
    pending.clear(); controllers.forEach((controller) => controller.abort());
    states.clear(); loadedAt.clear();
    listeners.forEach((_, id) => notify(id));
  };
  const pump = () => {
    while (!accessDenied && running < 2 && queue.size) {
      const id = queue.values().next().value!;
      queue.delete(id);
      if (!demand.get(id)?.size) continue;
      const controller = new AbortController();
      pending.set(id, controller); running++;
      const current = () => pending.get(id) === controller && !controller.signal.aborted;
      const parameters = new URLSearchParams({ usuario: actor.userId, perfil: actor.profile,
        atuacao: actor.engineeringScope ?? "", administrativo: actor.administrativeScope ?? "" });
      // Register first: a synchronous mock/fetch failure must not strand a slot.
      void Promise.resolve().then(async () => {
        try {
          if (!current()) return;
          const response = await fetcher(`/api/follow-up/visits/${id}/photos?${parameters}`, {
            credentials: "same-origin", cache: "no-store", signal: controller.signal,
          });
          if (!current()) return;
          if (response.status === 401 || response.status === 403) {
            accessDenied = true; clear(); return;
          }
          if (!response.ok) throw new Error(unavailable);
          const photos = parsePhotos(await response.json(), id);
          if (!current()) return;
          if (!photos) throw new Error(unavailable);
          loadedAt.set(id, now()); publish(id, { status: "ready", photos });
        } catch {
          if (current()) publish(id, { status: "error", photos: [], message: unavailable });
        } finally {
          if (pending.get(id) === controller) pending.delete(id);
          running--; trim(); pump();
        }
      });
    }
  };
  const request = (id: string, retry = false) => {
    if (accessDenied || !demand.get(id)?.size || pending.has(id) || queue.has(id)) return;
    if (!uuidPattern.test(id)) { publish(id, { status: "error", photos: [], message: unavailable }); return; }
    const state = states.get(id);
    if (!retry && (state?.status === "error" || (state?.status === "ready" && now() - (loadedAt.get(id) ?? 0) < lifetimeMs))) return;
    queue.add(id); publish(id, { status: "loading", photos: [] }); pump();
  };
  return {
    getState: (id: string) => accessDenied ? denied : states.get(id) ?? idle,
    subscribe(id: string, listener: () => void) {
      const subscribers = listeners.get(id) ?? new Set<() => void>();
      subscribers.add(listener); listeners.set(id, subscribers);
      return () => { subscribers.delete(listener); if (!subscribers.size) listeners.delete(id); };
    },
    acquire(id: string) {
      const lease = Symbol(id);
      const leases = demand.get(id) ?? new Set<symbol>();
      leases.add(lease); demand.set(id, leases); request(id);
      return () => {
        leases.delete(lease);
        // StrictMode and two rows from the same visit can release together.
        queueMicrotask(() => {
          if (!demand.get(id)?.size) { demand.delete(id); cancelVisit(id); trim(); }
        });
      };
    },
    retry: (id: string) => request(id, true),
    /** The authoritative upload response wins over any older listing. */
    replace(id: string, photos: FindingPhoto[]) {
      if (accessDenied) return;
      const valid = parsePhotos({ available: true, photos }, id);
      cancelVisit(id);
      if (!valid) { publish(id, { status: "error", photos: [], message: unavailable }); return; }
      loadedAt.set(id, now()); publish(id, { status: "ready", photos: valid }); pump();
    },
    cancel() { demand.clear(); clear(); },
  };
}
