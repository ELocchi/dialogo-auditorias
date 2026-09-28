import type { WorkFinding } from "../../app/follow-up/actions.ts";
import type { FindingDraft } from "./findings.ts";
import type { FindingPhoto } from "./photos.ts";
import type { FollowUpReport } from "./service.ts";

/** The list needs findings, but not the three long report/editor text fields. */
export type FollowUpWorkspaceReport = Pick<FollowUpReport,
  "id" | "title" | "visitId" | "revision" | "findings" | "updatedAt">;
export type FollowUpWorkspaceSnapshot = {
  available: boolean;
  reports: FollowUpWorkspaceReport[];
  drafts: FindingDraft[];
  completed: string[];
  workFindings: WorkFinding[];
  message?: string;
};
export type FollowUpReportIndexEntry = Pick<FollowUpReport, "id" | "title" | "visitId" | "updatedAt">;
export type FollowUpReportIndexSnapshot = { available: boolean; reports: FollowUpReportIndexEntry[]; message?: string };
export type FollowUpVisitPhotosSnapshot = { available: boolean; photos: FindingPhoto[]; message?: string };

export const unavailableFollowUpWorkspace = (message?: string): FollowUpWorkspaceSnapshot => ({
  available: false, reports: [], drafts: [], completed: [], workFindings: [], ...(message ? { message } : {}),
});
export const unavailableFollowUpReportIndex = (message?: string): FollowUpReportIndexSnapshot => ({
  available: false, reports: [], ...(message ? { message } : {}),
});
export const unavailableFollowUpVisitPhotos = (message?: string): FollowUpVisitPhotosSnapshot => ({
  available: false, photos: [], ...(message ? { message } : {}),
});
