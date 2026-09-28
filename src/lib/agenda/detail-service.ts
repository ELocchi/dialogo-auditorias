import type { SupabaseClient } from "@supabase/supabase-js";
import type { Visit } from "../../domain/prototype-access.ts";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { uuidPattern } from "../access/validation.ts";
import { parseAgendaVisit } from "./service.ts";

export type AgendaVisitDetail = { available: true; visit: Visit | null } | { available: false; forbidden?: true };

export async function readAgendaVisitDetail(client: Pick<SupabaseClient, "rpc">, context: ProfileWorkspaceContext, visitId: string): Promise<AgendaVisitDetail> {
  if (!uuidPattern.test(visitId)) return { available: false };
  try {
    const { data, error } = await client.rpc("read_audit_agenda_visit_detail", {
      p_profile: context.profile, p_visit_id: visitId.toLowerCase(),
      p_engineering_scope: context.engineeringScope, p_administrative_scope: context.administrativeScope ?? null,
    });
    if (error) return { available: false, ...(error.code === "42501" ? { forbidden: true as const } : {}) };
    if (data === null) return { available: true, visit: null };
    const visit = parseAgendaVisit(data, context);
    return visit && visit.id === visitId.toLowerCase() ? { available: true, visit } : { available: false };
  } catch { return { available: false }; }
}
