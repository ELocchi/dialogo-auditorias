"use client";

import { memo, useMemo, useState } from "react";
import { moduleLabels, type AppModule, type Visit } from "@/domain/prototype-access";
import { formatAuditDate, type WorkRecord } from "@/domain/operational-records";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { FollowUpReportIndexEntry } from "@/lib/follow-up/workspace-contracts";
import { isFollowUpReportIndexSnapshot, useFollowUpSnapshot } from "./use-follow-up-snapshot";
import styles from "./engineering-follow-up-panel.module.css";

type Props = { actor: AgendaActorContext; visits: readonly Visit[]; works: readonly WorkRecord[]; module: AppModule };

export function EngineeringFollowUpPanel(props: Props) {
  const { userId, profile, engineeringScope, administrativeScope } = props.actor;
  return <EngineeringFollowUpSession key={JSON.stringify([userId, profile, engineeringScope, administrativeScope, props.module])} {...props} />;
}

function EngineeringFollowUpSession({ actor, visits, works, module }: Props) {
  const { data, loading, error, retry } = useFollowUpSnapshot(actor, "/api/follow-up/reports", isFollowUpReportIndexSnapshot);
  const [workId, setWorkId] = useState("");
  const workById = useMemo(() => new Map(works.map((work) => [work.id, work])), [works]);
  const visitById = useMemo(() => new Map(visits.filter((visit) => visit.kind === "follow_up" && visit.module === module)
    .map((visit) => [visit.id, visit])), [module, visits]);
  const visible = useMemo(() => (data?.reports ?? []).flatMap((report) => {
    const visit = visitById.get(report.visitId);
    const work = visit && workById.get(visit.workId);
    return visit && work && (!workId || work.id === workId) ? [{ report, visit, work }] : [];
  }).sort((first, second) => second.report.updatedAt.localeCompare(first.report.updatedAt)), [data?.reports, visitById, workById, workId]);

  return <section className="panel" aria-label={`Relatório Orientativo de ${moduleLabels[module]}`}>
    <div className={`panel-heading ${styles.heading}`}>
      <h3>Relatório Orientativo</h3>
      {works.length > 1 && <select className="filter-select" value={workId} onChange={(event) => setWorkId(event.target.value)} aria-label="Filtrar relatórios orientativos por obra">
        <option value="">Todas as obras</option>{works.map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}
      </select>}
    </div>
    {loading && <p className="muted" role="status">Carregando relatórios orientativos...</p>}
    {error && <p className="muted" role="alert">Não foi possível consultar os relatórios orientativos. <button type="button" className="secondary" onClick={retry}>Tentar novamente</button></p>}
    {visible.length ? <div className={styles.list}>{visible.map(({ report, visit, work }) => <EngineeringFollowUpReportCard report={report} visit={visit} work={work} key={report.id} />)}</div>
      : data && !loading && !error ? <p className="muted">Nenhum relatório orientativo publicado para esta disciplina.</p> : null}
  </section>;
}

const EngineeringFollowUpReportCard = memo(function EngineeringFollowUpReportCard({ report, visit, work }: {
  report: FollowUpReportIndexEntry; visit: Visit; work: WorkRecord;
}) {
  return <article className={styles.card}>
    <div className={styles.cardContent}>
      <span className={styles.date}>{formatAuditDate(visit.date)}</span>
      <strong>{report.title}</strong>
      <span>{work.name}</span>
      <small>Responsável: {visit.auditorName ?? "Profissional responsável"}</small>
    </div>
    <a className="secondary" href={`/app/acompanhamento/relatorio/${visit.id}/pdf?relatorio=${report.id}`} target="_blank" rel="noreferrer">Baixar PDF</a>
  </article>;
});
