"use client";

import Image from "next/image";
import { useEffect, useId, useState } from "react";
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
  modelId: AuditModelId;
  item: string;
  description: string;
  criterionTitle?: string;
  subitem?: string;
  serious?: boolean;
  nonconformity: string;
  itemDescription?: string;
  verificationCriterion?: string;
  status?: string;
  evidencePhotos?: readonly { name: string; url?: string }[];
};

export function PublishedAuditFindingsList({ auditFindings, works }: {
  auditFindings: readonly PublishedAuditFinding[];
  works: readonly WorkRecord[];
}) {
  const [expandedAudits, setExpandedAudits] = useState<Set<string>>(() => new Set());
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(() => new Set());
  const idPrefix = useId().replace(/:/g, "");
  const workNames = new Map(works.map((work) => [work.id, work.name]));
  const groupedAuditFindings = [...auditFindings.reduce((groups, finding) => {
    const group = groups.get(finding.auditId);
    if (group) group.findings.push(finding);
    else groups.set(finding.auditId, { auditId: finding.auditId, workId: finding.workId, auditDate: finding.auditDate, auditor: finding.auditor, findings: [finding] });
    return groups;
  }, new Map<string, { auditId: string; workId: string; auditDate: string; auditor: string; findings: PublishedAuditFinding[] }>()).values()]
    .sort((first, second) => second.auditDate.localeCompare(first.auditDate));

  if (!groupedAuditFindings.length) return null;
  return <div className={styles.auditGroups}>{groupedAuditFindings.map((group, groupIndex) => {
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
        <span className={styles.auditInfo}><strong>{workNames.get(group.workId) ?? "Obra"}</strong><small>Responsável</small><span>{group.auditor}</span><em>{group.findings.length} apontamento{group.findings.length === 1 ? "" : "s"}</em></span>
        <span className={`${styles.chevron}${expanded ? ` ${styles.chevronExpanded}` : ""}`} aria-hidden="true" />
      </button>
      {expanded && <div className={styles.auditDetails}><span className={styles.listLabel}>DA AUDITORIA PUBLICADA · {formatAuditDate(group.auditDate)}</span><ul className={styles.findings}>{group.findings.map((finding, findingIndex) => {
        const findingKey = `${finding.auditId}:${finding.id}`;
        const findingExpanded = expandedFindings.has(findingKey);
        const detailsId = `${idPrefix}-published-audit-finding-${groupIndex}-${findingIndex}`;
        return <li className={styles.auditFinding} key={findingKey}>
          <button type="button" className={styles.findingSummary} aria-expanded={findingExpanded} aria-controls={detailsId} onClick={() => setExpandedFindings((current) => {
            const next = new Set(current);
            if (findingExpanded) next.delete(findingKey); else next.add(findingKey);
            return next;
          })}>
            <span className={styles.findingSummaryText}><strong>{finding.item} · {finding.description}{finding.serious && <em className={styles.seriousFlag}>Item grave</em>}</strong><span>{finding.nonconformity}</span></span>
            <i className={`${styles.chevron}${findingExpanded ? ` ${styles.chevronExpanded}` : ""}`} aria-hidden="true" />
          </button>
          {findingExpanded && <div className={styles.findingDetails} id={detailsId}>
            <div><span>Descrição</span><p>{finding.itemDescription || finding.description}</p></div>
            <div><span>Critério</span><p>{finding.verificationCriterion || "Não informado"}</p></div>
            <div><span>Status</span><strong className={finding.serious ? styles.statusNonconforming : styles.status}>{finding.serious ? "Item grave" : finding.status || "Com apontamento"}</strong></div>
            <div className={styles.findingPhotos}><span>Foto</span>{finding.evidencePhotos?.length ? <div>{finding.evidencePhotos.map((photo, photoIndex) => photo.url
              ? <a href={photo.url} target="_blank" rel="noopener noreferrer" key={`${photo.name}:${photoIndex}`} title="Abrir foto em nova guia"><Image src={photo.url} alt={`Evidência do item ${finding.item}`} width={160} height={100} unoptimized /><small>{photo.name}</small></a>
              : <small key={`${photo.name}:${photoIndex}`}>{photo.name}</small>)}</div>
              : <p>Nenhuma foto anexada.</p>}</div>
          </div>}
        </li>;
      })}</ul></div>}
    </article>;
  })}</div>;
}

export function EngineeringResourcePanels({ actor, works, module, catalogs, auditFindings = [] }: {
  actor: AgendaActorContext;
  works: readonly WorkRecord[];
  module: AppModule;
  catalogs: CatalogSnapshot;
  auditFindings?: readonly PublishedAuditFinding[];
}) {
  const [findings, setFindings] = useState<WorkFinding[]>([]);
  const [available, setAvailable] = useState(true);
  const [expandedOtherFindings, setExpandedOtherFindings] = useState<Set<string>>(() => new Set());
  const { userId, profile, engineeringScope, administrativeScope } = actor;
  const workNames = new Map(works.map((work) => [work.id, work.name]));
  const modelIds: AuditModelId[] = module === "safety" ? ["security-it07-r02"] : ["quality-f175", "quality-f176"];
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
      <PublishedAuditFindingsList auditFindings={auditFindings} works={works} />
      {!available ? <p className="muted">Não foi possível consultar os demais apontamentos.</p>
        : findings.length ? <><span className={styles.listLabel}>OUTROS APONTAMENTOS</span><ul className={styles.findings}>{findings.slice(0, 6).map((finding, findingIndex) => {
          const expanded = expandedOtherFindings.has(finding.id);
          const detailsId = `other-finding-${findingIndex}`;
          return <li className={styles.auditFinding} key={finding.id}>
            <button type="button" className={styles.findingSummary} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpandedOtherFindings((current) => {
              const next = new Set(current);
              if (expanded) next.delete(finding.id); else next.add(finding.id);
              return next;
            })}>
              <span className={styles.findingSummaryText}><strong>{finding.description}</strong></span>
              <i className={`${styles.chevron}${expanded ? ` ${styles.chevronExpanded}` : ""}`} aria-hidden="true" />
            </button>
            {expanded && <div className={styles.otherFindingDetails} id={detailsId}>
              <span>{workNames.get(finding.workId) ?? "Obra"}{finding.location ? ` · ${finding.location}` : ""}</span>
              <p>{finding.correction}</p>
            </div>}
          </li>;
        })}</ul></>
          : auditFindings.length === 0 ? <p className="muted">Nenhum apontamento ativo para esta disciplina.</p> : null}
    </section>
    <section className="panel" aria-label={`Roteiros de ${moduleLabels[module]}`}>
      <div className="panel-heading"><h3>Roteiros</h3></div>
      <ul className={styles.catalogs}>{modelIds.map((modelId) => {
        const version = catalogVersion(catalogs, modelId);
        return <li key={modelId}><div className={styles.catalogInfo}><strong>{auditModelLabels[modelId].name}</strong>
          <span>{version.criteria.length} itens · {auditModelLabels[modelId].version}</span></div>
          <a className={styles.catalogDownload} href={`/api/reference-documents/${modelId}?download=pdf`} download aria-label={`Baixar PDF: ${auditModelLabels[modelId].name}`} title="Baixar PDF">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
          </a></li>;
      })}</ul>
    </section>
  </div>;
}
