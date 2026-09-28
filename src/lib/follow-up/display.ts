import type { Visit } from "../../domain/prototype-access.ts";
import type { FollowUpFinding } from "./service.ts";

export type DisplayFollowUpReport = { visitId: string; updatedAt: string; findings: readonly FollowUpFinding[] };
export type SavedFollowUpFinding = FollowUpFinding & {
  source: "report" | "saved";
  visitId: string;
  workId: string;
  workName: string;
  date: string;
};

export function indexFollowUpReports<T extends DisplayFollowUpReport>(reports: readonly T[]): Map<string, T[]> {
  const indexed = new Map<string, T[]>();
  for (const report of reports) {
    const entries = indexed.get(report.visitId) ?? [];
    entries.push(report);
    indexed.set(report.visitId, entries);
  }
  for (const entries of indexed.values()) entries.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  return indexed;
}

export function mergeFollowUpFindings(visits: readonly Visit[],
  drafts: ReadonlyMap<string, { findings: readonly FollowUpFinding[] }>,
  reports: ReadonlyMap<string, readonly DisplayFollowUpReport[]>,
  completed: readonly string[], works: ReadonlyMap<string, { name: string }>): SavedFollowUpFinding[] {
  const completedIds = new Set(completed);
  return visits.flatMap((visit) => {
    const draft = drafts.get(visit.id)?.findings ?? [];
    const draftIds = new Set(draft.map((finding) => finding.id));
    const reported = new Map<string, FollowUpFinding>();
    for (const report of reports.get(visit.id) ?? []) for (const finding of report.findings) reported.set(finding.id, finding);
    return [
      ...draft.map((finding) => ({ ...finding, source: reported.has(finding.id) ? "report" as const : "saved" as const })),
      ...[...reported.values()].filter((finding) => !draftIds.has(finding.id)).map((finding) => ({ ...finding, source: "report" as const })),
    ].filter((finding) => !completedIds.has(`${visit.id}:${finding.id}`))
      .map((finding) => ({ ...finding, visitId: visit.id, workId: visit.workId, workName: works.get(visit.workId)?.name ?? "Obra", date: visit.date }));
  });
}
