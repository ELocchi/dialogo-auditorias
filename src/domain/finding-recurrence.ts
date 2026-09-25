import type { AuditModelId } from "./operational-records.ts";
import type { AppModule } from "./prototype-access.ts";

export type PublishedFindingOccurrence = {
  auditId: string;
  workId: string;
  auditDate: string;
  module: AppModule;
  modelId: AuditModelId;
  item: string;
  description: string;
  criterionTitle?: string;
  subitem?: string;
  nonconformity: string;
};

export type RecurringFinding = {
  id: string;
  module: AppModule;
  modelId: AuditModelId;
  item: string;
  description: string;
  details: Array<{ label?: string; description: string }>;
  occurrences: number;
  workCount: number;
  latestDate: string;
};

export function getRecurringFindings(findings: readonly PublishedFindingOccurrence[], limit = 5): RecurringFinding[] {
  const groups = new Map<string, {
    finding: PublishedFindingOccurrence;
    auditIds: Set<string>;
    workIds: Set<string>;
    latestDate: string;
    details: Map<string, { label?: string; description: string }>;
  }>();
  findings.forEach((finding) => {
    const criterionTitle = finding.criterionTitle || finding.description;
    const key = [finding.module, finding.modelId, finding.item, criterionTitle].join("\0");
    const detail = { ...(finding.subitem ? { label: finding.subitem } : {}), description: finding.nonconformity };
    const detailKey = `${finding.subitem ?? ""}\0${finding.nonconformity}`;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { finding, auditIds: new Set([finding.auditId]), workIds: new Set([finding.workId]), latestDate: finding.auditDate, details: new Map([[detailKey, detail]]) });
      return;
    }
    current.auditIds.add(finding.auditId);
    current.workIds.add(finding.workId);
    current.details.set(detailKey, detail);
    if (finding.auditDate > current.latestDate) current.latestDate = finding.auditDate;
  });
  return [...groups.entries()].flatMap(([id, group]) => group.auditIds.size < 2 ? [] : [{
    id,
    module: group.finding.module,
    modelId: group.finding.modelId,
    item: group.finding.item,
    description: group.finding.criterionTitle || group.finding.description,
    details: [...group.details.values()],
    occurrences: group.auditIds.size,
    workCount: group.workIds.size,
    latestDate: group.latestDate,
  }]).sort((left, right) => right.occurrences - left.occurrences
    || right.workCount - left.workCount
    || right.latestDate.localeCompare(left.latestDate)
    || left.item.localeCompare(right.item, "pt-BR"))
    .slice(0, Math.max(0, limit));
}
