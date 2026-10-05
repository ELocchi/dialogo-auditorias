import type { SafetyClosure } from "../../domain/safety-audit.ts";
import type { Criterion } from "../../domain/catalogs.ts";
import type { AuditDrafts } from "../../domain/audit-draft.ts";
import type { AppModule } from "../../domain/prototype-access.ts";

export type ActionPlanFinding = {
  id: string;
  item: string;
  description: string;
  criterionTitle?: string;
  subitem?: string;
  serious?: boolean;
  itemDescription?: string;
  verificationCriterion?: string;
  status?: string;
  nonconformity: string;
  evidencePhotos?: readonly { name: string; url?: string; thumbnailUrl?: string }[];
};

export type ActionPlanRow = ActionPlanFinding & {
  correctiveAction: string;
  responsible: string;
  startDate: string;
  dueDate: string;
};

export type AuditPdfInput = {
  model: string;
  modelId: string;
  workName: string;
  details: { date: string; auditor: string };
  criteria: Criterion[];
  drafts: AuditDrafts;
  safetyClosure?: SafetyClosure;
};

export type ActionPlanPdfInput = {
  workName: string;
  auditDate: string;
  auditScore: number | null;
  module: AppModule;
  authorName: string;
  rows: readonly ActionPlanRow[];
};

export type PdfPhotoSource = {
  reference: string;
  name: string;
  url?: string;
  file?: Blob;
};

export type PdfAssets = {
  logo: Uint8Array | null;
  photos: Record<string, { bytes: Uint8Array; mimeType: string; url?: string }>;
};

export type PdfJob = ({ kind: "audit"; input: AuditPdfInput } | { kind: "action-plan"; input: ActionPlanPdfInput }) & {
  baseUrl: string;
  photos: PdfPhotoSource[];
};

export type PdfWorkerResult = { bytes: Uint8Array } | { error: string };
