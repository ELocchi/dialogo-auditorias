"use client";

import { useState, type ReactNode } from "react";
import { auditModelLabels, auditVersionLabel, formatAuditDate, type AuditRecord, type WorkRecord } from "@/domain/operational-records";
import { canEditAudit, canConsultAgenda, canReadAudit, canReadVisit, modelModule, roleLabels, moduleLabels, type DemoUser, type AppModule, type Visit } from "@/domain/prototype-access";
import { Icon } from "./ui-icon";
import { WorkRanking } from "./work-ranking";
import { AdminFindings } from "./admin-findings";
import type { AdminFindingSummary } from "./admin-findings";
import { PublishedAuditFindingsList, type PublishedAuditFinding } from "./engineering-resource-panels";
import { AdminMonthlyRanking } from "./admin-monthly-ranking";
import { AdminVisitCalendar } from "./admin-visit-calendar";
import type { PublishedMonthlyWorkScore } from "@/domain/admin-ranking";
import type { AuditDashboardSnapshot } from "@/lib/audits/dashboard-contracts";
import { getRecurringFindings } from "@/domain/finding-recurrence";
import { VisitCard } from "./visit-agenda";
import type { AgendaActionResult } from "@/lib/agenda/contracts";
import { MaintenanceHistory } from "./maintenance-history";
import { DialogoLogo } from "./dialogo-logo";
import { sortAuditHistory } from "@/domain/audit-history";
import { HistoryPagination } from "./history-pagination";
import { HistoryFilters, HistoryLoadStatus, HistoryMonthFilter, usePublishedHistoryPage } from "./published-history-page";
import { getSaoPauloToday } from "@/domain/visit-calendar";
import styles from "./prototype-workspace.module.css";
import engineeringStyles from "./engineering-overview.module.css";

