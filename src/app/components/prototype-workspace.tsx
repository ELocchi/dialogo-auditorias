"use client";

import { useState } from "react";
import { auditModelLabels, formatAuditDate, type AuditModelId, type AuditRecord, type WorkRecord } from "@/domain/operational-records";
import { canEditAudit, canStartAudit, canConsultAgenda, roleLabels, moduleLabels, type DemoUser, type AppModule, type Visit } from "@/domain/prototype-access";
import { Icon } from "./ui-icon";
import { WorkRanking } from "./work-ranking";
import { AdminFindings } from "./admin-findings";
import { AdminMonthlyRanking } from "./admin-monthly-ranking";
import { AdminVisitCalendar } from "./admin-visit-calendar";
import { DialogoLogo } from "./dialogo-logo";
import styles from "./prototype-workspace.module.css";

export function PrototypeDashboard({ user, module, works, audits, visits, open }: { user: DemoUser; module: AppModule; works: readonly WorkRecord[]; audits: readonly AuditRecord[]; visits: readonly Visit[]; open: (screen: string) => void }) {
  const admin = user.role === "administrative";
  const ownDrafts = audits.filter((audit) => canEditAudit(user, audit));
  const published = audits.filter((audit) => audit.status === "Publicada");
  return <>
    <div className="page-intro"><div><h2>{admin ? "Painel administrativo" : "Visão geral"}</h2><p className="muted">{admin ? "Cadastros, configuração e agendamento de visitas." : `${moduleLabels[module]} · ${roleLabels[user.role]}${user.activity === "coordination" ? " / Coordenação" : user.activity === "site-team" ? " / Equipe da obra" : ""}`}</p></div>{!admin && works[0] && canStartAudit(user, works[0].id, module === "safety" ? "security-it07-r02" : "quality-f175") && <button className="primary" type="button" onClick={() => open("new")}><Icon name="plus" />Nova auditoria</button>}</div>
    <div className="stats-grid">
      <Metric label="Obras disponíveis" value={works.length} description={admin ? "Consultar obras" : undefined} onClick={() => open("works")} />
      <Metric label="Visitas na agenda" value={admin && visits.length === 0 ? "--" : visits.length} description={admin ? "Consultar agenda" : undefined} onClick={works[0] && canConsultAgenda(user, works[0].id, module) ? () => open("agenda") : undefined} />
      <Metric label={admin ? "Perfis principais" : "Relatórios publicados"} value={admin ? 4 : published.length} description={admin ? "Consultar perfis" : undefined} onClick={() => open(admin ? "settings" : "report")} />
      <Metric label={admin ? "Roteiros disponíveis" : user.role === "engineering" ? "Auditorias consultáveis" : "Rascunhos próprios"} value={admin ? 3 : user.role === "engineering" ? audits.length : ownDrafts.length} description={admin ? "Consultar roteiros" : undefined} onClick={() => open(admin ? "criteria" : "audits")} />
    </div>
    {admin && <AdminFindings />}
    <div className="overview-grid">
      {admin ? <AdminMonthlyRanking /> : module === "safety" ? <WorkRanking works={works} audits={audits} onViewWorks={() => open("works")} /> : <section className="panel"><span className="section-label">QUALIDADE</span><h3>Roteiros independentes</h3><p className="muted">F.175/00: 10 quesitos. F.176/00: 23 quesitos. Pesos e critérios disponíveis nos roteiros; cálculo automático e Farol em preparação.</p><button className="secondary" type="button" onClick={() => open("criteria")}>Consultar roteiros</button></section>}
      {admin ? <AdminVisitCalendar visits={visits} works={works} onViewAgenda={() => open("agenda")} /> : <section className="panel"><div className="panel-heading"><div><span className="section-label">REGISTROS AUTORIZADOS</span><h3>Auditorias recentes</h3></div><span className="icon-tile"><Icon name="calendar" /></span></div>
        {[...audits].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((audit) => <div className="visit-card" key={audit.id}><div className="visit-info"><strong>{auditModelLabels[audit.modelId].name}</strong><small>{formatAuditDate(audit.date)} · {auditModelLabels[audit.modelId].version}</small></div><span className="badge">{audit.status}</span></div>)}
        {audits.length === 0 && <p className={styles.empty}>Nenhum registro disponível neste contexto.</p>}
        <button className="text-button panel-link" type="button" onClick={() => open("audits")}>Consultar auditorias<Icon name="arrow" /></button>
      </section>}
    </div>
  </>;
}

