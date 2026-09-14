"use client";

import { useState } from "react";
import { type AuditModelId, type AuditRecord } from "@/domain/operational-records";
import { roleLabels, moduleLabels, modelModule, canAccessWorkModule, canAccessModule, canReadVisit, canConsultAgenda, canReadAudit, canEditAudit, canStartAudit, canReadTechnicalWeights, canReadOperationalDocuments, type AppModule, type Visit } from "@/domain/prototype-access";
import { beginWorkspacePreviewAudit, updatePrototypeResponse, updatePrototypeAuditDate, criteriaForModel, modelDisplayName, type PrototypeAuditState } from "@/domain/prototype-audits";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import { Catalog, NewAudit } from "./audit-workspace";
import { Works, Occurrences } from "./operational-views";
import { Icon, type IconName } from "./ui-icon";
import { VisitAgenda } from "./visit-agenda";
import { PrototypeDashboard, AuditList, StartAudit, DeferredScreen, AdministrativePanel, AuditPreview } from "./prototype-workspace";
import { LogoutButton } from "./auth/LogoutButton";
import styles from "./prototype-app.module.css";

export function PrototypeApp({ context, initialScreen = "overview" }: { context: ProfileWorkspaceContext; initialScreen?: "overview" | "works" }) {
  return <ProfileWorkspace key={JSON.stringify([context.user, context.profile, context.works, initialScreen])} context={context} initialScreen={initialScreen} />;
}

