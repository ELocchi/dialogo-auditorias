"use client";

import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { CatalogSnapshot } from "@/lib/catalogs/contracts";
import { createDeferredCatalogLoader, type DeferredCatalogState } from "@/lib/catalogs/deferred-loader";

export function useDeferredCatalogs(actor: AgendaActorContext, initial: CatalogSnapshot) {
  const { userId, profile, engineeringScope, administrativeScope } = actor;
  const loader = useMemo(() => createDeferredCatalogLoader({ userId, profile, engineeringScope, administrativeScope }, initial),
    [userId, profile, engineeringScope, administrativeScope, initial]);
  const state = useSyncExternalStore(loader.subscribe, loader.getSnapshot, loader.getSnapshot);
  useEffect(() => () => loader.cancel(), [loader]);
  return { state, catalogs: state.catalogs, loadCatalogs: loader.load, setCatalogs: loader.replace };
}

export function DeferredCatalogs({ state, load, children }: {
  state: DeferredCatalogState; load: () => Promise<CatalogSnapshot>; children: ReactNode;
}) {
  useEffect(() => { void load().catch(() => {}); }, [load]);
  if (state.status === "ready") return children;
  return <section className="panel" aria-busy={state.status !== "error"}>
    {state.status === "error" ? <>
      <p role="alert">{state.message ?? "Não foi possível carregar os roteiros."}</p>
      <button type="button" className="secondary" onClick={() => { void load().catch(() => {}); }}>Tentar novamente</button>
    </> : <p className="muted" role="status">Carregando roteiros...</p>}
  </section>;
}
