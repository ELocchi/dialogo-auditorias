import type { JobReceipt } from "../jobs/contracts.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidPattern } from "../access/validation.ts";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";

type Client = Pick<SupabaseClient, "rpc">;
export type FollowUpFinding = { id: string; location: string; description: string; correction: string; serious?: boolean };
export type FollowUpReport = {
  id: string;
  title: string;
  visitId: string;
  revision: number;
  participants: string;
  subjects: string;
  decisions: string;
  findings: FollowUpFinding[];
  updatedAt: string;
};
export type FollowUpSnapshot = { available: boolean; reports: FollowUpReport[]; message?: string };
export type SaveFollowUpInput = Pick<FollowUpReport, "visitId" | "title" | "participants" | "subjects" | "decisions" | "findings"> & { expectedRevision: number };
export type SaveFollowUpResult = { status: "success" | "error"; message: string; report?: FollowUpReport; processing?: JobReceipt };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" && uuidPattern.test(value);
const text = (value: unknown, max: number, min = 0): value is string => typeof value === "string" && value.trim().length >= min && value.length <= max && !value.includes("\u0000");
const auditor = (context: ProfileWorkspaceContext) => context.profile === "AUDITOR_SEGURANCA" || context.profile === "AUDITOR_QUALIDADE";
const canReadReports = (context: ProfileWorkspaceContext) => auditor(context) || context.profile === "ENGENHARIA";
const failure = (message: string): SaveFollowUpResult => ({ status: "error", message });

function parseFinding(value: unknown): FollowUpFinding | null {
  if (!record(value) || Object.keys(value).some((key) => !["id", "location", "description", "correction", "serious"].includes(key))
    || Object.keys(value).length < 4 || !uuid(value.id)
    || !text(value.location, 200) || !text(value.description, 2000, 5)
    || !text(value.correction, 2000, 5)
    || (value.serious !== undefined && typeof value.serious !== "boolean")) return null;
  return { id: value.id.toLowerCase(), location: value.location.trim(),
    description: value.description.trim(), correction: value.correction.trim(),
    ...(value.serious !== undefined ? { serious: value.serious } : {}) };
}

export function parseFindings(value: unknown): FollowUpFinding[] | null {
  if (!Array.isArray(value) || value.length > 30) return null;
  const findings = value.map(parseFinding);
  if (findings.some((item) => !item)) return null;
  const valid = findings as FollowUpFinding[];
  return new Set(valid.map((item) => item.id)).size === valid.length ? valid : null;
}

export function resolveReportFindings(selected: readonly FollowUpFinding[], reported: readonly FollowUpFinding[],
  drafts: readonly FollowUpFinding[]): FollowUpFinding[] | null {
  if (selected.length === 0) return null;
  const available = new Map([...reported, ...drafts].map((finding) => [finding.id, finding]));
  const resolved = selected.flatMap((finding) => {
    const current = available.get(finding.id);
    return current ? [current] : [];
  });
  return resolved.length === selected.length ? resolved : null;
}

export function parseReport(value: unknown): FollowUpReport | null {
  if (!record(value) || !uuid(value.visitId) || !Number.isInteger(value.revision)
    || Number(value.revision) < 1 || !text(value.participants, 5000)
    || (value.title !== undefined && !text(value.title, 120, 1))
    || !text(value.subjects, 10000, 1) || !text(value.decisions, 10000)
    || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return null;
  const findings = parseFindings(value.findings);
  if (!findings) return null;
  return { id: uuid(value.id) ? value.id.toLowerCase() : value.visitId.toLowerCase(),
    title: typeof value.title === "string" ? value.title.trim() : "Relatório orientativo",
    visitId: value.visitId.toLowerCase(), revision: Number(value.revision),
    participants: value.participants, subjects: value.subjects, decisions: value.decisions,
    findings, updatedAt: value.updatedAt };
}

export function parseSaveFollowUp(input: unknown): SaveFollowUpInput | null {
  if (!record(input) || Object.keys(input).length !== 7 || !uuid(input.visitId)
    || !Number.isInteger(input.expectedRevision) || Number(input.expectedRevision) < 0
    || !text(input.title, 120, 1)
    || !text(input.participants, 5000, 1) || !text(input.subjects, 10000, 1)
    || !text(input.decisions, 10000, 1)) return null;
  const findings = parseFindings(input.findings);
  return findings ? { visitId: input.visitId.toLowerCase(), expectedRevision: Number(input.expectedRevision),
    title: input.title.trim(),
    participants: input.participants.trim(), subjects: input.subjects.trim(),
    decisions: input.decisions.trim(), findings } : null;
}

export async function readFollowUpReports(client: Client, context: ProfileWorkspaceContext): Promise<FollowUpSnapshot> {
  if (!canReadReports(context)) return { available: false, reports: [] };
  try {
    const { data, error } = await client.rpc("read_follow_up_reports", { p_profile: context.profile });
    if (error) return { available: false, reports: [], message: ["PGRST202", "42883", ...(context.profile === "ENGENHARIA" ? ["42501"] : [])].includes(error.code)
      ? "Os relatórios orientativos estarão disponíveis após a atualização do banco de dados."
      : "Não foi possível consultar os relatórios orientativos. Tente novamente." };
    if (!Array.isArray(data) || data.length > 1000) return { available: false, reports: [] };
    const reports = data.map(parseReport);
    if (reports.some((item) => !item)) return { available: false, reports: [],
      message: "Os relatórios orientativos precisam da atualização do banco de dados. Atualize a página após a migração." };
    const valid = reports as FollowUpReport[];
    if (new Set(valid.map((item) => item.id)).size !== valid.length) return { available: false, reports: [] };
    return { available: true, reports: valid };
  } catch { return { available: false, reports: [], message: "Não foi possível consultar os relatórios orientativos. Tente novamente." }; }
}

export async function saveFollowUpReport(client: Client, context: ProfileWorkspaceContext, input: unknown): Promise<SaveFollowUpResult> {
  if (!auditor(context)) return failure("Somente o auditor responsável pode registrar o acompanhamento.");
  const value = parseSaveFollowUp(input);
  if (!value) return failure("Informe o nome, preencha os três campos e confira os apontamentos antes de salvar.");
  if (value.expectedRevision !== 0) return failure("Este relatório já foi fechado. Você pode visualizá-lo ou baixar o PDF.");
  // The save RPC locks the visit and rechecks assignment, profile, current access,
  // confirmation and São Paulo date atomically before closing the report.
  try {
    const { data, error } = await client.rpc("save_follow_up_report", {
      p_profile: context.profile, p_visit_id: value.visitId, p_expected_revision: value.expectedRevision,
      p_title: value.title,
      p_participants: value.participants, p_subjects: value.subjects,
      p_decisions: value.decisions, p_findings: value.findings,
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
