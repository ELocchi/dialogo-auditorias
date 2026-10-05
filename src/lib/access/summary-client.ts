import { requestSignal } from "../request-signal.ts";
import type { AgendaActorContext } from "../agenda/contracts.ts";
import { isAvailableAccessSummary, type AccessSummary } from "./summary-contracts.ts";

export async function loadAccessSummary(actor: AgendaActorContext, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<Extract<AccessSummary, { available: true }>> {
  const query = new URLSearchParams({ usuario: actor.userId, perfil: actor.profile,
    atuacao: actor.engineeringScope ?? "", administrativo: actor.administrativeScope ?? "" });
  const response = await fetcher(`/api/access/summary?${query}`, { credentials: "same-origin", cache: "no-store", signal: requestSignal(signal) });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? "Este resumo não está disponível para o perfil atual."
    : "Não foi possível carregar o resumo de acessos. Tente novamente.");
  const summary: unknown = await response.json();
  if (!isAvailableAccessSummary(summary)) throw new Error("Não foi possível confirmar o resumo de acessos. Tente novamente.");
  return { available: true, pendingCount: summary.pendingCount, activeCount: summary.activeCount };
}
