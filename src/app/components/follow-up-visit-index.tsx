"use client";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import { useCursorList } from "./use-cursor-list";
import { ListFilters, ListStatus, ListPagination } from "./list-controls";
import { listReportHref } from "@/lib/lists/presentation";
import styles from "./follow-up-report-page.module.css";
export function FollowUpVisitIndex({ actor, visitId }: { actor: AgendaActorContext; visitId: string }) {
 const { anchor: listAnchor, ...list } = useCursorList(actor, "reports", "visit-reports", undefined, undefined, true, visitId);
 return <section className="panel" aria-label="Relatórios da visita" ref={listAnchor}>
  <ListFilters list={list} label="Relatórios da visita" /><ListStatus list={list} />
  <ul className={styles.reportList}>{list.data?.items.map(item => {
   const date = new Date(item.at), options = { timeZone: "America/Sao_Paulo" };
   return <li key={item.key}>
    <span className={styles.reportDate}><strong>{date.toLocaleDateString("pt-BR",{...options,day:"2-digit"})}</strong><small>{date.toLocaleDateString("pt-BR",{...options,month:"short",year:"numeric"})}</small></span>
    <span className={styles.reportInfo}><strong>{item.title}</strong><small>{date.toLocaleDateString("pt-BR",options)}</small></span>
    <a className={styles.downloadButton} href={listReportHref(item)} aria-label={`Baixar PDF: ${item.title}`} data-tooltip="Baixar PDF" download>
     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
    </a>
   </li>;
  })}</ul>
  <ListPagination list={list} label="Relatórios da visita" />
 </section>;
}