export function PrototypeDashboard({ user, module, works, agendaWorks = works, audits, auditFindings = [], summary, publishedActionPlanKeys = [], visits, auditors = [], activeAccountCount, generalAdministrator = false, previewRanking = false, open }: { user: DemoUser; module: AppModule; works: readonly WorkRecord[]; agendaWorks?: readonly WorkRecord[]; audits: readonly AuditRecord[]; auditFindings?: readonly PublishedAuditFinding[]; summary?: AuditDashboardSnapshot; publishedActionPlanKeys?: readonly string[]; visits: readonly Visit[]; auditors?: readonly DemoUser[]; activeAccountCount: number | null; generalAdministrator?: boolean; previewRanking?: boolean; open: (screen: string) => void }) {
  const admin = user.role === "administrative";
  const safetyAuditor = user.role === "safety-auditor";
  const auditor = safetyAuditor || user.role === "quality-auditor";
  const scheduledAudits = visits.filter((visit) => visit.kind === "audit").length;
  const ownDrafts = audits.filter((audit) => canEditAudit(user, audit));
  const published = audits.filter((audit) => audit.status === "Publicada");
  const workNames = new Map(works.map((work) => [work.id, work.name]));
  const visibleFindings = auditFindings.filter((finding) => workNames.has(finding.workId)
    && user.modules.includes(finding.module)
    && (!auditor || finding.module === module));
  const localSeriousItems = summarizeSeriousFindings(visibleFindings.filter((finding) => finding.serious === true), workNames);
  const seriousItems = summary?.mostSevere
    ? [...new Map([...summary.mostSevere, ...localSeriousItems].map((item) => [item.id, item])).values()]
    : localSeriousItems;
  const localRecurringItems: AdminFindingSummary[] = getRecurringFindings(visibleFindings).map((finding) => ({
    id: finding.id,
    title: `${finding.item} · ${finding.description}`,
    discipline: moduleLabels[finding.module],
    month: finding.latestDate.slice(0, 7),
    workCount: finding.workCount,
    occurrences: finding.occurrences,
    descriptions: finding.details,
  }));
  const recurringItems: AdminFindingSummary[] = summary?.mostRecurring
    ? [...new Map([...summary.mostRecurring, ...localRecurringItems].map((item) => [item.id, item])).values()]
    : localRecurringItems;
  const publishedMonthlyScores: PublishedMonthlyWorkScore[] = published.flatMap((audit) => {
    const workName = workNames.get(audit.workId);
    if (typeof audit.finalScore !== "number" || !workName) return [];
    return [{
      month: audit.date.slice(0, 7),
      discipline: audit.modelId.startsWith("security-") ? "safety" as const : "quality" as const,
      workId: audit.workId,
      workName,
      score: audit.finalScore,
      published: true as const,
    }];
  });
  const rankingScores = previewRanking
    ? addPreviewRankingScores(publishedMonthlyScores, works, admin ? user.modules : [module])
    : publishedMonthlyScores;
  const publishedCount = summary ? summary.available ? summary.publishedCount : "--" : published.length;
  const findingsPanel = summary?.available === false
    ? <section className="panel" aria-label="Principais apontamentos"><h3>Principais apontamentos</h3><p role="status">Não foi possível carregar os apontamentos das auditorias.</p></section>
    : <AdminFindings mostSevere={seriousItems} mostRecurring={recurringItems}
      onOpenFindings={auditor ? (source) => open(source === "follow_up" ? "follow_up" : "audits") : undefined} />;
  const worksCard = <Metric label="Obras disponíveis" value={works.length} description={admin ? "Consultar obras" : undefined} onClick={() => open("works")} />;
  const agendaCard = <Metric label={admin ? "Visitas Agendadas" : auditor ? "Auditorias Agendadas" : "Visitas na agenda"} value={admin && visits.length === 0 ? "--" : auditor ? scheduledAudits : visits.length} description={admin ? "Consultar agenda" : undefined} onClick={works[0] && canConsultAgenda(user, works[0].id, module) ? () => open("agenda") : undefined} />;
  const profilesCard = <Metric label={admin ? "Perfis cadastrados" : "Relatórios publicados"} value={admin ? activeAccountCount ?? "--" : publishedCount} description={admin ? "Consultar perfis" : auditor ? "Consultar auditorias" : undefined} onClick={() => open(admin ? "settings" : auditor ? "audits" : "report")} />;
  const catalogsCard = <Metric label={admin ? "Roteiros disponíveis" : user.role === "engineering" ? "Auditorias consultáveis" : "Rascunhos próprios"} value={admin ? user.modules.includes("safety") ? 1 + (user.modules.includes("quality") ? 2 : 0) : 2 : user.role === "engineering" ? audits.length : ownDrafts.length} description={admin ? "Consultar roteiros" : undefined} onClick={() => open(admin ? "criteria" : "audits")} />;
  if (user.role === "engineering") return <EngineeringOverview user={user} works={works} audits={audits} auditFindings={visibleFindings} summary={summary} publishedActionPlanKeys={publishedActionPlanKeys} visits={visits} auditors={auditors} previewRanking={previewRanking} open={open} />;
  if (auditor) return <>
    <div className="page-intro"><div><h2>Visão geral</h2></div></div>
    <div className="stats-grid stats-grid-admin stats-grid-three">
      <Metric label="Auditorias Agendadas" value={scheduledAudits} description="Consultar agenda" onClick={() => open("agenda")} />
      <Metric label="Obras relacionadas" value={works.length} description="Consultar obras" onClick={() => open("works")} />
      <Metric label="Roteiros disponíveis" value={module === "safety" ? 1 : 2} description="Consultar roteiro" onClick={() => open("audits")} />
    </div>
    {findingsPanel}
    <div className="overview-grid">
      <AdminMonthlyRanking modules={[module]} publishedMonthlyScores={rankingScores} summary={summary?.ranking} available={summary?.available} />
      <AdminVisitCalendar visits={visits} works={agendaWorks} auditors={[user]} viewerId={user.id} onViewAgenda={() => open("agenda")} includeFollowUps showLegend={false} colorBy="work" />
    </div>
  </>;
  return <>
    <div className="page-intro"><div><h2>{admin ? "Painel administrativo" : "Visão geral"}</h2>{!admin && <p className="muted">{`${moduleLabels[module]} · ${roleLabels[user.role]}${user.activity === "coordination" ? " / Coordenação" : user.activity === "site-team" ? " / Equipe da obra" : ""}`}</p>}</div></div>
    <div className={`stats-grid${admin ? " stats-grid-admin" : ""}${admin && !generalAdministrator ? " stats-grid-three" : ""}`}>
      {admin ? <>{agendaCard}{worksCard}{catalogsCard}{generalAdministrator && profilesCard}</> : <>{worksCard}{agendaCard}{profilesCard}{catalogsCard}</>}
    </div>
    {admin && findingsPanel}
    <div className="overview-grid">
      {admin ? <AdminMonthlyRanking modules={user.modules} publishedMonthlyScores={rankingScores} summary={summary?.ranking} available={summary?.available} /> : module === "safety" ? <WorkRanking works={works} audits={audits} onViewWorks={() => open("works")} /> : <AdminMonthlyRanking modules={["quality"]} publishedMonthlyScores={rankingScores} summary={summary?.ranking} available={summary?.available} />}
      {admin ? <AdminVisitCalendar visits={visits} works={works} auditors={auditors} viewerId={user.id} onViewAgenda={() => open("agenda")} /> : <section className="panel"><div className="panel-heading"><div><span className="section-label">REGISTROS AUTORIZADOS</span><h3>Auditorias recentes</h3></div><span className="icon-tile"><Icon name="calendar" /></span></div>
        {[...audits].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((audit) => <div className="visit-card" key={audit.id}><div className="visit-info"><strong>{auditModelLabels[audit.modelId].name}</strong><small>{formatAuditDate(audit.date)} · {auditVersionLabel(audit)}</small></div><span className="badge">{audit.status}</span></div>)}
        {audits.length === 0 && <p className={styles.empty}>Nenhum registro disponível neste contexto.</p>}
        <button className="text-button panel-link" type="button" onClick={() => open("audits")}>Consultar auditorias<Icon name="arrow" /></button>
      </section>}
    </div>
  </>;
}

