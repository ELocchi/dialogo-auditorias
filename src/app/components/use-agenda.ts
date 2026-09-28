"use client";

import { startTransition, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import type { AgendaActionResult, AgendaSnapshot } from "@/lib/agenda/contracts";
import { AgendaSyncClient } from "@/lib/agenda/sync-client";

export { isAgendaSnapshot } from "@/lib/agenda/contracts";
export { newRequestId } from "@/lib/agenda/sync-client";

export function useAgenda(initialAgenda: AgendaSnapshot, userId: string, profile: ProfileWorkspaceContext["profile"],
  engineeringScope: ProfileWorkspaceContext["engineeringScope"], administrativeScope: ProfileWorkspaceContext["administrativeScope"]) {
  const client = useMemo(() => new AgendaSyncClient(initialAgenda, { userId, profile, engineeringScope, administrativeScope }),
    [initialAgenda, userId, profile, engineeringScope, administrativeScope]);
  const state = useSyncExternalStore(client.subscribe, client.getState, client.getState);
  useEffect(() => {
    client.activate();
    const refresh = () => { if (document.visibilityState === "visible") void client.refresh(); };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") refresh(); else client.cancelRefresh(); };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!initialAgenda.available) refresh();
    return () => {
      client.dispose();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [client, initialAgenda.available]);
  const runAgendaAction = (operation: string, payload: object, action: (requestId: string) => Promise<AgendaActionResult>) =>
    client.runAction(operation, payload, (requestId) => new Promise<AgendaActionResult>((resolve, reject) => {
      startTransition(async () => {
        try { resolve(await action(requestId)); } catch (cause) { reject(cause); }
      });
    }));
  return { ...state, runAgendaAction, removePublishedVisit: client.removePublishedVisit };
}
