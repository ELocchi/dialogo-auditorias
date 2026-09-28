import { isAgendaRevision, isAgendaSnapshot, unavailableAgenda, withoutPublishedVisit,
  type AgendaActionResult, type AgendaActorContext, type AgendaSnapshot } from "./contracts.ts";

export function newRequestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type SyncState = { agenda: AgendaSnapshot; agendaSyncError: string; mutationPending: boolean };
type Fetch = (input: string, init: RequestInit) => Promise<Response>;
const retryMessage = "Não foi possível atualizar a agenda. Tentaremos novamente automaticamente.";

/** One instance per selected identity. No shared/session authorization cache. */
export class AgendaSyncClient {
  private state: SyncState;
  private readonly listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private epoch = 0;
  private active = false;
  private readonly query: string;
  private readonly fetcher: Fetch;
  private readonly attempts = new Map<string, { payload: string; requestId: string }>();

  constructor(initialAgenda: AgendaSnapshot, actor: AgendaActorContext, fetcher: Fetch = fetch) {
    this.fetcher = fetcher;
    this.state = { agenda: initialAgenda, agendaSyncError: "", mutationPending: false };
    this.query = new URLSearchParams({ formato: "compacto", usuario: actor.userId, perfil: actor.profile,
      atuacao: actor.engineeringScope ?? "", administrativo: actor.administrativeScope ?? "" }).toString();
  }
  getState = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  activate = () => { this.active = true; };
  private publish(change: Partial<SyncState>) {
    this.state = { ...this.state, ...change };
    this.listeners.forEach((listener) => listener());
  }
  cancelRefresh = () => { this.controller?.abort(); this.controller = null; };
  dispose = () => { this.active = false; this.epoch += 1; this.cancelRefresh(); };
  private current(epoch: number, signal?: AbortSignal) { return this.active && epoch === this.epoch && !signal?.aborted; }

  refresh = async () => {
    if (!this.active || this.controller || this.state.mutationPending) return;
    const request = new AbortController();
    this.controller = request;
    const epoch = this.epoch;
    const revision = this.state.agenda.available && isAgendaRevision(this.state.agenda.revision) ? this.state.agenda.revision : null;
    try {
      // Browser fetch requires its own receiver (or no receiver), never this client.
      const fetcher = this.fetcher;
      const response = await fetcher(`/api/agenda?${this.query}`, { credentials: "same-origin", cache: "no-store",
        signal: request.signal, ...(revision ? { headers: { "If-None-Match": `"${revision}"` } } : {}) });
      if (!this.current(epoch, request.signal)) return;
      if (response.status === 401 || response.status === 403) {
        this.epoch += 1;
        this.publish({ agenda: unavailableAgenda(), agendaSyncError: "A sessão não autoriza mais esta agenda. Entre novamente ou selecione um perfil autorizado." });
        return;
      }
      if (response.status === 304) {
        // A 304 never contains JSON. Accept it only for the snapshot sent above.
        if (!revision || response.headers.get("ETag") !== `"${revision}"`) throw new Error("Revisão da agenda inválida");
        if (this.state.agendaSyncError) this.publish({ agendaSyncError: "" });
        return;
      }
      if (!response.ok) throw new Error("Agenda indisponível");
      const snapshot: unknown = await response.json();
      if (!this.current(epoch, request.signal)) return;
      if (!isAgendaSnapshot(snapshot) || !snapshot.available || !isAgendaRevision(snapshot.revision)
        || response.headers.get("ETag") !== `"${snapshot.revision}"`) throw new Error("Resposta da agenda inválida");
      this.publish({ agenda: snapshot, agendaSyncError: "" });
    } catch {
      if (this.current(epoch, request.signal)) this.publish({ agendaSyncError: retryMessage });
    } finally { if (this.controller === request) this.controller = null; }
  };

  runAction = async (operation: string, payload: object, action: (requestId: string) => Promise<AgendaActionResult>): Promise<AgendaActionResult> => {
    if (!this.active || this.state.mutationPending) return { status: "error", message: "Aguarde a operação de agenda em andamento." };
    if (!this.state.agenda.available) return { status: "error", message: "A agenda está indisponível no momento. Tente novamente após a atualização." };
    const fingerprint = JSON.stringify(payload);
    let attempt = this.attempts.get(operation);
    if (!attempt || attempt.payload !== fingerprint) {
      attempt = { payload: fingerprint, requestId: newRequestId() };
      this.attempts.set(operation, attempt);
    }
    const epoch = ++this.epoch;
    this.cancelRefresh();
    this.publish({ mutationPending: true });
    try {
      const result = await action(attempt.requestId);
      if (this.current(epoch)) {
        if (result.snapshot?.available) this.publish({ agenda: result.snapshot, agendaSyncError: "" });
        else {
          // A successful write with unavailable read must force the next full read.
          this.publish({ agenda: { ...this.state.agenda, revision: undefined }, agendaSyncError: result.snapshot ? retryMessage : this.state.agendaSyncError });
        }
        if (result.status === "success") this.attempts.delete(operation);
      }
      return result;
    } catch {
      if (this.current(epoch)) this.publish({ agenda: { ...this.state.agenda, revision: undefined } });
      return { status: "error", message: "Não foi possível confirmar o resultado da operação. Tente novamente com os mesmos dados para consultar ou concluir este envio." };
    } finally {
      if (this.current(epoch)) this.publish({ mutationPending: false });
    }
  };

  removePublishedVisit = (visitId: string) => {
    this.epoch += 1;
    this.cancelRefresh();
    this.publish({ agenda: withoutPublishedVisit(this.state.agenda, visitId), mutationPending: false });
  };
}
