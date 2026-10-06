"use client";
import { DownloadButton } from "./download-button";
import { useListFilter } from "./list-state";
import { useCursorList } from "./use-cursor-list";
import { ListFilters, ListStatus, ListPagination } from "./list-controls";
import { listWorkFinding } from "@/lib/lists/presentation";

import { EvidenceThumbnail } from "./evidence-thumbnail";
import { useId, useState, type ReactNode } from "react";
import { moduleLabels, type AppModule } from "@/domain/prototype-access";
import { auditModelLabels, formatAuditDate, type AuditModelId, type WorkRecord } from "@/domain/operational-records";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import { catalogVersion, type CatalogSnapshot } from "@/lib/catalogs/contracts";
import { groupAuditHistoryFindings } from "@/domain/audit-history";
import { followUpPhotoThumbnailUrl } from "@/lib/photos/urls";
import { HistoryPagination, useHistoryPage } from "./history-pagination";
import { HistoryFilters, HistoryLoadStatus, usePublishedHistoryPage } from "./published-history-page";
import { useAuditDetails } from "./audit-details-context";
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
  evidencePhotos?: readonly { name: string; url?: string; thumbnailUrl?: string }[];
};

export function PublishedAuditFindingsList({ auditFindings, works, module, contextKey = "", heading }: {
  auditFindings: readonly PublishedAuditFinding[];
  works: readonly WorkRecord[];
  contextKey?: string;
  module?: AppModule;
  heading?: string;
}) {
  const [workId, setWorkId] = useListFilter(`published-findings:workId:${contextKey}`);
  const [dateFrom, setDateFrom] = useListFilter(`published-findings:dateFrom:${contextKey}`);
  const [dateTo, setDateTo] = useListFilter(`published-findings:dateTo:${contextKey}`);
  const [expandedAudits, setExpandedAudits] = useState<Set<string>>(() => new Set());
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(() => new Set());
  const idPrefix = useId().replace(/:/g, "");
  const { loadAudit, isLoaded, isLocalAudit, states } = useAuditDetails();
  const workNames = new Map(works.map((work) => [work.id, work.name]));
  const page = usePublishedHistoryPage([], { module, workId: workId || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined,
    onlyWithFindings: true, includeFindings: true }, contextKey);
  const sourceFindings: readonly PublishedAuditFinding[] = page.remote ? [...auditFindings.filter((finding) => isLocalAudit(finding.auditId)), ...page.findings.map((finding) =>
    auditFindings.find((detail) => detail.auditId === finding.auditId && detail.id === finding.id) ?? finding)] : auditFindings;
  const groupedAuditFindings = groupAuditHistoryFindings(sourceFindings.filter((finding) => (!workId || finding.workId === workId)
    && (!dateFrom || finding.auditDate >= dateFrom) && (!dateTo || finding.auditDate <= dateTo)));
  const localHistory = useHistoryPage(groupedAuditFindings, JSON.stringify([contextKey, workId, dateFrom, dateTo, works.map((work) => work.id).sort()]));
  const history = page.remote ? { ...page, items: groupedAuditFindings } : localHistory;

  const filters = <HistoryFilters className={heading ? styles.headingFilters : undefined} works={works} workId={workId} onWorkChange={setWorkId} dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} label="Filtrar apontamentos" />;

  return <>{heading ? <div className={`panel-heading ${styles.findingsHeading}`}><h3>{heading}</h3>{filters}</div> : filters}
    <HistoryLoadStatus history={page} />
    {!history.items.length && page.status === "ready" && <p className="muted">Nenhum apontamento incluído em relatório de auditoria publicado neste período.</p>}
    <div className={styles.auditGroups}>{history.items.map((group, groupIndex) => {
    const expanded = expandedAudits.has(group.auditId);
    const loaded = isLoaded(group.auditId);
    const detailState = states[group.auditId];
    const [year, month] = group.auditDate.split("-");
    const monthAbbreviation = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"][Number(month) - 1] ?? month;
    return <article className={styles.auditGroup} key={group.auditId}>
      <button type="button" className={styles.auditSummary} aria-expanded={expanded} onClick={() => {
        setExpandedAudits((current) => {
          const next = new Set(current);
          if (expanded) next.delete(group.auditId); else next.add(group.auditId);
          return next;
        });
        if (!expanded && !loaded && detailState?.status !== "loading") void loadAudit(group.auditId).catch(() => {});
      }}>
        <span className={styles.auditDate}><strong>{monthAbbreviation}</strong><small>{year}</small></span>
        <span className={styles.auditInfo}><strong>{workNames.get(group.workId) ?? "Obra"}</strong><small>Responsável</small><span>{group.auditor}</span><em>{group.findings.length} apontamento{group.findings.length === 1 ? "" : "s"}</em></span>
        <span className={`${styles.chevron}${expanded ? ` ${styles.chevronExpanded}` : ""}`} aria-hidden="true" />
      </button>
      {expanded && <div className={styles.auditDetails}><span className={styles.listLabel}>DA AUDITORIA PUBLICADA · {formatAuditDate(group.auditDate)}</span>
        {!loaded ? detailState?.status === "error" ? <div role="alert"><p className="muted">{detailState.message || "Não foi possível carregar os detalhes da auditoria."}</p><button type="button" className="secondary" onClick={() => { void loadAudit(group.auditId).catch(() => {}); }}>Recarregar auditoria</button></div>
          : <p className="muted" role="status">Carregando apontamentos da auditoria…</p>
          : <ul className={styles.findings}>{group.findings.map((finding, findingIndex) => {
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
              ? <EvidenceThumbnail thumbnailSrc={photo.thumbnailUrl} originalSrc={photo.url} alt={`Evidência do item ${finding.item}`} width={160} height={100}  key={`${photo.name}:${photoIndex}`} caption={<small>{photo.name}</small>} />
              : <small key={`${photo.name}:${photoIndex}`}>{photo.name}</small>)}</div>
              : <p>Nenhuma foto anexada.</p>}</div>
          </div>}
        </li>;
      })}</ul>}</div>}
    </article>;
  })}</div><HistoryPagination {...history} label="Páginas das auditorias com apontamentos" /></>;
}

