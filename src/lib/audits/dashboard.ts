import { getAnnualAdminRanking, getMonthlyAdminRanking, type PublishedMonthlyWorkScore } from "../../domain/admin-ranking.ts";
import { getRecurringFindings } from "../../domain/finding-recurrence.ts";
import type { WorkRecord } from "../../domain/operational-records.ts";
import { modelModule, moduleLabels, type AppModule } from "../../domain/prototype-access.ts";
import type { PublishedAuditFinding, PublishedAuditSnapshot } from "./contracts.ts";
import { unavailableAuditDashboard, type AuditDashboardSnapshot, type DashboardFindingSummary, type DashboardRanking } from "./dashboard-contracts.ts";

export function buildDashboardRanking(scores: readonly PublishedMonthlyWorkScore[]): DashboardRanking {
  const byMonth = new Map<string, PublishedMonthlyWorkScore[]>();
  const byYear = new Map<string, PublishedMonthlyWorkScore[]>();
  for (const score of scores) {
    if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(score.month)) continue;
    const month = byMonth.get(score.month) ?? [];
    month.push(score);
    byMonth.set(score.month, month);
    const yearKey = score.month.slice(0, 4);
    const year = byYear.get(yearKey) ?? [];
    year.push(score);
    byYear.set(yearKey, year);
  }
  return {
    months: [...byMonth.keys()].sort((left, right) => right.localeCompare(left)),
    monthly: Object.fromEntries([...byMonth].map(([month, results]) => [month, {
      safety: getMonthlyAdminRanking(results, month, "safety"),
      quality: getMonthlyAdminRanking(results, month, "quality"),
    }])),
    annual: Object.fromEntries([...byYear].map(([year, results]) => [year, {
      safety: getAnnualAdminRanking(results, year, "safety"),
      quality: getAnnualAdminRanking(results, year, "quality"),
    }])),
  };
}

function summarizeSeriousFindings(findings: readonly PublishedAuditFinding[], workNames: ReadonlyMap<string, string>): DashboardFindingSummary[] {
  const grouped = new Map<string, { summary: DashboardFindingSummary; works: Set<string> }>();
  for (const finding of findings) {
    if (!finding.serious) continue;
    const key = `${finding.module}:${finding.item}:${finding.description}`;
    const current = grouped.get(key);
    if (current) {
      current.summary.occurrences = (current.summary.occurrences ?? 0) + 1;
      current.works.add(finding.workId);
      current.summary.workCount = current.works.size;
      current.summary.references?.push({ id: finding.auditId, date: finding.auditDate, workName: workNames.get(finding.workId) ?? "Obra", responsible: finding.auditor });
      continue;
    }
    grouped.set(key, {
      summary: {
        id: key,
        title: finding.nonconformity,
        checklistItem: `${finding.item} · ${finding.description}`,
        discipline: moduleLabels[finding.module],
        workCount: 1,
        occurrences: 1,
        references: [{ id: finding.auditId, date: finding.auditDate, workName: workNames.get(finding.workId) ?? "Obra", responsible: finding.auditor }],
      },
      works: new Set([finding.workId]),
    });
  }
  return [...grouped.values()].map(({ summary }) => summary)
    .sort((left, right) => (right.occurrences ?? 0) - (left.occurrences ?? 0) || left.checklistItem!.localeCompare(right.checklistItem!, "pt-BR"))
    .slice(0, 5);
}

export function buildAuditDashboard(snapshot: PublishedAuditSnapshot, works: readonly WorkRecord[], modules: readonly AppModule[] = ["safety", "quality"]): AuditDashboardSnapshot {
  if (!snapshot.available) return unavailableAuditDashboard();
  const workNames = new Map(works.map((work) => [work.id, work.name]));
  const audits = snapshot.audits.filter((audit) => audit.status === "Publicada" && workNames.has(audit.workId) && modules.includes(modelModule(audit.modelId)));
  const auditIds = new Set(audits.map((audit) => audit.id));
  const findings = (snapshot.findings ?? []).filter((finding) => auditIds.has(finding.auditId) && workNames.has(finding.workId) && modules.includes(finding.module));
  const scores: PublishedMonthlyWorkScore[] = audits.flatMap((audit) => typeof audit.finalScore !== "number" ? [] : [{
    month: audit.date.slice(0, 7), discipline: modelModule(audit.modelId), workId: audit.workId,
    workName: workNames.get(audit.workId)!, score: audit.finalScore, published: true,
  }]);
  const scoreMonths: AuditDashboardSnapshot["scoreMonths"] = {};
  for (const score of scores) {
    const month = scoreMonths[score.month] ?? { sum: 0, count: 0 };
    month.sum += score.score;
    month.count += 1;
    scoreMonths[score.month] = month;
  }
  const findingKeys = (discipline?: AppModule) => new Set(findings.filter((finding) => !discipline || finding.module === discipline).map((finding) => `${finding.auditId}\0${finding.id}`)).size;
  return {
    available: true,
    publishedCount: audits.length,
    publishedModules: [...new Set(audits.map((audit) => modelModule(audit.modelId)))],
    findingCount: findingKeys(),
    findingCounts: { safety: findingKeys("safety"), quality: findingKeys("quality") },
    pendingPlanKeys: [...new Set(findings.map((finding) => `${finding.auditId}:${finding.module}:${finding.workId}`))],
    mostSevere: summarizeSeriousFindings(findings, workNames),
    mostRecurring: getRecurringFindings(findings).map((finding) => ({
      id: finding.id, title: `${finding.item} · ${finding.description}`, discipline: moduleLabels[finding.module],
      month: finding.latestDate.slice(0, 7), workCount: finding.workCount, occurrences: finding.occurrences, descriptions: finding.details,
    })),
    ranking: buildDashboardRanking(scores),
    scoreMonths,
  };
}