function addPreviewRankingScores(
  scores: readonly PublishedMonthlyWorkScore[],
  works: readonly WorkRecord[],
  modules: readonly AppModule[],
): PublishedMonthlyWorkScore[] {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", timeZone: "America/Sao_Paulo",
  }).formatToParts(new Date());
  const month = `${dateParts.find((part) => part.type === "year")!.value}-${dateParts.find((part) => part.type === "month")!.value}`;
  const disciplines = modules.filter((entry): entry is "safety" | "quality" => entry === "safety" || entry === "quality");
  const existing = new Set(scores.map((score) => `${score.month}\0${score.discipline}\0${score.workId}`));
  const preview = works.flatMap((work, workIndex) => disciplines.flatMap((discipline, disciplineIndex) => {
    if (existing.has(`${month}\0${discipline}\0${work.id}`)) return [];
    const score = Number(Math.max(5.5, 9.48 - workIndex * .43 - disciplineIndex * .18).toFixed(2));
    return [{ month, discipline, workId: work.id, workName: work.name, score, published: true as const }];
  }));
  return [...scores, ...preview];
}

function summarizeSeriousFindings(findings: readonly PublishedAuditFinding[], workNames: ReadonlyMap<string, string>): AdminFindingSummary[] {
  const grouped = new Map<string, { summary: AdminFindingSummary; works: Set<string> }>();
  findings.forEach((finding) => {
    const key = `${finding.module}:${finding.item}:${finding.description}`;
    const current = grouped.get(key);
    if (current) {
      current.summary.occurrences = (current.summary.occurrences ?? 0) + 1;
      current.works.add(finding.workId);
      current.summary.workCount = current.works.size;
      current.summary.references?.push({ id: finding.auditId, date: finding.auditDate, workName: workNames.get(finding.workId) ?? "Obra", responsible: finding.auditor });
      return;
    }
    grouped.set(key, {
      summary: {
        id: key,
        title: finding.nonconformity,
        source: "audits",
        checklistItem: `${finding.item} · ${finding.description}`,
        discipline: moduleLabels[finding.module],
        workCount: 1,
        occurrences: 1,
        references: [{ id: finding.auditId, date: finding.auditDate, workName: workNames.get(finding.workId) ?? "Obra", responsible: finding.auditor }],
      },
      works: new Set([finding.workId]),
    });
  });
  return [...grouped.values()].map(({ summary }) => summary)
    .sort((left, right) => (right.occurrences ?? 0) - (left.occurrences ?? 0) || left.checklistItem!.localeCompare(right.checklistItem!, "pt-BR"))
    .slice(0, 5);
}

