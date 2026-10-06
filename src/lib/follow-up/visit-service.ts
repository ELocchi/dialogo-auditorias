import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkFinding } from "../../app/follow-up/actions.ts";
import { canReadVisit, type Visit } from "../../domain/prototype-access.ts";
import { isCalendarDate } from "../../domain/visit-calendar.ts";
import { uuidPattern } from "../access/validation.ts";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import type { FindingDraft } from "./findings.ts";
import { parsePhotoFileName } from "./photos.ts";
import { parseFindings, parseReport, type FollowUpReport } from "./service.ts";
import {
  unavailableFollowUpReportDetail, unavailableFollowUpVisit,
  type FollowUpReportDetailSnapshot, type FollowUpVisitSnapshot, type FollowUpWorkPhoto,
} from "./visit-contracts.ts";

type Client = Pick<SupabaseClient, "rpc">;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" && uuidPattern.test(value);
const text = (value: unknown, max: number, min = 0): value is string => typeof value === "string"
  && value.trim().length >= min && value.length <= max && !value.includes("\u0000");
const timestamp = (value: unknown): value is string => typeof value === "string"
  && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const revision = (value: unknown): value is number => typeof value === "number"
  && Number.isInteger(value) && value >= 1 && value < 2147483647;
const date = (value: unknown): value is string => typeof value === "string" && isCalendarDate(value);
const auditor = (context: ProfileWorkspaceContext) => context.profile === "AUDITOR_SEGURANCA" || context.profile === "AUDITOR_QUALIDADE";
const params = (context: ProfileWorkspaceContext, visitId: string) => ({ p_visit_id: visitId,
  p_profile: context.profile, p_engineering_scope: context.engineeringScope, p_administrative_scope: context.administrativeScope });
const unavailableMessage = "Não foi possível consultar o acompanhamento. Tente novamente.";

/** Validate the same persisted Visit fields as the agenda, for one follow-up. */
function parseVisit(value: unknown, context: ProfileWorkspaceContext, visitId: string): Visit | null {
  if (!object(value) || !uuid(value.id) || value.id.toLowerCase() !== visitId
    || !uuid(value.workId) || !uuid(value.auditorId) || !uuid(value.createdBy)
    || value.kind !== "follow_up" || value.modelId !== null
    || (value.module !== "safety" && value.module !== "quality")
    || !text(value.workName, 200, 1) || !text(value.note, 2000)
    || !text(value.auditorName, 200) || !text(value.createdByName, 200)
    || !date(value.date) || !timestamp(value.createdAt) || !revision(value.revision)
    || (value.confirmationStatus !== "pending_confirmation" && value.confirmationStatus !== "confirmed")
    || (value.confirmationStatus === "confirmed" ? !timestamp(value.confirmedAt) : value.confirmedAt !== null)
    || !Array.isArray(value.history)) return null;
  const history: Visit["history"][number][] = [];
  for (const entry of value.history) {
    if (!object(entry) || !date(entry.previousDate) || !date(entry.date) || !text(entry.note, 2000)
      || !uuid(entry.changedBy) || !timestamp(entry.changedAt)) return null;
    history.push({ previousDate: entry.previousDate, date: entry.date, note: entry.note,
      changedBy: entry.changedBy.toLowerCase(), changedAt: entry.changedAt });
  }
  const visit: Visit = { id: visitId, workId: value.workId.toLowerCase(), workName: value.workName.trim(),
    module: value.module, kind: "follow_up", modelId: null, auditorId: value.auditorId.toLowerCase(),
    date: value.date, note: value.note, createdBy: value.createdBy.toLowerCase(), createdAt: value.createdAt,
    revision: value.revision, confirmationStatus: value.confirmationStatus, confirmedAt: value.confirmedAt as string | null,
    auditorName: value.auditorName, createdByName: value.createdByName, history };
  if (!context.works.some((work) => work.id === visit.workId)
    || !context.user.workModuleScopes?.some((scope) => scope.workId === visit.workId && scope.module === visit.module)
    || (auditor(context) && (visit.auditorId !== context.user.id
      || visit.module !== (context.profile === "AUDITOR_SEGURANCA" ? "safety" : "quality")))) return null;
  return canReadVisit(context.user, visit) ? visit : null;
}

function parseVisitReport(value: unknown, visitId: string): FollowUpReport | null {
  // The current table has real IDs/titles: do not accept the legacy parser's fallback here.
  if (!object(value) || !uuid(value.id) || !uuid(value.visitId)
    || value.visitId.toLowerCase() !== visitId || !text(value.title, 120, 1)) return null;
  return parseReport(value);
}

function parseDraft(value: unknown, visitId: string): FindingDraft | null {
  if (!object(value) || !uuid(value.visitId) || value.visitId.toLowerCase() !== visitId
    || !revision(value.revision) || !timestamp(value.updatedAt)) return null;
  const findings = parseFindings(value.findings);
  return findings ? { visitId, revision: value.revision, findings, updatedAt: value.updatedAt } : null;
}

