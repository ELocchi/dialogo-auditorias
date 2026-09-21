"use client";

import { useEffect, useMemo, useState } from "react";
import { readFollowUpReportsAction } from "@/app/follow-up/actions";
import { moduleLabels, type AppModule, type Visit } from "@/domain/prototype-access";
import { formatAuditDate, type WorkRecord } from "@/domain/operational-records";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { FollowUpReport } from "@/lib/follow-up/service";
import styles from "./engineering-follow-up-panel.module.css";
import filterStyles from "./follow-up-workspace.module.css";

export function EngineeringFollowUpPanel({ actor, visits, works, module }: {
  actor: AgendaActorContext;
  visits: readonly Visit[];
  works: readonly WorkRecord[];
  module: AppModule;
}) {
  const [reports, setReports] = useState<FollowUpReport[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [workId, setWorkId] = useState("");
  const { userId, profile, engineeringScope, administrativeScope } = actor;
  const workById = useMemo(() => new Map(works.map((work) => [work.id, work])), [works]);
  const visitById = useMemo(() => new Map(visits.filter((visit) => visit.kind === "follow_up" && visit.module === module)
    .map((visit) => [visit.id, visit])), [module, visits]);

  useEffect(() => {
    let active = true;
    readFollowUpReportsAction({ userId, profile, engineeringScope, administrativeScope }).then((snapshot) => {
      if (!active) return;
      setReports(snapshot.available ? snapshot.reports : []);
      setMessage(snapshot.message ?? "");
    }).catch(() => active && setMessage("Não foi possível consultar os relatórios orientativos."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [userId, profile, engineeringScope, administrativeScope]);

  const visible = reports.flatMap((report) => {
    const visit = visitById.get(report.visitId);
    const work = visit && workById.get(visit.workId);
    return visit && work && (!workId || work.id === workId) ? [{ report, visit, work }] : [];
  }).sort((first, second) => second.report.updatedAt.localeCompare(first.report.updatedAt));

  return <section className="panel" aria-label={`Acompanhamento de ${moduleLabels[module]}`}>
    <div className={`panel-heading ${styles.heading}`}>
      <div><h3>Acompanhamento</h3><p>Relatórios orientativos publicados</p></div>
      {works.length > 1 && <select className={filterStyles.workFilter} value={workId} onChange={(event) => setWorkId(event.target.value)} aria-label="Filtrar relatórios orientativos por obra">
        <option value="">Todas as obras</option>{works.map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}
      </select>}
    </div>
    {loading ? <p className="muted">Carregando relatórios orientativos...</p>
      : message ? <p className="muted" role="status">{message}</p>
        : visible.length ? <div className={styles.list}>{visible.map(({ report, visit, work }) => <article className={styles.card} key={report.id}>
          <div className={styles.cardContent}>
            <span className={styles.date}>{formatAuditDate(visit.date)}</span>
            <strong>{report.title}</strong>
            <span>{work.name}</span>
            <small>Responsável: {visit.auditorName ?? "Profissional responsável"}</small>
          </div>
          <a className="secondary" href={`/app/acompanhamento/relatorio/${visit.id}/pdf?relatorio=${report.id}`} target="_blank" rel="noreferrer">Baixar PDF</a>
        </article>)}</div>
          : <p className="muted">Nenhum relatório orientativo publicado para esta disciplina.</p>}
  </section>;
}
