"use server";

import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { confirmAgendaVisit, createAgendaVisit, deleteAgendaVisit } from "@/lib/agenda/service";
import { createAgendaVisitsBatch } from "@/lib/agenda/batch-service";
import { unavailableAgenda, type AgendaActorContext, type AgendaActionResult, type ConfirmAgendaVisitInput, type CreateAgendaVisitInput, type DeleteAgendaVisitInput } from "@/lib/agenda/contracts";

async function execute(operation: typeof createAgendaVisit, input: unknown, expected: AgendaActorContext): Promise<AgendaActionResult> {
  const active = await requireActiveProfile();
  if (!expected || expected.userId !== active.user.id || expected.profile !== active.profile || expected.engineeringScope !== active.engineeringScope || expected.administrativeScope !== active.administrativeScope) {
    return { status: "error", message: "O usuário ou perfil mudou. Atualize a página antes de continuar.", snapshot: unavailableAgenda() };
  }
  const context = await readWorkspaceContext(active);
  if (!context) return { status: "error", message: "Não foi possível confirmar seus acessos. Atualize a página." };
  return operation(input, context, await createClient({ writableCookies: true }));
}

export async function createAgendaVisitAction(input: CreateAgendaVisitInput, expected: AgendaActorContext): Promise<AgendaActionResult> {
  return execute(createAgendaVisit, input, expected);
}

export async function createAgendaVisitsBatchAction(input: CreateAgendaVisitInput[], expected: AgendaActorContext): Promise<AgendaActionResult> {
  return execute(createAgendaVisitsBatch, input, expected);
}

export async function deleteAgendaVisitAction(input: DeleteAgendaVisitInput, expected: AgendaActorContext): Promise<AgendaActionResult> {
  return execute(deleteAgendaVisit, input, expected);
}

export async function confirmAgendaVisitAction(input: ConfirmAgendaVisitInput, expected: AgendaActorContext): Promise<AgendaActionResult> {
  return execute(confirmAgendaVisit, input, expected);
}
