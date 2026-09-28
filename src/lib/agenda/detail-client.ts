import type { DemoUser, Visit } from "../../domain/prototype-access.ts";

/** Display context is compared with the verified session; it never grants access. */
export function agendaDetailQuery(user: DemoUser): URLSearchParams {
  return new URLSearchParams({ usuario: user.id, papel: user.role, atividade: user.activity ?? "",
    disciplinas: [...user.modules].sort().join(",") });
}

export function matchesAgendaDetailActor(query: URLSearchParams, user: DemoUser): boolean {
  return [...agendaDetailQuery(user)].every(([name, value]) => query.getAll(name).length === 1 && query.get(name) === value);
}

export function agendaDetailKey(user: DemoUser, visit: Visit): string {
  return JSON.stringify([user, visit.id, visit.workId, visit.auditorId, visit.date, visit.revision,
    visit.lastChangedAt, visit.detailVersion, visit.confirmationStatus, visit.confirmedAt]);
}

export async function fetchAgendaVisitDetail(visit: Visit, user: DemoUser, signal: AbortSignal,
  fetcher: typeof fetch = fetch): Promise<Visit> {
  const response = await fetcher(`/api/agenda/visits/${encodeURIComponent(visit.id)}?${agendaDetailQuery(user)}`, {
    credentials: "same-origin", cache: "no-store", signal,
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? "O acesso a este agendamento mudou. Atualize a página."
    : response.status === 404 ? "Este agendamento não está mais disponível. Atualize a agenda."
      : "Não foi possível carregar a observação. Tente novamente.");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("available" in data) || data.available !== true || !("visit" in data)
    || !data.visit || typeof data.visit !== "object") throw new Error("Não foi possível carregar a observação. Tente novamente.");
  const detail = data.visit as Partial<Visit>;
  if (detail.id !== visit.id || detail.workId !== visit.workId || detail.auditorId !== visit.auditorId
    || detail.module !== visit.module || detail.kind !== visit.kind || detail.modelId !== visit.modelId
    || detail.revision !== visit.revision || detail.date !== visit.date || detail.detailsLoaded === false
    || (visit.detailVersion !== undefined && detail.detailVersion !== visit.detailVersion)) {
    throw new Error("O agendamento mudou. Aguarde a atualização da agenda e abra o cartão novamente.");
  }
  if (typeof detail.note !== "string" || detail.note.length > 2000 || !Array.isArray(detail.history)) {
    throw new Error("Não foi possível carregar a observação. Tente novamente.");
  }
  return detail as Visit;
}
