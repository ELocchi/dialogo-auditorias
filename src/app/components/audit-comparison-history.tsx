"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { AuditComparison } from "@/lib/audits/comparison-contracts";
import { createAuditComparisonLoader, type ComparisonReference } from "@/lib/audits/comparison-loader";
import type { AuditRecord } from "@/domain/operational-records";
import { canReadAudit, type DemoUser } from "@/domain/prototype-access";

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

export function AuditComparisonHistory({ audits, localAudits, children }: {
  audits: readonly ComparisonReference[];
  localAudits: readonly AuditComparison[];
  children: (history: readonly AuditComparison[]) => ReactNode;
}) {
  const loader = useContext(ComparisonContext);
  if (!loader) throw new Error("O histórico requer o contexto do perfil.");
  const states = useSyncExternalStore(loader.subscribe, loader.getSnapshot, loader.getSnapshot);
  const requested = useMemo(() => audits.filter((audit) => !localAudits.some((local) => local.id === audit.id)), [audits, localAudits]);
  useEffect(() => { void loader.loadAudits(requested).catch(() => {}); }, [loader, requested]);
  const history = useMemo(() => audits.flatMap((audit) => {
    const local = localAudits.find((entry) => entry.id === audit.id);
    if (local) return [local];
    const state = states[audit.id];
    return state?.status === "loaded" ? [state.audit] : [];
  }), [audits, localAudits, states]);
  const pending = requested.filter((audit) => states[audit.id]?.status !== "loaded");
  const failed = pending.filter((audit) => states[audit.id]?.status === "error");
  return <>
    {pending.length > 0 && <div role="status">
      <p className="muted">{failed.length ? "Não foi possível consultar parte do histórico anterior." : "Carregando resultados das auditorias anteriores..."}</p>
      {failed.length > 0 && <button type="button" className="secondary" onClick={() => { void loader.loadAudits(failed).catch(() => {}); }}>Tentar novamente</button>}
    </div>}
    {children(history)}
  </>;
}