function ProfileWorkspace({ context, initialScreen }: { context: ProfileWorkspaceContext; initialScreen: "overview" | "works" }) {
  const { user } = context;
  const [selectedModule, setSelectedModule] = useState<AppModule | null>(user.modules[0] ?? null);
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const [screen, setScreen] = useState<string>(initialScreen);
  const [session, setSession] = useState<PrototypeAuditState>({ audits: [], responses: {} });
  const visits: readonly Visit[] = [];
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [jumpOpen, setJumpOpen] = useState(false);
  const [catalogId, setCatalogId] = useState<AuditModelId>("security-it07-r02");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [error, setError] = useState("");

  const availableModules = user.modules.filter((module) => canAccessModule(user, module));
  const auditModule = selectedModule && availableModules.includes(selectedModule) ? selectedModule : availableModules[0] ?? null;
  const availableWorks = context.works.filter((work) => auditModule && canAccessWorkModule(user, work.id, auditModule));
  const work = availableWorks.find((entry) => entry.id === selectedWorkId) ?? availableWorks[0];
  const isAdmin = user.role === "administrative";
  const modelIds: AuditModelId[] = auditModule === "safety" ? ["security-it07-r02"] : auditModule === "quality" ? ["quality-f175", "quality-f176"] : [];
  const currentCatalogId = modelIds.includes(catalogId) ? catalogId : modelIds[0];
  const currentModelName = currentCatalogId ? modelDisplayName(currentCatalogId) : "Sem roteiro autorizado";
  const canStart = !!work && !!currentCatalogId && canStartAudit(user, work.id, currentCatalogId);
  const canAgenda = !!auditModule && !!work && canConsultAgenda(user, work.id, auditModule);
  const canDocuments = !!auditModule && !!work && canReadOperationalDocuments(user, work.id, auditModule);
  const moduleAudits = session.audits.filter((audit) => modelModule(audit.modelId) === auditModule && canReadAudit(user, audit));
  const contextualAudits = moduleAudits.filter((audit) => audit.workId === work?.id);
  const contextualVisits = visits.filter((visit) => visit.workId === work?.id && visit.module === auditModule && canReadVisit(user, visit));
  const activeAudit = contextualAudits.find((audit) => audit.id === activeAuditId);
  const preview = activeAudit ?? contextualAudits.find((audit) => canEditAudit(user, audit));
  const criteria = currentCatalogId ? criteriaForModel(currentCatalogId).filter((item) => `${item.code} ${item.text} ${item.group} ${item.subgroup}`.toLocaleLowerCase("pt-BR").includes(catalogQuery.toLocaleLowerCase("pt-BR"))) : [];

  const nav: { key: string; label: string; icon: IconName }[] = [
    { key: "overview", label: isAdmin ? "Painel administrativo" : "Visão geral", icon: "overview" },
    ...(canAgenda || (isAdmin && auditModule) ? [{ key: "agenda", label: "Agenda", icon: "calendar" as const }] : []),
    ...(!isAdmin ? [{ key: "audits", label: "Auditorias", icon: "audits" as const }] : []),
    { key: "works", label: "Obras", icon: "works" },
    ...(currentCatalogId ? [{ key: "criteria", label: isAdmin ? "Roteiros e versões" : "Roteiros", icon: "book" as const }] : []),
    ...(canDocuments ? [{ key: "report", label: "Relatórios", icon: "report" as const }, { key: "occurrences", label: "Apontamentos", icon: "occurrences" as const }, { key: "plans", label: "Planos de ação", icon: "check" as const }] : []),
    ...(canDocuments && auditModule === "safety" ? [{ key: "committee", label: "Comitê", icon: "calendar" as const }] : []),
    ...(isAdmin ? [{ key: "settings", label: "Administração", icon: "settings" as const }] : []),
  ];
  const allowed = new Set([...nav.map((item) => item.key), ...(canStart ? ["new", "fill", "discussion", "publication"] : []), ...(activeAudit && canReadAudit(user, activeAudit) ? ["fill"] : [])]);
  const currentScreen = allowed.has(screen) ? screen : "overview";
  const navigate = (next: string) => { if (allowed.has(next)) { setScreen(next); setError(""); } };
  const changeContext = () => { setScreen("overview"); setActiveAuditId(null); setJumpOpen(false); setCatalogQuery(""); setError(""); };
  const openAudit = (audit: AuditRecord) => {
    if (!work || !canReadAudit(user, audit) || audit.workId !== work.id || modelModule(audit.modelId) !== auditModule) return;
    setActiveAuditId(audit.id); setJumpOpen(false); setScreen(audit.status === "Publicada" ? "report" : "fill");
  };
  const startAudit = (modelId: AuditModelId, date: string, visit?: Visit) => {
    if (!work || modelModule(modelId) !== auditModule || !canAccessWorkModule(user, work.id, modelModule(modelId))) throw new Error("Selecione uma obra e um modelo autorizados.");
    const result = beginWorkspacePreviewAudit(session, user, { id: `PREVIA-${crypto.randomUUID()}`, work, modelId, date, visit });
    setSession(result.state); setActiveAuditId(result.auditId); setJumpOpen(false); setScreen("fill");
  };
  const agendaUnavailable = () => { throw new Error("O agendamento estará disponível após a integração da agenda e dos auditores autorizados."); };
  const auditNav = ["audits", "new", "fill", "discussion", "publication"].includes(currentScreen);
  const profileLabel = `${roleLabels[user.role]}${user.activity === "coordination" ? " · Coordenação" : user.activity === "site-team" ? " · Equipe da obra" : ""}`;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    <header className="site-header"><div className="header-inner"><div className="header-main">
      <div className="brand" aria-label="Diálogo Engenharia"><span className="brand-name">Diálogo</span><span className="brand-caption">ENGENHARIA</span></div>
      <div className="header-title"><h1>Auditorias de obra</h1><p>Gestão de segurança e qualidade</p><span className="context-pill">{isAdmin ? "ADMINISTRAÇÃO" : auditModule ? moduleLabels[auditModule].toLocaleUpperCase("pt-BR") : "MEU PERFIL"}</span></div>
      <div className={styles.session}>
        <div className={`summary-item ${styles.userCard}`}><span>USUÁRIO</span><strong>{user.name}</strong></div>
        <div className={styles.sessionActions}><a href="/escolher-perfil">Trocar perfil</a><a href="/minha-conta">Meus acessos</a><LogoutButton /></div>
      </div>
    </div><div className="header-summary"><div className="summary-item"><span>OBRA NO CONTEXTO</span><strong>{work?.name ?? "Sem obra autorizada"}</strong></div><div className="summary-item"><span>{isAdmin ? "DISCIPLINA DA AGENDA" : "MÓDULO"}</span><strong>{auditModule ? moduleLabels[auditModule] : "Sem módulo autorizado"}</strong></div><div className="summary-item"><span>ACESSO</span><strong>{profileLabel}</strong></div></div></div></header>
    <div className="navigation-bar"><nav className="main-navigation" aria-label="Navegação principal">{nav.map(({ key, label, icon }) => <button type="button" key={key} className={`nav-item${currentScreen === key || (key === "audits" && auditNav) ? " active" : ""}`} aria-current={currentScreen === key ? "page" : undefined} onClick={() => navigate(key)}><Icon name={icon} /><span>{label}</span></button>)}</nav></div>
    <main className="main-content" id="main-content" tabIndex={-1}><div className="content-wrap">
      {currentScreen !== "works" && <aside className="notice"><Icon name="info" /><p><strong>Auditorias em prévia.</strong> Preenchimentos de auditoria de teste não são salvos e serão descartados ao atualizar ou trocar perfil.</p></aside>}
      <div className={styles.context} aria-label="Contexto autorizado"><label>{isAdmin ? "Disciplina da agenda" : "Módulo"}<select value={auditModule ?? ""} disabled={!availableModules.length} onChange={(event) => { const next = event.target.value as AppModule; if (canAccessModule(user, next)) { setSelectedModule(next); changeContext(); } }}>{!availableModules.length && <option value="">Nenhum módulo autorizado</option>}{availableModules.map((id) => <option value={id} key={id}>{moduleLabels[id]}</option>)}</select></label><label>Obra no contexto<select value={work?.id ?? ""} disabled={!availableWorks.length} onChange={(event) => { if (auditModule && canAccessWorkModule(user, event.target.value, auditModule)) { setSelectedWorkId(event.target.value); changeContext(); } }}>{!availableWorks.length && <option value="">Nenhuma obra autorizada</option>}{availableWorks.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label></div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {auditNav && <nav className="subnav" aria-label="Seções de auditorias"><button className={`subnav-item${currentScreen === "audits" ? " active" : ""}`} type="button" onClick={() => navigate("audits")}>Histórico e rascunhos</button>{canStart && <><button className={`subnav-item${currentScreen === "new" ? " active" : ""}`} type="button" onClick={() => navigate("new")}>Nova auditoria</button>{activeAudit && <button className={`subnav-item${currentScreen === "fill" ? " active" : ""}`} type="button" onClick={() => navigate("fill")}>Preenchimento</button>}<button className="subnav-item" type="button" onClick={() => navigate("discussion")}>Fechamento</button><button className="subnav-item" type="button" onClick={() => navigate("publication")}>Conferência e publicação</button></>}</nav>}
      {currentScreen === "overview" && (auditModule ? <PrototypeDashboard user={user} module={auditModule} works={availableWorks} audits={moduleAudits} visits={contextualVisits} open={navigate} /> : <section className="panel"><h2>Visão geral</h2><p className="muted">Este perfil ainda não tem obras e módulos autorizados. Consulte seus acessos ou solicite a liberação ao Administrativo.</p></section>)}
      {currentScreen === "works" && <Works works={availableWorks} canManage={isAdmin} />}
      {currentScreen === "settings" && isAdmin && <AdministrativePanel />}
      {currentScreen === "criteria" && currentCatalogId && auditModule && <>{isAdmin && <div className="inline-note">Consulte os roteiros disponíveis. A manutenção de novas versões está em preparação.</div>}<Catalog model={currentModelName} setModel={(name) => { const id = modelIds.find((entry) => modelDisplayName(entry) === name); if (id) { setCatalogId(id); setCatalogQuery(""); } }} query={catalogQuery} setQuery={setCatalogQuery} criteria={criteria} allowedModels={modelIds.map(modelDisplayName)} showWeights={canReadTechnicalWeights(user, auditModule)} /></>}
      {currentScreen === "audits" && <AuditList user={user} works={availableWorks} audits={contextualAudits} onOpen={openAudit} onNew={canStart ? () => navigate("new") : undefined} />}
      {work && auditModule && <>
        {currentScreen === "agenda" && canAgenda && <VisitAgenda key={`${user.id}:${work.id}:${auditModule}`} user={user} works={availableWorks} users={[]} visits={[]} module={auditModule} workId={work.id} previewOnly onCreate={agendaUnavailable} onReschedule={agendaUnavailable} onStartAudit={(visit) => startAudit(visit.modelId, visit.date, visit)} />}
        {currentScreen === "new" && canStart && <StartAudit key={`${user.id}:${work.id}:${auditModule}`} user={user} work={work} module={auditModule} onStart={startAudit} />}
        {currentScreen === "fill" && activeAudit && activeAudit.status !== "Publicada" && <NewAudit key={activeAudit.id} model={modelDisplayName(activeAudit.modelId)} setModel={() => {}} responseKey={activeAudit.modelId} lockedContext workName={`${work.name} · ${work.city}`} readOnly={!canEditAudit(user, activeAudit)} showWeights={canReadTechnicalWeights(user, auditModule)} criteria={criteriaForModel(activeAudit.modelId)} activeIndex={positions[activeAudit.id] ?? 0} setActiveIndex={(index) => setPositions((previous) => ({ ...previous, [activeAudit.id]: index }))} drafts={session.responses[activeAudit.id] ?? {}} updateDraft={(response) => { try { const item = criteriaForModel(activeAudit.modelId)[positions[activeAudit.id] ?? 0]; setSession(updatePrototypeResponse(session, user, activeAudit.id, item, response)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Edição indisponível."); } }} jumpOpen={jumpOpen} setJumpOpen={setJumpOpen} details={{ date: activeAudit.date, auditor: activeAudit.auditor }} setDetails={(details) => { try { setSession(updatePrototypeAuditDate(session, user, activeAudit.id, details.date)); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Data inválida."); } }} />}
        {currentScreen === "fill" && !activeAudit && <p className="muted">Selecione um rascunho autorizado no histórico.</p>}
        {currentScreen === "report" && <>{preview && canEditAudit(user, preview) ? <AuditPreview audit={preview} work={work} /> : <section className="panel"><h2>Relatórios publicados</h2><p className="muted">Nenhum documento publicado disponível neste contexto. A publicação oficial está em preparação.</p></section>}</>}
        {currentScreen === "occurrences" && <Occurrences works={[work]} records={[]} />}
        {(currentScreen === "discussion" || currentScreen === "publication" || currentScreen === "plans" || currentScreen === "committee") && <DeferredScreen kind={currentScreen} />}
      </>}
      {!work && currentScreen === "agenda" && <section className="panel"><h2>Nenhuma obra disponível na agenda</h2><p className="muted">Cadastre uma obra para consultar este contexto.</p></section>}
      <footer className="page-footer"><span>Diálogo Engenharia · Auditorias</span><span>{profileLabel}</span></footer>
    </div></main>
  </div>;
}