function Metric({ label, value, description, onClick }: { label: string; value: number | string; description?: string; onClick?: () => void }) {
  return <button type="button" className="stat-card" onClick={onClick} disabled={!onClick}><span className="stat-top">{label}<Icon name="arrow" /></span><strong className="stat-value">{String(value).padStart(2, "0")}</strong><span className="stat-bottom">{onClick ? description ?? "Consultar contexto selecionado" : "Consulta não concedida neste perfil"}</span></button>;
}

export function AuditList({ user, audits, works, onOpen, onNew }: { user: DemoUser; audits: readonly AuditRecord[]; works: readonly WorkRecord[]; onOpen: (audit: AuditRecord) => void; onNew?: () => void }) {
  return <><div className="page-intro"><div><h2>Auditorias e histórico</h2><p className="muted">Rascunhos próprios e consultas permitidas no módulo e na obra selecionados.</p></div>{onNew && <button type="button" className="primary" onClick={onNew}>Nova auditoria</button>}</div>
    <div className="table-panel"><table><caption>Auditorias do contexto · rascunhos de teste nesta prévia</caption><thead><tr><th>Obra / registro</th><th>Modelo / versão</th><th>Data / responsável</th><th>Situação</th><th>Acesso</th></tr></thead><tbody>{[...audits].sort((a, b) => b.date.localeCompare(a.date)).map((audit) => <tr key={audit.id}><td><strong>{works.find((work) => work.id === audit.workId)?.name}</strong><small>{audit.id}</small></td><td>{auditModelLabels[audit.modelId].name}<small>{auditModelLabels[audit.modelId].version}</small></td><td>{formatAuditDate(audit.date)}<small>{audit.auditor}</small></td><td><span className="badge">{audit.status}</span><small>Nota pendente — configuração incompleta</small></td><td><button type="button" className="secondary" onClick={() => onOpen(audit)}>{canEditAudit(user, audit) ? "Retomar rascunho" : "Consultar"}</button></td></tr>)}{audits.length === 0 && <tr><td colSpan={5}>Nenhuma auditoria disponível para este perfil e contexto.</td></tr>}</tbody></table></div>
  </>;
}

