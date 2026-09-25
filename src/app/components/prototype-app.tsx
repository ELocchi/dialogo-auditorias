"use client";

import { startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type AuditModelId, type AuditRecord } from "@/domain/operational-records";
import type { ItemResponse } from "@/domain/audit-draft";
import { calculateAuditFinalScore } from "@/domain/audit-draft";
import { roleLabels, moduleLabels, modelModule, canAccessWorkModule, canAccessModule, canReadVisit, canBeginScheduledAudit, canConsultAgenda, canReadAudit, canEditAudit, canReadTechnicalWeights, canReadOperationalDocuments, type AppModule, type Visit, type VisitInput } from "@/domain/prototype-access";
import { beginScheduledVisitAudit, completePrototypeAudit, validatePrototypeAuditCompletion, updatePrototypeResponse, criteriaForAudit, criteriaForModel, modelDisplayName, type PrototypeAuditState } from "@/domain/prototype-audits";
import { getSaoPauloToday } from "@/domain/visit-calendar";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import { unavailableAgenda, withoutPublishedVisit, type AgendaActionResult, type AgendaActorContext, type AgendaSnapshot } from "@/lib/agenda/contracts";
import { createAgendaVisitAction, deleteAgendaVisitAction, confirmAgendaVisitAction } from "@/app/agenda/actions";
import { catalogVersion, unavailableCatalogs, type CatalogSnapshot } from "@/lib/catalogs/contracts";
import { AuditReview, Catalog, NewAudit } from "./audit-workspace";
import { Works, Occurrences } from "./operational-views";
import { Icon, type IconName } from "./ui-icon";
import { VisitAgenda } from "./visit-agenda";
import { PrototypeDashboard, AuditList, AuditorScheduledAudits, PublishedAuditsPanel, DeferredScreen, AdministrativePanel, AuditPreview, type ActionPlanSource } from "./prototype-workspace";
import { type AdminNotification } from "./auth/AdminNotifications";
import { AdministrativeHeader } from "./administrative-header";
import { FollowUpWorkspace } from "./follow-up-workspace";
import { ActionPlanEditor, type ActionPlanFinding, type ActionPlanRow } from "./action-plan-editor";
import { EngineeringFollowUpPanel } from "./engineering-follow-up-panel";
import { EngineeringResourcePanels, type PublishedAuditFinding } from "./engineering-resource-panels";
import styles from "./prototype-app.module.css";
import { unavailablePublishedAudits, type PublishedAuditSnapshot } from "@/lib/audits/contracts";
import { assignedAgendaWorks, currentAuditAssignments } from "@/domain/assigned-audit-context";

type PrototypeAppProps = {
  context: ProfileWorkspaceContext;
  initialScreen?: "overview" | "works" | "agenda" | "audits" | "follow_up" | "report" | "settings" | "action_plan";
  initialVisitId?: string;
  initialActionPlanAuditId?: string;
  initialAgenda?: AgendaSnapshot;
  initialCatalogs?: CatalogSnapshot;
  initialAudits?: PublishedAuditSnapshot;
  administrationContent?: ReactNode;
  activeAccountCount?: number | null;
};

type LocalAuditFixture = {
  modelId: AuditModelId;
  responses: Record<string, ItemResponse>;
  criteria?: Array<{ code: string; title: string; text: string; group: string }>;
};

export function PrototypeApp({ context, initialScreen = "overview", initialVisitId, initialActionPlanAuditId, initialAgenda = unavailableAgenda(), initialCatalogs = unavailableCatalogs(), initialAudits = unavailablePublishedAudits(), administrationContent, activeAccountCount = null }: PrototypeAppProps) {
  return <ProfileWorkspace key={JSON.stringify([context.user, context.profile, context.works, initialScreen, initialVisitId, initialActionPlanAuditId])} context={context} initialScreen={initialScreen} initialVisitId={initialVisitId} initialActionPlanAuditId={initialActionPlanAuditId} initialAgenda={initialAgenda} initialCatalogs={initialCatalogs} initialAudits={initialAudits} administrationContent={administrationContent} activeAccountCount={activeAccountCount} />;
}

