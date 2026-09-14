"use client";

import { useState } from "react";
import { formatAuditDate, type AuditRecord, type WorkRecord } from "@/domain/operational-records";
import { getWorkRanking } from "@/domain/work-ranking";
import { Icon } from "./ui-icon";
import styles from "./work-ranking.module.css";

const numberFormat = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function WorkRanking({ works, audits, onViewWorks }: { works: readonly WorkRecord[]; audits: readonly AuditRecord[]; onViewWorks: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const rows = getWorkRanking(works, audits, "security-it07-r02");
  const visibleRows = expanded ? rows : rows.slice(0, 5);
  const rankedCount = rows.filter((row) => row.position !== null).length;

  return <section className={`panel ${styles.panel}`} aria-labelledby="work-ranking-heading">
    <div className={`panel-heading ${styles.heading}`}>
      <div><span className="section-label">SEGURANÇA DO TRABALHO</span><h3 id="work-ranking-heading">Ranking das obras</h3><p className={styles.period}>Última auditoria de Segurança por obra</p></div>
      <span className="icon-tile"><Icon name="works" /></span>
    </div>
    <div className={styles.context}><span className={styles.source}>IT.07 rev. 02</span>{works.some((work) => work.isDemo) && <span>Inclui cadastros de demonstração</span>}</div>
    {rows.length === 0 ? <div className={styles.empty}><strong>Nenhuma obra cadastrada</strong><p>O ranking mostrará as obras e o resultado de suas últimas auditorias.</p></div> : <>
      {rankedCount === 0 && <p className={styles.waiting}>Aguardando notas finais para classificar as obras.</p>}
      <p className={styles.scrollHint}>Deslize para consultar todas as colunas.</p>
      <div className={styles.tableScroll} role="region" aria-label="Ranking de Segurança" tabIndex={0}>
        <table className={styles.table} id="work-ranking-table" aria-describedby="work-ranking-note">
          <caption className={styles.caption}>Obras ordenadas pela nota final publicada da última auditoria de Segurança, IT.07 revisão 02.</caption>
          <colgroup><col className={styles.positionColumn} /><col /><col className={styles.dateColumn} /><col className={styles.scoreColumn} /></colgroup>
          <thead><tr><th scope="col"><span className={styles.caption}>Posição</span></th><th scope="col" className={styles.workHeading}>Obras</th><th scope="col">Última auditoria</th><th scope="col">Nota final</th></tr></thead>
          <tbody>{visibleRows.map((row) => <tr key={row.work.id} className={row.position === 1 ? styles.first : row.position === 2 ? styles.second : undefined}>
            <td className={styles.position}>{row.position === null ? <><span aria-hidden="true">—</span><span className={styles.caption}>Sem classificação</span></> : `${row.position}º`}</td>
            <th scope="row" className={styles.work}>{row.work.name}</th>
            <td className={styles.date}>{row.audit ? <time dateTime={row.audit.date}>{formatAuditDate(row.audit.date)}</time> : "—"}</td>
            <td className={row.finalScore === null ? styles.pending : styles.finalScore}>{row.finalScore === null ? <><span aria-hidden="true">—</span><small>{row.audit ? "Nota pendente" : "Sem auditoria"}</small></> : numberFormat.format(row.finalScore)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className={styles.note} id="work-ranking-note">A maior nota publicada vem primeiro. Obras sem nota publicada na última auditoria ficam sem classificação.</p>
    </>}
    <div className={styles.footer}>
      <span className={styles.count} role="status">{rows.length} {rows.length === 1 ? "obra" : "obras"} · {rankedCount} {rankedCount === 1 ? "classificada" : "classificadas"}{!expanded && rows.length > 5 ? " · mostrando 5" : ""}</span>
      {rows.length > 5 ? <button type="button" className={`text-button ${styles.toggle}`} aria-expanded={expanded} aria-controls="work-ranking-table" onClick={() => setExpanded(!expanded)}>
        {expanded ? "Recolher ranking" : "Ver ranking completo"}<Icon name="arrow" className={expanded ? styles.arrowUp : styles.arrowDown} />
      </button> : <button type="button" className={`text-button ${styles.toggle}`} onClick={onViewWorks}>Ver obras<Icon name="arrow" /></button>}
    </div>
  </section>;
}
