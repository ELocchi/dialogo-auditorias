"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { type AuditModelId, type AuditRecord } from "@/domain/operational-records";
import type { ItemResponse } from "@/domain/audit-draft";
import { calculateAuditFinalScore } from "@/domain/audit-draft";
import { roleLabels, moduleLabels, modelModule, canAccessWorkModule, canAccessModule, canReadVisit, canBeginScheduledAudit, canConsultAgenda, canReadAudit, canEditAudit, canReadTechnicalWeights, canReadOperationalDocuments, type AppModule, type Visit, type VisitInput } from "@/domain/prototype-access";
import { beginScheduledVisitAudit, completePrototypeAudit, validatePrototypeAuditCompletion, updatePrototypeResponse, criteriaForAudit, criteriaForModel, modelDisplayName, type PrototypeAuditState } from "@/domain/prototype-audits";
import { getSaoPauloToday } from "@/domain/visit-calendar";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import { unavailableAgenda, type AgendaActorContext, type AgendaSnapshot, type CreateAgendaVisitInput } from "@/lib/agenda/contracts";
import { createAgendaVisitAction, createAgendaVisitsBatchAction, deleteAgendaVisitAction, confirmAgendaVisitAction } from "@/app/agenda/actions";
import { catalogVersion, unavailableCatalogs, type CatalogSnapshot } from "@/lib/catalogs/contracts";
import { Icon, type IconName } from "./ui-icon";
import { PrototypeDashboard, AuditList, AuditorScheduledAudits, PublishedAuditsPanel, DeferredScreen, AdministrativePanel, AuditPreview, type ActionPlanSource } from "./prototype-workspace";
import { type AdminNotification } from "./auth/AdminNotifications";
import { AdministrativeHeader } from "./administrative-header";
import type { ActionPlanFinding, ActionPlanRow } from "./action-plan-editor";
import type { PublishedAuditFinding } from "./engineering-resource-panels";
import styles from "./prototype-app.module.css";
import { unavailablePublishedAudits, type PublishedAuditSnapshot } from "@/lib/audits/contracts";
import { assignedAgendaWorks, currentAuditAssignments } from "@/domain/assigned-audit-context";
import { AuditDetailsContext, AuditDetailGate, usePublishedAuditDetails } from "./audit-details-context";
import { DeferredCatalogs, useDeferredCatalogs } from "./deferred-catalogs";
import { AuditPhotoProvider } from "./audit-photo-context";
import { useAuditPublication, publicationQuery } from "./use-audit-publication";
import { auditPhotoThumbnailUrl } from "@/lib/photos/urls";
import { useAgenda, isAgendaSnapshot, newRequestId } from "./use-agenda";
import { AuditComparisonProvider, AuditComparisonHistory, usePreviousAudits } from "./audit-comparison-history";
import type { AuditComparison } from "@/lib/audits/comparison-contracts";
import type { AuditDashboardSnapshot } from "@/lib/audits/dashboard-contracts";
import { AuditHistoryProvider } from "./audit-history-context";
import { useAuditDashboard } from "./use-audit-dashboard";
import { workspaceResources } from "@/lib/access/workspace-resources";

const noLocalComparisons: readonly AuditComparison[] = [];

const loadingPanel = () => <section className="panel"><p className="muted">Carregando funcionalidade...</p></section>;
const AuditReview = dynamic(() => import("./audit-workspace").then((module) => module.AuditReview), { loading: loadingPanel });
const Catalog = dynamic(() => import("./audit-workspace").then((module) => module.Catalog), { loading: loadingPanel });
const NewAudit = dynamic(() => import("./audit-workspace").then((module) => module.NewAudit), { loading: loadingPanel });
const Works = dynamic(() => import("./operational-views").then((module) => module.Works), { loading: loadingPanel });
const Occurrences = dynamic(() => import("./operational-views").then((module) => module.Occurrences), { loading: loadingPanel });
const VisitAgenda = dynamic(() => import("./visit-agenda").then((module) => module.VisitAgenda), { loading: loadingPanel });
const FollowUpWorkspace = dynamic(() => import("./follow-up-workspace").then((module) => module.FollowUpWorkspace), { loading: loadingPanel });
const PersistentActionPlanEditor = dynamic(() => import("./persistent-action-plan-editor").then(module => module.PersistentActionPlanEditor), { loading: loadingPanel });
const ActionPlanEditor = dynamic(() => import("./action-plan-editor").then((module) => module.ActionPlanEditor), { loading: loadingPanel });
const EngineeringFollowUpPanel = dynamic(() => import("./engineering-follow-up-panel").then((module) => module.EngineeringFollowUpPanel), { loading: loadingPanel });
const EngineeringResourcePanels = dynamic(() => import("./engineering-resource-panels").then((module) => module.EngineeringResourcePanels), { loading: loadingPanel });
const EngineeringRoutesPanel = dynamic(() => import("./engineering-resource-panels").then((module) => module.EngineeringRoutesPanel), { loading: loadingPanel });
const DeferredAccessSummary = dynamic(() => import("./access/DeferredAccessSummary").then((module) => module.DeferredAccessSummary), { loading: loadingPanel });

type PrototypeAppProps = {
  context: ProfileWorkspaceContext;
  initialScreen?: "overview" | "works" | "agenda" | "audits" | "follow_up" | "report" | "settings" | "action_plan";
  initialVisitId?: string;
  initialActionPlanAuditId?: string;
  initialAgenda?: AgendaSnapshot;
  initialCatalogs?: CatalogSnapshot;
  initialAudits?: PublishedAuditSnapshot;
  initialDashboard?: AuditDashboardSnapshot;
  remoteAudits?: boolean;
  activeAccountCount?: number | null;
};

type LocalAuditFixture = {
  modelId: AuditModelId;
  responses: Record<string, ItemResponse>;
  criteria?: Array<{ code: string; title: string; text: string; group: string }>;
};

export function PrototypeApp({ context, initialScreen = "overview", initialVisitId, initialActionPlanAuditId, initialAgenda = unavailableAgenda(), initialCatalogs = unavailableCatalogs(), initialAudits = unavailablePublishedAudits(), initialDashboard, remoteAudits = Boolean(initialDashboard), activeAccountCount = null }: PrototypeAppProps) {
  return <ProfileWorkspace key={JSON.stringify([context.user, context.profile, context.works, initialScreen, initialVisitId, initialActionPlanAuditId])} context={context} initialScreen={initialScreen} initialVisitId={initialVisitId} initialActionPlanAuditId={initialActionPlanAuditId} initialAgenda={initialAgenda} initialCatalogs={initialCatalogs} initialAudits={initialAudits} initialDashboard={initialDashboard} remoteAudits={remoteAudits} activeAccountCount={activeAccountCount} />;
}

