"use server";

import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { readFollowUpReports, saveFollowUpReport, type FollowUpSnapshot, type SaveFollowUpResult } from "@/lib/follow-up/service";
import type { AgendaActorContext } from "@/lib/agenda/contracts";

async function activeContext(expected: AgendaActorContext) {
  const active = await requireActiveProfile();
  if (!expected || expected.userId !== active.user.id || expected.profile !== active.profile
    || expected.engineeringScope !== active.engineeringScope || expected.administrativeScope !== active.administrativeScope) return null;
  return readWorkspaceContext(active);
}

export async function readFollowUpReportsAction(expected: AgendaActorContext): Promise<FollowUpSnapshot> {
  const context = await activeContext(expected);
  if (!context) return { available: false, reports: [], message: "Seu acesso mudou. Atualize a página." };
  return readFollowUpReports(await createClient(), context);
}

export async function saveFollowUpReportAction(input: unknown, expected: AgendaActorContext): Promise<SaveFollowUpResult> {
  const context = await activeContext(expected);
  if (!context) return { status: "error", message: "Seu acesso mudou. Atualize a página." };
  return saveFollowUpReport(await createClient({ writableCookies: true }), context, input);
}
