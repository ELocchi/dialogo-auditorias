"use client";

import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";
import { type AuditModelId, type AuditRecord } from "@/domain/operational-records";
import { roleLabels, moduleLabels, modelModule, canAccessWorkModule, canAccessModule, canReadVisit, canConsultAgenda, canReadAudit, canEditAudit, canStartAudit, canReadTechnicalWeights, canReadOperationalDocuments, type AppModule, type Visit, type VisitInput } from "@/domain/prototype-access";
import { beginWorkspacePreviewAudit, updatePrototypeResponse, updatePrototypeAuditDate, criteriaForAudit, modelDisplayName, type PrototypeAuditState } from "@/domain/prototype-audits";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import { unavailableAgenda, type AgendaActionResult, type AgendaSnapshot } from "@/lib/agenda/contracts";
import { createAgendaVisitAction, rescheduleAgendaVisitAction, confirmAgendaVisitAction } from "@/app/agenda/actions";
import { catalogVersion, unavailableCatalogs, type CatalogSnapshot } from "@/lib/catalogs/contracts";
import { refreshCatalogsAction } from "@/app/catalogs/actions";
import { Catalog, NewAudit } from "./audit-workspace";
import { Works, Occurrences } from "./operational-views";
import { Icon, type IconName } from "./ui-icon";
import { VisitAgenda } from "./visit-agenda";
import { PrototypeDashboard, AuditList, StartAudit, DeferredScreen, AdministrativePanel, AuditPreview } from "./prototype-workspace";
import { LogoutButton } from "./auth/LogoutButton";
import { AdminNotifications, type AdminNotification } from "./auth/AdminNotifications";
import { AdministrativeHeader } from "./administrative-header";
import { DialogoLogo } from "./dialogo-logo";
import styles from "./prototype-app.module.css";

type PrototypeAppProps = {
  context: ProfileWorkspaceContext;
  initialScreen?: "overview" | "works" | "agenda" | "settings";
  initialVisitId?: string;
  initialAgenda?: AgendaSnapshot;
  initialCatalogs?: CatalogSnapshot;
  administrationContent?: ReactNode;
  administrationWorksContent?: ReactNode;
  activeAccountCount?: number | null;
};

export function PrototypeApp({ context, initialScreen = "overview", initialVisitId, initialAgenda = unavailableAgenda(), initialCatalogs = unavailableCatalogs(), administrationContent, administrationWorksContent, activeAccountCount = null }: PrototypeAppProps) {
  return <ProfileWorkspace key={JSON.stringify([context.user, context.profile, context.works, initialScreen, initialVisitId])} context={context} initialScreen={initialScreen} initialVisitId={initialVisitId} initialAgenda={initialAgenda} initialCatalogs={initialCatalogs} administrationContent={administrationContent} administrationWorksContent={administrationWorksContent} activeAccountCount={activeAccountCount} />;
}

