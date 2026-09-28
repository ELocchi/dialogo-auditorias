import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkFinding } from "../../app/follow-up/actions.ts";
import { uuidPattern } from "../access/validation.ts";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import type { FindingDraft } from "./findings.ts";
import { parsePhotoFileName, readVisitPhotos } from "./photos.ts";
import { parseFindings } from "./service.ts";
import {
  unavailableFollowUpReportIndex, unavailableFollowUpVisitPhotos, unavailableFollowUpWorkspace,
  type FollowUpReportIndexEntry, type FollowUpReportIndexSnapshot, type FollowUpVisitPhotosSnapshot,
  type FollowUpWorkspaceReport, type FollowUpWorkspaceSnapshot,
} from "./workspace-contracts.ts";

type Client = Pick<SupabaseClient, "rpc">;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" && uuidPattern.test(value);
const text = (value: unknown, max: number, min = 0): value is string => typeof value === "string"
  && value.trim().length >= min && value.length <= max && !value.includes("\u0000");
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const auditor = (context: ProfileWorkspaceContext) => context.profile === "AUDITOR_SEGURANCA" || context.profile === "AUDITOR_QUALIDADE";
const profileParams = (context: ProfileWorkspaceContext) => ({ p_profile: context.profile,
  p_engineering_scope: context.engineeringScope, p_administrative_scope: context.administrativeScope });
const workspaceMessage = "Não foi possível consultar os apontamentos. Tente novamente.";
const reportMessage = "Não foi possível consultar os relatórios orientativos. Tente novamente.";
const photoMessage = "Não foi possível consultar as fotos desta visita. Tente novamente.";

function parseIndexEntry(value: unknown): FollowUpReportIndexEntry | null {
  if (!object(value) || !uuid(value.id) || !uuid(value.visitId)
    || !text(value.title, 120, 1) || !timestamp(value.updatedAt)) return null;
  return { id: value.id.toLowerCase(), title: value.title.trim(),
    visitId: value.visitId.toLowerCase(), updatedAt: value.updatedAt };
}

function parseWorkspaceReport(value: unknown): FollowUpWorkspaceReport | null {
  const entry = parseIndexEntry(value);
  if (!entry || !object(value) || !Number.isInteger(value.revision) || Number(value.revision) < 1) return null;
  const findings = parseFindings(value.findings);
  return findings ? { ...entry, revision: Number(value.revision), findings } : null;
}

function parseDraft(value: unknown): FindingDraft | null {
  if (!object(value) || !uuid(value.visitId) || !Number.isInteger(value.revision)
    || Number(value.revision) < 1 || !timestamp(value.updatedAt)) return null;
  const findings = parseFindings(value.findings);
  return findings ? { visitId: value.visitId.toLowerCase(), revision: Number(value.revision),
    findings, updatedAt: value.updatedAt } : null;
}

function parseWorkFinding(value: unknown, context: ProfileWorkspaceContext): WorkFinding | null {
  const discipline = context.profile === "AUDITOR_SEGURANCA" ? "safety" : "quality";
  if (!object(value) || !uuid(value.id) || !uuid(value.workId)
    || value.module !== discipline
    || !text(value.location, 200) || !text(value.description, 2000, 5) || !text(value.correction, 2000, 5)
    || typeof value.photoFileName !== "string" || parsePhotoFileName(value.photoFileName)?.findingId !== value.id.toLowerCase()
    || !timestamp(value.createdAt)) return null;
  if (!context.works.some((work) => work.id === value.workId)
    || !context.user.workModuleScopes?.some((scope) => scope.workId === value.workId && scope.module === value.module)) return null;
  return { id: value.id.toLowerCase(), workId: value.workId.toLowerCase(), module: discipline,
    location: value.location, description: value.description, correction: value.correction,
    photoFileName: value.photoFileName, createdAt: value.createdAt };
}

