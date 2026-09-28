import type { SupabaseClient } from "@supabase/supabase-js";
import { canAccessWorkModule, canManageAgenda } from "../../domain/prototype-access.ts";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { uuidPattern } from "../access/validation.ts";
import type { AgendaActionResult, CreateAgendaVisitInput } from "./contracts.ts";
import { parseCreateAgendaVisit, readAgendaSnapshot } from "./service.ts";

export const maximumAgendaBatchSize = 200;

export function parseCreateAgendaBatch(input: unknown): CreateAgendaVisitInput[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > maximumAgendaBatchSize) return null;
  const visits: CreateAgendaVisitInput[] = [];
  const requestIds = new Set<string>();
  for (const item of input) {
    const visit = parseCreateAgendaVisit(item);
    if (!visit || requestIds.has(visit.requestId)) return null;
    requestIds.add(visit.requestId);
    visits.push(visit);
  }
  return visits;
}

/** One transaction for the complete batch, followed by one agenda refresh. */
export async function createAgendaVisitsBatch(input: unknown, context: ProfileWorkspaceContext,
  client: Pick<SupabaseClient, "rpc">): Promise<AgendaActionResult> {
  const values = parseCreateAgendaBatch(input);
  const failure = (message: string): AgendaActionResult => ({ status: "error", message });
  if (!values) return failure(`Revise os agendamentos. Envie de 1 a ${maximumAgendaBatchSize} visitas por vez.`);
  const workIds = new Set(context.works.map((work) => work.id));
  if (!canManageAgenda(context.user) || values.some((visit) => !workIds.has(visit.workId)
    || !canAccessWorkModule(context.user, visit.workId, visit.module))) {
    return failure("Este perfil não pode agendar todas as obras e disciplinas selecionadas.");
  }
  try {
    const { data, error } = await client.rpc("create_agenda_visits_batch", { p_visits: values });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") return failure("O envio da agenda ficará disponível após a atualização do banco de dados.");
      if (error.code === "42501") return failure("Seu perfil ou um dos profissionais não está autorizado para estes agendamentos. Confira os acessos antes de reenviar.");
      if (error.code === "22023" || error.code === "22007" || error.code === "22008") return failure("Revise as obras, profissionais e datas. Nenhum novo agendamento deste envio foi salvo.");
      if (error.code === "40001") return failure("A programação mudou. Confira os agendamentos e tente novamente com os mesmos dados.");
      return failure("Não foi possível confirmar o envio. Tente novamente com os mesmos dados para consultar ou concluir esta agenda.");
    }
    if (!Array.isArray(data) || data.length !== values.length || new Set(data).size !== data.length
      || data.some((id) => typeof id !== "string" || !uuidPattern.test(id))) {
      return failure("O resultado não pôde ser confirmado. Tente novamente com os mesmos dados para consultar este envio.");
    }
    const snapshot = await readAgendaSnapshot(client, context);
    const message = values.length === 1 ? "Visita agendada. O profissional recebeu a solicitação de confirmação."
      : `${values.length} visitas agendadas. Os profissionais receberam as solicitações de confirmação.`;
    return { status: "success", message: snapshot.available ? message : `${message} Atualize a página para consultar a agenda.`, snapshot };
  } catch {
    return failure("Não foi possível confirmar o envio. Tente novamente com os mesmos dados para consultar ou concluir esta agenda.");
  }
}
