"use client";

import { useState, type ReactNode } from "react";
import { auditModelLabels, auditVersionLabel, formatAuditDate, type AuditRecord, type WorkRecord } from "@/domain/operational-records";
import { canEditAudit, canConsultAgenda, canReadAudit, canReadVisit, roleLabels, moduleLabels, type DemoUser, type AppModule, type Visit } from "@/domain/prototype-access";
import { Icon } from "./ui-icon";
import { WorkRanking } from "./work-ranking";
import { AdminFindings } from "./admin-findings";
import { AdminMonthlyRanking } from "./admin-monthly-ranking";
import { AdminVisitCalendar } from "./admin-visit-calendar";
import { VisitCard } from "./visit-agenda";
import type { AgendaActionResult } from "@/lib/agenda/contracts";
import { MaintenanceHistory } from "./maintenance-history";
import { DialogoLogo } from "./dialogo-logo";
import styles from "./prototype-workspace.module.css";

export function PrototypeDashboard({ user, module, works, audits, visits, auditors = [], activeAccountCount, generalAdministrator = false, open }: { user: DemoUser; module: AppModule; works: readonly WorkRecord[]; audits: readonly AuditRecord[]; visits: readonly Visit[]; auditors?: readonly DemoUser[]; activeAccountCount: number | null; generalAdministrator?: boolean; open: (screen: string) => void }) {
  const admin = user.role === "administrative";
  const safetyAuditor = user.role === "safety-auditor";
  const auditor = safetyAuditor || user.role === "quality-auditor";
  const scheduledAudits = visits.filter((visit) => visit.kind === "audit").length;
  const ownDrafts = audits.filter((audit) => canEditAudit(user, audit));
  const published = audits.filter((audit) => audit.status === "Publicada");
  const worksCard = <Metric label="Obras disponíveis" value={works.length} description={admin ? "Consultar obras" : undefined} onClick={() => open("works")} />;
  const agendaCard = <Metric label={admin ? "Visitas Agendadas" : auditor ? "Auditorias Agendadas" : "Visitas na agenda"} value={admin && visits.length === 0 ? "--" : auditor ? scheduledAudits : visits.length} description={admin ? "Consultar agenda" : undefined} onClick={works[0] && canConsultAgenda(user, works[0].id, module) ? () => open("agenda") : undefined} />;
  const profilesCard = <Metric label={admin ? "Perfis cadastrados" : "Relatórios publicados"} value={admin ? activeAccountCount ?? "--" : published.length} description={admin ? "Consultar perfis" : auditor ? "Consultar auditorias" : undefined} onClick={() => open(admin ? "settings" : auditor ? "audits" : "report")} />;
  const catalogsCard = <Metric label={admin ? "Roteiros disponíveis" : user.role === "engineering" ? "Auditorias consultáveis" : "Rascunhos próprios"} value={admin ? user.modules.includes("safety") ? 1 + (user.modules.includes("quality") ? 2 : 0) : 2 : user.role === "engineering" ? audits.length : ownDrafts.length} description={admin ? "Consultar roteiros" : undefined} onClick={() => open(admin ? "criteria" : "audits")} />;
  if (safetyAuditor) return <>
    <div className="page-intro"><div><h2>Visão geral</h2><p className="muted">Segurança · Auditor de Segurança</p></div></div>
    <div className="stats-grid stats-grid-admin stats-grid-three">
      <Metric label="Auditorias Agendadas" value={scheduledAudits} description="Consultar agenda" onClick={() => open("agenda")} />
      <Metric label="Obras relacionadas" value={works.length} description="Consultar obras" onClick={() => open("works")} />
      <Metric label="Roteiros disponíveis" value={1} description="Consultar roteiro" onClick={() => open("criteria")} />
    </div>
    <AdminFindings />
    <div className="overview-grid">
      <AdminMonthlyRanking modules={["safety"]} />
      <AdminVisitCalendar visits={visits} works={works} auditors={[user]} viewerId={user.id} onViewAgenda={() => open("agenda")} includeFollowUps showLegend={false} />
    </div>
  </>;
  return <>
    <div className="page-intro"><div><h2>{admin ? "Painel administrativo" : "Visão geral"}</h2>{!admin && <p className="muted">{`${moduleLabels[module]} · ${roleLabels[user.role]}${user.activity === "coordination" ? " / Coordenação" : user.activity === "site-team" ? " / Equipe da obra" : ""}`}</p>}</div></div>
    <div className={`stats-grid${admin ? " stats-grid-admin" : ""}${admin && !generalAdministrator ? " stats-grid-three" : ""}`}>
      {admin ? <>{agendaCard}{worksCard}{catalogsCard}{generalAdministrator && profilesCard}</> : <>{worksCard}{agendaCard}{profilesCard}{catalogsCard}</>}
    </div>
    {admin && <AdminFindings />}
    <div className="overview-grid">
      {admin ? <AdminMonthlyRanking modules={user.modules} /> : module === "safety" ? <WorkRanking works={works} audits={audits} onViewWorks={() => open("works")} /> : <section className="panel"><span className="section-label">QUALIDADE</span><h3>Roteiros independentes</h3><p className="muted">F.175/00: 10 quesitos. F.176/00: 23 quesitos. Pesos e critérios disponíveis nos roteiros; cálculo automático e Farol em preparação.</p><button className="secondary" type="button" onClick={() => open("criteria")}>Consultar roteiros</button></section>}
      {admin ? <AdminVisitCalendar visits={visits} works={works} auditors={auditors} viewerId={user.id} onViewAgenda={() => open("agenda")} /> : <section className="panel"><div className="panel-heading"><div><span className="section-label">REGISTROS AUTORIZADOS</span><h3>Auditorias recentes</h3></div><span className="icon-tile"><Icon name="calendar" /></span></div>
        {[...audits].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((audit) => <div className="visit-card" key={audit.id}><div className="visit-info"><strong>{auditModelLabels[audit.modelId].name}</strong><small>{formatAuditDate(audit.date)} · {auditVersionLabel(audit)}</small></div><span className="badge">{audit.status}</span></div>)}
        {audits.length === 0 && <p className={styles.empty}>Nenhum registro disponível neste contexto.</p>}
        <button className="text-button panel-link" type="button" onClick={() => open("audits")}>Consultar auditorias<Icon name="arrow" /></button>
      </section>}
    </div>
  </>;
}