function ProfileWorkspace({ context: providedContext, initialScreen, initialVisitId, initialActionPlanAuditId, initialAgenda, initialCatalogs, initialAudits, initialDashboard, remoteAudits, activeAccountCount }: Required<Pick<PrototypeAppProps, "context" | "initialScreen" | "initialAgenda" | "initialCatalogs" | "initialAudits" | "activeAccountCount" | "remoteAudits">> & Pick<PrototypeAppProps, "initialVisitId" | "initialActionPlanAuditId" | "initialDashboard">) {
  const localScenario = process.env.NODE_ENV === "development";
  const localAuditFlow = localScenario
    && (providedContext.user.role === "safety-auditor" || providedContext.user.role === "quality-auditor");
  const localTestWork = { id: "00000000-0000-4000-8000-000000000901", name: "Obra Teste — Fluxo da Auditoria", city: "São Paulo, SP", engineer: "Responsável de teste", coordinator: "Coordenação de teste", status: "Ativa" as const, isDemo: true };
  const localReportWork = providedContext.works.find((work) => /boulevar/i.test(work.name))
    ?? { id: "00000000-0000-4000-8000-000000000902", name: "BoulevarDiálogo", city: "São Paulo, SP", engineer: "Equipe da obra", coordinator: "Coordenação da obra", status: "Ativa" as const, isDemo: true };
  const auditContext = localAuditFlow ? {
    ...providedContext,
    user: {
      ...providedContext.user,
      modules: [...new Set([...providedContext.user.modules, "safety" as const, "quality" as const])],
      workIds: [...providedContext.user.workIds, localTestWork.id],
      agendaWorkIds: [...providedContext.user.agendaWorkIds, localTestWork.id],
      workModuleScopes: [...(providedContext.user.workModuleScopes ?? []),
        { workId: localTestWork.id, module: "safety" as const },
        { workId: localTestWork.id, module: "quality" as const }],
    },
    works: [...providedContext.works, localTestWork],
  } : providedContext;
  const includeLocalQualityPreview = localScenario && (auditContext.user.role !== "administrative" || auditContext.user.modules.includes("quality"));
  const context = includeLocalQualityPreview ? {
    ...auditContext,
    user: {
      ...auditContext.user,
      modules: [...new Set([...auditContext.user.modules, "quality" as const])],
      workIds: [...new Set([...auditContext.user.workIds, localReportWork.id])],
      agendaWorkIds: [...new Set([...auditContext.user.agendaWorkIds, localReportWork.id])],
      documentWorkIds: [...new Set([...auditContext.user.documentWorkIds, localReportWork.id])],
      workModuleScopes: [...new Map([...(auditContext.user.workModuleScopes ?? []), { workId: localReportWork.id, module: "quality" as const }]
        .map((scope) => [`${scope.workId}:${scope.module}`, scope])).values()],
    },
    works: auditContext.works.some((work) => work.id === localReportWork.id) ? auditContext.works : [...auditContext.works, localReportWork],
  } : auditContext;
  const baseUser = context.user;
  const [screen, setScreen] = useState<string>(initialScreen);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const agendaScreen = screen === "report" && ["safety-auditor", "quality-auditor"].includes(baseUser.role) ? "audits" : screen;
  const needsAgenda = workspaceResources(agendaScreen).agenda || notificationsOpen;
  const liveAgendaRefresh = agendaScreen === "agenda" || notificationsOpen;
  const { agenda: syncedAgenda, agendaSyncError, mutationPending, runAgendaAction, removePublishedVisit } = useAgenda(initialAgenda, baseUser.id, context.profile, context.engineeringScope, context.administrativeScope, needsAgenda, liveAgendaRefresh);
  const { user, visits, agenda, localTestVisitIds } = useMemo(() => {
    const localTestVisits: Visit[] = [
      { id: "local-audit-flow-security", workId: localTestWork.id, module: "safety", kind: "audit", modelId: "security-it07-r02", auditorId: baseUser.id, date: getSaoPauloToday(), note: "Teste local do relatório de Segurança.", createdBy: baseUser.id, createdAt: `${getSaoPauloToday()}T12:00:00.000-03:00`, revision: 1, confirmationStatus: "confirmed", confirmedAt: `${getSaoPauloToday()}T12:00:00.000-03:00`, auditorName: baseUser.name, createdByName: "Teste local", history: [] },
      { id: "local-audit-flow-f175", workId: localTestWork.id, module: "quality", kind: "audit", modelId: "quality-f175", auditorId: baseUser.id, date: getSaoPauloToday(), note: "Teste local do relatório de Qualidade F.175.", createdBy: baseUser.id, createdAt: `${getSaoPauloToday()}T12:01:00.000-03:00`, revision: 1, confirmationStatus: "confirmed", confirmedAt: `${getSaoPauloToday()}T12:01:00.000-03:00`, auditorName: baseUser.name, createdByName: "Teste local", history: [] },
      { id: "local-audit-flow-f176", workId: localTestWork.id, module: "quality", kind: "audit", modelId: "quality-f176", auditorId: baseUser.id, date: getSaoPauloToday(), note: "Teste local do relatório de Qualidade F.176.", createdBy: baseUser.id, createdAt: `${getSaoPauloToday()}T12:02:00.000-03:00`, revision: 1, confirmationStatus: "confirmed", confirmedAt: `${getSaoPauloToday()}T12:02:00.000-03:00`, auditorName: baseUser.name, createdByName: "Teste local", history: [] },
    ];
    const localTestVisitIds = new Set(localTestVisits.map((visit) => visit.id));
    const visits = localAuditFlow ? [...localTestVisits, ...syncedAgenda.visits.filter((visit) => !localTestVisitIds.has(visit.id))] : syncedAgenda.visits;
    const agenda = localAuditFlow ? { ...syncedAgenda, available: true, visits } : syncedAgenda;
    return { visits, agenda, localTestVisitIds, user: { ...baseUser, auditAssignments: currentAuditAssignments(baseUser, visits, agenda.available) } };
  }, [baseUser, syncedAgenda, localAuditFlow, localTestWork.id]);
  const agendaWorks = assignedAgendaWorks(user, context.works, visits);
  const requestedActionPlanAudit = initialActionPlanAuditId
    ? initialAudits.audits.find((audit) => audit.id === initialActionPlanAuditId && audit.status === "Publicada" && canReadAudit(user, audit))
    : undefined;
  const requestedActionPlanWork = requestedActionPlanAudit
    ? context.works.find((entry) => entry.id === requestedActionPlanAudit.workId) : undefined;
  const initialActionPlanSource: ActionPlanSource | null = user.role === "engineering" && user.activity === "site-team"
    && requestedActionPlanAudit && requestedActionPlanWork ? {
      auditId: requestedActionPlanAudit.id, workId: requestedActionPlanAudit.workId,
      workName: requestedActionPlanWork.name, date: requestedActionPlanAudit.date,
      module: modelModule(requestedActionPlanAudit.modelId), example: false,
    } : null;
  const initialVisit = initialScreen === "agenda" ? initialAgenda.visits.find((visit) => visit.id === initialVisitId && canReadVisit(user, visit)) : undefined;
  const [selectedModule, setSelectedModule] = useState<AppModule | null>(initialActionPlanSource?.module ?? initialVisit?.module ?? user.modules[0] ?? null);
  const [selectedWorkId, setSelectedWorkId] = useState(initialActionPlanSource?.workId ?? initialVisit?.workId ?? (localAuditFlow ? localTestWork.id : ""));
  const [reportSection, setReportSection] = useState<"reports" | "occurrences" | "plans">("reports");
  const agendaActor = useMemo(() => ({ userId: user.id, profile: context.profile,
    engineeringScope: context.engineeringScope ?? null, administrativeScope: context.administrativeScope }),
  [user.id, context.profile, context.engineeringScope, context.administrativeScope]);
  const { state: catalogState, catalogs, loadCatalogs, setCatalogs } = useDeferredCatalogs(agendaActor, initialCatalogs);
  const [session, setSession] = useState<PrototypeAuditState>({ audits: initialAudits.audits, responses: initialAudits.responses, criteriaSnapshots: initialAudits.criteriaSnapshots });
  const publication = useAuditPublication(agendaActor, session, setSession);
  const auditDetails = usePublishedAuditDetails(providedContext, initialAudits, setSession, session, remoteAudits);
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);
  const [completedPreview, setCompletedPreview] = useState<{ audit: AuditRecord; work: ProfileWorkspaceContext["works"][number] } | null>(null);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const setActiveItem = useCallback((index: number) => {
    if (activeAuditId) setPositions((previous) => ({ ...previous, [activeAuditId]: index }));
  }, [activeAuditId]);
  const [catalogId, setCatalogId] = useState<AuditModelId>("security-it07-r02");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [error, setError] = useState("");
  const [actionPlanSource, setActionPlanSource] = useState<ActionPlanSource | null>(initialActionPlanSource);
  const [actionPlanDrafts, setActionPlanDrafts] = useState<Record<string, readonly ActionPlanRow[]>>({});
  const [publishedActionPlans, setPublishedActionPlans] = useState<Record<string, { bytes: Uint8Array; fileName: string }>>({});

  const availableModules = useMemo(() => user.modules.filter((module) => canAccessModule(user, module)), [user]);
  const auditModule = selectedModule && availableModules.includes(selectedModule) ? selectedModule : availableModules[0] ?? null;
  const availableWorks = useMemo(() => context.works.filter((work) => auditModule && canAccessWorkModule(user, work.id, auditModule)),
    [context.works, auditModule, user]);
  const work = availableWorks.find((entry) => entry.id === selectedWorkId) ?? availableWorks[0];
  const isAdmin = user.role === "administrative";
  const isAuditor = user.role === "safety-auditor" || user.role === "quality-auditor";
  const isEngineering = user.role === "engineering";
  const isGeneralAdmin = isAdmin && context.administrativeScope === "GERAL";
  const catalogModules = useMemo(() => isAdmin ? availableModules : auditModule ? [auditModule] : [], [isAdmin, availableModules, auditModule]);
  const modelIds = useMemo(() => (["security-it07-r02", "quality-f175", "quality-f176"] as const)
    .filter((id) => catalogModules.includes(modelModule(id))), [catalogModules]);
  const currentCatalogId = modelIds.includes(catalogId) ? catalogId : modelIds[0];
  const currentModelName = currentCatalogId ? modelDisplayName(currentCatalogId) : "Sem roteiro autorizado";
  const readableVisits = useMemo(() => visits.filter((visit) => canReadVisit(user, visit)), [visits, user]);
  const canAgenda = readableVisits.length > 0
    || context.works.some((entry) => user.modules.some((discipline) => canConsultAgenda(user, entry.id, discipline)));
  const canDocuments = !!auditModule && !!work && canReadOperationalDocuments(user, work.id, auditModule);
  const readableAudits = useMemo(() => session.audits.filter((audit) => canReadAudit(user, audit)), [session.audits, user]);
  const readablePublishedAudits = useMemo(() => readableAudits.filter((audit) => audit.status === "Publicada"), [readableAudits]);
  const canPublishedReports = (initialDashboard?.publishedCount ?? 0) > 0 || readablePublishedAudits.length > 0
    || remoteAudits && context.works.some((entry) => availableModules.some((module) => canAccessWorkModule(user, entry.id, module)));
  const publishedReportModules = availableModules.filter((module) => initialDashboard?.publishedModules.includes(module) || readablePublishedAudits.some((audit) => modelModule(audit.modelId) === module));
  const reportModules = remoteAudits && !initialDashboard ? availableModules : publishedReportModules.length ? publishedReportModules : auditModule ? [auditModule] : [];
  const visibleReportModules: readonly AppModule[] = isAdmin
    ? context.administrativeScope === "GERAL" ? ["quality", "safety"]
      : context.administrativeScope === "SEGURANCA" ? ["safety"]
        : context.administrativeScope === "QUALIDADE" ? ["quality"] : []
    : reportModules;
  const moduleAudits = useMemo(() => readableAudits.filter((audit) => modelModule(audit.modelId) === auditModule), [readableAudits, auditModule]);
  const contextualAudits = useMemo(() => moduleAudits.filter((audit) => audit.workId === work?.id), [moduleAudits, work?.id]);
  const contextualVisits = useMemo(() => readableVisits.filter((visit) => visit.workId === work?.id && visit.module === auditModule),
    [readableVisits, work?.id, auditModule]);
  const startedVisitIds = useMemo(() => new Set(session.audits.map((audit) => audit.visitId).filter((id): id is string => !!id)), [session.audits]);
  const completedReview = screen === "audit_review" && completedPreview?.audit.id === activeAuditId ? completedPreview : null;
  const activeAudit = moduleAudits.find((audit) => audit.id === activeAuditId) ?? completedReview?.audit;
  const activeAuditWork = activeAudit ? agendaWorks.find((entry) => entry.id === activeAudit.workId) ?? completedReview?.work : undefined;
  const activeAuditHistory = usePreviousAudits(session.audits, activeAudit, user);
  const firstHistoryResponses = session.responses[activeAuditHistory[0]?.id];
  const secondHistoryResponses = session.responses[activeAuditHistory[1]?.id];
  const thirdHistoryResponses = session.responses[activeAuditHistory[2]?.id];
  const localComparisonHistory = useMemo(() => {
    if (!activeAuditHistory.some((audit) => audit.isDemo)) return noLocalComparisons;
    const responses = [firstHistoryResponses, secondHistoryResponses, thirdHistoryResponses];
    return activeAuditHistory.flatMap((audit, index) => audit.isDemo ? [{
      id: audit.id, date: audit.date, workId: audit.workId, modelId: audit.modelId,
      answers: Object.fromEntries(Object.entries(responses[index]?.[audit.modelId] ?? {})
        .flatMap(([id, response]) => typeof response.answer === "string" ? [[id, response.answer]] : [])),
    }] : []);
  }, [activeAuditHistory, firstHistoryResponses, secondHistoryResponses, thirdHistoryResponses]);
  const preview = activeAudit ?? contextualAudits.find((audit) => canEditAudit(user, audit));
  const criteria = useMemo(() => catalogState.status === "ready" && !isAdmin && currentCatalogId
    ? catalogVersion(catalogs, currentCatalogId).criteria.filter((item) => `${item.code} ${item.text} ${item.group} ${item.subgroup}`
      .toLocaleLowerCase("pt-BR").includes(catalogQuery.toLocaleLowerCase("pt-BR"))) : [],
  [catalogState.status, isAdmin, currentCatalogId, catalogs, catalogQuery]);

  useEffect(() => {
    if (!localAuditFlow || !activeAudit?.isDemo) return;
    const currentResponses = session.responses[activeAudit.id]?.[activeAudit.modelId] ?? {};
    const activeCriteria = criteriaForAudit(session, activeAudit);
    if (activeAudit.modelId === "quality-f176") {
      const alreadyImported = currentResponses[activeCriteria[8]?.id]?.checks?.length === 11
        && currentResponses[activeCriteria[19]?.id]?.checks?.length === 7
        && currentResponses[activeCriteria[19]?.id]?.checks?.[0]?.weight === 4
        && currentResponses[activeCriteria[19]?.id]?.checks?.[5]?.label === "FVS-2A / FVS-2B / FVS -2C - Alvenaria de vedação Bloco Cerâmico ou de Concreto"
        && currentResponses[activeCriteria[22]?.id]?.note === "Aprovado";
      if (alreadyImported) return;
      let cancelled = false;
      void fetch("/local-test-evidence/boulevard/audit.json", { cache: "no-store" })
        .then(async (result) => {
          if (!result.ok) throw new Error("O arquivo local da auditoria BoulevarDiálogo não foi encontrado.");
          return result.json() as Promise<LocalAuditFixture>;
        })
        .then((fixture) => {
          if (cancelled || fixture.modelId !== activeAudit.modelId || Object.keys(fixture.responses).length !== 23) return;
          const orderedResponses = Array.from({ length: 23 }, (_, index) => fixture.responses[`F176-Q${String(index + 1).padStart(2, "0")}`]);
          const importedResponses = Object.fromEntries(activeCriteria.map((criterion, index) => [criterion.id, orderedResponses[index]]).filter((entry): entry is [string, ItemResponse] => Boolean(entry[1])));
          if (Object.keys(importedResponses).length !== activeCriteria.length) throw new Error("Os itens do relatório não correspondem ao roteiro da auditoria criada.");
          setSession((current) => ({
            ...current,
            responses: {
              ...current.responses,
              [activeAudit.id]: {
                ...(current.responses[activeAudit.id] ?? {}),
                [activeAudit.modelId]: importedResponses,
              },
            },
          }));
          setError("");
          setScreen("fill");
        })
        .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Não foi possível importar o relatório local."); });
      return () => { cancelled = true; };
    }
    if (activeAudit.workId !== localTestWork.id) return;
    if (Object.keys(session.responses[activeAudit.id]?.[activeAudit.modelId] ?? {}).length) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSession((current) => {
        let filled = current;
        criteriaForAudit(current, activeAudit).forEach((criterion, index) => {
          const security = activeAudit.modelId === "security-it07-r02";
          const answer = security
            ? index % 17 === 0 ? "0" : index % 11 === 0 ? "5" : index % 13 === 0 ? "N/A" : "10"
            : index % 7 === 0 ? "Não conforme" : criterion.verificationRule?.includes("Não Aplicável") && index % 11 === 0 ? "N/A" : "Conforme";
          const needsEvidence = answer === "0" || answer === "5" || answer === "Não conforme";
          const evidenceCount = needsEvidence ? 2 : !security && answer === "Conforme" && index % 4 === 0 ? 1 : 0;
          const quantitative = criterion.verificationRule === "Dividido pela quantidade verificada";
          const checks = quantitative ? Array.from({ length: 3 }, (_, checkIndex) => {
            const compliant = checkIndex !== 1;
            return {
              id: `${criterion.id}-teste-${checkIndex + 1}`,
              label: `Material verificado ${checkIndex + 1} — lote fictício ${String(index + 1).padStart(2, "0")}`,
              compliant,
              ...(compliant ? {} : { photos: [`Foto fictícia da verificação - ${activeAudit.modelId} - ${criterion.code} - lote 02.jpg`] }),
            };
          }) : undefined;
          filled = updatePrototypeResponse(filled, user, activeAudit.id, criterion, {
            answer,
            note: answer === "0" || answer === "Não conforme" ? "Não conformidade fictícia identificada durante a inspeção. Recomenda-se correção imediata e registro da tratativa."
              : answer === "5" ? "Atendimento parcial fictício. O item requer adequação e acompanhamento pela equipe responsável."
              : answer === "N/A" ? "" : "Item verificado em conformidade durante o teste do fluxo.",
            ...(evidenceCount ? { photos: Array.from({ length: evidenceCount }, (_, photoIndex) =>
              `Foto fictícia ${photoIndex + 1} - ${activeAudit.modelId} - ${criterion.code}.jpg`) } : {}),
            ...(checks ? { checks } : {}),
          });
        });
        return filled;
      });
      setError("");
      setScreen("audit_review");
    });
    return () => { cancelled = true; };
  }, [activeAudit, localAuditFlow, localTestWork.id, session, user]);

  useEffect(() => {
    if (!localScenario) return;
    const auditId = "local-boulevard-quality-f176-published";
    const realPublishedAudit = session.audits.find((audit) => audit.id !== auditId
      && audit.status === "Publicada" && audit.workId === localReportWork.id
      && audit.modelId === "quality-f176" && audit.date === "2026-09-23");
    if (realPublishedAudit) {
      const realResponses = session.responses[realPublishedAudit.id]?.[realPublishedAudit.modelId];
      const realCriteria = criteriaForAudit(session, realPublishedAudit);
      const seriousTestItems = [realCriteria[8]?.id, realCriteria[9]?.id, realCriteria[13]?.id].filter((criterionId): criterionId is string => Boolean(criterionId));
      const hasDetailedResponses = Boolean(realResponses && Object.keys(realResponses).length === realCriteria.length);
      const needsSeriousTestItems = hasDetailedResponses && seriousTestItems.some((criterionId) => realResponses?.[criterionId]?.serious !== true);
      if (hasDetailedResponses && (session.audits.some((audit) => audit.id === auditId) || needsSeriousTestItems)) queueMicrotask(() => setSession((current) => {
        const responses = { ...current.responses };
        const criteriaSnapshots = { ...current.criteriaSnapshots };
        if (current.audits.some((audit) => audit.id === auditId)) {
          delete responses[auditId];
          delete criteriaSnapshots[auditId];
        }
        const currentRealResponses = responses[realPublishedAudit.id]?.[realPublishedAudit.modelId];
        if (currentRealResponses) responses[realPublishedAudit.id] = {
          ...responses[realPublishedAudit.id],
          [realPublishedAudit.modelId]: Object.fromEntries(Object.entries(currentRealResponses).map(([criterionId, response]) => [criterionId,
            seriousTestItems.includes(criterionId) ? { ...response, serious: true } : response])),
        };
        return { ...current, audits: current.audits.filter((audit) => audit.id !== auditId), responses, criteriaSnapshots };
      }));
      if (hasDetailedResponses) return;
    }
    const currentPublishedCriteria = session.criteriaSnapshots?.[auditId];
    const currentPublishedResponses = session.responses[auditId]?.["quality-f176"];
    if (!localScenario || (session.audits.some((audit) => audit.id === auditId)
      && currentPublishedCriteria?.[3]?.code === "01.04"
      && currentPublishedCriteria?.[19]?.code === "06.01"
      && currentPublishedResponses?.["F176-Q09"]?.serious === true
      && currentPublishedResponses?.["F176-Q10"]?.serious === true
      && currentPublishedResponses?.["F176-Q14"]?.serious === true)) return;
    let cancelled = false;
    void fetch("/local-test-evidence/boulevard/audit.json", { cache: "no-store" })
      .then(async (result) => {
        if (!result.ok) throw new Error("O relatório final local da BoulevarDiálogo não foi encontrado.");
        return result.json() as Promise<LocalAuditFixture>;
      })
      .then((fixture) => {
        if (cancelled || fixture.modelId !== "quality-f176") return;
        const version = catalogVersion(catalogs, fixture.modelId);
        const baseCriteria = criteriaForModel(fixture.modelId);
        const publishedCriteria = baseCriteria.map((criterion, index) => fixture.criteria?.[index]
          ? { ...criterion, ...fixture.criteria[index] }
          : criterion);
        const orderedResponses = Array.from({ length: 23 }, (_, index) => fixture.responses[`F176-Q${String(index + 1).padStart(2, "0")}`]);
        const importedResponses = Object.fromEntries(publishedCriteria.map((criterion, index) => [criterion.id, orderedResponses[index]]).filter((entry): entry is [string, ItemResponse] => Boolean(entry[1])));
        if (publishedCriteria.length !== 23 || Object.keys(importedResponses).length !== publishedCriteria.length) throw new Error("O relatório final local não corresponde ao roteiro de Qualidade Completa.");
        const drafts = { [fixture.modelId]: importedResponses };
        const finalScore = calculateAuditFinalScore(publishedCriteria, drafts, fixture.modelId);
        if (finalScore === null) throw new Error("Não foi possível calcular a nota do relatório final local.");
        setSession((current) => ({
          ...current,
          audits: current.audits.some((audit) => audit.id === auditId) ? current.audits.map((audit) => audit.id === auditId ? {
            ...audit,
            finalScore,
            calculationStatus: "Disponível",
          } : audit) : [...current.audits, {
            id: auditId,
            workId: localReportWork.id,
            modelId: fixture.modelId,
            date: "2026-09-23",
            auditor: "Emanuel Locchi",
            auditorId: user.id,
            status: "Publicada",
            collectionStatus: "Coleta concluída",
            calculationStatus: "Disponível",
            finalScore,
            isDemo: true,
            catalogRevisionId: version.id,
            catalogVersion: version.version,
            catalogRevisionLabel: version.label,
          }],
          responses: { ...current.responses, [auditId]: drafts },
          criteriaSnapshots: { ...current.criteriaSnapshots, [auditId]: structuredClone(publishedCriteria) },
        }));
        setError("");
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Não foi possível preparar o fluxo publicado local."); });
    return () => { cancelled = true; };
  }, [catalogs, localReportWork.id, localScenario, session, user.id]);

  const coordination = isEngineering && user.activity === "coordination";
  const nav: { key: string; label: string; icon: IconName }[] = isEngineering ? [
    { key: "overview", label: "Visão geral", icon: "overview" },
    ...(user.activity === "site-team" ? [{ key: "agenda", label: "Agenda", icon: "calendar" as const }] : []),
    ...(coordination
      ? [{ key: "engineering_coordination", label: "Qualidade e Segurança", icon: "audits" as const }]
      : [{ key: "engineering_quality", label: "Qualidade", icon: "audits" as const },
        { key: "engineering_safety", label: "Segurança", icon: "helmet" as const }]),
    { key: "works", label: "Obras", icon: "works" },
  ] : [
    { key: "overview", label: isAdmin ? "Painel administrativo" : "Visão geral", icon: "overview" },
    ...(canAgenda || (isAdmin && auditModule) ? [{ key: "agenda", label: "Agenda", icon: "calendar" as const }] : []),
    ...(!isAdmin ? [{ key: "audits", label: "Auditorias", icon: "audits" as const }] : []),
    ...(isAuditor ? [{ key: "follow_up", label: "Acompanhamento", icon: "check" as const }] : []),
    { key: "works", label: "Obras", icon: "works" },
    ...(currentCatalogId && !isAuditor ? [{ key: "criteria", label: "Roteiro", icon: "book" as const }] : []),
    ...(!isAuditor && (canDocuments || canPublishedReports) ? [{ key: "report", label: "Relatórios", icon: "report" as const }] : []),
    ...(isGeneralAdmin ? [{ key: "settings", label: "Administração", icon: "settings" as const }] : []),
  ];
  const allowed = new Set([...nav.map((item) => item.key), ...(activeAudit && canReadAudit(user, activeAudit) ? ["fill", "audit_review"] : []), ...(completedReview ? ["audit_review"] : []), ...(isEngineering && user.activity === "site-team" && actionPlanSource ? ["action_plan"] : [])]);
  const currentScreen = allowed.has(screen) ? screen : isAuditor && screen === "report" ? "audits" : "overview";
  const isAdminOverview = isAdmin && currentScreen === "overview";
  const isAdminAgenda = isAdmin && currentScreen === "agenda";
  const isAdminCatalog = isAdmin && currentScreen === "criteria";
  const isAdminSettings = isAdmin && currentScreen === "settings";
  const navigate = (next: string) => { if (allowed.has(next)) { setCompletedPreview(null); if (next === "report") setReportSection("reports"); setScreen(next); setError(""); } };
  const navigateAgenda = (item: AdminNotification) => {
    const visitId = item.href ? new URL(item.href, window.location.origin).searchParams.get("visita") : null;
    const target = visits.find((visit) => visit.id === visitId && canReadVisit(user, visit))
      ?? visits.find((visit) => canReadVisit(user, visit) && agendaWorks.some((entry) => entry.id === visit.workId && entry.name === item.workName));
    if (target) { setSelectedModule(target.module); setSelectedWorkId(target.workId); }
    if (target || allowed.has("agenda")) { setScreen("agenda"); setError(""); }
  };
  const changeContext = () => { setScreen("overview"); setReportSection("reports"); setActiveAuditId(null); setCatalogQuery(""); setError(""); };
  const openAudit = (audit: AuditRecord) => {
    if (!work || !canReadAudit(user, audit) || audit.workId !== work.id || modelModule(audit.modelId) !== auditModule) return;
    setActiveAuditId(audit.id); setReportSection("reports"); setScreen(audit.status === "Publicada" ? "report" : "fill");
  };
  const agendaActions = {
    onCreate: (input: VisitInput) => runAgendaAction("create", input, (requestId) => createAgendaVisitAction({ ...input, requestId }, agendaActor)),
    onCreateBatch: (inputs: CreateAgendaVisitInput[]) => runAgendaAction("create-batch", inputs, () => createAgendaVisitsBatchAction(inputs, agendaActor)),
    onDelete: (visitId: string, expectedRevision: number) => runAgendaAction(`delete:${visitId}`, { visitId, expectedRevision }, (requestId) => deleteAgendaVisitAction({ visitId, expectedRevision, requestId }, agendaActor)),
    onConfirm: (visitId: string, expectedRevision: number) => runAgendaAction(`confirm:${visitId}`, { visitId, expectedRevision }, (requestId) => confirmAgendaVisitAction({ visitId, expectedRevision, requestId }, agendaActor)),
  };
  const startScheduledAudit = async (visit: Visit) => {
    const resuming = session.audits.some(a => a.visitId === visit.id && !a.isDemo && canEditAudit(user, a));
    if (!isAuditor || !agenda.available || (!resuming && !canBeginScheduledAudit(user, visit, getSaoPauloToday())))
      throw new Error("Esta auditoria só pode ser iniciada pelo profissional responsável na data confirmada.");
    let current = visit;
    if (!localTestVisitIds.has(visit.id)) {
      const response = await fetch("/api/agenda", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível conferir o agendamento. Tente novamente.");
      const fresh: unknown = await response.json();
      if (!isAgendaSnapshot(fresh) || !fresh.available) throw new Error("Não foi possível conferir o agendamento. Tente novamente.");
      const persisted = fresh.visits.find((entry) => entry.id === visit.id);
      if (!persisted || persisted.revision !== visit.revision || (!resuming && !canBeginScheduledAudit(user, persisted, getSaoPauloToday())))
        throw new Error("O agendamento mudou ou não está mais disponível para iniciar. Atualize a agenda.");
      current = persisted;
    }
    const selectedWork = assignedAgendaWorks(user, context.works, [current]).find((entry) => entry.id === current.workId);
    if (!selectedWork || !current.modelId) throw new Error("Esta obra ou roteiro não está autorizado neste perfil.");
    if (!localTestVisitIds.has(current.id)) {
      const existing = session.audits.find(a => a.visitId === current.id && !a.isDemo);
      if (existing) await publication.save(existing.id, session.responses[existing.id] ?? {});
      const auditId = await publication.start(current);
      setCompletedPreview(null); setSelectedModule(current.module); setSelectedWorkId(current.workId);
      setActiveAuditId(auditId); setError(""); setScreen("fill"); return;
    }
    // Existing drafts retain their pinned criteria, even if catalog lookup is unavailable.
    const existingDraft = session.audits.some((audit) => audit.visitId === current.id);
    const version = existingDraft ? undefined : catalogVersion(await loadCatalogs(true), current.modelId);
    const started = beginScheduledVisitAudit(session, user, {
      id: newRequestId(), work: selectedWork, visit: current, catalogRevision: version,
    }, getSaoPauloToday());
    setCompletedPreview(null);
    setSession(started.state);
    setSelectedModule(current.module);
    setSelectedWorkId(current.workId);
    setActiveAuditId(started.auditId);
    setError("");
    setScreen("fill");
  };
  const auditNav = ["audits", "fill", "audit_review"].includes(currentScreen);
  const profileLabel = `${roleLabels[user.role]}${user.activity === "coordination" ? " · Coordenação" : user.activity === "site-team" ? " · Equipe da obra" : ""}`;
  const actionPlanAudit = actionPlanSource?.auditId ? session.audits.find((audit) => audit.id === actionPlanSource.auditId) : undefined;
  const actionPlanFindings: readonly ActionPlanFinding[] = useMemo(() => actionPlanAudit
    ? extractAuditFindings(session, actionPlanAudit)
    : actionPlanSource?.example ? testActionPlanFindings[actionPlanSource.module] : [], [session, actionPlanAudit, actionPlanSource]);
  const summaryFindingsByAudit = useMemo(() => {
    const grouped = new Map<string, PublishedAuditFinding[]>();
    for (const finding of initialAudits.findings ?? []) {
      const entries = grouped.get(finding.auditId) ?? [];
      entries.push(finding);
      grouped.set(finding.auditId, entries);
    }
    return grouped;
  }, [initialAudits]);
  const showsPublishedFindings = ["overview", "engineering_quality", "engineering_safety", "audits"].includes(currentScreen);
  const publishedAuditFindings = useMemo(() => !showsPublishedFindings ? [] : session.audits.filter((audit) => audit.status === "Publicada").flatMap((audit): PublishedAuditFinding[] =>
    !session.responses[audit.id]?.[audit.modelId] ? summaryFindingsByAudit.get(audit.id) ?? []
    : extractAuditFindings(session, audit).map((finding) => ({
      ...finding,
      auditId: audit.id,
      workId: audit.workId,
      auditDate: audit.date,
      auditor: audit.auditor,
      module: modelModule(audit.modelId),
      modelId: audit.modelId,
    }))), [session, summaryFindingsByAudit, showsPublishedFindings]);
  const localRecurrenceWork = context.works.find((entry) => entry.id !== localReportWork.id) ?? localTestWork;
  const localRecurringPreviewFindings: PublishedAuditFinding[] = localScenario ? publishedAuditFindings
    .filter((finding) => finding.modelId === "quality-f176" && ["02.04", "03.01", "04.03"].includes(finding.item))
    .flatMap((finding) => [{
      ...finding,
      auditId: `local-recurrence-1:${finding.id}`,
      workId: localRecurrenceWork.id,
      auditDate: "2026-08-23",
      auditor: "Auditoria de referência",
      serious: false,
    }, ...(finding.item === "03.01" ? [{
      ...finding,
      auditId: `local-recurrence-2:${finding.id}`,
      workId: localRecurrenceWork.id,
      auditDate: "2026-07-23",
      auditor: "Auditoria de referência",
      serious: false,
    }] : [])]) : [];
  const dashboardAuditFindings = [...publishedAuditFindings, ...localRecurringPreviewFindings];
  const { summary: dashboardSummary, retry: retryDashboard, loading: dashboardLoading } = useAuditDashboard(initialDashboard, agendaActor, session.audits, publishedAuditFindings, workspaceResources(currentScreen).dashboard, remoteAudits);
  const actionPlanDraftKey = actionPlanSource ? `${actionPlanSource.auditId ?? "example"}:${actionPlanSource.module}:${actionPlanSource.workId}` : "";
  const downloadActionPlan = (source: ActionPlanSource) => {
    if (source.auditId && publication.plans.some(plan => plan.auditId === source.auditId)) {
      window.open(`/api/publications/${source.auditId}/plan-report?${publicationQuery(agendaActor)}`, "_blank", "noopener,noreferrer"); return;
    }
    const localPublication = publishedActionPlans[actionPlanSourceKey(source)];
    if (!localPublication) return;
    const url = URL.createObjectURL(new Blob([Uint8Array.from(localPublication.bytes).buffer], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = localPublication.fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const deferCatalogs = (children: ReactNode) => <DeferredCatalogs state={catalogState} load={loadCatalogs}>{children}</DeferredCatalogs>;
  return <AuditHistoryProvider actor={agendaActor} enabled={remoteAudits}><AuditPhotoProvider responses={session.responses} store={publication.photoStore}><AuditComparisonProvider actor={agendaActor}><AuditDetailsContext value={auditDetails}><div className="app-shell">
    <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    <AdministrativeHeader name={user.name} email={context.email} userId={user.id} scope={isAdmin ? context.administrativeScope : undefined} profileLabel={isAdmin ? undefined : profileLabel} notifications={agenda.notifications} notificationsLoading={notificationsOpen && !agenda.available && !agendaSyncError} notificationsError={notificationsOpen ? agendaSyncError : undefined} onNotificationsOpenChange={setNotificationsOpen} onNavigateAgenda={navigateAgenda} />
    <div className="navigation-bar"><nav className="main-navigation" aria-label="Navegação principal">{nav.map(({ key, label, icon }) => <button type="button" key={key} className={`nav-item${currentScreen === key || (key === "audits" && auditNav) || (currentScreen === "action_plan" && key === `engineering_${actionPlanSource?.module}`) ? " active" : ""}`} aria-current={currentScreen === key ? "page" : undefined} onClick={() => navigate(key)}><Icon name={icon} /><span>{label}</span></button>)}</nav></div>
    <main className="main-content" id="main-content" tabIndex={-1}><div className="content-wrap">
      {currentScreen !== "overview" && currentScreen !== "agenda" && currentScreen !== "works" && currentScreen !== "fill" && currentScreen !== "audit_review" && currentScreen !== "action_plan" && !(currentScreen === "report" && reportSection === "reports") && !currentScreen.startsWith("engineering_") && !(currentScreen === "audits" && isAuditor) && !(currentScreen === "follow_up" && isAuditor) && !isAdminCatalog && !isAdminSettings && <div className={styles.context} aria-label="Contexto autorizado"><label>{isAdmin ? "Disciplina da agenda" : "Módulo"}<select className="filter-select" value={auditModule ?? ""} disabled={!availableModules.length} onChange={(event) => { const next = event.target.value as AppModule; if (canAccessModule(user, next)) { setSelectedModule(next); changeContext(); } }}>{!availableModules.length && <option value="">Nenhum módulo autorizado</option>}{availableModules.map((id) => <option value={id} key={id}>{moduleLabels[id]}</option>)}</select></label><label>Obra no contexto<select className="filter-select" value={work?.id ?? ""} disabled={!availableWorks.length} onChange={(event) => { if (auditModule && canAccessWorkModule(user, event.target.value, auditModule)) { setSelectedWorkId(event.target.value); changeContext(); } }}>{!availableWorks.length && <option value="">Nenhuma obra autorizada</option>}{availableWorks.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label></div>}
      {workspaceResources(currentScreen).dashboard && dashboardLoading && <p className="muted" role="status">Atualizando resumos…</p>}
      {workspaceResources(currentScreen).dashboard && !dashboardLoading && dashboardSummary?.available === false && <p role="alert" className={styles.error}>Não foi possível atualizar os resumos. <button type="button" className="secondary" onClick={retryDashboard}>Recarregar resumos</button></p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!localScenario && !initialAudits.available && <p role="alert" className={styles.error}>Não foi possível carregar as auditorias publicadas e suas notas. Atualize a página para tentar novamente.</p>}
      {auditNav && !isAuditor && <nav className="subnav" aria-label="Seções de auditorias"><button className={`subnav-item${currentScreen === "audits" ? " active" : ""}`} type="button" onClick={() => navigate("audits")}>Histórico e rascunhos</button>{activeAudit && <button className={`subnav-item${currentScreen === "fill" ? " active" : ""}`} type="button" onClick={() => navigate("fill")}>Preenchimento</button>}</nav>}
      {currentScreen === "report" && canDocuments && <nav className="subnav" aria-label="Seções de relatórios">
        {([ ["reports", "Relatórios"], ["occurrences", "Apontamentos"], ["plans", "Planos de ação"] ] as const).map(([key, label]) => <button key={key} type="button" className={`subnav-item${reportSection === key ? " active" : ""}`} aria-current={reportSection === key ? "page" : undefined} onClick={() => setReportSection(key)}>{label}</button>)}
      </nav>}
      {currentScreen === "report" && reportSection === "reports" && (canDocuments || canPublishedReports) && <>
        <div className="page-intro"><h2>Relatórios publicados</h2></div>
        <div className={`${styles.reportModulesGrid}${visibleReportModules.length === 1 ? ` ${styles.singleReportModule}` : ""}`}>
          {visibleReportModules.map((module) => <div className={styles.reportModule} key={module}>
            <PublishedAuditsPanel user={user} works={context.works.filter((entry) => canAccessWorkModule(user, entry.id, module))}
              audits={readablePublishedAudits} module={module} />
          </div>)}
        </div>
        {preview && work && canEditAudit(user, preview) && <AuditPreview audit={preview} work={work} />}
      </>}
      {currentScreen === "overview" && (auditModule ? <PrototypeDashboard summary={dashboardSummary} user={user} module={auditModule} works={isAdminOverview || isEngineering ? context.works : availableWorks} audits={isAdminOverview || isEngineering ? readableAudits : moduleAudits} auditFindings={isEngineering ? publishedAuditFindings : dashboardAuditFindings} publishedActionPlanKeys={isEngineering ? [...Object.keys(publishedActionPlans), ...publication.plans.map(p => `${p.auditId}:${p.module}:${p.workId}`)] : []} visits={isAdminOverview || isEngineering ? readableVisits : isAuditor ? readableVisits.filter((visit) => visit.module === auditModule) : contextualVisits} auditors={isAdminOverview || isEngineering ? agenda.auditors : []} activeAccountCount={activeAccountCount} generalAdministrator={isGeneralAdmin} previewRanking={localScenario} agendaWorks={agendaWorks} open={navigate} /> : <section className="panel"><h2>Visão geral</h2><p className="muted">Este perfil ainda não tem obras e módulos autorizados. Consulte seus acessos ou solicite a liberação ao Administrativo.</p></section>)}
      {currentScreen === "engineering_quality" && isEngineering && <EngineeringSection findingCount={dashboardSummary?.available ? dashboardSummary.findingCounts.quality : undefined} title="Qualidade" module="quality" user={user} works={context.works} audits={session.audits} auditFindings={publishedAuditFindings} visits={visits} actor={agendaActor} catalogs={catalogs} deferCatalogs={deferCatalogs} onCreateActionPlan={user.activity === "site-team" ? (source) => { setActionPlanSource(source); setScreen("action_plan"); } : undefined} hasPublishedActionPlan={(source) => Boolean(publishedActionPlans[actionPlanSourceKey(source)]) || publication.plans.some(plan => plan.auditId === source.auditId)} onDownloadActionPlan={downloadActionPlan} />}
      {currentScreen === "engineering_safety" && isEngineering && <EngineeringSection findingCount={dashboardSummary?.available ? dashboardSummary.findingCounts.safety : undefined} title="Segurança" module="safety" user={user} works={context.works} audits={session.audits} auditFindings={publishedAuditFindings} visits={visits} actor={agendaActor} catalogs={catalogs} deferCatalogs={deferCatalogs} onCreateActionPlan={user.activity === "site-team" ? (source) => { setActionPlanSource(source); setScreen("action_plan"); } : undefined} hasPublishedActionPlan={(source) => Boolean(publishedActionPlans[actionPlanSourceKey(source)]) || publication.plans.some(plan => plan.auditId === source.auditId)} onDownloadActionPlan={downloadActionPlan} />}
      {currentScreen === "engineering_coordination" && coordination && <EngineeringCoordinationSection user={user} works={context.works} audits={session.audits} catalogs={catalogs} deferCatalogs={deferCatalogs} hasPublishedActionPlan={(source) => Boolean(publishedActionPlans[actionPlanSourceKey(source)]) || publication.plans.some(plan => plan.auditId === source.auditId)} onDownloadActionPlan={downloadActionPlan} />}
      {currentScreen === "action_plan" && actionPlanSource && user.activity === "site-team" && (!actionPlanSource.example && !actionPlanAudit?.isDemo && actionPlanSource.auditId ? <PersistentActionPlanEditor key={actionPlanSource.auditId} auditId={actionPlanSource.auditId} actor={agendaActor} workName={actionPlanSource.workName} auditDate={actionPlanSource.date} auditScore={actionPlanAudit?.finalScore ?? null} module={actionPlanSource.module} authorName={user.name} onPublished={() => publication.planPublished(actionPlanSource.auditId!, actionPlanSource.workId, actionPlanSource.module)} onBack={() => setScreen(`engineering_${actionPlanSource.module}`)} /> : <AuditDetailGate auditId={actionPlanSource.example || actionPlanAudit?.isDemo ? "" : actionPlanSource.auditId ?? ""}><ActionPlanEditor key={`${actionPlanDraftKey}:prefill-v5`} workName={actionPlanSource.workName} auditDate={actionPlanSource.date} auditScore={actionPlanAudit?.finalScore ?? null} module={actionPlanSource.module} authorName={user.name} findings={actionPlanFindings} draft={actionPlanDrafts[actionPlanDraftKey]} example={actionPlanSource.example} prefillTest={localScenario && actionPlanSource.module === "quality" && /boulevar/i.test(actionPlanSource.workName)} onSave={(rows) => setActionPlanDrafts((current) => ({ ...current, [actionPlanDraftKey]: rows }))} onPublish={(publication) => setPublishedActionPlans((current) => ({ ...current, [actionPlanDraftKey]: publication }))} onBack={() => setScreen(`engineering_${actionPlanSource.module}`)} /></AuditDetailGate>)}
      {currentScreen === "works" && <Works works={context.works} canManage={isGeneralAdmin} />}
      {currentScreen === "follow_up" && isAuditor && <FollowUpWorkspace user={user} visits={visits} works={context.works} actor={agendaActor} agendaAvailable={agenda.available} />}
      {currentScreen === "settings" && isGeneralAdmin && <AdministrativePanel accessContent={<DeferredAccessSummary actor={agendaActor} />} />}
      {currentScreen === "criteria" && currentCatalogId && !isAuditor && deferCatalogs(<Catalog model={currentModelName} setModel={(name) => { const id = modelIds.find((entry) => modelDisplayName(entry) === name); if (id) { setCatalogId(id); setCatalogQuery(""); } }} query={catalogQuery} setQuery={setCatalogQuery} criteria={criteria} showItemList={!isAdmin} allowedModels={modelIds.map(modelDisplayName)} showWeights={canReadTechnicalWeights(user, modelModule(currentCatalogId))} showReferenceDocuments={isAdmin} catalogs={catalogs} actorId={isAdmin ? user.id : undefined} onCatalogsSaved={isAdmin ? setCatalogs : undefined} />)}
      {currentScreen === "audits" && (isAuditor ? <AuditorScheduledAudits user={user} works={agendaWorks} audits={moduleAudits} auditFindings={publishedAuditFindings.filter((finding) => finding.module === auditModule)} visits={visits} users={agenda.auditors} available={agenda.available} mutationPending={mutationPending} onDelete={agendaActions.onDelete} onConfirm={agendaActions.onConfirm} onStartAudit={startScheduledAudit} startedVisitIds={startedVisitIds}
        catalog={currentCatalogId ? deferCatalogs(<Catalog embedded model={currentModelName} setModel={(name) => { const id = modelIds.find((entry) => modelDisplayName(entry) === name); if (id) { setCatalogId(id); setCatalogQuery(""); } }} query={catalogQuery} setQuery={setCatalogQuery} criteria={criteria} showItemList={false} showReferenceDocuments allowedModels={modelIds.map(modelDisplayName)} showWeights={canReadTechnicalWeights(user, modelModule(currentCatalogId))} catalogs={catalogs} />) : <p className="muted">Nenhum roteiro autorizado para este perfil.</p>} /> : <AuditList module={auditModule ?? undefined} workId={work?.id} contextKey={`${auditModule}:${work?.id ?? ""}`} user={user} works={availableWorks} audits={contextualAudits} onOpen={openAudit} />)}
      {isAdminAgenda && auditModule && <VisitAgenda key={user.id} user={user} works={context.works} users={agenda.auditors} visits={visits} module={auditModule} workId={work?.id ?? ""} available={agenda.available} mutationPending={mutationPending} syncError={agendaSyncError} {...agendaActions} />}
      {currentScreen === "agenda" && !isAdmin && canAgenda && <VisitAgenda key={user.id} user={user} works={agendaWorks} users={agenda.auditors} visits={visits} module={auditModule ?? "safety"} workId={work?.id ?? ""} available={agenda.available} mutationPending={mutationPending} syncError={agendaSyncError} {...agendaActions} />}
      {publication.error && <p role="alert" className="error">{publication.error}</p>}
      {auditModule && <>
        {currentScreen === "fill" && activeAuditWork && activeAudit && activeAudit.status !== "Publicada" && <AuditComparisonHistory activeAudit={remoteAudits ? activeAudit : undefined} audits={activeAuditHistory} localAudits={localComparisonHistory}>{(previousAudits) => <NewAudit key={activeAudit.id} model={modelDisplayName(activeAudit.modelId).replace(" rev. 02", "")} responseKey={activeAudit.modelId} workName={publication.draftVersions[activeAudit.id]?.workName ?? activeAuditWork.name} readOnly={!canEditAudit(user, activeAudit)} showWeights={canReadTechnicalWeights(user, auditModule)} previousAudits={previousAudits} fvsServices={publication.draftVersions[activeAudit.id]?.fvsServices ?? catalogs.fvsWeights?.services} criteria={criteriaForAudit(session, activeAudit)} activeIndex={positions[activeAudit.id] ?? 0} setActiveIndex={setActiveItem} drafts={session.responses[activeAudit.id] ?? {}} updateDraft={(response) => { try { const item = criteriaForAudit(session, activeAudit)[positions[activeAudit.id] ?? 0]; setSession(updatePrototypeResponse(session, user, activeAudit.id, item, response)); return true; } catch (reason) { setError(reason instanceof Error ? reason.message : "Edição indisponível."); return false; } }} safetyClosure={session.safetyClosures?.[activeAudit.id]} onDraftsChange={drafts => { if (canEditAudit(user, activeAudit)) setSession(current => ({ ...current, responses: { ...current.responses, [activeAudit.id]: drafts } })); }} onFinish={async (closure) => { try { validatePrototypeAuditCompletion(session, user, activeAudit.id); if (closure) setSession(current => ({ ...current, safetyClosures: { ...current.safetyClosures, [activeAudit.id]: closure } })); if (!activeAudit.isDemo) await publication.save(activeAudit.id, session.responses[activeAudit.id] ?? {}, closure); setError(""); setScreen("audit_review"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível revisar o relatório."); } }} details={{ date: activeAudit.date, auditor: activeAudit.auditor }} />}</AuditComparisonHistory>}
        {currentScreen === "fill" && !activeAudit && <p className="muted">Selecione um rascunho autorizado no histórico.</p>}
        {currentScreen === "audit_review" && activeAuditWork && activeAudit && <AuditReview safetyClosure={session.safetyClosures?.[activeAudit.id]} publishedReportUrl={activeAudit.reportUrl} model={modelDisplayName(activeAudit.modelId).replace(" rev. 02", "")} modelId={activeAudit.modelId} workName={publication.draftVersions[activeAudit.id]?.workName ?? activeAuditWork.name} details={{ date: activeAudit.date, auditor: activeAudit.auditor }} criteria={criteriaForAudit(session, activeAudit)} drafts={session.responses[activeAudit.id] ?? {}} onBack={() => { if (activeAudit.status !== "Publicada") { setError(""); setScreen("fill"); } }} onPublish={async () => { try {
          if (!activeAudit.isDemo) {
            const published = await publication.publish(activeAudit.id, session.responses[activeAudit.id] ?? {}, session.safetyClosures?.[activeAudit.id]);
            setCompletedPreview({ audit: published, work: activeAuditWork });
            if (activeAudit.visitId) removePublishedVisit(activeAudit.visitId);
            setError(""); return true;
          }
          const completed = completePrototypeAudit(session, user, activeAudit.id); setSession(completed); const published = completed.audits.find((audit) => audit.id === activeAudit.id); if (published) setCompletedPreview({ audit: published, work: activeAuditWork }); if (activeAudit.visitId) removePublishedVisit(activeAudit.visitId); setError(""); return true; } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível publicar a auditoria."); return false; } }} />}
        {currentScreen === "report" && work && canDocuments && reportSection === "occurrences" && <Occurrences works={[work]} records={[]} />}
        {currentScreen === "report" && canDocuments && reportSection === "plans" && <DeferredScreen kind="plans" />}
        {(currentScreen === "discussion" || currentScreen === "publication") && <DeferredScreen kind={currentScreen} />}
      </>}
      {!canAgenda && !isAdmin && currentScreen === "agenda" && <section className="panel"><h2>Nenhuma obra disponível na agenda</h2><p className="muted">Consulte seus acessos para verificar as obras autorizadas.</p></section>}
      <footer className="page-footer"><span>Diálogo Engenharia · Auditorias</span></footer>
    </div></main>
  </div></AuditDetailsContext></AuditComparisonProvider></AuditPhotoProvider></AuditHistoryProvider>;
}

function EngineeringSection({ title, module, user, works, audits, auditFindings, findingCount, visits, actor, catalogs, deferCatalogs, onCreateActionPlan, hasPublishedActionPlan, onDownloadActionPlan }: {
  title: "Qualidade" | "Segurança";
  module: AppModule;
  user: ProfileWorkspaceContext["user"];
  works: ProfileWorkspaceContext["works"];
  audits: readonly AuditRecord[];
  auditFindings: readonly PublishedAuditFinding[];
  findingCount?: number;
  visits: readonly Visit[];
  actor: AgendaActorContext;
  catalogs: CatalogSnapshot;
  deferCatalogs: (children: ReactNode) => ReactNode;
  onCreateActionPlan?: (source: ActionPlanSource) => void;
  hasPublishedActionPlan?: (source: ActionPlanSource) => boolean;
  onDownloadActionPlan?: (source: ActionPlanSource) => void;
}) {
  return <>
    <div className="page-intro"><div><h2>{title}</h2></div></div>
    <div className={styles.engineeringSection}>
      <PublishedAuditsPanel user={user} works={works} audits={audits} module={module} onCreateActionPlan={onCreateActionPlan} hasPublishedActionPlan={hasPublishedActionPlan} onDownloadActionPlan={onDownloadActionPlan} />
      <EngineeringFollowUpPanel actor={actor} visits={visits} works={works} module={module} />
      <EngineeringResourcePanels findingCount={findingCount} actor={actor} works={works} module={module} catalogs={catalogs} deferCatalogs={deferCatalogs} auditFindings={auditFindings.filter((finding) => finding.module === module)} />
    </div>
  </>;
}

function EngineeringCoordinationSection({ user, works, audits, catalogs, deferCatalogs, hasPublishedActionPlan, onDownloadActionPlan }: {
  user: ProfileWorkspaceContext["user"];
  works: ProfileWorkspaceContext["works"];
  audits: readonly AuditRecord[];
  catalogs: CatalogSnapshot;
  deferCatalogs: (children: ReactNode) => ReactNode;
  hasPublishedActionPlan: (source: ActionPlanSource) => boolean;
  onDownloadActionPlan: (source: ActionPlanSource) => void;
}) {
  return <>
    <div className="page-intro"><div><h2>Qualidade e Segurança</h2></div></div>
    <div className={styles.coordinationSection}>
      <PublishedAuditsPanel user={user} works={works} audits={audits} module="quality" hasPublishedActionPlan={hasPublishedActionPlan} onDownloadActionPlan={onDownloadActionPlan} />
      <PublishedAuditsPanel user={user} works={works} audits={audits} module="safety" hasPublishedActionPlan={hasPublishedActionPlan} onDownloadActionPlan={onDownloadActionPlan} />
      <EngineeringRoutesPanel modules={["quality", "safety"]} catalogs={catalogs} deferCatalogs={deferCatalogs} />
    </div>
  </>;
}

function extractAuditFindings(state: PrototypeAuditState, audit: AuditRecord): ActionPlanFinding[] {
  const responses = state.responses[audit.id]?.[audit.modelId] ?? {};
  const evidencePhotos = (references: readonly string[] | undefined) => (references ?? []).map((reference) => ({
    name: evidenceReferenceName(reference),
    thumbnailUrl: auditPhotoThumbnailUrl(audit.id, reference, audit.reportUrl),
    ...(/^https:\/\//.test(reference) ? { url: reference }
      : /^p\d{2}-\d{2}\.png$/.test(reference) ? { url: `/local-test-evidence/boulevard/${encodeURIComponent(reference)}` } : {}),
  }));
  return criteriaForAudit(state, audit).flatMap((criterion) => {
    const response = responses[criterion.id];
    if (!response) return [];
    const checkFindings = (response.checks ?? []).filter((check) => check.compliant === false).map((check) => ({
      id: `${criterion.id}:${check.id}`,
      item: criterion.code,
      description: `${criterion.title || criterion.text} — ${check.label}`,
      criterionTitle: criterion.title || criterion.text,
      subitem: check.label,
      itemDescription: criterion.text,
      verificationCriterion: criterion.verificationRule,
      status: "Não conforme",
      serious: response.serious === true,
      nonconformity: check.note?.trim() || `Verificação “${check.label}” registrada como não conforme.`,
      evidencePhotos: evidencePhotos(check.photos),
    }));
    if (checkFindings.length) return checkFindings;
    const note = response.note.trim();
    const actionableNote = Boolean(note && !/^aprovado\.?$/i.test(note));
    const nonconforming = response.answer === "0" || response.answer === "5" || response.answer === "Não conforme";
    return nonconforming || actionableNote || response.serious === true
      ? [{ id: criterion.id, item: criterion.code, description: criterion.title || criterion.text, itemDescription: criterion.text,
        criterionTitle: criterion.title || criterion.text,
        verificationCriterion: criterion.verificationRule, status: response.answer ?? "Com apontamento",
        serious: response.serious === true, nonconformity: note || criterion.text, evidencePhotos: evidencePhotos(response.photos) }]
      : [];
  });
}

function evidenceReferenceName(reference: string): string {
  if (!/^https:\/\//.test(reference)) return reference;
  try { return decodeURIComponent(new URL(reference).pathname.split("/").pop() || "evidência"); }
  catch { return "evidência"; }
}

const testActionPlanFindings: Record<AppModule, readonly ActionPlanFinding[]> = {
  quality: [
    { id: "quality-test-1", item: "F.175-03", description: "Controle de serviços executados", nonconformity: "Registro de inspeção do serviço não localizado no local definido para consulta." },
    { id: "quality-test-2", item: "F.175-07", description: "Armazenamento e proteção de materiais", nonconformity: "Materiais armazenados diretamente sobre o piso e sem identificação do lote." },
    { id: "quality-test-3", item: "F.175-09", description: "Tratamento de não conformidades", nonconformity: "Pendência anterior sem evidência de conclusão anexada ao acompanhamento." },
  ],
  safety: [
    { id: "safety-test-1", item: "14.01.01", description: "Proteção contra quedas — áreas internas", nonconformity: "Abertura no piso identificada sem fechamento provisório resistente e fixado." },
    { id: "safety-test-2", item: "22.01.03", description: "Instalações elétricas provisórias", nonconformity: "Quadro elétrico encontrado destrancado e com circuitos sem identificação." },
    { id: "safety-test-3", item: "26.01.01", description: "Ordem e limpeza", nonconformity: "Via de circulação com materiais obstruindo parcialmente a passagem." },
  ],
};

function actionPlanSourceKey(source: ActionPlanSource) {
  return `${source.auditId ?? "example"}:${source.module}:${source.workId}`;
}
