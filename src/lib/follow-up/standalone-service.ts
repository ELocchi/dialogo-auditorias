import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { uuidPattern } from "../access/validation.ts";
import { getSaoPauloToday } from "../../domain/visit-calendar.ts";
import { parseFindings, type FollowUpFinding } from "./service.ts";
import { isStandaloneReportIndex, parseStandaloneInput, parseStandaloneReport,
  type StandaloneReport, type StandaloneReportHeader, type StandaloneReportIndex, type StandaloneSaveResult } from "./standalone-contracts.ts";

type Client = Pick<SupabaseClient, "rpc">;
export const standaloneDiscipline = (profile: string) => profile === "AUDITOR_QUALIDADE" ? "quality"
  : profile === "AUDITOR_SEGURANCA" ? "safety" : null;
export function canCreateStandaloneReport(context: ProfileWorkspaceContext, workId: string) {
  const discipline = standaloneDiscipline(context.profile);
  return !!discipline && context.works.some(work => work.id === workId)
    && context.user.workModuleScopes?.some(scope => scope.workId === workId && scope.module === discipline) === true;
}
function canRead(context: ProfileWorkspaceContext, report: StandaloneReportHeader) {
  return context.works.some(work => work.id === report.workId)
    && context.user.workModuleScopes?.some(scope => scope.workId === report.workId && scope.module === report.module)
    && (context.profile === "ENGENHARIA" || (report.auditorId === context.user.id && standaloneDiscipline(context.profile) === report.module));
}
const params = (context: ProfileWorkspaceContext) => ({ p_profile: context.profile,
  p_engineering_scope: context.engineeringScope, p_administrative_scope: context.administrativeScope });

export async function readStandaloneReports(client: Client, context: ProfileWorkspaceContext): Promise<StandaloneReportIndex> {
  const unavailable: StandaloneReportIndex = { available: false, reports: [] };
  if (!standaloneDiscipline(context.profile) && context.profile !== "ENGENHARIA") return unavailable;
  try {
    const { data, error } = await client.rpc("read_standalone_follow_up_reports", params(context));
    return !error && isStandaloneReportIndex(data) && data.reports.every(report => canRead(context, report)) ? data : unavailable;
  } catch { return unavailable; }
}

export async function readStandaloneReport(client: Client, context: ProfileWorkspaceContext, id: string): Promise<{ available: boolean; report: StandaloneReport | null }> {
  const unavailable = { available: false, report: null };
  if (!uuidPattern.test(id) || (!standaloneDiscipline(context.profile) && context.profile !== "ENGENHARIA")) return unavailable;
  try {
    const { data, error } = await client.rpc("read_standalone_follow_up_reports", { ...params(context), p_report_id: id });
    if (error || !isStandaloneReportIndex(data) || data.reports.length > 1) return unavailable;
    if (!data.reports.length) return { available: true, report: null };
    const report = parseStandaloneReport(data.reports[0]);
    return report && report.id === id && canRead(context, report) ? { available: true, report } : unavailable;
  } catch { return unavailable; }
}

export async function readStandaloneFindings(client: Pick<SupabaseClient, "from">, context: ProfileWorkspaceContext, workId: string): Promise<{ available: boolean; findings: FollowUpFinding[] }> {
  const unavailable = { available: false, findings: [] };
  if (!uuidPattern.test(workId) || !canCreateStandaloneReport(context, workId)) return unavailable;
  try {
    // These findings already exist independently of reports. Read their existing
    // table through the user's RLS session, even before the report migration.
    const discipline = context.profile === "AUDITOR_SEGURANCA" ? "SEGURANCA" : "QUALIDADE";
    const findings: FollowUpFinding[] = [];
    const seen = new Set<string>();
    let total: number | null = null;
    do {
      const { data, error, count } = await client.from("follow_up_work_findings")
        .select("id,work_id,auditor_auth_user_id,modulo,completed_at,location,description,correction,serious", { count: "exact" })
        .eq("work_id", workId).eq("auditor_auth_user_id", context.user.id).eq("modulo", discipline).is("completed_at", null)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).range(findings.length, findings.length + 199);
      if (error || !Array.isArray(data) || count === null || !Number.isSafeInteger(count) || count < 0
        || (total !== null && count !== total) || data.length + findings.length > count
        || (!data.length && findings.length < count)) return unavailable;
      total = count;
      for (const entry of data) {
        if (!entry || entry.work_id !== workId || entry.auditor_auth_user_id !== context.user.id
          || entry.modulo !== discipline || entry.completed_at !== null || typeof entry.serious !== "boolean") return unavailable;
        const parsed = parseFindings([{ id: entry.id, location: entry.location, description: entry.description,
          correction: entry.correction, serious: entry.serious }]);
        if (!parsed || seen.has(parsed[0].id)) return unavailable;
        seen.add(parsed[0].id);
        findings.push(parsed[0]);
      }
      // Continue by the received row count if PostgREST uses a smaller page cap.
    } while (findings.length < total);
    return { available: true, findings };
  } catch { return unavailable; }
}

export async function saveStandaloneReport(client: Client, context: ProfileWorkspaceContext, value: unknown): Promise<StandaloneSaveResult> {
  const input = parseStandaloneInput(value, getSaoPauloToday());
  if (!input || !canCreateStandaloneReport(context, input.workId)) return { status: "error", message: "Confira a obra, a data e o conteúdo do relatório." };
  try {
    const { data, error } = await client.rpc("save_standalone_follow_up_report", {
      p_profile: context.profile, p_work_id: input.workId, p_date: input.date, p_title: input.title,
      p_participants: input.participants, p_subjects: input.subjects, p_decisions: input.decisions,
      p_finding_ids: input.findingIds, p_request_id: input.requestId,
    });
    if (!error && typeof data === "string" && uuidPattern.test(data)) return { status: "success", reportId: data };
    if (error?.code === "42501" || error?.code === "23514") return { status: "error", message: "A obra, os apontamentos ou as fotos não estão mais disponíveis. Atualize a seleção e tente novamente." };
    if (error?.code === "PGRST202" || error?.code === "42883") return { status: "error", message: "A criação de relatórios precisa ser habilitada no banco de dados. Seu formulário foi mantido." };
  } catch { /* A retry uses the same request ID if confirmation was lost. */ }
  return { status: "error", message: "Não foi possível confirmar o salvamento. Tente novamente sem fechar esta página." };
}
