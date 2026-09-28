"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { AuditComparison } from "@/lib/audits/comparison-contracts";
import { createAuditComparisonLoader, type ComparisonReference } from "@/lib/audits/comparison-loader";
import type { AuditRecord } from "@/domain/operational-records";
import { canReadAudit, type DemoUser } from "@/domain/prototype-access";
import { useAuditHistory } from "./audit-history-context";

const ComparisonContext = createContext<ReturnType<typeof createAuditComparisonLoader> | null>(null);

export function usePreviousAudits(audits: readonly AuditRecord[], activeAudit: AuditRecord | undefined, user: DemoUser) {
  return useMemo(() => activeAudit ? audits
    .filter((audit) => audit.id !== activeAudit.id && audit.workId === activeAudit.workId
      && audit.modelId === activeAudit.modelId && audit.status === "Publicada" && canReadAudit(user, audit))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 3) : [], [activeAudit, audits, user]);
}

export function AuditComparisonProvider({ actor, children }: { actor: AgendaActorContext; children: ReactNode }) {
  const { userId, profile, engineeringScope, administrativeScope } = actor;
  const loader = useMemo(() => createAuditComparisonLoader({ userId, profile, engineeringScope, administrativeScope }),
    [userId, profile, engineeringScope, administrativeScope]);
  useEffect(() => () => loader.cancel(), [loader]);
  return <ComparisonContext.Provider value={loader}>{children}</ComparisonContext.Provider>;
}

export function AuditComparisonHistory({ audits, localAudits, activeAudit, children }: {
  audits: readonly ComparisonReference[];
  localAudits: readonly AuditComparison[];
  /** Paginated workspaces discover their previous three publications on demand. */
  activeAudit?: ComparisonReference;
  children: (history: readonly AuditComparison[]) => ReactNode;
}) {
  const loader = useContext(ComparisonContext);
  if (!loader) throw new Error("O histórico requer o contexto do perfil.");
  const previous = useAuditHistory(activeAudit ? {
    workId: activeAudit.workId, modelId: activeAudit.modelId,
    ...(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activeAudit.id) ? { excludeAuditId: activeAudit.id } : {}),
    pageSize: 3, includeFindings: false,
  } : null);
  const serverHistory = Boolean(activeAudit && previous.enabled);
  const states = useSyncExternalStore(loader.subscribe, loader.getSnapshot, loader.getSnapshot);
  // The parent may rebuild local arrays while the current answer is edited.
  // Only changes to the actual immutable comparison data should retrigger work.
  const localKey = JSON.stringify(localAudits);
  const stableLocal = useMemo(() => JSON.parse(localKey) as readonly AuditComparison[], [localKey]);
  const selectedReferences = serverHistory
    ? [...(previous.snapshot?.audits ?? []), ...stableLocal]
      .filter((audit, index, all) => audit.id !== activeAudit!.id && audit.workId === activeAudit!.workId
        && audit.modelId === activeAudit!.modelId && all.findIndex((entry) => entry.id === audit.id) === index)
      .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id)).slice(0, 3)
    : audits;
  const referencesKey = JSON.stringify(selectedReferences.map(({ id, workId, modelId, date }) => ({ id, workId, modelId, date })));
  const selected = useMemo(() => JSON.parse(referencesKey) as readonly ComparisonReference[], [referencesKey]);
  const requested = useMemo(() => selected.filter((audit) => !stableLocal.some((local) => local.id === audit.id)), [selected, stableLocal]);
  useEffect(() => { void loader.loadAudits(requested).catch(() => {}); }, [loader, requested]);
  const history = useMemo(() => selected.flatMap((audit) => {
    const local = stableLocal.find((entry) => entry.id === audit.id);
    if (local) return [local];
    const state = states[audit.id];
    return state?.status === "loaded" ? [state.audit] : [];
  }), [selected, stableLocal, states]);
  const pending = requested.filter((audit) => states[audit.id]?.status !== "loaded");
  const failed = pending.filter((audit) => states[audit.id]?.status === "error");
  const discoveryPending = serverHistory && previous.status !== "ready";
  const discoveryFailed = discoveryPending && previous.status === "error";
  return <>
    {(pending.length > 0 || discoveryPending) && <div role="status">
      <p className="muted">{failed.length || discoveryFailed ? "Não foi possível consultar parte do histórico anterior." : "Carregando resultados das auditorias anteriores..."}</p>
      {(failed.length > 0 || discoveryFailed) && <button type="button" className="secondary" onClick={() => {
        if (discoveryFailed) previous.retry();
        if (failed.length) void loader.loadAudits(failed).catch(() => {});
      }}>Tentar novamente</button>}
    </div>}
    {children(history)}
  </>;
}
