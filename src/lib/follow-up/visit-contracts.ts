import type { Visit } from "../../domain/prototype-access.ts";
import type { WorkFinding } from "../../app/follow-up/actions.ts";
import type { FindingDraft } from "./findings.ts";
import type { FollowUpReport } from "./service.ts";

export type FollowUpVisitSnapshot = {
  available: boolean;
  visit: Visit | null;
  reports: FollowUpReport[];
  hasReports?: boolean;
  hasLegacyReport?: boolean;
  draft: FindingDraft | null;
  workFindings: WorkFinding[];
  message?: string;
};

/** Work-scoped photos already selected by the report's finding IDs. */
export type FollowUpWorkPhoto = { findingId: string; fileName: string; scopeId: string };
export type FollowUpReportDetailSnapshot = {
  available: boolean;
  visit: Visit | null;
  report: FollowUpReport | null;
  workPhotos: FollowUpWorkPhoto[];
  message?: string;
};

export const unavailableFollowUpVisit = (message?: string): FollowUpVisitSnapshot => ({
  available: false, visit: null, reports: [], draft: null, workFindings: [], ...(message ? { message } : {}),
});
export const unavailableFollowUpReportDetail = (message?: string): FollowUpReportDetailSnapshot => ({
  available: false, visit: null, report: null, workPhotos: [], ...(message ? { message } : {}),
});
