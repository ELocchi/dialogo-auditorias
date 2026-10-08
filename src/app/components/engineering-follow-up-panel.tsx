"use client";
import { DownloadButton } from "./download-button";
import { useCursorList } from "./use-cursor-list";
import { ListWorkFilter, ListFilters, ListStatus, ListPagination } from "./list-controls";
import { listReportHref } from "@/lib/lists/presentation";

import { memo, useId, useState } from "react";
import { Icon } from "./ui-icon";
import { moduleLabels, type AppModule, type Visit } from "@/domain/prototype-access";
import { formatAuditDate, type WorkRecord } from "@/domain/operational-records";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import styles from "./engineering-follow-up-panel.module.css";

type Props = { actor: AgendaActorContext; visits: readonly Visit[]; works: readonly WorkRecord[]; module: AppModule };
type ReportCard = { id: string; title: string; date: string; updatedAt: string; workName: string; auditorName: string; pdfHref: string };

export function EngineeringFollowUpPanel(props: Props) {
  const { userId, profile, engineeringScope, administrativeScope } = props.actor;
  return <EngineeringFollowUpSession key={JSON.stringify([userId, profile, engineeringScope, administrativeScope, props.module])} {...props} />;
}

function EngineeringFollowUpSession({ actor, works, module }: Props) {
  const { anchor: listAnchor, ...list } = useCursorList(actor, "reports", "engineering-reports", module);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchId = useId();
  const showSearch = searchOpen || !!list.search;
  return <section className="panel" aria-label={`Relatório Orientativo de ${moduleLabels[module]}`}>
    <div className={`panel-heading panel-filter-heading ${styles.heading}`}><h3>Relatório Orientativo</h3><ListWorkFilter list={list} works={works} label="Relatórios orientativos" /><button type="button" className={`secondary ${styles.searchButton}`} aria-label="Buscar relatórios" data-tooltip="Buscar" aria-expanded={showSearch} aria-controls={showSearch ? searchId : undefined} onClick={() => { setSearchOpen(!showSearch); if (showSearch) list.setSearch(""); }}><Icon name="search" /></button></div>
    <div ref={listAnchor}><ListFilters list={list} label="Relatórios orientativos" showSearch={showSearch} searchId={searchId} focusSearch={searchOpen} /></div>
    <ListStatus list={list} empty="Nenhum relatório orientativo encontrado." />
    {!list.loading && !list.error && <div className={styles.list}>{list.data?.items.map(item =>
      <EngineeringFollowUpReportCard key={item.key} report={{ id: item.id, title: item.title!, date: item.date!,
        updatedAt: item.at, workName: item.workName, auditorName: item.auditorName!, pdfHref: listReportHref(item) }} />)}</div>}
    <ListPagination list={list} label="Relatórios orientativos" />
  </section>;
}

const EngineeringFollowUpReportCard = memo(function EngineeringFollowUpReportCard({ report }: {
  report: ReportCard;
}) {
  return <article className={styles.card}>
    <div className={styles.cardContent}>
      <span className={styles.date}>{formatAuditDate(report.date)}</span>
      <strong>{report.title}</strong>
      <span>{report.workName}</span>
      <small>Responsável: {report.auditorName}</small>
    </div>
    <DownloadButton className="secondary" href={report.pdfHref} label={`Baixar PDF: ${report.title}, ${report.workName}, ${formatAuditDate(report.date)}`}>Baixar PDF</DownloadButton>
  </article>;
});
