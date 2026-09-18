"use client";

import { startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type AuditModelId, type AuditRecord } from "@/domain/operational-records";
import { roleLabels, moduleLabels, modelModule, canAccessWorkModule, canAccessModule, canReadVisit, canBeginScheduledAudit, canConsultAgenda, canReadAudit, canEditAudit, canReadTechnicalWeights, canReadOperationalDocuments, type AppModule, type Visit, type VisitInput } from "@/domain/prototype-access";
import { beginScheduledVisitAudit, updatePrototypeResponse, criteriaForAudit, modelDisplayName, type PrototypeAuditState } from "@/domain/prototype-audits";
import { getSaoPauloToday } from "@/domain/visit-calendar";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import { unavailableAgenda, type AgendaActionResult, type AgendaSnapshot } from "@/lib/agenda/contracts";
import { createAgendaVisitAction, deleteAgendaVisitAction, confirmAgendaVisitAction } from "@/app/agenda/actions";
import { catalogVersion, unavailableCatalogs, type CatalogSnapshot } from "@/lib/catalogs/contracts";
import { Catalog, NewAudit } from "./audit-workspace";
import { Works, Occurrences } from "./operational-views";
import { Icon, type IconName } from "./ui-icon";
import { VisitAgenda } from "./visit-agenda";
import { PrototypeDashboard, AuditList, AuditorScheduledAudits, DeferredScreen, AdministrativePanel, AuditPreview } from "./prototype-workspace";
import { type AdminNotification } from "./auth/AdminNotifications";
import { AdministrativeHeader } from "./administrative-header";
import { FollowUpWorkspace } from "./follow-up-workspace";
import styles from "./prototype-app.module.css";

