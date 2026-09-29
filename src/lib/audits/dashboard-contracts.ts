import type { AdminRankingRow } from "../../domain/admin-ranking.ts";
import type { AppModule } from "../../domain/prototype-access.ts";

export type DashboardFindingSummary = {
  id: string;
  title: string;
  checklistItem?: string;
  discipline?: string;
  month?: string;
  workCount?: number;
  occurrences?: number;
  descriptions?: Array<{ label?: string; description: string }>;
  references?: Array<{ id: string; date: string; workName: string; responsible: string }>;
};

export type DashboardRankingRows = Record<AppModule, AdminRankingRow[]>;
export type DashboardRanking = {
  months: string[];
  monthly: Record<string, DashboardRankingRows>;
  annual: Record<string, DashboardRankingRows>;
};

/** Aggregates for the complete authorized history, independent of the loaded history page. */
export type AuditDashboardSnapshot = {
  available: boolean;
  publishedCount: number;
  publishedModules: AppModule[];
  findingCount: number;
  findingCounts: Record<AppModule, number>;
  pendingPlanKeys: string[];
  mostSevere: DashboardFindingSummary[];
  mostRecurring: DashboardFindingSummary[];
  ranking: DashboardRanking;
  /** Includes every publication, unlike the ranking's conflicting-month exclusion rule. */
  scoreMonths: Record<string, { sum: number; count: number }>;
};

export const unavailableAuditDashboard = (): AuditDashboardSnapshot => ({
  available: false,
  publishedCount: 0,
  publishedModules: [],
  findingCount: 0,
  findingCounts: { safety: 0, quality: 0 },
  pendingPlanKeys: [],
  mostSevere: [],
  mostRecurring: [],
  ranking: { months: [], monthly: {}, annual: {} },
  scoreMonths: {},
});