function EngineeringOverview({ user, works, audits, auditFindings, summary, publishedActionPlanKeys, visits, auditors, previewRanking, open }: {
  user: DemoUser;
  works: readonly WorkRecord[];
  audits: readonly AuditRecord[];
  auditFindings: readonly PublishedAuditFinding[];
  summary?: AuditDashboardSnapshot;
  publishedActionPlanKeys: readonly string[];
  visits: readonly Visit[];
  auditors: readonly DemoUser[];
  previewRanking: boolean;
  open: (screen: string) => void;
}) {
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(null);
  const [selectedCalendarWorkId, setSelectedCalendarWorkId] = useState<string | null>(null);
  const workNames = new Map(works.map((work) => [work.id, work.name]));
  const publishedScores: PublishedMonthlyWorkScore[] = audits.flatMap((audit) => {
    const workName = workNames.get(audit.workId);
    if (audit.status !== "Publicada" || typeof audit.finalScore !== "number" || !workName) return [];
    return [{
      month: audit.date.slice(0, 7),
      discipline: audit.modelId.startsWith("security-") ? "safety" as const : "quality" as const,
      workId: audit.workId,
      workName,
      score: audit.finalScore,
      published: true as const,
    }];
  });
  const rankingScores = previewRanking
    ? addPreviewRankingScores(publishedScores, works, ["safety", "quality"])
    : publishedScores;
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", timeZone: "America/Sao_Paulo",
  }).formatToParts(new Date());
  const currentMonth = `${dateParts.find((part) => part.type === "year")!.value}-${dateParts.find((part) => part.type === "month")!.value}`;
  const scoredMonths = summary ? Object.keys(summary.scoreMonths) : rankingScores.map((score) => score.month);
  const latestScoredMonth = scoredMonths.reduce((latest, month) => month > latest ? month : latest, "");
  const scoreMonth = scoredMonths.includes(currentMonth) ? currentMonth : latestScoredMonth;
  const monthlyScores = rankingScores.filter((score) => score.month === scoreMonth);
  const scoreTotal = summary ? summary.scoreMonths[scoreMonth] : monthlyScores.length ? { sum: monthlyScores.reduce((total, score) => total + score.score, 0), count: monthlyScores.length } : undefined;
  const monthlyAverage = scoreTotal && summary?.available !== false
    ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(scoreTotal.sum / scoreTotal.count)
    : "--";
  const findingCount = summary?.findingCount ?? new Set(auditFindings.map((finding) => `${finding.auditId}\0${finding.id}`)).size;
  const publishedPlanKeys = new Set(publishedActionPlanKeys);
  const pendingPlanCount = new Set((summary?.pendingPlanKeys ?? auditFindings
    .map((finding) => `${finding.auditId}:${finding.module}:${finding.workId}`))
    .filter((key) => !publishedPlanKeys.has(key))).size;

  return <>
    <div className="page-intro"><div><h2>Visão geral</h2></div></div>
    {user.activity !== "coordination" && <div className={engineeringStyles.metrics}>
      <EngineeringMetric label="Apontamentos" value={summary?.available === false ? "--" : String(findingCount).padStart(2, "0")} />
      <EngineeringMetric label="Planos de ação" value={summary?.available === false ? "--" : String(pendingPlanCount).padStart(2, "0")} detail="Pendentes" />
      <EngineeringMetric label="Nota" value={monthlyAverage} detail={summary?.available === false ? "Consulta indisponível" : scoreMonth === currentMonth ? "Média do mês" : scoreMonth ? "Último mês com nota" : "Sem notas publicadas"} accent />
    </div>}
    <div className={engineeringStyles.content}>
      <AdminMonthlyRanking modules={["safety", "quality"]} publishedMonthlyScores={rankingScores} summary={summary?.ranking} available={summary?.available} />
      <AdminVisitCalendar visits={visits} works={works} auditors={auditors} viewerId={user.id} calendarOnly includeFollowUps={user.activity !== "coordination"}
        colorBy={user.activity === "coordination" ? "work" : "auditor"}
        selectedAuditorId={user.activity === "coordination" ? null : selectedVisitorId}
        onSelectAuditor={user.activity === "coordination" ? undefined : setSelectedVisitorId}
        selectedWorkId={user.activity === "coordination" ? selectedCalendarWorkId : null}
        onSelectWork={user.activity === "coordination" ? setSelectedCalendarWorkId : undefined}
        keepVisitorColors={user.activity !== "coordination"} highlightAuditDays onViewAgenda={() => open("agenda")} />
    </div>
  </>;
}

function EngineeringMetric({ label, value, detail, accent = false }: { label: string; value: string; detail?: string; accent?: boolean }) {
  return <section className={`${engineeringStyles.metric}${accent ? ` ${engineeringStyles.metricAccent}` : ""}`} aria-label={label}>
    <h3>{label}</h3>
    {detail && <span>{detail}</span>}
    <strong>{value}</strong>
  </section>;
}

