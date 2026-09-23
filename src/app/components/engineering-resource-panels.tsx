"use client";

import { useEffect, useState } from "react";
import { readEngineeringWorkFindingsAction, type WorkFinding } from "@/app/follow-up/actions";
import { moduleLabels, type AppModule } from "@/domain/prototype-access";
import { auditModelLabels, formatAuditDate, type AuditModelId, type WorkRecord } from "@/domain/operational-records";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import { catalogVersion, type CatalogSnapshot } from "@/lib/catalogs/contracts";
import styles from "./engineering-resource-panels.module.css";

export type PublishedAuditFinding = {
  id: string;
  auditId: string;
  workId: string;
  auditDate: string;
  auditor: string;
  module: AppModule;
  item: string;
  description: string;
  nonconformity: string;
};

export function EngineeringResourcePanels({ actor, works, module, catalogs, auditFindings = [] }: {
  actor: AgendaActorContext;
  works: readonly WorkRecord[];
  module: AppModule;
  catalogs: CatalogSnapshot;
  auditFindings?: readonly PublishedAuditFinding[];
}) {
  const [findings, setFindings] = useState<WorkFinding[]>([]);
  const [available, setAvailable] = useState(true);
  const [expandedAudits, setExpandedAudits] = useState<Set<string>>(() => new Set());
  const { userId, profile, engineeringScope, administrativeScope } = actor;
  const workNames = new Map(works.map((work) => [work.id, work.name]));
  const modelIds: AuditModelId[] = module === "safety" ? ["security-it07-r02"] : ["quality-f175", "quality-f176"];
  const groupedAuditFindings = [...auditFindings.reduce((groups, finding) => {
    const group = groups.get(finding.auditId);
    if (group) group.findings.push(finding);
    else groups.set(finding.auditId, { auditId: finding.auditId, workId: finding.workId, auditDate: finding.auditDate, auditor: finding.auditor, findings: [finding] });
    return groups;
  }, new Map<string, { auditId: string; workId: string; auditDate: string; auditor: string; findings: PublishedAuditFinding[] }>()).values()]
    .sort((first, second) => second.auditDate.localeCompare(first.auditDate));

  useEffect(() => {
    let active = true;
    readEngineeringWorkFindingsAction(module, { userId, profile, engineeringScope, administrativeScope })
      .then((result) => { if (active) { setFindings(result.findings); setAvailable(result.available); } })
      .catch(() => active && setAvailable(false));
    return () => { active = false; };
  }, [module, userId, profile, engineeringScope, administrativeScope]);

  return <div className={styles.grid}>
    <section className="panel" aria-label={`Apontamentos de ${moduleLabels[module]}`}>
      <div className="panel-heading"><div><h3>Apontamentos</h3>{auditFindings.length > 0 && <p className={styles.summary}>{auditFindings.length} não conformidade{auditFindings.length === 1 ? "" : "s"} extraída{auditFindings.length === 1 ? "" : "s"} de auditoria publicada</p>}</div></div>
      {groupedAuditFindings.length > 0 && <div className={styles.auditGroups}>{groupedAuditFindings.map((group) => {
        const expanded = expandedAudits.has(group.auditId);
        const [year, month] = group.auditDate.split("-");
        const monthAbbreviation = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"][Number(month) - 1] ?? month;
        return <article className={styles.auditGroup} key={group.auditId}>
          <button type="button" className={styles.auditSummary} aria-expanded={expanded} onClick={() => setExpandedAudits((current) => {
            const next = new Set(current);
            if (expanded) next.delete(group.auditId); else next.add(group.auditId);
            return next;
          })}>
            <span className={styles.auditDate}><strong>{monthAbbreviation}</strong><small>{year}</small></span>
            <span className={styles.auditInfo}><strong>{workNames.get(group.workId) ?? "Obra"}</strong><small>Responsável</small><span>{group.auditor}</span><em>{group.findings.length} não conformidade{group.findings.length === 1 ? "" : "s"}</em></span>
            <span className={`${styles.chevron}${expanded ? ` ${styles.chevronExpanded}` : ""}`} aria-hidden="true" />
          </button>
          {expanded && <div className={styles.auditDetails}><span className={styles.listLabel}>DA AUDITORIA PUBLICADA · {formatAuditDate(group.auditDate)}</span><ul className={styles.findings}>{group.findings.map((finding) => <li key={`${finding.auditId}:${finding.id}`}>
            <strong>{finding.item} · {finding.description}</strong>
            <p>{finding.nonconformity}</p>
          </li>)}</ul></div>}
        </article>;
      })}</div>}
      {!available ? <p className="muted">Não foi possível consultar os demais apontamentos.</p>
        : findings.length ? <><span className={styles.listLabel}>OUTROS APONTAMENTOS</span><ul className={styles.findings}>{findings.slice(0, 6).map((finding) => <li key={finding.id}>
          <strong>{finding.description}</strong>
          <span>{workNames.get(finding.workId) ?? "Obra"}{finding.location ? ` · ${finding.location}` : ""}</span>
          <p>{finding.correction}</p>
        </li>)}</ul></>
          : auditFindings.length === 0 ? <p className="muted">Nenhum apontamento ativo para esta disciplina.</p> : null}
    </section>
    <section className="panel" aria-label={`Roteiros de ${moduleLabels[module]}`}>
      <div className="panel-heading"><h3>Roteiros</h3></div>
      <ul className={styles.catalogs}>{modelIds.map((modelId) => {
        const version = catalogVersion(catalogs, modelId);
        return <li key={modelId}><div className={styles.catalogInfo}><strong>{auditModelLabels[modelId].name}</strong>
          <span>{version.criteria.length} itens · {auditModelLabels[modelId].version}</span></div>
          <a className="secondary" href={`/api/reference-documents/${modelId}?revision=bundled`} target="_blank" rel="noopener noreferrer">Mostrar relatório</a></li>;
      })}</ul>
    </section>
  </div>;
}
