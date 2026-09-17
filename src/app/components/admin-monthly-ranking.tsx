"use client";

import { useId, useState } from "react";
import styles from "./admin-monthly-ranking.module.css";

export type AdminMonthlyRankingRow = {
  workId: string;
  workName: string;
  position: number | null;
  score: number | null;
};

type AdminMonthlyRankingProps = {
  modules?: readonly ("safety" | "quality")[];
  /** When supplied, the parent controls the month and provides its matching rows. */
  month?: string;
  onMonthChange?: (month: string) => void;
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

function currentMonth() {
  const parts = monthFormatter.formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`;
}

function RankingTable({ title, month, rows }: {
  title: string; month: string; rows: readonly AdminMonthlyRankingRow[];
}) {
  const headingId = useId();
  return <section className={styles.ranking} aria-labelledby={headingId}>
    <h4 id={headingId} className={styles.discipline}>{title}</h4>
    <table className={styles.table}>
      <caption className={styles.srOnly}>Ranking de {title} no mês {month}</caption>
      <colgroup><col className={styles.positionColumn} /><col /><col className={styles.scoreColumn} /></colgroup>
      <thead><tr><th scope="col"><abbr title="Posição">Pos.</abbr></th><th scope="col">Obra</th><th scope="col" className={styles.score}>Nota</th></tr></thead>
      <tbody>{rows.length ? rows.map((row) => <tr key={row.workId}>
        <td className={styles.position}>{row.position !== null && Number.isInteger(row.position) && row.position > 0 ? `${row.position}º` : <span aria-label="Sem classificação">—</span>}</td>
        <th scope="row" className={styles.work}>{row.workName}</th>
        <td className={styles.score}>{row.score !== null && Number.isFinite(row.score) ? scoreFormatter.format(row.score) : <span aria-label="Nota indisponível">—</span>}</td>
      </tr>) : <tr><td colSpan={3} className={styles.empty}>Nenhum resultado disponível neste mês.</td></tr>}</tbody>
    </table>
  </section>;
}

/** Presentation only: no score calculation, aggregation or fixture data. */
export function AdminMonthlyRanking({ month, onMonthChange, modules = ["safety", "quality"], safetyRows = [], qualityRows = [] }: AdminMonthlyRankingProps) {
  const [localMonth, setLocalMonth] = useState(currentMonth);
  const selectedMonth = month ?? localMonth;
  const headingId = useId();
  const monthId = useId();

  return <section className={`panel ${styles.panel}`} aria-labelledby={headingId}>
    <div className={styles.heading}>
      <h3 id={headingId}>Ranking das Obras</h3>
      <label className={styles.month} htmlFor={monthId}>
        <span className={styles.srOnly}>Mês de referência</span>
        <input id={monthId} type="month" value={selectedMonth} min="0001-01" max="9999-12"
          required readOnly={month !== undefined && !onMonthChange}
          onChange={(event) => {
            const nextMonth = event.target.value;
            if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(nextMonth)) return;
            if (month === undefined) setLocalMonth(nextMonth);
            onMonthChange?.(nextMonth);
          }} />
      </label>
    </div>
    <div className={styles.rankings}>
      {modules.includes("safety") && <RankingTable title="Segurança" month={selectedMonth} rows={safetyRows} />}
      {modules.includes("quality") && <RankingTable title="Qualidade" month={selectedMonth} rows={qualityRows} />}
    </div>
  </section>;
}
