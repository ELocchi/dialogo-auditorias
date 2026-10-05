"use client";

import { memo, useMemo, useState } from "react";
import { moduleLabels, type AppModule, type Visit } from "@/domain/prototype-access";
import { formatAuditDate, type WorkRecord } from "@/domain/operational-records";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import { isStandaloneReportIndex, standalonePdfHref } from "@/lib/follow-up/standalone-contracts";
import { isFollowUpReportIndexSnapshot, useFollowUpSnapshot } from "./use-follow-up-snapshot";
import styles from "./engineering-follow-up-panel.module.css";

type Props = { actor: AgendaActorContext; visits: readonly Visit[]; works: readonly WorkRecord[]; module: AppModule };
type ReportCard = { id: string; title: string; date: string; updatedAt: string; workName: string; auditorName: string; pdfHref: string };

export function EngineeringFollowUpPanel(props: Props) {
  const { userId, profile, engineeringScope, administrativeScope } = props.actor;
  return <EngineeringFollowUpSession key={JSON.stringify([userId, profile, engineeringScope, administrativeScope, props.module])} {...props} />;
}

function EngineeringFollowUpSession({ actor, visits, works, module }: Props) {
  const { data, loading, error, retry } = useFollowUpSnapshot(actor, "/api/follow-up/reports", isFollowUpReportIndexSnapshot);
  const standalone = useFollowUpSnapshot(actor, "/api/follow-up/standalone-reports", isStandaloneReportIndex);
  const [workId, setWorkId] = useState("");
  const workById = useMemo(() => new Map(works.map((work) => [work.id, work])), [works]);
  const visitById = useMemo(() => new Map(visits.filter((visit) => visit.kind === "follow_up" && visit.module === module)
    .map((visit) => [visit.id, visit])), [module, visits]);
  const visible = useMemo<ReportCard[]>(() => [ ...(data?.reports ?? []).flatMap((report) => {
    const visit = visitById.get(report.visitId);
    const work = visit && workById.get(visit.workId);
    return visit && work && (!workId || work.id === workId) ? [{ id: report.id, title: report.title, updatedAt: report.updatedAt,
      date: visit.date, workName: work.name, auditorName: visit.auditorName ?? "Profissional responsável",
      pdfHref: `/app/acompanhamento/relatorio/${visit.id}/pdf?relatorio=${report.id}` }] : [];
  }), ...(standalone.data?.reports ?? []).filter(report => report.module === module && workById.has(report.workId) && (!workId || workId === report.workId))
    .map(report => ({ ...report, pdfHref: standalonePdfHref(report.id) }))
  ].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)), [data?.reports, standalone.data?.reports, visitById, workById, workId, module]);

  return <section className="panel" aria-label={`Relatório Orientativo de ${moduleLabels[module]}`}>
    <div className={`panel-heading ${styles.heading}`}>
      <h3>Relatório Orientativo</h3>
      {works.length > 1 && <select className="filter-select" value={workId} onChange={(event) => setWorkId(event.target.value)} aria-label="Filtrar relatórios orientativos por obra">
        <option value="">Todas as obras</option>{works.map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}
      </select>}
    </div>
    {(loading || standalone.loading) && <p className="muted" role="status">Carregando relatórios orientativos...</p>}
    {(error || standalone.error) && <p className="muted" role="alert">Não foi possível consultar todos os relatórios orientativos. <button type="button" className="secondary" onClick={() => { retry(); standalone.retry(); }}>Tentar novamente</button></p>}
    {visible.length ? <div className={styles.list}>{visible.map(report => <EngineeringFollowUpReportCard report={report} key={report.id} />)}</div>
      : data && standalone.data && !loading && !error && !standalone.loading && !standalone.error ? <p className="muted">Nenhum relatório orientativo publicado para esta disciplina.</p> : null}
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
    <a className="secondary" href={report.pdfHref} target="_blank" rel="noreferrer">Baixar PDF</a>
  </article>;
});