function Metric({ label, value, description, onClick }: { label: string; value: number | string; description?: string; onClick?: () => void }) {
  return <button type="button" className="stat-card" onClick={onClick} disabled={!onClick}><span className="stat-top">{label}<Icon name="arrow" /></span><strong className="stat-value">{String(value).padStart(2, "0")}</strong><span className="stat-bottom">{onClick ? description ?? "Consultar contexto selecionado" : "Consulta não concedida neste perfil"}</span></button>;
}

function historyContextKey(user: DemoUser, works: readonly WorkRecord[], filter = "") {
  return JSON.stringify([user.id, user.role, user.activity, [...user.modules].sort(), works.map((work) => work.id).sort(), filter]);
}

export function AuditList({ user, audits, works, onOpen, module, workId, contextKey = "" }: { user: DemoUser; audits: readonly AuditRecord[]; works: readonly WorkRecord[]; onOpen: (audit: AuditRecord) => void; module?: AppModule; workId?: string; contextKey?: string }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const visible = sortAuditHistory(audits.filter((audit) => (!dateFrom || audit.date >= dateFrom) && (!dateTo || audit.date <= dateTo)));
  const history = usePublishedHistoryPage(visible, { module, workId, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, includeFindings: false }, historyContextKey(user, works, contextKey));
  const rows = history.remote ? [...visible.filter((audit) => audit.isDemo || audit.status !== "Publicada"), ...history.items] : history.items;
  return <><div className="page-intro"><div><h2>Auditorias e histórico</h2><p className="muted">Rascunhos próprios e consultas permitidas no módulo e na obra selecionados.</p></div></div>
    <HistoryFilters dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} label="Filtrar histórico" />
    <HistoryLoadStatus history={history} />
    <div className="table-panel"><table><caption>Auditorias do contexto</caption><thead><tr><th>Obra / registro</th><th>Modelo / versão</th><th>Data / responsável</th><th>Situação</th><th>Acesso</th></tr></thead><tbody>{rows.map((audit) => <tr key={audit.id}><td><strong>{works.find((work) => work.id === audit.workId)?.name}</strong><small>{audit.id}</small></td><td>{auditModelLabels[audit.modelId].name}<small>{auditVersionLabel(audit)}</small></td><td>{formatAuditDate(audit.date)}<small>{audit.auditor}</small></td><td><span className="badge">{audit.status}</span></td><td><button type="button" className="secondary" onClick={() => onOpen(audit)}>{canEditAudit(user, audit) ? "Retomar rascunho" : "Consultar"}</button></td></tr>)}{rows.length === 0 && history.status === "ready" && <tr><td colSpan={5}>Nenhuma auditoria disponível para este perfil e contexto.</td></tr>}</tbody></table></div>
    <HistoryPagination {...history} label="Páginas do histórico de auditorias" />
  </>;
}