export function StartAudit({ user, work, module, onStart }: { user: DemoUser; work: WorkRecord; module: AppModule; onStart: (model: AuditModelId, date: string) => void }) {
  const [model, setModel] = useState<AuditModelId>(module === "safety" ? "security-it07-r02" : "quality-f175");
  const [error, setError] = useState("");
  return <><div className="page-intro"><div><h2>Iniciar auditoria</h2><p className="muted">Experimente o preenchimento com a obra e o perfil selecionados. Cada início abre um rascunho de teste vazio.</p></div></div>
    <form className="panel" onSubmit={(event) => { event.preventDefault(); try { const date = new FormData(event.currentTarget).get("inspectionDate"); if (typeof date !== "string" || !date) throw new Error("Informe uma data válida para a inspeção."); onStart(model, date); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível iniciar."); } }}>
      <div className={styles.fields}><label>Obra<input value={work.name} readOnly /></label><label>Auditor responsável<input value={user.name} readOnly /></label><label>Modelo pretendido<select value={model} onChange={(event) => setModel(event.target.value as AuditModelId)}>{(module === "safety" ? ["security-it07-r02"] : ["quality-f175", "quality-f176"]).map((id) => <option key={id} value={id}>{auditModelLabels[id as AuditModelId].name} · {auditModelLabels[id as AuditModelId].version}</option>)}</select></label><label>Data da inspeção<input name="inspectionDate" type="date" required /></label></div>
      <p className={styles.help}>Obra, responsável e versão identificam este rascunho de teste. Não há gravação ou publicação oficial nesta prévia.</p>
      {error && <p role="alert">{error}</p>}<button className="primary" type="submit" disabled={!canStartAudit(user, work.id, model)}>Iniciar preenchimento</button>
    </form></>;
}

const deferred = {
  discussion: { title: "Fechamento com a obra", text: "O auditor discute os resultados com a equipe da obra e registra os ajustes. A confirmação do acordo está em preparação.", action: "Registrar acordo" },
  publication: { title: "Conferência e publicação", text: "A publicação estará disponível após a validação dos cálculos e das condições de emissão. Relatórios publicados preservarão seu conteúdo original.", action: "Publicar relatório" },
  plans: { title: "Planos de ação", text: "A equipe da obra elabora o plano e a coordenação registra seu parecer. Os formulários e o envio estão em preparação.", action: "Enviar plano" },
  committee: { title: "Comitê de Segurança", text: "A agenda e as apresentações ao comitê estarão disponíveis após a definição das regras e a publicação de resultados válidos.", action: "Agendar comitê" },
} as const;

export function DeferredScreen({ kind }: { kind: keyof typeof deferred }) {
  const entry = deferred[kind];
  return <><div className="page-intro"><div><h2>{entry.title}</h2><p className="muted">Em preparação</p></div></div><section className="panel"><p className="muted" id={`pending-${kind}`}>{entry.text}</p><button className="secondary" type="button" disabled aria-describedby={`pending-${kind}`}>{entry.action}</button></section></>;
}

export function AdministrativePanel() {
  const [tab, setTab] = useState("users");
  const entries = [["users", "Usuários e acessos"], ["parameters", "Parâmetros"], ["reports", "Modelos de relatórios"], ["history", "Histórico de manutenção"]];
  return <><div className="page-intro"><div><h2>Administração</h2><p className="muted">Manutenção da plataforma · sem edição do conteúdo de auditorias.</p></div></div><nav className="subnav" aria-label="Manutenção administrativa">{entries.map(([id, label]) => <button className={`subnav-item${id === tab ? " active" : ""}`} key={id} type="button" onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === "users" ? <section className="panel"><h3>Usuários e acessos</h3><p className="muted">Analise solicitações, combine perfis e defina as obras e os módulos autorizados para cada pessoa. As decisões e os acessos concedidos ficam registrados no histórico.</p><a className="primary" href="/administracao/usuarios">Abrir usuários e acessos</a></section> : <section className="panel"><h3>{entries.find(([id]) => id === tab)?.[1]}</h3><p className="muted">{tab === "parameters" ? "A configuração dos pesos e cálculos oficiais está em preparação. Os pesos já documentados podem ser consultados nos roteiros." : tab === "reports" ? "A manutenção de modelos de apresentação está em preparação. Uma nova versão não alterará relatórios já publicados." : "O histórico da manutenção de parâmetros e modelos estará disponível com esses recursos. As aprovações de acesso já podem ser consultadas em Usuários e acessos."}</p>{tab === "history" ? <a className="secondary" href="/administracao/usuarios#history-heading">Consultar histórico de acessos</a> : <button className="secondary" type="button" disabled>Em preparação</button>}</section>}
  </>;
}

export function AuditPreview({ audit, work }: { audit: AuditRecord; work: WorkRecord }) {
  const model = auditModelLabels[audit.modelId];
  return <><div className="page-intro"><div><h2>Relatório de auditoria</h2><p className="muted">Prévia de demonstração · não é relatório publicado.</p></div><button type="button" className="primary" onClick={() => window.print()}><Icon name="report" />Imprimir página</button></div><article className="report-sheet"><div className="report-heading"><div><DialogoLogo className={styles.reportLogo} /><h3>Relatório de coleta</h3><p className="muted">Exemplo de apresentação · dados de teste</p></div><span className="badge badge-amber">Nota final pendente</span></div><dl className="report-details"><div><dt>OBRA</dt><dd>{work.name}</dd></div><div><dt>DISCIPLINA E ROTEIRO</dt><dd>{model.name} · {model.version}</dd></div><div><dt>DATA DA AUDITORIA</dt><dd>{formatAuditDate(audit.date)}</dd></div><div><dt>AUDITOR RESPONSÁVEL</dt><dd>{audit.auditor}</dd></div></dl><div className="report-warning"><Icon name="info" /><div><strong>Nota pendente — configuração incompleta</strong><p>Publicação oficial em preparação.</p></div></div><p className="report-footnote">Prévia de identificação e apresentação. Não inclui as respostas e anexos do rascunho, nem produz documento publicado. A impressão usa o navegador e não salva a auditoria.</p></article></>;
}
