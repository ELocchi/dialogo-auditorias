"use client";

import { useId, useState } from "react";
import { getAnnualAdminRanking, getMonthlyAdminRanking, type PublishedMonthlyWorkScore } from "@/domain/admin-ranking";
import type { DashboardRanking } from "@/lib/audits/dashboard-contracts";
import styles from "./admin-monthly-ranking.module.css";

export type AdminMonthlyRankingRow = {
  workId: string;
  workName: string;
  position: number | null;
  score: number | null;
  monthsCount?: number;
};

type AdminMonthlyRankingProps = {
  modules?: readonly ("safety" | "quality")[];
  /** When supplied, the parent controls the month and provides its matching rows. */
  month?: string;
  onMonthChange?: (month: string) => void;
  year?: string;
  onYearChange?: (year: string) => void;
  /** Published monthly scores from persistent records; annual averages use only these results. */
  publishedMonthlyScores?: readonly PublishedMonthlyWorkScore[];
  summary?: DashboardRanking;
  available?: boolean;
  /** Already authorized, ordered and calculated by the data provider. */
  safetyRows?: readonly AdminMonthlyRankingRow[];
  qualityRows?: readonly AdminMonthlyRankingRow[];
};

const monthFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", timeZone: "America/Sao_Paulo",
});
const scoreFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function currentMonth() {
  const parts = monthFormatter.formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`;
}

function RankingTable({ title, reference, annual, rows }: {
  title: string; reference: string; annual: boolean; rows: readonly AdminMonthlyRankingRow[];
}) {
  const headingId = useId();
  return <section className={styles.ranking} aria-labelledby={headingId}>
    <h4 id={headingId} className={styles.discipline}>{title}</h4>
    <table className={styles.table}>
      <caption className={styles.srOnly}>Ranking de {title} no {annual ? `ano ${reference}` : `mês ${reference}`}</caption>
      <colgroup><col className={styles.positionColumn} /><col /><col className={styles.scoreColumn} /></colgroup>
      <thead><tr><th scope="col"><abbr title="Posição">Pos.</abbr></th><th scope="col">Obra</th><th scope="col" className={styles.score}>{annual ? "Média" : "Nota"}</th></tr></thead>
      <tbody>{rows.length ? rows.map((row) => <tr key={row.workId}>
        <td className={styles.position}>{row.position !== null && Number.isInteger(row.position) && row.position > 0 ? `${row.position}º` : <span aria-label="Sem classificação">—</span>}</td>
        <th scope="row" className={styles.work}>{row.workName}</th>
        <td className={styles.score}>{row.score !== null && Number.isFinite(row.score) ? scoreFormatter.format(row.score) : <span aria-label="Nota indisponível">—</span>}</td>
      </tr>) : <tr><td colSpan={3} className={styles.empty}>Nenhum resultado disponível neste {annual ? "ano" : "mês"}.</td></tr>}</tbody>
    </table>
  </section>;
}

/** Published monthly results drive the annual average; drafts and fixtures stay out of this view. */
export function AdminMonthlyRanking({ month, onMonthChange, year, onYearChange, publishedMonthlyScores, summary, available = true, modules = ["safety", "quality"], safetyRows = [], qualityRows = [] }: AdminMonthlyRankingProps) {
  const [localMonth, setLocalMonth] = useState(currentMonth);
  const [localYear, setLocalYear] = useState(() => currentMonth().slice(0, 4));
  const [period, setPeriod] = useState<"month" | "year">("month");
  const selectedMonth = month ?? localMonth;
  const selectedYear = year ?? localYear;
  const headingId = useId();
  const monthId = useId();
  const yearId = useId();
  const periodId = useId();
  const currentYear = Number(currentMonth().slice(0, 4));
  const availableMonths = summary?.months ?? (publishedMonthlyScores ?? []).map((result) => result.month);
  const yearOptions = [...new Set([
    ...Array.from({ length: currentYear - 1999 }, (_, index) => String(currentYear - index)),
    selectedYear,
    ...availableMonths.map((month) => month.slice(0, 4)),
  ])].filter((value) => /^(?!0000)\d{4}$/.test(value)).sort((left, right) => right.localeCompare(left));
  const monthYears = [...new Set([currentMonth().slice(0, 4), selectedMonth.slice(0, 4),
    ...availableMonths.map((month) => month.slice(0, 4))])]
    .filter((value) => /^(?!0000)\d{4}$/.test(value)).sort((left, right) => right.localeCompare(left));
  const monthOptions = monthYears.flatMap((optionYear) => monthNames.map((label, index) => ({
    value: `${optionYear}-${String(index + 1).padStart(2, "0")}`,
    label: `${label} de ${optionYear}`,
  }))).sort((left, right) => right.value.localeCompare(left.value));
  const annual = period === "year";
  const periodRanking = summary ? (annual ? summary.annual[selectedYear] : summary.monthly[selectedMonth]) : undefined;
  const safetyRanking = summary ? periodRanking?.safety ?? [] : annual ? getAnnualAdminRanking(publishedMonthlyScores ?? [], selectedYear, "safety")
    : publishedMonthlyScores ? getMonthlyAdminRanking(publishedMonthlyScores, selectedMonth, "safety") : safetyRows;
  const qualityRanking = summary ? periodRanking?.quality ?? [] : annual ? getAnnualAdminRanking(publishedMonthlyScores ?? [], selectedYear, "quality")
    : publishedMonthlyScores ? getMonthlyAdminRanking(publishedMonthlyScores, selectedMonth, "quality") : qualityRows;

  return <section className={`panel ${styles.panel}`} aria-labelledby={headingId}>
    <div className={styles.heading}>
      <h3 id={headingId}>Ranking das Obras</h3>
      <div className={styles.filters}>
        <label className={styles.period} htmlFor={periodId}>
          <span className={styles.srOnly}>Período do ranking</span>
          <select className="filter-select" id={periodId} value={period} onChange={(event) => setPeriod(event.target.value as "month" | "year")}>
            <option value="month">Mensal</option>
            <option value="year">Anual</option>
          </select>
        </label>
        {annual ? <label className={styles.year} htmlFor={yearId}>
          <span className={styles.srOnly}>Ano de referência</span>
          <select className="filter-select" id={yearId} value={selectedYear} disabled={year !== undefined && !onYearChange}
            onChange={(event) => {
              const nextYear = event.target.value;
              if (!/^(?!0000)\d{4}$/.test(nextYear)) return;
              if (year === undefined) setLocalYear(nextYear);
              onYearChange?.(nextYear);
            }}>
            {yearOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label> : <label className={styles.month} htmlFor={monthId}>
          <span className={styles.srOnly}>Mês de referência</span>
          <select className="filter-select" id={monthId} value={selectedMonth}
            required disabled={month !== undefined && !onMonthChange}
            onChange={(event) => {
              const nextMonth = event.target.value;
              if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(nextMonth)) return;
              if (month === undefined) setLocalMonth(nextMonth);
              onMonthChange?.(nextMonth);
            }}>{monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        </label>}
      </div>
    </div>
    {!available ? <p role="status">Não foi possível carregar o ranking das obras.</p> : <div className={styles.rankings}>
      {modules.includes("safety") && <RankingTable title="Segurança" reference={annual ? selectedYear : selectedMonth} annual={annual} rows={safetyRanking} />}
      {modules.includes("quality") && <RankingTable title="Qualidade" reference={annual ? selectedYear : selectedMonth} annual={annual} rows={qualityRanking} />}
    </div>}
  </section>;
}
