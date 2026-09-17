export type RankingDiscipline = "safety" | "quality";

/** One published monthly result per work and discipline, supplied by the persisted data provider. */
export type PublishedMonthlyWorkScore = {
  month: string;
  discipline: RankingDiscipline;
  workId: string;
  workName: string;
  score: number;
  published: true;
};

export type AdminRankingRow = {
  workId: string;
  workName: string;
  position: number;
  score: number;
  monthsCount: number;
};

const monthPattern = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/;
const workNames = new Intl.Collator("pt-BR", { sensitivity: "base" });

function validMonthlyScores(results: readonly PublishedMonthlyWorkScore[], discipline: RankingDiscipline) {
  const byWorkMonth = new Map<string, PublishedMonthlyWorkScore | null>();
  for (const result of results) {
    if (result.published !== true || result.discipline !== discipline || !monthPattern.test(result.month)
      || !result.workId.trim() || !result.workName.trim()
      || !Number.isFinite(result.score) || result.score < 0 || result.score > 10) continue;

    const key = `${result.workId}\0${result.month}`;
    const previous = byWorkMonth.get(key);
    if (previous === undefined && !byWorkMonth.has(key)) byWorkMonth.set(key, result);
    else if (previous && previous.score === result.score) {
      if (workNames.compare(result.workName, previous.workName) < 0) byWorkMonth.set(key, result);
    } else byWorkMonth.set(key, null); // Conflicting monthly values cannot enter a ranking.
  }
  return [...byWorkMonth.values()].filter((result): result is PublishedMonthlyWorkScore => result !== null);
}

function rank(rows: Omit<AdminRankingRow, "position">[]): AdminRankingRow[] {
  rows.sort((left, right) => right.score - left.score
    || workNames.compare(left.workName, right.workName)
    || left.workId.localeCompare(right.workId));
  let previousScore: number | null = null;
  let position = 0;
  return rows.map((row, index) => {
    if (row.score !== previousScore) position = index + 1;
    previousScore = row.score;
    return { ...row, position };
  });
}

export function getMonthlyAdminRanking(
  results: readonly PublishedMonthlyWorkScore[], month: string, discipline: RankingDiscipline,
): AdminRankingRow[] {
  if (!monthPattern.test(month)) return [];
  return rank(validMonthlyScores(results, discipline)
    .filter((result) => result.month === month)
    .map((result) => ({ workId: result.workId, workName: result.workName, score: result.score, monthsCount: 1 })));
}

/** Annual score is the mean of available published monthly scores; missing months are excluded. */
export function getAnnualAdminRanking(
  results: readonly PublishedMonthlyWorkScore[], year: string, discipline: RankingDiscipline,
): AdminRankingRow[] {
  if (!/^(?!0000)\d{4}$/.test(year)) return [];
  const byWork = new Map<string, { workName: string; latestMonth: string; total: number; monthsCount: number }>();
  for (const result of validMonthlyScores(results, discipline)) {
    if (!result.month.startsWith(`${year}-`)) continue;
    const current = byWork.get(result.workId);
    if (!current) {
      byWork.set(result.workId, { workName: result.workName, latestMonth: result.month, total: result.score, monthsCount: 1 });
    } else {
      current.total += result.score;
      current.monthsCount += 1;
      if (result.month > current.latestMonth) {
        current.workName = result.workName;
        current.latestMonth = result.month;
      }
    }
  }
  return rank([...byWork].map(([workId, result]) => ({
    workId,
    workName: result.workName,
    score: Number((result.total / result.monthsCount).toFixed(2)),
    monthsCount: result.monthsCount,
  })));
}
