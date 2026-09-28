"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { AuditHistoryQuery } from "@/lib/audits/history-contracts";
import { auditHistoryKey, createAuditHistoryLoader, idleAuditHistory } from "@/lib/audits/history-loader";

const AuditHistoryContext = createContext<ReturnType<typeof createAuditHistoryLoader> | null>(null);
const noSubscription = () => () => {};
const idleSnapshot = () => idleAuditHistory;

export function AuditHistoryProvider({ actor, enabled = true, children }: {
  actor: AgendaActorContext;
  enabled?: boolean;
  children: ReactNode;
}) {
  const { userId, profile, engineeringScope, administrativeScope } = actor;
  const loader = useMemo(() => enabled
    ? createAuditHistoryLoader({ userId, profile, engineeringScope, administrativeScope }) : null,
  [enabled, userId, profile, engineeringScope, administrativeScope]);
  useEffect(() => () => loader?.cancel(), [loader]);
  return <AuditHistoryContext.Provider value={loader}>{children}</AuditHistoryContext.Provider>;
}

export function useServerAuditHistoryEnabled() {
  return useContext(AuditHistoryContext) !== null;
}

/** No provider or a null query preserves standalone/demo component behavior. */
export function useAuditHistory(query: AuditHistoryQuery | null) {
  const loader = useContext(AuditHistoryContext);
  let key: string | null = null;
  let invalid = false;
  if (loader && query) {
    try { key = auditHistoryKey(query); } catch { invalid = true; }
  }
  const normalized = useMemo(() => key ? JSON.parse(key) as AuditHistoryQuery : null, [key]);
  const subscribe = useCallback((listener: () => void) => loader && key ? loader.subscribe(key, listener) : noSubscription(), [loader, key]);
  const getSnapshot = useCallback(() => loader && key ? loader.getState(key) : idleSnapshot(), [loader, key]);
  const state = useSyncExternalStore(subscribe, getSnapshot, idleSnapshot);
  useEffect(() => {
    if (loader && normalized) void loader.loadPage(normalized).catch(() => {});
  }, [loader, normalized]);
  const retry = useCallback(() => {
    if (loader && normalized) void loader.loadPage(normalized, true).catch(() => {});
  }, [loader, normalized]);
  return { ...state, ...(invalid ? { status: "error" as const, message: "Filtros do histórico inválidos." } : {}), enabled: loader !== null, retry };
}