function ProfileWorkspace({ context, initialScreen, initialVisitId, initialAgenda, initialCatalogs, administrationContent, administrationWorksContent, activeAccountCount }: Required<Pick<PrototypeAppProps, "context" | "initialScreen" | "initialAgenda" | "initialCatalogs" | "activeAccountCount">> & Pick<PrototypeAppProps, "initialVisitId" | "administrationContent" | "administrationWorksContent">) {
  const { user } = context;
  const initialVisit = initialScreen === "agenda" ? initialAgenda.visits.find((visit) => visit.id === initialVisitId && canReadVisit(user, visit)) : undefined;
  const [selectedModule, setSelectedModule] = useState<AppModule | null>(initialVisit?.module ?? user.modules[0] ?? null);
  const [selectedWorkId, setSelectedWorkId] = useState(initialVisit?.workId ?? "");
  const [screen, setScreen] = useState<string>(initialScreen);
  const [catalogs, setCatalogs] = useState(initialCatalogs);
  const [startingAudit, setStartingAudit] = useState(false);
  const startingRef = useRef(false);
  const [session, setSession] = useState<PrototypeAuditState>({ audits: [], responses: {} });
  const { agenda, agendaSyncError, mutationPending, runAgendaAction } = useAgenda(initialAgenda, user.id, context.profile, context.engineeringScope);
  const visits = agenda.visits;
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
  const catalogModules = isAdmin ? availableModules : auditModule ? [auditModule] : [];
  const modelIds = (["security-it07-r02", "quality-f175", "quality-f176"] as const).filter((id) => catalogModules.includes(modelModule(id)));
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
  const criteria = !isAdmin && currentCatalogId ? catalogVersion(catalogs, currentCatalogId).criteria.filter((item) => `${item.code} ${item.text} ${item.group} ${item.subgroup}`.toLocaleLowerCase("pt-BR").includes(catalogQuery.toLocaleLowerCase("pt-BR"))) : [];

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
  const isAdminOverview = isAdmin && currentScreen === "overview";
  const isAdminAgenda = isAdmin && currentScreen === "agenda";
  const isAdminWorks = isAdmin && currentScreen === "works";
  const isAdminCatalog = isAdmin && currentScreen === "criteria";
  const isAdminSettings = isAdmin && currentScreen === "settings";
  const navigate = (next: string) => { if (allowed.has(next)) { setScreen(next); setError(""); } };
  const navigateAgenda = (item: AdminNotification) => {
    const visitId = item.href ? new URL(item.href, window.location.origin).searchParams.get("visita") : null;
    const target = visits.find((visit) => visit.id === visitId && canReadVisit(user, visit))
      ?? visits.find((visit) => canReadVisit(user, visit) && context.works.some((entry) => entry.id === visit.workId && entry.name === item.workName));
    if (target) { setSelectedModule(target.module); setSelectedWorkId(target.workId); }
    if (target || allowed.has("agenda")) { setScreen("agenda"); setError(""); setJumpOpen(false); }
  };
  const changeContext = () => { setScreen("overview"); setActiveAuditId(null); setJumpOpen(false); setCatalogQuery(""); setError(""); };
  const openAudit = (audit: AuditRecord) => {
    if (!work || !canReadAudit(user, audit) || audit.workId !== work.id || modelModule(audit.modelId) !== auditModule) return;
    setActiveAuditId(audit.id); setJumpOpen(false); setScreen(audit.status === "Publicada" ? "report" : "fill");
  };
  const startAudit = async (modelId: AuditModelId, date: string, visit?: Visit) => {
    if (startingRef.current) return;
    startingRef.current = true; setStartingAudit(true); setError("");
    try {
      if (!work || modelModule(modelId) !== auditModule || !canAccessWorkModule(user, work.id, modelModule(modelId))) throw new Error("Selecione uma obra e um modelo autorizados.");
      const existing = visit && session.audits.find((audit) => audit.visitId === visit.id);
      const latest = existing ? catalogs : await refreshCatalogsAction({ userId: user.id, profile: context.profile, engineeringScope: context.engineeringScope });
      if (!existing && !latest.available && !latest.setupPending) throw new Error("Não foi possível conferir a revisão atual. Tente novamente antes de iniciar a auditoria.");
      if (latest.available) setCatalogs(latest);
      const result = beginWorkspacePreviewAudit(session, user, { id: `PREVIA-${newRequestId()}`, work, modelId, date, visit, catalogRevision: catalogVersion(latest, modelId) });
      setSession(result.state); setSelectedWorkId(work.id); setSelectedModule(modelModule(modelId)); setActiveAuditId(result.auditId); setJumpOpen(false); setScreen("fill");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível iniciar a auditoria."); }
    finally { startingRef.current = false; setStartingAudit(false); }
  };
  const agendaActor = { userId: user.id, profile: context.profile, engineeringScope: context.engineeringScope ?? null };
  const agendaActions = {
    onCreate: (input: VisitInput) => runAgendaAction("create", input, (requestId) => createAgendaVisitAction({ ...input, requestId }, agendaActor)),
    onReschedule: (visitId: string, change: { expectedRevision: number; date: string; note: string }) => runAgendaAction(`reschedule:${visitId}`, { visitId, ...change }, (requestId) => rescheduleAgendaVisitAction({ visitId, ...change, requestId }, agendaActor)),
    onConfirm: (visitId: string, expectedRevision: number) => runAgendaAction(`confirm:${visitId}`, { visitId, expectedRevision }, (requestId) => confirmAgendaVisitAction({ visitId, expectedRevision, requestId }, agendaActor)),
  };
  const auditNav = ["audits", "new", "fill", "discussion", "publication"].includes(currentScreen);
  const profileLabel = `${roleLabels[user.role]}${user.activity === "coordination" ? " · Coordenação" : user.activity === "site-team" ? " · Equipe da obra" : ""}`;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    {isAdmin ? <AdministrativeHeader name={user.name} notifications={agenda.notifications} onNavigateAgenda={navigateAgenda} /> : <header className="site-header"><div className="header-inner"><div className="header-main">
      <div className="brand"><DialogoLogo /></div>
      <div className="header-title"><h1>Auditorias de obra</h1><p>Gestão de segurança e qualidade</p><span className="context-pill">{auditModule ? moduleLabels[auditModule].toLocaleUpperCase("pt-BR") : "MEU PERFIL"}</span></div>
      <div className={styles.session}>
          <div className={`summary-item ${styles.userCard}`}><span>USUÁRIO</span><strong>{user.name}</strong></div>
          <div className={styles.sessionActions}><AdminNotifications items={agenda.notifications} onNavigateAgenda={navigateAgenda} /><a href="/escolher-perfil">Trocar perfil</a><a href="/minha-conta">Meus acessos</a><LogoutButton /></div>
      </div>
    </div><div className="header-summary"><div className="summary-item"><span>OBRA NO CONTEXTO</span><strong>{work?.name ?? "Sem obra autorizada"}</strong></div><div className="summary-item"><span>MÓDULO</span><strong>{auditModule ? moduleLabels[auditModule] : "Sem módulo autorizado"}</strong></div><div className="summary-item"><span>ACESSO</span><strong>{profileLabel}</strong></div></div></div></header>}
    <div className="navigation-bar"><nav className="main-navigation" aria-label="Navegação principal">{nav.map(({ key, label, icon }) => <button type="button" key={key} className={`nav-item${currentScreen === key || (key === "audits" && auditNav) ? " active" : ""}`} aria-current={currentScreen === key ? "page" : undefined} onClick={() => navigate(key)}><Icon name={icon} /><span>{label}</span></button>)}</nav></div>
    <main className="main-content" id="main-content" tabIndex={-1}><div className="content-wrap">
      {!isAdminOverview && !isAdminAgenda && !isAdminWorks && !isAdminCatalog && !isAdminSettings && <div className={styles.context} aria-label="Contexto autorizado"><label>{isAdmin ? "Disciplina da agenda" : "Módulo"}<select value={auditModule ?? ""} disabled={!availableModules.length} onChange={(event) => { const next = event.target.value as AppModule; if (canAccessModule(user, next)) { setSelectedModule(next); changeContext(); } }}>{!availableModules.length && <option value="">Nenhum módulo autorizado</option>}{availableModules.map((id) => <option value={id} key={id}>{moduleLabels[id]}</option>)}</select></label><label>Obra no contexto<select value={work?.id ?? ""} disabled={!availableWorks.length} onChange={(event) => { if (auditModule && canAccessWorkModule(user, event.target.value, auditModule)) { setSelectedWorkId(event.target.value); changeContext(); } }}>{!availableWorks.length && <option value="">Nenhuma obra autorizada</option>}{availableWorks.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label></div>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {auditNav && <nav className="subnav" aria-label="Seções de auditorias"><button className={`subnav-item${currentScreen === "audits" ? " active" : ""}`} type="button" onClick={() => navigate("audits")}>Histórico e rascunhos</button>{canStart && <><button className={`subnav-item${currentScreen === "new" ? " active" : ""}`} type="button" onClick={() => navigate("new")}>Nova auditoria</button>{activeAudit && <button className={`subnav-item${currentScreen === "fill" ? " active" : ""}`} type="button" onClick={() => navigate("fill")}>Preenchimento</button>}<button className="subnav-item" type="button" onClick={() => navigate("discussion")}>Fechamento</button><button className="subnav-item" type="button" onClick={() => navigate("publication")}>Conferência e publicação</button></>}</nav>}
      {currentScreen === "overview" && (auditModule ? <PrototypeDashboard user={user} module={auditModule} works={isAdminOverview ? context.works : availableWorks} audits={isAdminOverview ? session.audits.filter((audit) => canReadAudit(user, audit)) : moduleAudits} visits={isAdminOverview ? visits.filter((visit) => canReadVisit(user, visit)) : contextualVisits} activeAccountCount={activeAccountCount} open={navigate} /> : <section className="panel"><h2>Visão geral</h2><p className="muted">Este perfil ainda não tem obras e módulos autorizados. Consulte seus acessos ou solicite a liberação ao Administrativo.</p></section>)}
      {currentScreen === "works" && <Works works={isAdmin ? context.works : availableWorks} canManage={isAdmin} />}
      {currentScreen === "settings" && isAdmin && <AdministrativePanel accessContent={administrationContent} worksContent={administrationWorksContent} />}
      {currentScreen === "criteria" && currentCatalogId && <Catalog model={currentModelName} setModel={(name) => { const id = modelIds.find((entry) => modelDisplayName(entry) === name); if (id) { setCatalogId(id); setCatalogQuery(""); } }} query={catalogQuery} setQuery={setCatalogQuery} criteria={criteria} showItemList={!isAdmin} allowedModels={modelIds.map(modelDisplayName)} showWeights={canReadTechnicalWeights(user, modelModule(currentCatalogId))} showReferenceDocuments={isAdmin} catalogs={catalogs} actorId={isAdmin ? user.id : undefined} onCatalogsSaved={isAdmin ? setCatalogs : undefined} />}
      {currentScreen === "audits" && <AuditList user={user} works={availableWorks} audits={contextualAudits} onOpen={openAudit} onNew={canStart ? () => navigate("new") : undefined} />}
      {isAdminAgenda && auditModule && <VisitAgenda key={user.id} user={user} works={context.works} users={agenda.auditors} visits={visits} module={auditModule} workId={work?.id ?? ""} available={agenda.available} mutationPending={mutationPending || startingAudit} syncError={agendaSyncError} {...agendaActions} onStartAudit={(visit) => startAudit(visit.modelId, visit.date, visit)} />}
      {work && auditModule && <>
        {currentScreen === "agenda" && !isAdmin && canAgenda && <VisitAgenda key={`${user.id}:${work.id}:${auditModule}`} user={user} works={availableWorks} users={agenda.auditors} visits={visits} module={auditModule} workId={work.id} available={agenda.available} mutationPending={mutationPending || startingAudit} syncError={agendaSyncError} {...agendaActions} onStartAudit={(visit) => startAudit(visit.modelId, visit.date, visit)} />}
        {currentScreen === "new" && canStart && <StartAudit key={`${user.id}:${work.id}:${auditModule}`} user={user} work={work} module={auditModule} onStart={startAudit} pending={startingAudit} />}
        {currentScreen === "fill" && activeAudit && activeAudit.status !== "Publicada" && <NewAudit key={activeAudit.id} model={activeAudit.catalogVersion ? `${modelDisplayName(activeAudit.modelId).replace(" rev. 02", "")} · ${activeAudit.catalogRevisionLabel}` : modelDisplayName(activeAudit.modelId)} setModel={() => {}} responseKey={activeAudit.modelId} lockedContext workName={`${work.name} · ${work.city}`} readOnly={!canEditAudit(user, activeAudit)} showWeights={canReadTechnicalWeights(user, auditModule)} criteria={criteriaForAudit(session, activeAudit)} activeIndex={positions[activeAudit.id] ?? 0} setActiveIndex={(index) => setPositions((previous) => ({ ...previous, [activeAudit.id]: index }))} drafts={session.responses[activeAudit.id] ?? {}} updateDraft={(response) => { try { const item = criteriaForAudit(session, activeAudit)[positions[activeAudit.id] ?? 0]; setSession(updatePrototypeResponse(session, user, activeAudit.id, item, response)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Edição indisponível."); } }} jumpOpen={jumpOpen} setJumpOpen={setJumpOpen} details={{ date: activeAudit.date, auditor: activeAudit.auditor }} setDetails={(details) => { try { setSession(updatePrototypeAuditDate(session, user, activeAudit.id, details.date)); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Data inválida."); } }} />}
        {currentScreen === "fill" && !activeAudit && <p className="muted">Selecione um rascunho autorizado no histórico.</p>}
        {currentScreen === "report" && <>{preview && canEditAudit(user, preview) ? <AuditPreview audit={preview} work={work} /> : <section className="panel"><h2>Relatórios publicados</h2><p className="muted">Nenhum documento publicado disponível neste contexto. A publicação oficial está em preparação.</p></section>}</>}
        {currentScreen === "occurrences" && <Occurrences works={[work]} records={[]} />}
        {(currentScreen === "discussion" || currentScreen === "publication" || currentScreen === "plans" || currentScreen === "committee") && <DeferredScreen kind={currentScreen} />}
      </>}
      {!work && !isAdmin && currentScreen === "agenda" && <section className="panel"><h2>Nenhuma obra disponível na agenda</h2><p className="muted">Cadastre uma obra para consultar este contexto.</p></section>}
      <footer className="page-footer"><span>Diálogo Engenharia · Auditorias</span><span>{profileLabel}</span></footer>
    </div></main>
  </div>;
}

function newRequestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hexadecimal = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`;
}

function isAgendaSnapshot(value: unknown): value is AgendaSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AgendaSnapshot>;
  return typeof candidate.available === "boolean" && Array.isArray(candidate.visits)
    && Array.isArray(candidate.auditors) && Array.isArray(candidate.notifications);
}

function useAgenda(initialAgenda: AgendaSnapshot, userId: string, profile: ProfileWorkspaceContext["profile"], engineeringScope: ProfileWorkspaceContext["engineeringScope"]) {
  const [agenda, setAgenda] = useState(initialAgenda);
  const [agendaSyncError, setAgendaSyncError] = useState("");
  const [mutationPending, setMutationPending] = useState(false);
  const mutationRef = useRef(false);
  const epochRef = useRef(0);
  const mountedRef = useRef(true);
  const attemptsRef = useRef(new Map<string, { payload: string; requestId: string }>());

  useEffect(() => {
    mountedRef.current = true;
    let controller: AbortController | null = null;
    const query = new URLSearchParams({ usuario: userId, perfil: profile, atuacao: engineeringScope ?? "" });
    const refreshAgenda = async () => {
      if (document.visibilityState !== "visible" || controller || mutationRef.current) return;
      const request = new AbortController();
      controller = request;
      const epoch = epochRef.current;
      try {
        const response = await fetch(`/api/agenda?${query}`, { credentials: "same-origin", cache: "no-store", signal: request.signal });
        if (!mountedRef.current || request.signal.aborted || epoch !== epochRef.current) return;
        if (response.status === 401 || response.status === 403) {
          epochRef.current += 1;
          setAgenda(unavailableAgenda());
          setAgendaSyncError("A sessão não autoriza mais esta agenda. Entre novamente ou selecione um perfil autorizado.");
          return;
        }
        if (!response.ok && response.status !== 503) throw new Error("Agenda indisponível");
        const snapshot: unknown = await response.json();
        if (!isAgendaSnapshot(snapshot) || (response.status === 503 && snapshot.available)) throw new Error("Resposta de agenda inválida");
        if (mountedRef.current && !request.signal.aborted && epoch === epochRef.current) {
          setAgenda(snapshot);
          setAgendaSyncError("");
        }
      } catch {
        if (mountedRef.current && !request.signal.aborted && epoch === epochRef.current) {
          setAgendaSyncError("Não foi possível atualizar a agenda. Tentaremos novamente automaticamente.");
        }
      } finally {
        if (controller === request) controller = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshAgenda();
      else { controller?.abort(); controller = null; }
    };
    const onFocus = () => { void refreshAgenda(); };
    const interval = window.setInterval(() => { void refreshAgenda(); }, 30_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    void refreshAgenda();
    return () => {
      mountedRef.current = false;
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [userId, profile, engineeringScope]);

  const runAgendaAction = async (operation: string, payload: object, action: (requestId: string) => Promise<AgendaActionResult>): Promise<AgendaActionResult> => {
    if (mutationRef.current) return { status: "error", message: "Aguarde a operação de agenda em andamento." };
    if (!agenda.available) return { status: "error", message: "A agenda está indisponível no momento. Tente novamente após a atualização." };
    const fingerprint = JSON.stringify(payload);
    let attempt = attemptsRef.current.get(operation);
    if (!attempt || attempt.payload !== fingerprint) {
      attempt = { payload: fingerprint, requestId: newRequestId() };
      attemptsRef.current.set(operation, attempt);
    }
    const requestId = attempt.requestId;
    mutationRef.current = true;
    setMutationPending(true);
    const epoch = ++epochRef.current;
    try {
      const result = await new Promise<AgendaActionResult>((resolve, reject) => {
        startTransition(async () => {
          try { resolve(await action(requestId)); } catch (cause) { reject(cause); }
        });
      });
      if (mountedRef.current && epoch === epochRef.current && result.snapshot) {
        setAgenda(result.snapshot);
        setAgendaSyncError("");
      }
      if (result.status === "success") attemptsRef.current.delete(operation);
      return result;
    } catch {
      return { status: "error", message: "Não foi possível confirmar o resultado da operação. Tente novamente com os mesmos dados para consultar ou concluir este envio." };
    } finally {
      mutationRef.current = false;
      if (mountedRef.current) setMutationPending(false);
    }
  };

  return { agenda, agendaSyncError, mutationPending, runAgendaAction };
}