function parseWorkFinding(value: unknown, visit: Visit): WorkFinding | null {
  if (!object(value) || !uuid(value.id) || !uuid(value.workId) || value.workId.toLowerCase() !== visit.workId
    || value.module !== visit.module || !text(value.location, 200)
    || !text(value.description, 2000, 5) || !text(value.correction, 2000, 5)
    || typeof value.serious !== "boolean"
    || typeof value.photoFileName !== "string" || parsePhotoFileName(value.photoFileName)?.findingId !== value.id.toLowerCase()
    || !timestamp(value.createdAt)) return null;
  return { id: value.id.toLowerCase(), workId: visit.workId, module: visit.module,
    location: value.location, description: value.description, correction: value.correction, serious: value.serious,
    photoFileName: value.photoFileName, createdAt: value.createdAt };
}

function parseList<T>(value: unknown, parse: (entry: unknown) => T | null, key: (entry: T) => string): T[] | null {
  if (!Array.isArray(value)) return null;
  const result: T[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const entry = parse(raw);
    if (!entry || seen.has(key(entry))) return null;
    seen.add(key(entry)); result.push(entry);
  }
  return result;
}

export async function readFollowUpVisit(client: Client, context: ProfileWorkspaceContext, visitId: string, headerOnly = false, findingId?: string): Promise<FollowUpVisitSnapshot> {
  if (!auditor(context) || !uuid(visitId) || findingId !== undefined && !uuid(findingId)) return unavailableFollowUpVisit();
  const id = visitId.toLowerCase();
  try {
    const { data, error } = await client.rpc(headerOnly ? "read_follow_up_editor_header" : findingId ? "read_follow_up_finding_context" : "read_follow_up_visit", { ...params(context, id), ...(findingId ? { p_finding_id: findingId } : {}) });
    if (error || !object(data) || data.available !== true || !Array.isArray(data.reports)
      || !Array.isArray(data.workFindings)) return unavailableFollowUpVisit(unavailableMessage);
    if (data.visit === null) return data.reports.length === 0 && data.draft === null && data.workFindings.length === 0
      ? { available: true, visit: null, reports: [], draft: null, workFindings: [] }
      : unavailableFollowUpVisit(unavailableMessage);
    const visit = parseVisit(data.visit, context, id);
    if (!visit) return unavailableFollowUpVisit(unavailableMessage);
    const reports = parseList(data.reports, (entry) => parseVisitReport(entry, id), (entry) => entry.id);
    const draft = data.draft === null ? null : parseDraft(data.draft, id);
    const workFindings = parseList(data.workFindings, (entry) => parseWorkFinding(entry, visit), (entry) => entry.id);
    if (!reports || (data.draft !== null && !draft) || !workFindings) return unavailableFollowUpVisit(unavailableMessage);
    return { available: true, visit, reports, draft, workFindings, ...(headerOnly ? { hasReports: data.hasReports === true, hasLegacyReport: data.hasLegacyReport === true } : {}) };
  } catch { return unavailableFollowUpVisit(unavailableMessage); }
}

export async function readFollowUpReportDetail(client: Client, context: ProfileWorkspaceContext,
  visitId: string, reportId: string | null = null): Promise<FollowUpReportDetailSnapshot> {
  if ((!auditor(context) && context.profile !== "ENGENHARIA") || !uuid(visitId)
    || (reportId !== null && !uuid(reportId))) return unavailableFollowUpReportDetail();
  const id = visitId.toLowerCase();
  const selectedId = reportId?.toLowerCase() ?? null;
  try {
    const { data, error } = await client.rpc("read_follow_up_report_detail", { ...params(context, id), p_report_id: selectedId });
    if (error || !object(data) || data.available !== true || !Array.isArray(data.workPhotos))
      return unavailableFollowUpReportDetail(unavailableMessage);
    if (data.visit === null) return data.report === null && data.workPhotos.length === 0
      ? { available: true, visit: null, report: null, workPhotos: [] } : unavailableFollowUpReportDetail(unavailableMessage);
    const visit = parseVisit(data.visit, context, id);
    if (!visit) return unavailableFollowUpReportDetail(unavailableMessage);
    if (data.report === null) return data.workPhotos.length === 0
      ? { available: true, visit, report: null, workPhotos: [] } : unavailableFollowUpReportDetail(unavailableMessage);
    const report = parseVisitReport(data.report, id);
    if (!report || (selectedId !== null && report.id !== selectedId)) return unavailableFollowUpReportDetail(unavailableMessage);
    const findingIds = new Set(report.findings.map((entry) => entry.id));
    const workPhotos = parseList<FollowUpWorkPhoto>(data.workPhotos, (entry) => {
      if (!object(entry) || !uuid(entry.findingId) || !findingIds.has(entry.findingId.toLowerCase())
        || entry.scopeId !== visit.workId || typeof entry.fileName !== "string"
        || parsePhotoFileName(entry.fileName)?.findingId !== entry.findingId.toLowerCase()) return null;
      return { findingId: entry.findingId.toLowerCase(), fileName: entry.fileName, scopeId: visit.workId };
    }, (entry) => entry.findingId);
    return workPhotos ? { available: true, visit, report, workPhotos } : unavailableFollowUpReportDetail(unavailableMessage);
  } catch { return unavailableFollowUpReportDetail(unavailableMessage); }
}