export function AuditorScheduledAudits({ user, visits, works, audits, auditFindings = [], users, available, mutationPending, onDelete, onConfirm, onStartAudit, startedVisitIds, catalog }: {
  user: DemoUser;
  visits: readonly Visit[];
  works: readonly WorkRecord[];
  audits: readonly AuditRecord[];
  auditFindings?: readonly PublishedAuditFinding[];
  users: readonly DemoUser[];
  available: boolean;
  mutationPending: boolean;
  onDelete: (visitId: string, expectedRevision: number) => Promise<AgendaActionResult>;
  onConfirm: (visitId: string, expectedRevision: number) => Promise<AgendaActionResult>;
  onStartAudit: (visit: Visit) => Promise<void>;
  startedVisitIds: ReadonlySet<string>;
  catalog: ReactNode;
}) {
  const [publicationWorkId, setPublicationWorkId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const workById = new Map(works.map((work) => [work.id, work]));
  const scheduled = visits.filter((visit) => visit.kind === "audit" && visit.auditorId === user.id
    && workById.has(visit.workId) && canReadVisit(user, visit))
    .slice().sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));
  const published = sortAuditHistory(audits.filter((audit) => audit.status === "Publicada" && workById.has(audit.workId) && canReadAudit(user, audit)));
  const visiblePublished = published.filter((audit) => (!publicationWorkId || audit.workId === publicationWorkId) && (!dateFrom || audit.date >= dateFrom) && (!dateTo || audit.date <= dateTo));
  const discipline: AppModule = user.role === "safety-auditor" ? "safety" : "quality";
  const publicationPage = usePublishedHistoryPage(visiblePublished, { module: discipline, workId: publicationWorkId || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, includeFindings: false }, historyContextKey(user, works));
  const publishedIds = new Set(published.map((audit) => audit.id));
  const visibleFindings = auditFindings.filter((finding) => publicationPage.remote || publishedIds.has(finding.auditId))
    .slice().sort((left, right) => Number(right.serious === true) - Number(left.serious === true) || right.auditDate.localeCompare(left.auditDate));
  const publicationItems = publicationPage.remote ? [...visiblePublished.filter((audit) => audit.isDemo), ...publicationPage.items] : publicationPage.items;
  const exampleWork = workById.get(scheduled[0]?.workId ?? "") ?? works[0];
  const exampleDate = scheduled[0]?.date ?? "2026-09-18";
  const showExample = !publicationPage.remote && process.env.NODE_ENV !== "production" && published.length === 0 && !!exampleWork;
  const showFilteredExample = showExample && (!publicationWorkId || publicationWorkId === exampleWork.id);

  return <>
    <div className="page-intro"><h2>Auditorias</h2></div>
    <div className={styles.auditorLayout}>
      <div className={styles.auditorSidebar}>
        <section className={`panel ${styles.scheduledPanel}`} aria-label="Auditorias agendadas">
          <div className="panel-heading"><h3>Auditorias agendadas</h3></div>
          {scheduled.length ? <div className={styles.scheduledList}>
            {scheduled.map((visit) => <VisitCard key={visit.id} visit={visit} user={user} users={users}
              work={workById.get(visit.workId)} available={available} mutationPending={mutationPending}
              onDelete={onDelete} onConfirm={onConfirm} onStartAudit={onStartAudit} auditStarted={startedVisitIds.has(visit.id)} collapsedInitially />)}
          </div> : <p className="muted">Nenhuma auditoria agendada para este perfil.</p>}
        </section>
        <section className="panel" aria-label="Apontamentos das auditorias">
          <div className="panel-heading"><h3>Apontamentos das auditorias</h3></div>
          <PublishedAuditFindingsList auditFindings={visibleFindings} works={works} module={discipline} contextKey={historyContextKey(user, works)} />
        </section>
      </div>
      <div className={styles.auditorSidebar}>
        <section className="panel" aria-label="Auditorias publicadas">
          <div className={`panel-heading ${styles.publicationHeading}`}><h3>Auditorias publicadas</h3>
            {showExample && <span className="badge badge-amber">Prévia de teste</span>}
          </div>
          <HistoryFilters works={works} workId={publicationWorkId} onWorkChange={setPublicationWorkId} dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} label="Filtrar auditorias publicadas" />
          <HistoryLoadStatus history={publicationPage} />
          <div className={styles.publicationColumns}>
            <div className={styles.publicationColumn}>
              <h4>Auditoria</h4>
              {publicationItems.length ? publicationItems.map((audit) => <PublishedDocumentCard key={audit.id} example={audit.isDemo} date={audit.date}
                workName={workById.get(audit.workId)?.name ?? "Obra"} responsible={audit.auditor}
                actionLabel={audit.reportUrl ? "Abrir PDF da auditoria" : undefined}
                onAction={audit.reportUrl ? () => window.open(audit.reportUrl, "_blank", "noopener,noreferrer") : undefined} />)
                : showFilteredExample ? <PublishedDocumentCard date={exampleDate} workName={exampleWork.name} responsible={user.name} example />
                  : publicationPage.status === "ready" ? <p className="muted">Nenhuma auditoria publicada para este perfil neste período.</p> : null}
            </div>
            <div className={styles.publicationColumn}>
              <h4>Plano de ação</h4>
              {showFilteredExample ? <PublishedDocumentCard date={exampleDate} workName={exampleWork.name} responsible={user.name} example />
                : <p className="muted">Nenhum plano de ação publicado.</p>}
            </div>
          </div>
          <HistoryPagination {...publicationPage} label="Páginas das auditorias publicadas" />
        </section>
        <section className={`panel ${styles.auditorCatalog}`} aria-label="Roteiros">{catalog}</section>
      </div>
    </div>
  </>;
}

export type ActionPlanSource = {
  auditId: string | null;
  workId: string;
  workName: string;
  date: string;
  module: AppModule;
  example: boolean;
};

