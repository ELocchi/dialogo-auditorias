import type { SafetyClosure } from "../../domain/safety-audit.ts";
import type { Criterion } from "../../domain/catalogs.ts";
import type { AuditDrafts } from "../../domain/audit-draft.ts";
import type { AuditModelId, AuditRecord } from "../../domain/operational-records.ts";
import type { FvsService } from "../../domain/fvs-services.ts";
import type { ActionPlanRow } from "../pdf/types.ts";

export type AuditDraftRecord = {
  safety_closure?: SafetyClosure | null;
  id: string; visit_id: string; work_id: string; modulo: string; model_id: AuditModelId;
  audit_date: string; auditor_auth_user_id: string; auditor_name: string; work_name: string;
  catalog_revision_id: string | null; catalog_version: number; catalog_revision_label: string;
  criteria: Criterion[]; fvs_services: FvsService[]; responses: AuditDrafts;
  photos: Record<string, string>; revision: number; published_at: string | null; final_score?: number | null; report_file_name?: string;
};
export type PlanRecord = {
  audit_id: string; revision: number; rows: ActionPlanRow[];
  published_at?: string | null; report_file_name?: string;
};
export type PersistedAudit = { safetyClosure?: SafetyClosure; workName: string; audit: AuditRecord; responses: AuditDrafts; criteria: Criterion[]; revision: number; fvsServices: FvsService[] };
export type PublicationIndex = { drafts: PersistedAudit[]; plans: { auditId: string; workId: string; module: "quality" | "safety" }[] };
export const draftPhotoUrl = (id: string, file: string) => `/api/publications/${id}/photo?file=${encodeURIComponent(file)}`;