function parseCompleted(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parts = value.split(":");
  return parts.length === 2 && parts.every(uuid) ? parts.join(":").toLowerCase() : null;
}

function parseList<T>(value: unknown, parse: (entry: unknown) => T | null, key: (entry: T) => string): T[] | null {
  if (!Array.isArray(value)) return null;
  const result: T[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const entry = parse(raw);
    if (entry === null || seen.has(key(entry))) return null;
    seen.add(key(entry));
    result.push(entry);
  }
  return result;
}

/** One RPC supplies a consistent complete list; list length is never a page cap. */
export async function readFollowUpWorkspace(client: Client, context: ProfileWorkspaceContext): Promise<FollowUpWorkspaceSnapshot> {
  if (!auditor(context)) return unavailableFollowUpWorkspace();
  try {
    const { data, error } = await client.rpc("read_follow_up_workspace", profileParams(context));
    if (error || !object(data) || data.available !== true) return unavailableFollowUpWorkspace(workspaceMessage);
    const reports = parseList(data.reports, parseWorkspaceReport, (entry) => entry.id);
    const drafts = parseList(data.drafts, parseDraft, (entry) => entry.visitId);
    const completed = parseList(data.completed, parseCompleted, (entry) => entry);
    const workFindings = parseList(data.workFindings, (entry) => parseWorkFinding(entry, context), (entry) => entry.id);
    // Do not publish partially validated lists: callers retain the previous view.
    return reports && drafts && completed && workFindings
      ? { available: true, reports, drafts, completed, workFindings }
      : unavailableFollowUpWorkspace(workspaceMessage);
  } catch { return unavailableFollowUpWorkspace(workspaceMessage); }
}

export async function readFollowUpReportIndex(client: Client, context: ProfileWorkspaceContext): Promise<FollowUpReportIndexSnapshot> {
  if (context.profile !== "ENGENHARIA") return unavailableFollowUpReportIndex();
  try {
    const { data, error } = await client.rpc("read_follow_up_report_index", profileParams(context));
    if (error || !object(data) || data.available !== true) return unavailableFollowUpReportIndex(reportMessage);
    const reports = parseList(data.reports, parseIndexEntry, (entry) => entry.id);
    return reports ? { available: true, reports } : unavailableFollowUpReportIndex(reportMessage);
  } catch { return unavailableFollowUpReportIndex(reportMessage); }
}

export type FollowUpVisitPhotosResult = { status: 200 | 403 | 404 | 503; snapshot: FollowUpVisitPhotosSnapshot };

export async function readFollowUpVisitPhotos(client: Pick<SupabaseClient, "rpc" | "storage">,
  context: ProfileWorkspaceContext, visitId: string): Promise<FollowUpVisitPhotosResult> {
  if (!auditor(context)) return { status: 403, snapshot: unavailableFollowUpVisitPhotos() };
  if (!uuid(visitId)) return { status: 404, snapshot: unavailableFollowUpVisitPhotos() };
  try {
    const { data, error } = await client.rpc("can_read_follow_up_visit_photos", {
      p_visit_id: visitId.toLowerCase(), ...profileParams(context),
    });
    if (error) return { status: error.code === "42501" ? 403 : 503, snapshot: unavailableFollowUpVisitPhotos(photoMessage) };
    if (data === false) return { status: 404, snapshot: unavailableFollowUpVisitPhotos() };
    if (data !== true) return { status: 503, snapshot: unavailableFollowUpVisitPhotos(photoMessage) };
    // No agenda/reports/drafts hydration, signing, download or cross-visit listing.
    const photos = await readVisitPhotos(client, context.user.id, visitId);
    return photos ? { status: 200, snapshot: { available: true, photos } }
      : { status: 503, snapshot: unavailableFollowUpVisitPhotos(photoMessage) };
  } catch { return { status: 503, snapshot: unavailableFollowUpVisitPhotos(photoMessage) }; }
}