export function PublishedAuditsPanel({ user, works, audits, module, onCreateActionPlan, hasPublishedActionPlan, onDownloadActionPlan }: {
  user: DemoUser;
  works: readonly WorkRecord[];
  audits: readonly AuditRecord[];
  module: AppModule;
  onCreateActionPlan?: (source: ActionPlanSource) => void;
  hasPublishedActionPlan?: (source: ActionPlanSource) => boolean;
  onDownloadActionPlan?: (source: ActionPlanSource) => void;
}) {
  const [publicationWorkId, setPublicationWorkId] = useState("");
  const [month, setMonth] = useState(() => getSaoPauloToday().slice(0, 7));
  const [year, monthNumber] = month.split("-").map(Number);
  const dateFrom = month ? `${month}-01` : "";
  const dateTo = month && Number.isInteger(year) && Number.isInteger(monthNumber)
    ? `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}` : "";
  const workById = new Map(works.map((work) => [work.id, work]));
  const published = sortAuditHistory(audits.filter((audit) => audit.status === "Publicada" && modelModule(audit.modelId) === module
    && workById.has(audit.workId) && canReadAudit(user, audit)));
  const visiblePublished = published.filter((audit) => (!publicationWorkId || audit.workId === publicationWorkId) && (!dateFrom || audit.date >= dateFrom) && (!dateTo || audit.date <= dateTo));
  const publicationPage = usePublishedHistoryPage(visiblePublished, { module, workId: publicationWorkId || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, includeFindings: false }, historyContextKey(user, works, module));
  const publicationItems = publicationPage.remote ? [...visiblePublished.filter((audit) => audit.isDemo), ...publicationPage.items] : publicationPage.items;
  const exampleWork = works[0];
  const exampleDate = "2026-09-18";
  const showExample = !publicationPage.remote && process.env.NODE_ENV !== "production" && published.length === 0 && !!exampleWork;
  const showFilteredExample = showExample && (!publicationWorkId || publicationWorkId === exampleWork.id);

  return <section className="panel" aria-label={`Auditorias publicadas de ${moduleLabels[module]}`}>
    <div className={`panel-heading ${styles.publicationHeading}`}><h3>{moduleLabels[module]}</h3>
      <HistoryMonthFilter className={styles.publicationFilters} works={works} workId={publicationWorkId} onWorkChange={setPublicationWorkId} month={month} onMonthChange={setMonth} label="Filtrar auditorias publicadas" />
    </div>
    <HistoryLoadStatus history={publicationPage} />
    <div className={styles.publicationColumns}>
      <div className={styles.publicationColumn}>
        <h4>Auditoria</h4>
        {publicationItems.length ? publicationItems.map((audit) => <PublishedDocumentCard key={audit.id} example={audit.isDemo} date={audit.date}
          workName={workById.get(audit.workId)?.name ?? "Obra"} responsible={audit.auditor}
          actionLabel={audit.reportUrl ? "Abrir PDF da auditoria" : undefined}
          onAction={audit.reportUrl ? () => window.open(audit.reportUrl, "_blank", "noopener,noreferrer") : undefined} />)
          : showFilteredExample ? <PublishedDocumentCard date={exampleDate} workName={exampleWork.name} responsible={user.name} example />
            : publicationPage.status === "ready" ? <p className="muted">Nenhuma auditoria publicada para este perfil neste período.</p> : null}
      </div>
      <div className={styles.publicationColumn}>
        <h4>Plano de ação</h4>
        {publicationItems.length ? publicationItems.map((audit) => {
          const workName = workById.get(audit.workId)?.name ?? "Obra";
          const source: ActionPlanSource = { auditId: audit.id, workId: audit.workId, workName, date: audit.date, module, example: false };
          const publishedPlan = hasPublishedActionPlan?.(source) ?? false;
          return <PublishedDocumentCard key={audit.id} example={audit.isDemo} date={audit.date} workName={workName} responsible={user.name}
            actionLabel={publishedPlan ? "Baixar PDF do plano publicado" : onCreateActionPlan ? "Criar plano de ação" : undefined}
            onAction={publishedPlan && onDownloadActionPlan ? () => onDownloadActionPlan(source) : onCreateActionPlan ? () => onCreateActionPlan(source) : undefined} />;
        }) : showFilteredExample ? (() => {
          const source: ActionPlanSource = { auditId: null, workId: exampleWork.id, workName: exampleWork.name, date: exampleDate, module, example: true };
          const publishedPlan = hasPublishedActionPlan?.(source) ?? false;
          return <PublishedDocumentCard date={exampleDate} workName={exampleWork.name} responsible={user.name} example
            actionLabel={publishedPlan ? "Baixar PDF do plano publicado" : onCreateActionPlan ? "Criar plano de ação" : undefined}
            onAction={publishedPlan && onDownloadActionPlan ? () => onDownloadActionPlan(source) : onCreateActionPlan ? () => onCreateActionPlan(source) : undefined} />;
        })()
          : <p className="muted">Nenhum plano de ação publicado.</p>}
      </div>
    </div>
    <HistoryPagination {...publicationPage} label={`Páginas das auditorias publicadas de ${moduleLabels[module]}`} />
  </section>;
}