function Metric({ label, value, description, onClick }: { label: string; value: number | string; description?: string; onClick?: () => void }) {
  return <button type="button" className="stat-card" onClick={onClick} disabled={!onClick}><span className="stat-top">{label}<Icon name="arrow" /></span><strong className="stat-value">{String(value).padStart(2, "0")}</strong><span className="stat-bottom">{onClick ? description ?? "Consultar contexto selecionado" : "Consulta não concedida neste perfil"}</span></button>;
}

export function AuditList({ user, audits, works, onOpen }: { user: DemoUser; audits: readonly AuditRecord[]; works: readonly WorkRecord[]; onOpen: (audit: AuditRecord) => void }) {
  return <><div className="page-intro"><div><h2>Auditorias e histórico</h2><p className="muted">Rascunhos próprios e consultas permitidas no módulo e na obra selecionados.</p></div></div>
    <div className="table-panel"><table><caption>Auditorias do contexto · rascunhos de teste nesta prévia</caption><thead><tr><th>Obra / registro</th><th>Modelo / versão</th><th>Data / responsável</th><th>Situação</th><th>Acesso</th></tr></thead><tbody>{[...audits].sort((a, b) => b.date.localeCompare(a.date)).map((audit) => <tr key={audit.id}><td><strong>{works.find((work) => work.id === audit.workId)?.name}</strong><small>{audit.id}</small></td><td>{auditModelLabels[audit.modelId].name}<small>{auditVersionLabel(audit)}</small></td><td>{formatAuditDate(audit.date)}<small>{audit.auditor}</small></td><td><span className="badge">{audit.status}</span><small>Nota pendente — configuração incompleta</small></td><td><button type="button" className="secondary" onClick={() => onOpen(audit)}>{canEditAudit(user, audit) ? "Retomar rascunho" : "Consultar"}</button></td></tr>)}{audits.length === 0 && <tr><td colSpan={5}>Nenhuma auditoria disponível para este perfil e contexto.</td></tr>}</tbody></table></div>
  </>;
}

