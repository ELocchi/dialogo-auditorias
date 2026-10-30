"use client";

import { useId, useState } from "react";
import { getAnnualAdminRanking, getMonthlyAdminRanking, type PublishedMonthlyWorkScore } from "@/domain/admin-ranking";
import { shiftCalendarMonth } from "@/domain/visit-calendar";
import type { DashboardRanking } from "@/lib/audits/dashboard-contracts";
import type { WorkRecord } from "@/domain/operational-records";
import { rankingPdf, type RankingPdfRow } from "@/lib/pdf/ranking-report";
import { Icon } from "./ui-icon";
import styles from "./admin-monthly-ranking.module.css";

export type AdminMonthlyRankingRow = {
  workId: string;
  workName: string;
  position: number | null;
  score: number | null;
  monthsCount?: number;
  rawScore?: number | null;
  penalty?: number;
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
  /** Administrativo: exporta o ranking de cada disciplina em PDF. */
  exportable?: boolean;
  /** Active works listed as "NÃO AVALIADA" in the export when they have no result in the period. */
  works?: readonly WorkRecord[];
};

const monthFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", timeZone: "America/Sao_Paulo",
});
const scoreFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const monthLabelFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long", year: "numeric", timeZone: "UTC",
});

function currentMonth() {
  const parts = monthFormatter.formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`;
}

function RankingTable({ title, reference, annual, rows, onExport, exporting = false }: {
  title: string; reference: string; annual: boolean; rows: readonly AdminMonthlyRankingRow[]; onExport?: () => void; exporting?: boolean;
}) {
  const headingId = useId();
  return <section className={styles.ranking} aria-labelledby={headingId}>
    <div className={styles.disciplineHeading}>
      <h4 id={headingId} className={styles.discipline}>{title}</h4>
      {onExport && <button type="button" className={styles.monthButton} data-tooltip={`Exportar ranking de ${title}`} aria-label={`Exportar ranking de ${title} em PDF`}
        disabled={exporting} onClick={onExport}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14" /></svg></button>}
    </div>
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

async function loadPng(path: string) {
  return fetch(path).then(async (response) => response.ok ? new Uint8Array(await response.arrayBuffer()) : null).catch(() => null);
}

const workNames = new Intl.Collator("pt-BR", { sensitivity: "base" });

/** Builds the poster rows: the period ranking, the annual average up to the period and the active works without a result. */
function rankingPdfRows({ annual, month, year, discipline, periodRows, monthlyScores, works }: {
  annual: boolean; month: string; year: string; discipline: "safety" | "quality";
  periodRows: readonly AdminMonthlyRankingRow[]; monthlyScores: readonly PublishedMonthlyWorkScore[]; works: readonly WorkRecord[];
}) {
  const annualRows: readonly AdminMonthlyRankingRow[] = annual ? periodRows
    : getAnnualAdminRanking(monthlyScores.filter((score) => score.month <= month), year, discipline);
  const annualById = new Map(annualRows.map((row) => [row.workId, row]));
  // "Última": the work's latest monthly score before the selected month.
  const previous = new Map<string, PublishedMonthlyWorkScore>();
  for (const score of monthlyScores) {
    if (annual || score.discipline !== discipline || score.month >= month) continue;
    const current = previous.get(score.workId);
    if (!current || score.month > current.month) previous.set(score.workId, score);
  }
  const details = (workId: string) => ({
    annualScore: annualById.get(workId)?.score ?? null, annualPosition: annualById.get(workId)?.position ?? null,
    previousScore: previous.get(workId)?.score ?? null,
  });
  const rows: RankingPdfRow[] = periodRows.map((row) => ({
    workName: row.workName, position: row.position, score: row.score, rawScore: row.rawScore, penalty: row.penalty, ...details(row.workId),
  }));
  const evaluated = new Set(periodRows.map((row) => row.workId));
  const unevaluated: RankingPdfRow[] = works.filter((work) => work.status === "Ativa" && !work.isDemo && !evaluated.has(work.id))
    .map((work) => ({ workName: work.name, position: null, score: null, ...details(work.id) }))
    // Like the spreadsheet, Quality lists only works with a result earlier in the year; Safety lists every active work.
    .filter((row) => discipline === "safety" || row.annualScore !== null)
    .sort((left, right) => (right.annualScore ?? -1) - (left.annualScore ?? -1) || workNames.compare(left.workName, right.workName));
  return { rows, unevaluated };
}

async function exportRanking(input: { discipline: "safety" | "quality"; annual: boolean; reference: string; label: string; rows: RankingPdfRow[]; unevaluated: RankingPdfRow[] }) {
  const safety = input.discipline === "safety";
  const [headerLogo, footerLogo] = await Promise.all([
    loadPng(safety ? "/logo-campanha-seguranca.png" : "/logo-dialogo.png"),
    safety ? loadPng("/logo-dialogo.png") : Promise.resolve(null),
  ]);
  const bytes = await rankingPdf({ ...input, headerLogo, footerLogo });
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Ranking das Obras - ${safety ? "Segurança" : "Qualidade"} - ${input.reference}.pdf`;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Published monthly results drive the annual average; drafts and fixtures stay out of this view. */
export function AdminMonthlyRanking({ month, onMonthChange, year, onYearChange, publishedMonthlyScores, summary, available = true, modules = ["safety", "quality"], safetyRows = [], qualityRows = [], exportable = false, works = [] }: AdminMonthlyRankingProps) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
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
  const monthLabel = monthLabelFormatter.format(new Date(`${selectedMonth}-01T12:00:00Z`));
  const monthReadOnly = month !== undefined && !onMonthChange;
  const changeMonth = (direction: -1 | 1) => {
    const nextMonth = shiftCalendarMonth(selectedMonth, direction);
    if (month === undefined) setLocalMonth(nextMonth);
    onMonthChange?.(nextMonth);
  };
  const annual = period === "year";
  const periodRanking = summary ? (annual ? summary.annual[selectedYear] : summary.monthly[selectedMonth]) : undefined;
  const safetyRanking = summary ? periodRanking?.safety ?? [] : annual ? getAnnualAdminRanking(publishedMonthlyScores ?? [], selectedYear, "safety")
    : publishedMonthlyScores ? getMonthlyAdminRanking(publishedMonthlyScores, selectedMonth, "safety") : safetyRows;
  const qualityRanking = summary ? periodRanking?.quality ?? [] : annual ? getAnnualAdminRanking(publishedMonthlyScores ?? [], selectedYear, "quality")
    : publishedMonthlyScores ? getMonthlyAdminRanking(publishedMonthlyScores, selectedMonth, "quality") : qualityRows;
  const exportDiscipline = (discipline: "safety" | "quality") => {
    // Monthly results of the year feed the "ANUAL" and "CLASS." columns of the monthly poster.
    const monthYear = selectedMonth.slice(0, 4);
    const monthlyScores: readonly PublishedMonthlyWorkScore[] = summary
      ? Object.entries(summary.monthly).filter(([key]) => key.startsWith(`${monthYear}-`))
        .flatMap(([key, rows]) => rows[discipline].map((row) => ({ month: key, discipline, workId: row.workId, workName: row.workName, score: row.score, published: true as const })))
      : publishedMonthlyScores ?? [];
    const { rows, unevaluated } = rankingPdfRows({ annual, month: selectedMonth, year: annual ? selectedYear : monthYear, discipline,
      periodRows: discipline === "safety" ? safetyRanking : qualityRanking, monthlyScores, works });
    const label = annual ? selectedYear : monthLabel.replace(" de ", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("pt-BR"));
    setExporting(true); setExportError("");
    exportRanking({ discipline, annual, reference: annual ? selectedYear : selectedMonth, label, rows, unevaluated })
      .catch(() => setExportError("Não foi possível exportar o ranking.")).finally(() => setExporting(false));
  };

  return <section className={`panel ${styles.panel}`} aria-labelledby={headingId}>
    <div className={styles.heading}>
      <div className={styles.title}>
        <h3 id={headingId}>Ranking das Obras</h3>
      </div>
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
        </label> : <div className={styles.monthNavigation} role="group" aria-label="Navegar pelo mês do ranking">
          <button data-tooltip="Mês anterior" type="button" className={styles.monthButton} aria-label="Mês anterior: ranking" disabled={monthReadOnly || selectedMonth === "0001-01"} onClick={() => changeMonth(-1)}><Icon name="arrow" className={styles.previous} /></button>
          <span id={monthId} className={styles.monthLabel} aria-live="polite">{monthLabel}</span>
          <button data-tooltip="Próximo mês" type="button" className={styles.monthButton} aria-label="Próximo mês: ranking" disabled={monthReadOnly || selectedMonth === "9999-12"} onClick={() => changeMonth(1)}><Icon name="arrow" /></button>
        </div>}
      </div>
    </div>
    {exportError && <p role="alert">{exportError}</p>}
    {!available ? <p role="status">Não foi possível carregar o ranking das obras.</p> : <div className={styles.rankings}>
      {modules.includes("safety") && <RankingTable title="Segurança" reference={annual ? selectedYear : selectedMonth} annual={annual} rows={safetyRanking}
        onExport={exportable ? () => exportDiscipline("safety") : undefined} exporting={exporting} />}
      {modules.includes("quality") && <RankingTable title="Qualidade" reference={annual ? selectedYear : selectedMonth} annual={annual} rows={qualityRanking}
        onExport={exportable ? () => exportDiscipline("quality") : undefined} exporting={exporting} />}
    </div>}
  </section>;
}