type PrototypeAppProps = {
  context: ProfileWorkspaceContext;
  initialScreen?: "overview" | "works" | "agenda" | "audits" | "follow_up" | "report" | "settings";
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
  const [reportSection, setReportSection] = useState<"reports" | "occurrences" | "plans">("reports");
  const [catalogs, setCatalogs] = useState(initialCatalogs);
  const [session, setSession] = useState<PrototypeAuditState>({ audits: [], responses: {} });
  const { agenda, agendaSyncError, mutationPending, runAgendaAction } = useAgenda(initialAgenda, user.id, context.profile, context.engineeringScope, context.administrativeScope);
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
  const isAuditor = user.role === "safety-auditor" || user.role === "quality-auditor";
  const isGeneralAdmin = isAdmin && context.administrativeScope === "GERAL";
  const catalogModules = isAdmin ? availableModules : auditModule ? [auditModule] : [];
  const modelIds = (["security-it07-r02", "quality-f175", "quality-f176"] as const).filter((id) => catalogModules.includes(modelModule(id)));
  const currentCatalogId = modelIds.includes(catalogId) ? catalogId : modelIds[0];
  const currentModelName = currentCatalogId ? modelDisplayName(currentCatalogId) : "Sem roteiro autorizado";
  const canAgenda = context.works.some((entry) => user.modules.some((discipline) => canConsultAgenda(user, entry.id, discipline)));
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
    ...(isAuditor ? [{ key: "follow_up", label: "Acompanhamento", icon: "check" as const }] : []),
    { key: "works", label: "Obras", icon: "works" },
    ...(currentCatalogId && !isAuditor ? [{ key: "criteria", label: isAdmin ? "Roteiros e versões" : "Roteiros", icon: "book" as const }] : []),
    ...(canDocuments ? [{ key: "report", label: "Relatórios", icon: "report" as const }] : []),
    ...(isGeneralAdmin ? [{ key: "settings", label: "Administração", icon: "settings" as const }] : []),
  ];
  const allowed = new Set([...nav.map((item) => item.key), ...(activeAudit && canReadAudit(user, activeAudit) ? ["fill"] : [])]);
  const currentScreen = allowed.has(screen) ? screen : "overview";
  const isAdminOverview = isAdmin && currentScreen === "overview";
  const isAdminAgenda = isAdmin && currentScreen === "agenda";
  const isAdminCatalog = isAdmin && currentScreen === "criteria";
  const isAdminSettings = isAdmin && currentScreen === "settings";
  const navigate = (next: string) => { if (allowed.has(next)) { if (next === "report") setReportSection("reports"); setScreen(next); setError(""); } };
  const navigateAgenda = (item: AdminNotification) => {
    const visitId = item.href ? new URL(item.href, window.location.origin).searchParams.get("visita") : null;
    const target = visits.find((visit) => visit.id === visitId && canReadVisit(user, visit))
      ?? visits.find((visit) => canReadVisit(user, visit) && context.works.some((entry) => entry.id === visit.workId && entry.name === item.workName));
    if (target) { setSelectedModule(target.module); setSelectedWorkId(target.workId); }
    if (target || allowed.has("agenda")) { setScreen("agenda"); setError(""); setJumpOpen(false); }
  };
  const changeContext = () => { setScreen("overview"); setReportSection("reports"); setActiveAuditId(null); setJumpOpen(false); setCatalogQuery(""); setError(""); };
  const openAudit = (audit: AuditRecord) => {
    if (!work || !canReadAudit(user, audit) || audit.workId !== work.id || modelModule(audit.modelId) !== auditModule) return;
    setActiveAuditId(audit.id); setJumpOpen(false); setReportSection("reports"); setScreen(audit.status === "Publicada" ? "report" : "fill");
  };
  const agendaActor = useMemo(() => ({ userId: user.id, profile: context.profile,
    engineeringScope: context.engineeringScope ?? null, administrativeScope: context.administrativeScope }),
  [user.id, context.profile, context.engineeringScope, context.administrativeScope]);
  const agendaActions = {
    onCreate: (input: VisitInput) => runAgendaAction("create", input, (requestId) => createAgendaVisitAction({ ...input, requestId }, agendaActor)),
    onDelete: (visitId: string, expectedRevision: number) => runAgendaAction(`delete:${visitId}`, { visitId, expectedRevision }, (requestId) => deleteAgendaVisitAction({ visitId, expectedRevision, requestId }, agendaActor)),
    onConfirm: (visitId: string, expectedRevision: number) => runAgendaAction(`confirm:${visitId}`, { visitId, expectedRevision }, (requestId) => confirmAgendaVisitAction({ visitId, expectedRevision, requestId }, agendaActor)),
  };
  const startScheduledAudit = async (visit: Visit) => {
    if (!isAuditor || !agenda.available || !canBeginScheduledAudit(user, visit, getSaoPauloToday()))
      throw new Error("Esta auditoria só pode ser iniciada pelo profissional responsável na data confirmada.");
    const response = await fetch("/api/agenda", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível conferir o agendamento. Tente novamente.");
    const fresh: unknown = await response.json();
    if (!isAgendaSnapshot(fresh) || !fresh.available) throw new Error("Não foi possível conferir o agendamento. Tente novamente.");
    const current = fresh.visits.find((entry) => entry.id === visit.id);
    if (!current || current.revision !== visit.revision || !canBeginScheduledAudit(user, current, getSaoPauloToday()))
      throw new Error("O agendamento mudou ou não está mais disponível para iniciar. Atualize a agenda.");
    const selectedWork = context.works.find((entry) => entry.id === current.workId);
    if (!selectedWork || !current.modelId) throw new Error("Esta obra ou roteiro não está autorizado neste perfil.");
    const version = catalogVersion(catalogs, current.modelId);
    const started = beginScheduledVisitAudit(session, user, {
      id: newRequestId(), work: selectedWork, visit: current, catalogRevision: version,
    }, getSaoPauloToday());
    setSession(started.state);
    setSelectedModule(current.module);
    setSelectedWorkId(current.workId);
    setActiveAuditId(started.auditId);
    setJumpOpen(false);
    setError("");
    setScreen("fill");
  };
  const auditNav = ["audits", "fill"].includes(currentScreen);
  const profileLabel = `${roleLabels[user.role]}${user.activity === "coordination" ? " · Coordenação" : user.activity === "site-team" ? " · Equipe da obra" : ""}`;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    <AdministrativeHeader name={user.name} userId={user.id} scope={isAdmin ? context.administrativeScope : undefined} profileLabel={isAdmin ? undefined : profileLabel} notifications={agenda.notifications} onNavigateAgenda={navigateAgenda} />
    <div className="navigation-bar"><nav className="main-navigation" aria-label="Navegação principal">{nav.map(({ key, label, icon }) => <button type="button" key={key} className={`nav-item${currentScreen === key || (key === "audits" && auditNav) ? " active" : ""}`} aria-current={currentScreen === key ? "page" : undefined} onClick={() => navigate(key)}><Icon name={icon} /><span>{label}</span></button>)}</nav></div>
    <main className="main-content" id="main-content" tabIndex={-1}><div className="content-wrap">
      {currentScreen !== "overview" && currentScreen !== "agenda" && currentScreen !== "works" && !(currentScreen === "audits" && isAuditor) && !(currentScreen === "follow_up" && isAuditor) && !isAdminCatalog && !isAdminSettings && <div className={styles.context} aria-label="Contexto autorizado"><label>{isAdmin ? "Disciplina da agenda" : "Módulo"}<select value={auditModule ?? ""} disabled={!availableModules.length} onChange={(event) => { const next = event.target.value as AppModule; if (canAccessModule(user, next)) { setSelectedModule(next); changeContext(); } }}>{!availableModules.length && <option value="">Nenhum módulo autorizado</option>}{availableModules.map((id) => <option value={id} key={id}>{moduleLabels[id]}</option>)}</select></label><label>Obra no contexto<select value={work?.id ?? ""} disabled={!availableWorks.length} onChange={(event) => { if (auditModule && canAccessWorkModule(user, event.target.value, auditModule)) { setSelectedWorkId(event.target.value); changeContext(); } }}>{!availableWorks.length && <option value="">Nenhuma obra autorizada</option>}{availableWorks.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label></div>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {auditNav && !isAuditor && <nav className="subnav" aria-label="Seções de auditorias"><button className={`subnav-item${currentScreen === "audits" ? " active" : ""}`} type="button" onClick={() => navigate("audits")}>Histórico e rascunhos</button>{activeAudit && <button className={`subnav-item${currentScreen === "fill" ? " active" : ""}`} type="button" onClick={() => navigate("fill")}>Preenchimento</button>}</nav>}
      {currentScreen === "report" && canDocuments && <nav className="subnav" aria-label="Seções de relatórios">
        {([ ["reports", "Relatórios"], ["occurrences", "Apontamentos"], ["plans", "Planos de ação"] ] as const).map(([key, label]) => <button key={key} type="button" className={`subnav-item${reportSection === key ? " active" : ""}`} aria-current={reportSection === key ? "page" : undefined} onClick={() => setReportSection(key)}>{label}</button>)}
      </nav>}
      {currentScreen === "overview" && (auditModule ? <PrototypeDashboard user={user} module={auditModule} works={isAdminOverview ? context.works : availableWorks} audits={isAdminOverview ? session.audits.filter((audit) => canReadAudit(user, audit)) : moduleAudits} visits={isAdminOverview || user.role === "safety-auditor" || user.role === "quality-auditor" ? visits.filter((visit) => canReadVisit(user, visit) && (isAdminOverview || visit.module === auditModule)) : contextualVisits} auditors={isAdminOverview ? agenda.auditors : []} activeAccountCount={activeAccountCount} generalAdministrator={isGeneralAdmin} open={navigate} /> : <section className="panel"><h2>Visão geral</h2><p className="muted">Este perfil ainda não tem obras e módulos autorizados. Consulte seus acessos ou solicite a liberação ao Administrativo.</p></section>)}
      {currentScreen === "works" && <Works works={context.works} canManage={isGeneralAdmin} />}
      {currentScreen === "follow_up" && isAuditor && <FollowUpWorkspace user={user} visits={visits} works={context.works} actor={agendaActor} agendaAvailable={agenda.available} />}
      {currentScreen === "settings" && isGeneralAdmin && <AdministrativePanel accessContent={administrationContent} worksContent={administrationWorksContent} />}
      {currentScreen === "criteria" && currentCatalogId && !isAuditor && <Catalog model={currentModelName} setModel={(name) => { const id = modelIds.find((entry) => modelDisplayName(entry) === name); if (id) { setCatalogId(id); setCatalogQuery(""); } }} query={catalogQuery} setQuery={setCatalogQuery} criteria={criteria} showItemList={!isAdmin} allowedModels={modelIds.map(modelDisplayName)} showWeights={canReadTechnicalWeights(user, modelModule(currentCatalogId))} showReferenceDocuments={isAdmin} catalogs={catalogs} actorId={isAdmin ? user.id : undefined} onCatalogsSaved={isAdmin ? setCatalogs : undefined} />}
      {currentScreen === "audits" && (isAuditor ? <AuditorScheduledAudits user={user} works={context.works} audits={moduleAudits} visits={visits} users={agenda.auditors} available={agenda.available} mutationPending={mutationPending} onDelete={agendaActions.onDelete} onConfirm={agendaActions.onConfirm} onStartAudit={startScheduledAudit} startedVisitIds={new Set(session.audits.map((audit) => audit.visitId).filter((id): id is string => !!id))}
        catalog={currentCatalogId ? <Catalog embedded model={currentModelName} setModel={(name) => { const id = modelIds.find((entry) => modelDisplayName(entry) === name); if (id) { setCatalogId(id); setCatalogQuery(""); } }} query={catalogQuery} setQuery={setCatalogQuery} criteria={criteria} showItemList={false} showReferenceDocuments allowedModels={modelIds.map(modelDisplayName)} showWeights={canReadTechnicalWeights(user, modelModule(currentCatalogId))} catalogs={catalogs} /> : <p className="muted">Nenhum roteiro autorizado para este perfil.</p>} /> : <AuditList user={user} works={availableWorks} audits={contextualAudits} onOpen={openAudit} />)}
      {isAdminAgenda && auditModule && <VisitAgenda key={user.id} user={user} works={context.works} users={agenda.auditors} visits={visits} module={auditModule} workId={work?.id ?? ""} available={agenda.available} mutationPending={mutationPending} syncError={agendaSyncError} {...agendaActions} />}
      {currentScreen === "agenda" && !isAdmin && canAgenda && <VisitAgenda key={user.id} user={user} works={context.works} users={agenda.auditors} visits={visits} module={auditModule ?? "safety"} workId={work?.id ?? ""} available={agenda.available} mutationPending={mutationPending} syncError={agendaSyncError} {...agendaActions} />}
      {work && auditModule && <>
        {currentScreen === "fill" && activeAudit && activeAudit.status !== "Publicada" && <NewAudit key={activeAudit.id} model={activeAudit.catalogVersion ? `${modelDisplayName(activeAudit.modelId).replace(" rev. 02", "")} · ${activeAudit.catalogRevisionLabel}` : modelDisplayName(activeAudit.modelId)} setModel={() => {}} responseKey={activeAudit.modelId} lockedContext workName={`${work.name} · ${work.city}`} readOnly={!canEditAudit(user, activeAudit)} showWeights={canReadTechnicalWeights(user, auditModule)} criteria={criteriaForAudit(session, activeAudit)} activeIndex={positions[activeAudit.id] ?? 0} setActiveIndex={(index) => setPositions((previous) => ({ ...previous, [activeAudit.id]: index }))} drafts={session.responses[activeAudit.id] ?? {}} updateDraft={(response) => { try { const item = criteriaForAudit(session, activeAudit)[positions[activeAudit.id] ?? 0]; setSession(updatePrototypeResponse(session, user, activeAudit.id, item, response)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Edição indisponível."); } }} jumpOpen={jumpOpen} setJumpOpen={setJumpOpen} details={{ date: activeAudit.date, auditor: activeAudit.auditor }} setDetails={() => {}} />}
        {currentScreen === "fill" && !activeAudit && <p className="muted">Selecione um rascunho autorizado no histórico.</p>}
        {currentScreen === "report" && reportSection === "reports" && <>{preview && canEditAudit(user, preview) ? <AuditPreview audit={preview} work={work} /> : <section className="panel"><h2>Relatórios publicados</h2><p className="muted">Nenhum documento publicado disponível neste contexto. A publicação oficial está em preparação.</p></section>}</>}
        {currentScreen === "report" && reportSection === "occurrences" && <Occurrences works={[work]} records={[]} />}
        {currentScreen === "report" && reportSection === "plans" && <DeferredScreen kind="plans" />}
        {(currentScreen === "discussion" || currentScreen === "publication") && <DeferredScreen kind={currentScreen} />}
      </>}
      {!canAgenda && !isAdmin && currentScreen === "agenda" && <section className="panel"><h2>Nenhuma obra disponível na agenda</h2><p className="muted">Consulte seus acessos para verificar as obras autorizadas.</p></section>}
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

function useAgenda(initialAgenda: AgendaSnapshot, userId: string, profile: ProfileWorkspaceContext["profile"], engineeringScope: ProfileWorkspaceContext["engineeringScope"], administrativeScope: ProfileWorkspaceContext["administrativeScope"]) {
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
    const query = new URLSearchParams({ usuario: userId, perfil: profile, atuacao: engineeringScope ?? "", administrativo: administrativeScope ?? "" });
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
  }, [userId, profile, engineeringScope, administrativeScope]);

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
