export const auditHistoryPageSize = 10;

export type HistoryPageState = { contextKey: string; page: number };

export function getHistoryPage<T>(items: readonly T[], requestedPage: number, pageSize = auditHistoryPageSize) {
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : auditHistoryPageSize;
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(pageCount, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const offset = (page - 1) * size;
  return {
    items: items.slice(offset, offset + size),
    total: items.length,
    page,
    pageCount,
    first: items.length ? offset + 1 : 0,
    last: Math.min(offset + size, items.length),
  };
}

export function resolveHistoryPageState(current: HistoryPageState, contextKey: string, pageCount: number): HistoryPageState {
  const page = current.contextKey === contextKey ? Math.min(current.page, Math.max(1, pageCount)) : 1;
  return current.contextKey === contextKey && current.page === page ? current : { contextKey, page };
}

export function sortAuditHistory<T extends { id: string; date: string }>(audits: readonly T[]): T[] {
  return [...audits].sort((first, second) => second.date.localeCompare(first.date) || second.id.localeCompare(first.id));
}

export function groupAuditHistoryFindings<T extends { auditId: string; workId: string; auditDate: string; auditor: string }>(findings: readonly T[]) {
  const groups = new Map<string, { auditId: string; workId: string; auditDate: string; auditor: string; findings: T[] }>();
  for (const finding of findings) {
    const group = groups.get(finding.auditId);
    if (group) group.findings.push(finding);
    else groups.set(finding.auditId, {
      auditId: finding.auditId, workId: finding.workId, auditDate: finding.auditDate,
      auditor: finding.auditor, findings: [finding],
    });
  }
  return [...groups.values()].sort((first, second) => second.auditDate.localeCompare(first.auditDate) || second.auditId.localeCompare(first.auditId));
}
