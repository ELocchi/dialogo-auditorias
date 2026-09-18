import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { uuidPattern } from "../access/validation.ts";
import { parseFindings, type FollowUpFinding } from "./service.ts";

type Client = Pick<SupabaseClient, "rpc">;
export type FindingDraft = { visitId: string; revision: number; findings: FollowUpFinding[]; updatedAt: string };
export type FindingDraftSnapshot = { available: boolean; drafts: FindingDraft[]; message?: string };
export type SaveFindingDraftInput = { visitId: string; expectedRevision: number; findings: FollowUpFinding[] };
export type SaveFindingDraftResult = { status: "success" | "error"; message: string; draft?: FindingDraft };

const auditor = (context: ProfileWorkspaceContext) => context.profile === "AUDITOR_SEGURANCA" || context.profile === "AUDITOR_QUALIDADE";
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const failed = (message: string): SaveFindingDraftResult => ({ status: "error", message });

function parseDraft(value: unknown): FindingDraft | null {
  if (!object(value) || typeof value.visitId !== "string" || !uuidPattern.test(value.visitId)
    || !Number.isInteger(value.revision) || Number(value.revision) < 1
    || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return null;
  const findings = parseFindings(value.findings);
  return findings ? { visitId: value.visitId.toLowerCase(), revision: Number(value.revision),
    findings, updatedAt: value.updatedAt } : null;
}

export async function readFindingDrafts(client: Client, context: ProfileWorkspaceContext): Promise<FindingDraftSnapshot> {
  if (!auditor(context)) return { available: false, drafts: [] };
  try {
    const { data, error } = await client.rpc("read_follow_up_finding_drafts", { p_profile: context.profile });
    if (error) return { available: false, drafts: [], message: ["PGRST202", "42883"].includes(error.code)
      ? "Os apontamentos estarão disponíveis após a atualização do banco de dados."
      : "Não foi possível consultar os apontamentos. Tente novamente." };
    if (!Array.isArray(data) || data.length > 1000) return { available: false, drafts: [] };
    const drafts = data.map(parseDraft);
    if (drafts.some((entry) => !entry)) return { available: false, drafts: [] };
    const valid = drafts as FindingDraft[];
    return new Set(valid.map((entry) => entry.visitId)).size === valid.length
      ? { available: true, drafts: valid } : { available: false, drafts: [] };
  } catch { return { available: false, drafts: [], message: "Não foi possível consultar os apontamentos. Tente novamente." }; }
}

export async function saveFindingDrafts(client: Client, context: ProfileWorkspaceContext, input: unknown): Promise<SaveFindingDraftResult> {
  if (!auditor(context)) return failed("Este perfil não pode registrar apontamentos.");
  if (!object(input) || Object.keys(input).length !== 3 || typeof input.visitId !== "string"
    || !uuidPattern.test(input.visitId) || !Number.isInteger(input.expectedRevision)
    || Number(input.expectedRevision) < 0) return failed("Confira os dados do apontamento.");
  const findings = parseFindings(input.findings);
  if (!findings) return failed("Confira os dados do apontamento.");
  try {
    const { data, error } = await client.rpc("save_follow_up_finding_drafts", {
      p_profile: context.profile, p_visit_id: input.visitId.toLowerCase(),
      p_expected_revision: input.expectedRevision, p_findings: findings,
    });
    if (error) {
      if (["PGRST202", "42883"].includes(error.code)) return failed("O salvamento estará disponível após a atualização do banco de dados.");
      if (["40001", "23505"].includes(error.code)) return failed("Os apontamentos mudaram em outra sessão. Atualize a página antes de salvar novamente.");
      if (["42501", "P0002"].includes(error.code)) return failed("Esta visita não está mais autorizada ou disponível para apontamentos.");
      if (error.code === "22023") return failed("Confira os textos dos apontamentos antes de salvar.");
      return failed("Não foi possível confirmar o salvamento. Tente novamente.");
    }
    const draft = parseDraft(data);
    if (!draft || draft.visitId !== input.visitId.toLowerCase() || draft.revision !== Number(input.expectedRevision) + 1)
      return failed("O salvamento não pôde ser confirmado. Atualize a página para conferir.");
    return { status: "success", message: "Apontamento salvo na plataforma.", draft };
  } catch { return failed("Não foi possível confirmar o salvamento. Tente novamente."); }
}
