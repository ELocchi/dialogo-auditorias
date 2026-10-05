"use client";

import { startTransition, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import type { AgendaActionResult, AgendaSnapshot } from "@/lib/agenda/contracts";
import { AgendaSyncClient } from "@/lib/agenda/sync-client";

export { isAgendaSnapshot } from "@/lib/agenda/contracts";
export { newRequestId } from "@/lib/agenda/sync-client";

export function useAgenda(initialAgenda: AgendaSnapshot, userId: string, profile: ProfileWorkspaceContext["profile"],
  engineeringScope: ProfileWorkspaceContext["engineeringScope"], administrativeScope: ProfileWorkspaceContext["administrativeScope"],
  enabled = true, liveRefresh = false) {
  const client = useMemo(() => new AgendaSyncClient(initialAgenda, { userId, profile, engineeringScope, administrativeScope }),
    [initialAgenda, userId, profile, engineeringScope, administrativeScope]);
  const state = useSyncExternalStore(client.subscribe, client.getState, client.getState);
  const started = useRef<AgendaSyncClient | null>(null);
  const lastRefreshAt = useRef(0);
  useEffect(() => {
    lastRefreshAt.current = Date.now();
    client.activate();
    return () => client.dispose();
  }, [client]);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      lastRefreshAt.current = Date.now();
      void client.refresh();
    };
    const refreshIfStale = () => {
      if (Date.now() - lastRefreshAt.current >= 60_000) refresh();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshIfStale();
      else client.cancelRefresh();
    };
    const interval = liveRefresh ? window.setInterval(refresh, 30_000) : undefined;
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", onVisibilityChange);
    // Hydrated screens need no duplicate read. Returning to a screen revalidates its retained snapshot.
    if (started.current === client || !initialAgenda.available) refresh();
    started.current = client;
    return () => {
      client.cancelRefresh();
      if (interval !== undefined) window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [client, initialAgenda.available, enabled, liveRefresh]);
  const runAgendaAction = (operation: string, payload: object, action: (requestId: string) => Promise<AgendaActionResult>) =>
    client.runAction(operation, payload, (requestId) => new Promise<AgendaActionResult>((resolve, reject) => {
      startTransition(async () => {
        try { resolve(await action(requestId)); } catch (cause) { reject(cause); }
      });
    }));
  return { ...state, retryAgenda: client.refresh, runAgendaAction, removePublishedVisit: client.removePublishedVisit };
}
