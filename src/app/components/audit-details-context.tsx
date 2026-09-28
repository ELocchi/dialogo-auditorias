"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type Dispatch, type SetStateAction, type ReactNode } from "react";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import type { PublishedAuditSnapshot } from "@/lib/audits/contracts";
import type { PrototypeAuditState } from "@/domain/prototype-audits";
import { createAuditDetailLoader, type AuditDetailStates } from "@/lib/audits/detail-loader";

type AuditDetails = { loadAudit: (id: string) => Promise<void>; states: AuditDetailStates; isLoaded: (id: string) => boolean };
export const AuditDetailsContext = createContext<AuditDetails>({ loadAudit: async () => {}, states: {}, isLoaded: () => true });
export const useAuditDetails = () => useContext(AuditDetailsContext);

export function usePublishedAuditDetails(context: ProfileWorkspaceContext, initial: PublishedAuditSnapshot,
  setSession: Dispatch<SetStateAction<PrototypeAuditState>>, session: PrototypeAuditState): AuditDetails {
  const { profile, engineeringScope, administrativeScope } = context;
  const userId = context.user.id;
  const loader = useMemo(() => createAuditDetailLoader({
    actor: { userId, profile, engineeringScope, administrativeScope }, initial,
    onLoaded: (snapshot) => setSession((current) => ({
      ...current,
      audits: current.audits.map((audit) => snapshot.audits.find((entry) => entry.id === audit.id) ?? audit),
      responses: { ...current.responses, ...snapshot.responses },
      criteriaSnapshots: { ...current.criteriaSnapshots, ...snapshot.criteriaSnapshots },
    })),
  }), [userId, profile, engineeringScope, administrativeScope, initial, setSession]);
  const states = useSyncExternalStore(loader.subscribe, loader.getSnapshot, loader.getSnapshot);
  useEffect(() => () => loader.cancel(), [loader]);
  return useMemo(() => ({ loadAudit: loader.loadAudit, states,
    isLoaded: (id: string) => session.audits.some((audit) => audit.id === id && (audit.isDemo
      || Boolean(session.responses[id]?.[audit.modelId] && session.criteriaSnapshots?.[id]))),
  }), [loader, states, session]);
}

export function AuditDetailGate({ auditId, children }: { auditId: string; children: ReactNode }) {
  const { loadAudit, states, isLoaded } = useAuditDetails();
  const loaded = !auditId || isLoaded(auditId);
  useEffect(() => { if (!loaded) void loadAudit(auditId).catch(() => {}); }, [auditId, loaded, loadAudit]);
  if (loaded) return children;
  const state = states[auditId];
  return <section className="panel" aria-busy={state?.status !== "error"}>
    {state?.status === "error" ? <>
      <p role="alert">{state.message}</p>
      <button type="button" className="secondary" onClick={() => { void loadAudit(auditId).catch(() => {}); }}>Tentar novamente</button>
    </> : <p className="muted" role="status">Carregando detalhes da auditoria...</p>}
  </section>;
}