function ProfileWorkspace({ context: providedContext, initialScreen, initialVisitId, initialActionPlanAuditId, initialAgenda, initialCatalogs, initialAudits, administrationContent, activeAccountCount }: Required<Pick<PrototypeAppProps, "context" | "initialScreen" | "initialAgenda" | "initialCatalogs" | "initialAudits" | "activeAccountCount">> & Pick<PrototypeAppProps, "initialVisitId" | "initialActionPlanAuditId" | "administrationContent">) {
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
  const context = localScenario ? {
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
  const { agenda: syncedAgenda, agendaSyncError, mutationPending, runAgendaAction, removePublishedVisit } = useAgenda(initialAgenda, baseUser.id, context.profile, context.engineeringScope, context.administrativeScope);
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
  const [screen, setScreen] = useState<string>(initialActionPlanSource ? "action_plan" : initialScreen);
  const [reportSection, setReportSection] = useState<"reports" | "occurrences" | "plans">("reports");
  const [catalogs, setCatalogs] = useState(initialCatalogs);
  const [session, setSession] = useState<PrototypeAuditState>({ audits: initialAudits.audits, responses: initialAudits.responses, criteriaSnapshots: initialAudits.criteriaSnapshots });
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);
  const [completedPreview, setCompletedPreview] = useState<{ audit: AuditRecord; work: ProfileWorkspaceContext["works"][number] } | null>(null);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [catalogId, setCatalogId] = useState<AuditModelId>("security-it07-r02");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [error, setError] = useState("");
  const [actionPlanSource, setActionPlanSource] = useState<ActionPlanSource | null>(initialActionPlanSource);
  const [actionPlanDrafts, setActionPlanDrafts] = useState<Record<string, readonly ActionPlanRow[]>>({});
  const [publishedActionPlans, setPublishedActionPlans] = useState<Record<string, { bytes: Uint8Array; fileName: string }>>({});

  const availableModules = user.modules.filter((module) => canAccessModule(user, module));
  const auditModule = selectedModule && availableModules.includes(selectedModule) ? selectedModule : availableModules[0] ?? null;
  const availableWorks = context.works.filter((work) => auditModule && canAccessWorkModule(user, work.id, auditModule));
  const work = availableWorks.find((entry) => entry.id === selectedWorkId) ?? availableWorks[0];
  const isAdmin = user.role === "administrative";
  const isAuditor = user.role === "safety-auditor" || user.role === "quality-auditor";
  const isEngineering = user.role === "engineering";
  const isGeneralAdmin = isAdmin && context.administrativeScope === "GERAL";
  const catalogModules = isAdmin ? availableModules : auditModule ? [auditModule] : [];
  const modelIds = (["security-it07-r02", "quality-f175", "quality-f176"] as const).filter((id) => catalogModules.includes(modelModule(id)));
  const currentCatalogId = modelIds.includes(catalogId) ? catalogId : modelIds[0];
  const currentModelName = currentCatalogId ? modelDisplayName(currentCatalogId) : "Sem roteiro autorizado";
  const canAgenda = visits.some((visit) => canReadVisit(user, visit))
    || context.works.some((entry) => user.modules.some((discipline) => canConsultAgenda(user, entry.id, discipline)));
  const canDocuments = !!auditModule && !!work && canReadOperationalDocuments(user, work.id, auditModule);
  const readablePublishedAudits = session.audits.filter((audit) => audit.status === "Publicada" && canReadAudit(user, audit));
  const canPublishedReports = readablePublishedAudits.length > 0;
  const publishedReportModules = availableModules.filter((module) => readablePublishedAudits.some((audit) => modelModule(audit.modelId) === module));
  const reportModules = publishedReportModules.length ? publishedReportModules : auditModule ? [auditModule] : [];
  const moduleAudits = session.audits.filter((audit) => modelModule(audit.modelId) === auditModule && canReadAudit(user, audit));
  const contextualAudits = moduleAudits.filter((audit) => audit.workId === work?.id);
  const contextualVisits = visits.filter((visit) => visit.workId === work?.id && visit.module === auditModule && canReadVisit(user, visit));
  const completedReview = screen === "audit_review" && completedPreview?.audit.id === activeAuditId ? completedPreview : null;
  const activeAudit = moduleAudits.find((audit) => audit.id === activeAuditId) ?? completedReview?.audit;
  const activeAuditWork = activeAudit ? agendaWorks.find((entry) => entry.id === activeAudit.workId) ?? completedReview?.work : undefined;
  const activeAuditHistory = activeAudit ? session.audits
    .filter((audit) => audit.id !== activeAudit.id && audit.workId === activeAudit.workId && audit.modelId === activeAudit.modelId && audit.status === "Publicada" && canReadAudit(user, audit))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 3)
    .map((audit) => ({ id: audit.id, date: audit.date, drafts: session.responses[audit.id] ?? {} })) : [];
  const preview = activeAudit ?? contextualAudits.find((audit) => canEditAudit(user, audit));
  const criteria = !isAdmin && currentCatalogId ? catalogVersion(catalogs, currentCatalogId).criteria.filter((item) => `${item.code} ${item.text} ${item.group} ${item.subgroup}`.toLocaleLowerCase("pt-BR").includes(catalogQuery.toLocaleLowerCase("pt-BR"))) : [];

  useEffect(() => {
    if (!localAuditFlow || !activeAudit) return;
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

  const nav: { key: string; label: string; icon: IconName }[] = isEngineering ? [
    { key: "overview", label: "Visão geral", icon: "overview" },
    { key: "agenda", label: "Agenda", icon: "calendar" },
    { key: "engineering_quality", label: "Qualidade", icon: "audits" },
    { key: "engineering_safety", label: "Segurança", icon: "check" },
    { key: "works", label: "Obras", icon: "works" },
  ] : [
    { key: "overview", label: isAdmin ? "Painel administrativo" : "Visão geral", icon: "overview" },
    ...(canAgenda || (isAdmin && auditModule) ? [{ key: "agenda", label: "Agenda", icon: "calendar" as const }] : []),
    ...(!isAdmin ? [{ key: "audits", label: "Auditorias", icon: "audits" as const }] : []),
    ...(isAuditor ? [{ key: "follow_up", label: "Acompanhamento", icon: "check" as const }] : []),
    { key: "works", label: "Obras", icon: "works" },
    ...(currentCatalogId && !isAuditor ? [{ key: "criteria", label: isAdmin ? "Roteiros e versões" : "Roteiros", icon: "book" as const }] : []),
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
  const agendaActor = { userId: user.id, profile: context.profile,
    engineeringScope: context.engineeringScope ?? null, administrativeScope: context.administrativeScope };
  const agendaActions = {
    onCreate: (input: VisitInput) => runAgendaAction("create", input, (requestId) => createAgendaVisitAction({ ...input, requestId }, agendaActor)),
    onDelete: (visitId: string, expectedRevision: number) => runAgendaAction(`delete:${visitId}`, { visitId, expectedRevision }, (requestId) => deleteAgendaVisitAction({ visitId, expectedRevision, requestId }, agendaActor)),
    onConfirm: (visitId: string, expectedRevision: number) => runAgendaAction(`confirm:${visitId}`, { visitId, expectedRevision }, (requestId) => confirmAgendaVisitAction({ visitId, expectedRevision, requestId }, agendaActor)),
  };
  const startScheduledAudit = async (visit: Visit) => {
    if (!isAuditor || !agenda.available || !canBeginScheduledAudit(user, visit, getSaoPauloToday()))
      throw new Error("Esta auditoria só pode ser iniciada pelo profissional responsável na data confirmada.");
    let current = visit;
    if (!localTestVisitIds.has(visit.id)) {
      const response = await fetch("/api/agenda", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível conferir o agendamento. Tente novamente.");
      const fresh: unknown = await response.json();
      if (!isAgendaSnapshot(fresh) || !fresh.available) throw new Error("Não foi possível conferir o agendamento. Tente novamente.");
      const persisted = fresh.visits.find((entry) => entry.id === visit.id);
      if (!persisted || persisted.revision !== visit.revision || !canBeginScheduledAudit(user, persisted, getSaoPauloToday()))
        throw new Error("O agendamento mudou ou não está mais disponível para iniciar. Atualize a agenda.");
      current = persisted;
    }
    const selectedWork = assignedAgendaWorks(user, context.works, [current]).find((entry) => entry.id === current.workId);
    if (!selectedWork || !current.modelId) throw new Error("Esta obra ou roteiro não está autorizado neste perfil.");
    const version = catalogVersion(catalogs, current.modelId);
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
  const actionPlanFindings: readonly ActionPlanFinding[] = actionPlanAudit
    ? extractAuditFindings(session, actionPlanAudit)
    : actionPlanSource?.example ? testActionPlanFindings[actionPlanSource.module] : [];
  const publishedAuditFindings = session.audits.filter((audit) => audit.status === "Publicada").flatMap((audit): PublishedAuditFinding[] =>
    extractAuditFindings(session, audit).map((finding) => ({
      ...finding,
      auditId: audit.id,
      workId: audit.workId,
      auditDate: audit.date,
      auditor: audit.auditor,
      module: modelModule(audit.modelId),
      modelId: audit.modelId,
    })));
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
  const actionPlanDraftKey = actionPlanSource ? `${actionPlanSource.auditId ?? "example"}:${actionPlanSource.module}:${actionPlanSource.workId}` : "";
  const downloadActionPlan = (source: ActionPlanSource) => {
    const publication = publishedActionPlans[actionPlanSourceKey(source)];
    if (!publication) return;
    const url = URL.createObjectURL(new Blob([Uint8Array.from(publication.bytes).buffer], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = publication.fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    <AdministrativeHeader name={user.name} email={context.email} userId={user.id} scope={isAdmin ? context.administrativeScope : undefined} profileLabel={isAdmin ? undefined : profileLabel} notifications={agenda.notifications} onNavigateAgenda={navigateAgenda} />
    <div className="navigation-bar"><nav className="main-navigation" aria-label="Navegação principal">{nav.map(({ key, label, icon }) => <button type="button" key={key} className={`nav-item${currentScreen === key || (key === "audits" && auditNav) || (currentScreen === "action_plan" && key === `engineering_${actionPlanSource?.module}`) ? " active" : ""}`} aria-current={currentScreen === key ? "page" : undefined} onClick={() => navigate(key)}><Icon name={icon} /><span>{label}</span></button>)}</nav></div>
    <main className="main-content" id="main-content" tabIndex={-1}><div className="content-wrap">
      {currentScreen !== "overview" && currentScreen !== "agenda" && currentScreen !== "works" && currentScreen !== "fill" && currentScreen !== "audit_review" && currentScreen !== "action_plan" && !(currentScreen === "report" && reportSection === "reports") && !currentScreen.startsWith("engineering_") && !(currentScreen === "audits" && isAuditor) && !(currentScreen === "follow_up" && isAuditor) && !isAdminCatalog && !isAdminSettings && <div className={styles.context} aria-label="Contexto autorizado"><label>{isAdmin ? "Disciplina da agenda" : "Módulo"}<select className="filter-select" value={auditModule ?? ""} disabled={!availableModules.length} onChange={(event) => { const next = event.target.value as AppModule; if (canAccessModule(user, next)) { setSelectedModule(next); changeContext(); } }}>{!availableModules.length && <option value="">Nenhum módulo autorizado</option>}{availableModules.map((id) => <option value={id} key={id}>{moduleLabels[id]}</option>)}</select></label><label>Obra no contexto<select className="filter-select" value={work?.id ?? ""} disabled={!availableWorks.length} onChange={(event) => { if (auditModule && canAccessWorkModule(user, event.target.value, auditModule)) { setSelectedWorkId(event.target.value); changeContext(); } }}>{!availableWorks.length && <option value="">Nenhuma obra autorizada</option>}{availableWorks.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label></div>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!localScenario && !initialAudits.available && <p role="alert" className={styles.error}>Não foi possível carregar as auditorias publicadas e suas notas. Atualize a página para tentar novamente.</p>}
      {auditNav && !isAuditor && <nav className="subnav" aria-label="Seções de auditorias"><button className={`subnav-item${currentScreen === "audits" ? " active" : ""}`} type="button" onClick={() => navigate("audits")}>Histórico e rascunhos</button>{activeAudit && <button className={`subnav-item${currentScreen === "fill" ? " active" : ""}`} type="button" onClick={() => navigate("fill")}>Preenchimento</button>}</nav>}
      {currentScreen === "report" && canDocuments && <nav className="subnav" aria-label="Seções de relatórios">
        {([ ["reports", "Relatórios"], ["occurrences", "Apontamentos"], ["plans", "Planos de ação"] ] as const).map(([key, label]) => <button key={key} type="button" className={`subnav-item${reportSection === key ? " active" : ""}`} aria-current={reportSection === key ? "page" : undefined} onClick={() => setReportSection(key)}>{label}</button>)}
      </nav>}
      {currentScreen === "report" && reportSection === "reports" && (canDocuments || canPublishedReports) && <>
        <div className="page-intro"><h2>Relatórios publicados</h2></div>
        {reportModules.map((module) => <div key={module}>
          <h3>{moduleLabels[module]}</h3>
          <PublishedAuditsPanel user={user} works={context.works.filter((entry) => canAccessWorkModule(user, entry.id, module))}
            audits={readablePublishedAudits} module={module} />
        </div>)}
        {preview && work && canEditAudit(user, preview) && <AuditPreview audit={preview} work={work} />}
      </>}
      {currentScreen === "overview" && (auditModule ? <PrototypeDashboard user={user} module={auditModule} works={isAdminOverview || isEngineering ? context.works : availableWorks} audits={isAdminOverview || isEngineering ? session.audits.filter((audit) => canReadAudit(user, audit)) : moduleAudits} auditFindings={dashboardAuditFindings} visits={isAdminOverview || isEngineering || user.role === "safety-auditor" || user.role === "quality-auditor" ? visits.filter((visit) => canReadVisit(user, visit) && (isAdminOverview || isEngineering || visit.module === auditModule)) : contextualVisits} auditors={isAdminOverview || isEngineering ? agenda.auditors : []} activeAccountCount={activeAccountCount} generalAdministrator={isGeneralAdmin} previewRanking={localScenario} agendaWorks={agendaWorks} open={navigate} /> : <section className="panel"><h2>Visão geral</h2><p className="muted">Este perfil ainda não tem obras e módulos autorizados. Consulte seus acessos ou solicite a liberação ao Administrativo.</p></section>)}
      {currentScreen === "engineering_quality" && isEngineering && <EngineeringSection title="Qualidade" module="quality" user={user} works={context.works} audits={session.audits} auditFindings={publishedAuditFindings} visits={visits} actor={agendaActor} catalogs={catalogs} onCreateActionPlan={user.activity === "site-team" ? (source) => { setActionPlanSource(source); setScreen("action_plan"); } : undefined} hasPublishedActionPlan={(source) => Boolean(publishedActionPlans[actionPlanSourceKey(source)])} onDownloadActionPlan={downloadActionPlan} />}
      {currentScreen === "engineering_safety" && isEngineering && <EngineeringSection title="Segurança" module="safety" user={user} works={context.works} audits={session.audits} auditFindings={publishedAuditFindings} visits={visits} actor={agendaActor} catalogs={catalogs} onCreateActionPlan={user.activity === "site-team" ? (source) => { setActionPlanSource(source); setScreen("action_plan"); } : undefined} hasPublishedActionPlan={(source) => Boolean(publishedActionPlans[actionPlanSourceKey(source)])} onDownloadActionPlan={downloadActionPlan} />}
      {currentScreen === "action_plan" && actionPlanSource && user.activity === "site-team" && <ActionPlanEditor key={`${actionPlanDraftKey}:prefill-v5`} workName={actionPlanSource.workName} auditDate={actionPlanSource.date} auditScore={actionPlanAudit?.finalScore ?? null} module={actionPlanSource.module} authorName={user.name} findings={actionPlanFindings} draft={actionPlanDrafts[actionPlanDraftKey]} example={actionPlanSource.example} prefillTest={localScenario && actionPlanSource.module === "quality" && /boulevar/i.test(actionPlanSource.workName)} onSave={(rows) => setActionPlanDrafts((current) => ({ ...current, [actionPlanDraftKey]: rows }))} onPublish={(publication) => setPublishedActionPlans((current) => ({ ...current, [actionPlanDraftKey]: publication }))} onBack={() => setScreen(`engineering_${actionPlanSource.module}`)} />}
      {currentScreen === "works" && <Works works={context.works} canManage={isGeneralAdmin} />}
      {currentScreen === "follow_up" && isAuditor && <FollowUpWorkspace user={user} visits={visits} works={context.works} actor={agendaActor} agendaAvailable={agenda.available} />}
      {currentScreen === "settings" && isGeneralAdmin && <AdministrativePanel accessContent={administrationContent} />}
      {currentScreen === "criteria" && currentCatalogId && !isAuditor && <Catalog model={currentModelName} setModel={(name) => { const id = modelIds.find((entry) => modelDisplayName(entry) === name); if (id) { setCatalogId(id); setCatalogQuery(""); } }} query={catalogQuery} setQuery={setCatalogQuery} criteria={criteria} showItemList={!isAdmin} allowedModels={modelIds.map(modelDisplayName)} showWeights={canReadTechnicalWeights(user, modelModule(currentCatalogId))} showReferenceDocuments={isAdmin} catalogs={catalogs} actorId={isAdmin ? user.id : undefined} onCatalogsSaved={isAdmin ? setCatalogs : undefined} />}
      {currentScreen === "audits" && (isAuditor ? <AuditorScheduledAudits user={user} works={agendaWorks} audits={moduleAudits} auditFindings={publishedAuditFindings.filter((finding) => finding.module === auditModule)} visits={visits} users={agenda.auditors} available={agenda.available} mutationPending={mutationPending} onDelete={agendaActions.onDelete} onConfirm={agendaActions.onConfirm} onStartAudit={startScheduledAudit} startedVisitIds={new Set(session.audits.map((audit) => audit.visitId).filter((id): id is string => !!id))}
        catalog={currentCatalogId ? <Catalog embedded model={currentModelName} setModel={(name) => { const id = modelIds.find((entry) => modelDisplayName(entry) === name); if (id) { setCatalogId(id); setCatalogQuery(""); } }} query={catalogQuery} setQuery={setCatalogQuery} criteria={criteria} showItemList={false} showReferenceDocuments allowedModels={modelIds.map(modelDisplayName)} showWeights={canReadTechnicalWeights(user, modelModule(currentCatalogId))} catalogs={catalogs} /> : <p className="muted">Nenhum roteiro autorizado para este perfil.</p>} /> : <AuditList user={user} works={availableWorks} audits={contextualAudits} onOpen={openAudit} />)}
      {isAdminAgenda && auditModule && <VisitAgenda key={user.id} user={user} works={context.works} users={agenda.auditors} visits={visits} module={auditModule} workId={work?.id ?? ""} available={agenda.available} mutationPending={mutationPending} syncError={agendaSyncError} {...agendaActions} />}
      {currentScreen === "agenda" && !isAdmin && canAgenda && <VisitAgenda key={user.id} user={user} works={agendaWorks} users={agenda.auditors} visits={visits} module={auditModule ?? "safety"} workId={work?.id ?? ""} available={agenda.available} mutationPending={mutationPending} syncError={agendaSyncError} {...agendaActions} />}
      {auditModule && <>
        {currentScreen === "fill" && activeAuditWork && activeAudit && activeAudit.status !== "Publicada" && <NewAudit key={activeAudit.id} model={modelDisplayName(activeAudit.modelId).replace(" rev. 02", "")} responseKey={activeAudit.modelId} workName={activeAuditWork.name} readOnly={!canEditAudit(user, activeAudit)} showWeights={canReadTechnicalWeights(user, auditModule)} previousAudits={activeAuditHistory} criteria={criteriaForAudit(session, activeAudit)} activeIndex={positions[activeAudit.id] ?? 0} setActiveIndex={(index) => setPositions((previous) => ({ ...previous, [activeAudit.id]: index }))} drafts={session.responses[activeAudit.id] ?? {}} updateDraft={(response) => { try { const item = criteriaForAudit(session, activeAudit)[positions[activeAudit.id] ?? 0]; setSession(updatePrototypeResponse(session, user, activeAudit.id, item, response)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Edição indisponível."); } }} onFinish={() => { try { validatePrototypeAuditCompletion(session, user, activeAudit.id); setError(""); setScreen("audit_review"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível revisar o relatório."); } }} details={{ date: activeAudit.date, auditor: activeAudit.auditor }} />}
        {currentScreen === "fill" && !activeAudit && <p className="muted">Selecione um rascunho autorizado no histórico.</p>}
        {currentScreen === "audit_review" && activeAuditWork && activeAudit && <AuditReview model={modelDisplayName(activeAudit.modelId).replace(" rev. 02", "")} modelId={activeAudit.modelId} workName={activeAuditWork.name} details={{ date: activeAudit.date, auditor: activeAudit.auditor }} criteria={criteriaForAudit(session, activeAudit)} drafts={session.responses[activeAudit.id] ?? {}} onBack={() => { if (activeAudit.status !== "Publicada") { setError(""); setScreen("fill"); } }} onPublish={() => { try { const completed = completePrototypeAudit(session, user, activeAudit.id); setSession(completed); const published = completed.audits.find((audit) => audit.id === activeAudit.id); if (published) setCompletedPreview({ audit: published, work: activeAuditWork }); if (activeAudit.visitId) removePublishedVisit(activeAudit.visitId); setError(""); return true; } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível publicar a auditoria."); return false; } }} />}
        {currentScreen === "report" && work && canDocuments && reportSection === "occurrences" && <Occurrences works={[work]} records={[]} />}
        {currentScreen === "report" && canDocuments && reportSection === "plans" && <DeferredScreen kind="plans" />}
        {(currentScreen === "discussion" || currentScreen === "publication") && <DeferredScreen kind={currentScreen} />}
      </>}
      {!canAgenda && !isAdmin && currentScreen === "agenda" && <section className="panel"><h2>Nenhuma obra disponível na agenda</h2><p className="muted">Consulte seus acessos para verificar as obras autorizadas.</p></section>}
      <footer className="page-footer"><span>Diálogo Engenharia · Auditorias</span><span>{profileLabel}</span></footer>
    </div></main>
  </div>;
}

function EngineeringSection({ title, module, user, works, audits, auditFindings, visits, actor, catalogs, onCreateActionPlan, hasPublishedActionPlan, onDownloadActionPlan }: {
  title: "Qualidade" | "Segurança";
  module: AppModule;
  user: ProfileWorkspaceContext["user"];
  works: ProfileWorkspaceContext["works"];
  audits: readonly AuditRecord[];
  auditFindings: readonly PublishedAuditFinding[];
  visits: readonly Visit[];
  actor: AgendaActorContext;
  catalogs: CatalogSnapshot;
  onCreateActionPlan?: (source: ActionPlanSource) => void;
  hasPublishedActionPlan?: (source: ActionPlanSource) => boolean;
  onDownloadActionPlan?: (source: ActionPlanSource) => void;
}) {
  return <>
    <div className="page-intro"><div><h2>{title}</h2></div></div>
    <div className={styles.engineeringSection}>
      <PublishedAuditsPanel user={user} works={works} audits={audits} module={module} onCreateActionPlan={onCreateActionPlan} hasPublishedActionPlan={hasPublishedActionPlan} onDownloadActionPlan={onDownloadActionPlan} />
      <EngineeringFollowUpPanel actor={actor} visits={visits} works={works} module={module} />
      <EngineeringResourcePanels actor={actor} works={works} module={module} catalogs={catalogs} auditFindings={auditFindings.filter((finding) => finding.module === module)} />
    </div>
  </>;
}

function extractAuditFindings(state: PrototypeAuditState, audit: AuditRecord): ActionPlanFinding[] {
  const responses = state.responses[audit.id]?.[audit.modelId] ?? {};
  const evidencePhotos = (references: readonly string[] | undefined) => (references ?? []).map((reference) => ({
    name: evidenceReferenceName(reference),
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

  const removePublishedVisit = (visitId: string) => setAgenda((current) => withoutPublishedVisit(current, visitId));

  return { agenda, agendaSyncError, mutationPending, runAgendaAction, removePublishedVisit };
}
