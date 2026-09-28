import type { PrototypeAuditState } from "../../domain/prototype-audits.ts";
import type { AppModule } from "../../domain/prototype-access.ts";
import type { AuditModelId } from "../../domain/operational-records.ts";

/** Compact dashboard projection. Evidence and technical criteria load on demand. */
export type PublishedAuditFinding = {
  id: string;
  auditId: string;
  workId: string;
  auditDate: string;
  auditor: string;
  module: AppModule;
  modelId: AuditModelId;
  item: string;
  description: string;
  criterionTitle: string;
  subitem?: string;
  serious: boolean;
  nonconformity: string;
};

export type PublishedAuditSnapshot = PrototypeAuditState & {
  available: boolean;
  findings?: PublishedAuditFinding[];
};

export const unavailablePublishedAudits = (): PublishedAuditSnapshot => ({
  available: false,
  audits: [],
  responses: {},
  criteriaSnapshots: {},
});
