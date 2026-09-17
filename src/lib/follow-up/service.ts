import type { SupabaseClient } from "@supabase/supabase-js";
import { canReadVisit } from "../../domain/prototype-access.ts";
import { getSaoPauloToday } from "../../domain/visit-calendar.ts";
import { uuidPattern } from "../access/validation.ts";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { readAgendaSnapshot } from "../agenda/service.ts";

type Client = Pick<SupabaseClient, "rpc">;
export type FollowUpFinding = { id: string; location: string; description: string; correction: string };
export type FollowUpReport = {
  visitId: string;
  revision: number;
  guidance: string;
  findings: FollowUpFinding[];
  updatedAt: string;
};
export type FollowUpSnapshot = { available: boolean; reports: FollowUpReport[]; message?: string };
export type SaveFollowUpInput = Pick<FollowUpReport, "visitId" | "guidance" | "findings"> & { expectedRevision: number };
export type SaveFollowUpResult = { status: "success" | "error"; message: string; report?: FollowUpReport };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" && uuidPattern.test(value);
const text = (value: unknown, max: number, min = 0): value is string => typeof value === "string" && value.trim().length >= min && value.length <= max && !value.includes("\u0000");
const auditor = (context: ProfileWorkspaceContext) => context.profile === "AUDITOR_SEGURANCA" || context.profile === "AUDITOR_QUALIDADE";
const failure = (message: string): SaveFollowUpResult => ({ status: "error", message });

function parseFinding(value: unknown): FollowUpFinding | null {
  if (!record(value) || Object.keys(value).length !== 4 || !uuid(value.id)
    || !text(value.location, 200) || !text(value.description, 2000, 5)
    || !text(value.correction, 2000, 5)) return null;
  return { id: value.id.toLowerCase(), location: value.location.trim(),
    description: value.description.trim(), correction: value.correction.trim() };
}

function parseFindings(value: unknown): FollowUpFinding[] | null {
  if (!Array.isArray(value) || value.length > 30) return null;
  const findings = value.map(parseFinding);
  if (findings.some((item) => !item)) return null;
  const valid = findings as FollowUpFinding[];
  return new Set(valid.map((item) => item.id)).size === valid.length ? valid : null;
}

function parseReport(value: unknown): FollowUpReport | null {
  if (!record(value) || !uuid(value.visitId) || !Number.isInteger(value.revision)
    || Number(value.revision) < 1 || !text(value.guidance, 10000, 20)
    || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return null;
  const findings = parseFindings(value.findings);
  if (!findings) return null;
  return { visitId: value.visitId.toLowerCase(), revision: Number(value.revision),
    guidance: value.guidance, findings, updatedAt: value.updatedAt };
}

export function parseSaveFollowUp(input: unknown): SaveFollowUpInput | null {
  if (!record(input) || Object.keys(input).length !== 4 || !uuid(input.visitId)
    || !Number.isInteger(input.expectedRevision) || Number(input.expectedRevision) < 0
    || !text(input.guidance, 10000, 20)) return null;
  const findings = parseFindings(input.findings);
  return findings ? { visitId: input.visitId.toLowerCase(), expectedRevision: Number(input.expectedRevision),
    guidance: input.guidance.trim(), findings } : null;
}

export async function readFollowUpReports(client: Client, context: ProfileWorkspaceContext): Promise<FollowUpSnapshot> {
  if (!auditor(context)) return { available: false, reports: [] };
  try {
    const { data, error } = await client.rpc("read_follow_up_reports", { p_profile: context.profile });
    if (error) return { available: false, reports: [], message: ["PGRST202", "42883"].includes(error.code)
      ? "Os relatórios orientativos estarão disponíveis após a atualização do banco de dados."
      : "Não foi possível consultar os relatórios orientativos. Tente novamente." };
    if (!Array.isArray(data) || data.length > 1000) return { available: false, reports: [] };
    const reports = data.map(parseReport);
    if (reports.some((item) => !item)) return { available: false, reports: [] };
    const valid = reports as FollowUpReport[];
    if (new Set(valid.map((item) => item.visitId)).size !== valid.length) return { available: false, reports: [] };
    return { available: true, reports: valid };
  } catch { return { available: false, reports: [], message: "Não foi possível consultar os relatórios orientativos. Tente novamente." }; }
}

export async function saveFollowUpReport(client: Client, context: ProfileWorkspaceContext, input: unknown): Promise<SaveFollowUpResult> {
  if (!auditor(context)) return failure("Somente o auditor responsável pode registrar o acompanhamento.");
  const value = parseSaveFollowUp(input);
  if (!value) return failure("Preencha a orientação e confira os apontamentos antes de salvar.");
  const agenda = await readAgendaSnapshot(client, context);
  const visit = agenda.visits.find((item) => item.id === value.visitId);
  if (!agenda.available || !visit || visit.kind !== "follow_up" || visit.auditorId !== context.user.id
    || visit.confirmationStatus !== "confirmed" || visit.date > getSaoPauloToday()
    || (value.expectedRevision === 0 && visit.date !== getSaoPauloToday())
    || !canReadVisit(context.user, visit)) return failure("Para criar o relatório, confirme a visita e aguarde a data agendada.");
  try {
    const { data, error } = await client.rpc("save_follow_up_report", {
      p_profile: context.profile, p_visit_id: value.visitId, p_expected_revision: value.expectedRevision,
      p_guidance: value.guidance, p_findings: value.findings,
    });
    if (error) {
      if (["PGRST202", "42883"].includes(error.code)) return failure("O salvamento estará disponível após a atualização do banco de dados.");
      if (["40001", "23505"].includes(error.code)) return failure("Este relatório mudou em outra sessão. Atualize a página antes de salvar novamente.");
      if (["42501", "P0002"].includes(error.code)) return failure("O acompanhamento não está mais autorizado ou disponível. Atualize a agenda.");
      if (error.code === "22023") return failure("Confira o texto do relatório e dos apontamentos.");
      return failure("Não foi possível confirmar o salvamento. Atualize o relatório antes de tentar novamente.");
    }
    const report = parseReport(data);
    if (!report || report.visitId !== value.visitId || report.revision !== value.expectedRevision + 1)
      return failure("O salvamento não pôde ser confirmado. Atualize o relatório para conferir.");
    return { status: "success", message: "Relatório orientativo salvo com os apontamentos para correção.", report };
  } catch { return failure("Não foi possível confirmar o salvamento. Atualize o relatório para conferir."); }
}
