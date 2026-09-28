"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import { createFollowUpPhotoLoader } from "@/lib/follow-up/photo-loader";

export function useFollowUpPhotoStore({ userId, profile, engineeringScope, administrativeScope }: AgendaActorContext) {
  const store = useMemo(() => createFollowUpPhotoLoader({ userId, profile, engineeringScope, administrativeScope }),
    [userId, profile, engineeringScope, administrativeScope]);
  useEffect(() => () => store.cancel(), [store]);
  return store;
}

/** Rows observe their own visibility; sharing a visit never duplicates a listing. */
export function useFollowUpVisitPhotos(store: ReturnType<typeof createFollowUpPhotoLoader>, visitId: string) {
  const ref = useRef<HTMLLIElement>(null);
  const subscribe = useCallback((listener: () => void) => store.subscribe(visitId, listener), [store, visitId]);
  const getState = useCallback(() => store.getState(visitId), [store, visitId]);
  const state = useSyncExternalStore(subscribe, getState, getState);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") return store.acquire(visitId);
    let active = true;
    let release: (() => void) | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!active) return;
      if (entries.some((entry) => entry.isIntersecting)) release ??= store.acquire(visitId);
      else { release?.(); release = undefined; }
    }, { rootMargin: "240px 0px" });
    observer.observe(element);
    return () => { active = false; observer.disconnect(); release?.(); };
  }, [store, visitId]);
  const retry = useCallback(() => store.retry(visitId), [store, visitId]);
  return { ref, ...state, retry };
}