export function EngineeringResourcePanels({ actor, works, module, catalogs, auditFindings = [], deferCatalogs = (content) => content }: {
  actor: AgendaActorContext;
  works: readonly WorkRecord[];
  module: AppModule;
  catalogs: CatalogSnapshot;
  auditFindings?: readonly PublishedAuditFinding[];
  findingCount?: number;
  deferCatalogs?: (children: ReactNode) => ReactNode;
}) {
  const { anchor: listAnchor, ...list } = useCursorList(actor, "work-findings", "engineering-findings", module);
  const findings = list.data?.items.map(listWorkFinding) ?? [];
  const [expandedOtherFindings, setExpandedOtherFindings] = useState<Set<string>>(() => new Set());
  const { userId, profile, engineeringScope, administrativeScope } = actor;
  const workNames = new Map(works.map((work) => [work.id, work.name]));

  return <div className={styles.grid}>
    <section className="panel" aria-label={`Apontamentos de ${moduleLabels[module]}`}>
      <PublishedAuditFindingsList heading="Apontamentos" auditFindings={auditFindings} works={works} module={module} contextKey={JSON.stringify([module, userId, profile, engineeringScope, administrativeScope])} />
      <div ref={listAnchor}><span className={styles.listLabel}>OUTROS APONTAMENTOS</span><ListFilters list={list} works={works} label="Outros apontamentos" /></div>
      <ListStatus list={list} empty="Nenhum outro apontamento encontrado." />
      {!list.loading && !list.error && findings.length ? <ul className={styles.findings}>{findings.map((finding, findingIndex) => {
          const expanded = expandedOtherFindings.has(finding.id);
          const detailsId = `other-finding-${findingIndex}`;
          const photoUrl = `/app/acompanhamento/obras/${finding.workId}/fotos/${finding.photoFileName}`;
          return <li className={styles.auditFinding} key={finding.id}>
            <button type="button" className={styles.findingSummary} aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpandedOtherFindings((current) => {
              const next = new Set(current);
              if (expanded) next.delete(finding.id); else next.add(finding.id);
              return next;
            })}>
              <span className={styles.findingSummaryText}><strong>{finding.description}{finding.serious && <em className={styles.seriousFlag}>Item grave</em>}</strong></span>
              <i className={`${styles.chevron}${expanded ? ` ${styles.chevronExpanded}` : ""}`} aria-hidden="true" />
            </button>
            {expanded && <div className={styles.otherFindingDetails} id={detailsId}>
              <EvidenceThumbnail thumbnailSrc={followUpPhotoThumbnailUrl(photoUrl, actor)} originalSrc={photoUrl} alt={`Foto de ${finding.description}`} width={110} height={82}  className={styles.otherFindingPhoto} />
              <div className={styles.otherFindingText}>
                <span>{workNames.get(finding.workId) ?? "Obra"}{finding.location ? ` · ${finding.location}` : ""}</span>
                <p>{finding.correction}</p>
              </div>
            </div>}
          </li>;
        })}</ul> : null}
      <ListPagination list={list} label="Outros apontamentos" />
    </section>
    <EngineeringRoutesPanel modules={[module]} catalogs={catalogs} deferCatalogs={deferCatalogs} />
  </div>;
}

export function EngineeringRoutesPanel({ modules, catalogs, deferCatalogs = (content) => content }: {
  modules: readonly AppModule[];
  catalogs: CatalogSnapshot;
  deferCatalogs?: (children: ReactNode) => ReactNode;
}) {
  const modelIds: AuditModelId[] = modules.flatMap((module) => module === "safety"
    ? ["security-it07-r02" as const] : ["quality-f175" as const, "quality-f176" as const]);
  const discipline = modules.length === 1 ? moduleLabels[modules[0]] : "Qualidade e Segurança";
  return deferCatalogs(<section className="panel" aria-label={`Roteiros de ${discipline}`}>
      <div className="panel-heading"><h3>Roteiros</h3></div>
      <ul className={styles.catalogs}>{modelIds.map((modelId) => {
        const version = catalogVersion(catalogs, modelId);
        return <li key={modelId}><div className={styles.catalogInfo}><strong>{auditModelLabels[modelId].name}</strong>
          <span>{version.criteria.length} itens · {auditModelLabels[modelId].version}</span></div>
          <DownloadButton className={styles.catalogDownload} href={`/api/reference-documents/${modelId}?download=pdf`} label={`Baixar PDF: ${auditModelLabels[modelId].name}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
          </DownloadButton></li>;
      })}</ul>
    </section>);
}