function PublishedDocumentCard({ date, workName, responsible, example = false, actionLabel, onAction }: {
  date: string; workName: string; responsible: string; example?: boolean; actionLabel?: string; onAction?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [year, month] = date.split("-");
  const monthLabel = `${month}/${year}`;
  const monthAbbreviation = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"][Number(month) - 1] ?? month;
  return <article className={styles.publicationCard}>
    <button type="button" className={styles.publicationSummary} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      <span className={styles.publicationDate}><strong>{monthAbbreviation}</strong><small>{year}</small></span>
      <span className={styles.publicationInfo}><strong>{workName}</strong><small>Responsável</small><span>{responsible}</span></span>
      <span className={styles.publicationChevron} aria-hidden="true" />
    </button>
    {expanded && <div className={styles.publicationDetails}>
      <span>{example ? "Exemplo visual, sem publicação" : `Referência: ${monthLabel}`}</span>
      {onAction && actionLabel ? <button type="button" className="primary" onClick={onAction}>{actionLabel}</button>
        : <button type="button" className="secondary" disabled title="PDF ainda não disponível">Baixar PDF</button>}
    </div>}
  </article>;
}

const deferred = {
  discussion: { title: "Fechamento com a obra", text: "O auditor discute os resultados com a equipe da obra e registra os ajustes. A confirmação do acordo está em preparação.", action: "Registrar acordo" },
  publication: { title: "Conferência e publicação", text: "A publicação estará disponível após a validação dos cálculos e das condições de emissão. Relatórios publicados preservarão seu conteúdo original.", action: "Publicar relatório" },
  plans: { title: "Planos de ação", text: "A equipe da obra elabora o plano e a coordenação registra seu parecer. Os formulários e o envio estão em preparação.", action: "Enviar plano" },
} as const;

export function DeferredScreen({ kind }: { kind: keyof typeof deferred }) {
  const entry = deferred[kind];
  return <><div className="page-intro"><div><h2>{entry.title}</h2><p className="muted">Em preparação</p></div></div><section className="panel"><p className="muted" id={`pending-${kind}`}>{entry.text}</p><button className="secondary" type="button" disabled aria-describedby={`pending-${kind}`}>{entry.action}</button></section></>;
}

export function AdministrativePanel({ accessContent }: { accessContent?: ReactNode }) {
  return <><div className="page-intro"><div><h2>Administração</h2></div></div>
    <div className={styles.administrationSections}>
      <section className="panel" aria-label="Usuários e acessos">{accessContent}</section>
      <MaintenanceHistory />
    </div>
  </>;
}

export function AuditPreview({ audit, work }: { audit: AuditRecord; work: WorkRecord }) {
  const model = auditModelLabels[audit.modelId];
  return <><div className="page-intro"><div><h2>Relatório de auditoria</h2><p className="muted">Prévia de demonstração · não é relatório publicado.</p></div><button type="button" className="primary" onClick={() => window.print()}><Icon name="report" />Imprimir página</button></div><article className="report-sheet"><div className="report-heading"><div><DialogoLogo className={styles.reportLogo} /><h3>Relatório de coleta</h3><p className="muted">Exemplo de apresentação · dados de teste</p></div><span className="badge badge-amber">Nota final pendente</span></div><dl className="report-details"><div><dt>OBRA</dt><dd>{work.name}</dd></div><div><dt>DISCIPLINA E ROTEIRO</dt><dd>{model.name} · {auditVersionLabel(audit)}</dd></div><div><dt>DATA DA AUDITORIA</dt><dd>{formatAuditDate(audit.date)}</dd></div><div><dt>AUDITOR RESPONSÁVEL</dt><dd>{audit.auditor}</dd></div></dl><div className="report-warning"><Icon name="info" /><div><strong>Nota pendente — configuração incompleta</strong><p>Publicação oficial em preparação.</p></div></div><p className="report-footnote">Prévia de identificação e apresentação. Não inclui as respostas e anexos do rascunho, nem produz documento publicado. A impressão usa o navegador e não salva a auditoria.</p></article></>;
}