export function AuditorScheduledAudits({ user, visits, works, audits, users, available, mutationPending, onDelete, onConfirm, onStartAudit, startedVisitIds, catalog }: {
  user: DemoUser;
  visits: readonly Visit[];
  works: readonly WorkRecord[];
  audits: readonly AuditRecord[];
  users: readonly DemoUser[];
  available: boolean;
  mutationPending: boolean;
  onDelete: (visitId: string, expectedRevision: number) => Promise<AgendaActionResult>;
  onConfirm: (visitId: string, expectedRevision: number) => Promise<AgendaActionResult>;
  onStartAudit: (visit: Visit) => Promise<void>;
  startedVisitIds: ReadonlySet<string>;
  catalog: ReactNode;
}) {
  const workById = new Map(works.map((work) => [work.id, work]));
  const scheduled = visits.filter((visit) => visit.kind === "audit" && visit.auditorId === user.id
    && workById.has(visit.workId) && canReadVisit(user, visit))
    .slice().sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));
  const published = audits.filter((audit) => audit.status === "Publicada" && workById.has(audit.workId) && canReadAudit(user, audit))
    .slice().sort((first, second) => second.date.localeCompare(first.date) || second.id.localeCompare(first.id));
  const exampleWork = workById.get(scheduled[0]?.workId ?? "") ?? works[0];
  const exampleDate = scheduled[0]?.date ?? "2026-09-18";
  const showExample = process.env.NODE_ENV !== "production" && published.length === 0 && !!exampleWork;

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
          <p className="muted">Nenhum apontamento incluído em relatório de auditoria publicado.</p>
        </section>
      </div>
      <div className={styles.auditorSidebar}>
        <section className="panel" aria-label="Auditorias publicadas">
          <div className="panel-heading"><h3>Auditorias publicadas</h3>{showExample && <span className="badge badge-amber">Prévia de teste</span>}</div>
          <div className={styles.publicationColumns}>
            <div className={styles.publicationColumn}>
              <h4>Auditoria</h4>
              {published.length ? published.map((audit) => <PublishedDocumentCard key={audit.id} date={audit.date}
                workName={workById.get(audit.workId)?.name ?? "Obra"} responsible={audit.auditor} />)
                : showExample ? <PublishedDocumentCard date={exampleDate} workName={exampleWork.name} responsible={user.name} example />
                  : <p className="muted">Nenhuma auditoria publicada para este perfil.</p>}
            </div>
            <div className={styles.publicationColumn}>
              <h4>Plano de ação</h4>
              {showExample ? <PublishedDocumentCard date={exampleDate} workName={exampleWork.name} responsible={user.name} example />
                : <p className="muted">Nenhum plano de ação publicado.</p>}
            </div>
          </div>
        </section>
        <section className={`panel ${styles.auditorCatalog}`} aria-label="Roteiros">{catalog}</section>
      </div>
    </div>
  </>;
}

function PublishedDocumentCard({ date, workName, responsible, example = false }: {
  date: string; workName: string; responsible: string; example?: boolean;
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
      <button type="button" className="secondary" disabled title="PDF ainda não disponível">Baixar PDF</button>
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

export function AdministrativePanel({ accessContent, worksContent }: { accessContent?: ReactNode; worksContent?: ReactNode }) {
  const [tab, setTab] = useState("users");
  const entries = [["users", "Usuários e acessos"], ["works", "Cadastro de obras"], ["history", "Histórico de manutenção"]];
  return <><div className="page-intro"><div><h2>Administração</h2></div></div><nav className="subnav" aria-label="Manutenção administrativa">{entries.map(([id, label]) => <button className={`subnav-item${id === tab ? " active" : ""}`} key={id} type="button" onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === "users" ? accessContent : tab === "works" ? worksContent : <MaintenanceHistory />}
  </>;
}

export function AuditPreview({ audit, work }: { audit: AuditRecord; work: WorkRecord }) {
  const model = auditModelLabels[audit.modelId];
  return <><div className="page-intro"><div><h2>Relatório de auditoria</h2><p className="muted">Prévia de demonstração · não é relatório publicado.</p></div><button type="button" className="primary" onClick={() => window.print()}><Icon name="report" />Imprimir página</button></div><article className="report-sheet"><div className="report-heading"><div><DialogoLogo className={styles.reportLogo} /><h3>Relatório de coleta</h3><p className="muted">Exemplo de apresentação · dados de teste</p></div><span className="badge badge-amber">Nota final pendente</span></div><dl className="report-details"><div><dt>OBRA</dt><dd>{work.name}</dd></div><div><dt>DISCIPLINA E ROTEIRO</dt><dd>{model.name} · {auditVersionLabel(audit)}</dd></div><div><dt>DATA DA AUDITORIA</dt><dd>{formatAuditDate(audit.date)}</dd></div><div><dt>AUDITOR RESPONSÁVEL</dt><dd>{audit.auditor}</dd></div></dl><div className="report-warning"><Icon name="info" /><div><strong>Nota pendente — configuração incompleta</strong><p>Publicação oficial em preparação.</p></div></div><p className="report-footnote">Prévia de identificação e apresentação. Não inclui as respostas e anexos do rascunho, nem produz documento publicado. A impressão usa o navegador e não salva a auditoria.</p></article></>;
}
