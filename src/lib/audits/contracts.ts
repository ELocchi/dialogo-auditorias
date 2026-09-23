import type { PrototypeAuditState } from "../../domain/prototype-audits.ts";

export type PublishedAuditSnapshot = PrototypeAuditState & {
  available: boolean;
};

export const unavailablePublishedAudits = (): PublishedAuditSnapshot => ({
  available: false,
  audits: [],
  responses: {},
  criteriaSnapshots: {},
});
