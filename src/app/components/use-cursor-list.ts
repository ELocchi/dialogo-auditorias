"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestSignal } from "@/lib/request-signal";
import { isListCursor, isListPage, listSizes, type ListCursor, type ListKind, type ListPage } from "@/lib/lists/contracts";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import { useListState } from "./list-state";
import { useHydrated } from "./use-hydrated";

type CursorState = { size: number; search: string; workId: string; cursors: (ListCursor | null)[]; page: number };
const initial: CursorState = { size: 20, search: "", workId: "", cursors: [null], page: 0 };
const validState = (v: unknown): v is CursorState => {
  const s = v as CursorState;
  return !!s && listSizes.includes(s.size as 20) && typeof s.search === "string" && s.search.length <= 120 && typeof s.workId === "string"
    && Array.isArray(s.cursors) && s.cursors[0] === null && s.cursors.slice(1).every(isListCursor)
    && Number.isInteger(s.page) && s.page >= 0 && s.page < s.cursors.length;
};
export function useCursorList(actor: AgendaActorContext, kind: ListKind, scope: string, module?: "quality" | "safety", fixedWorkId?: string, enabled = true, visitId?: string) {
  const actorKey = JSON.stringify(actor);
  const storageKey = `${actorKey}:${scope}:${module ?? ""}:${fixedWorkId ?? ""}:${visitId ?? ""}`;
  const [state, setState] = useListState(storageKey, initial, validState);
  const hydrated = useHydrated();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; data: ListPage | null; error: boolean } | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const restore = useRef(true);
  const [input, setInput] = useState<{ scope: string; value: string } | null>(null);
  const search = input?.scope === storageKey ? input.value : state.search;
  const setSearch = (value: string) => setInput({ scope: storageKey, value });
  // No requests for each keystroke; retain the entered term while the page loads.
  useEffect(() => { if (!hydrated || search === state.search) return;
    const timer = setTimeout(() => setState({ ...state, search, page: 0, cursors: [null] }), 300);
    return () => clearTimeout(timer);
  }, [search, hydrated, state, setState]);
  const query = useMemo(() => {
    const params = new URLSearchParams({ kind, size: String(state.size), search: state.search,
      usuario: actor.userId, perfil: actor.profile, atuacao: actor.engineeringScope ?? "", administrativo: actor.administrativeScope ?? "" });
    if (state.workId || fixedWorkId) params.set("workId", fixedWorkId || state.workId);
    if (visitId) params.set("visitId", visitId);
    if (module) params.set("module", module);
    if (state.cursors[state.page]) params.set("cursor", JSON.stringify(state.cursors[state.page]));
    return params.toString();
  }, [actor.userId, actor.profile, actor.engineeringScope, actor.administrativeScope, state, kind, module, fixedWorkId, visitId]);
  useEffect(() => {
    if (!hydrated || !enabled) return;
    const controller = new AbortController();
    void fetch(`/api/follow-up/list?${query}`, { credentials: "same-origin", cache: "no-store", signal: requestSignal(controller.signal) })
      .then(async response => { if (!response.ok) throw new Error("List unavailable"); const data: unknown = await response.json();
        if (!isListPage(data) || data.items.length > state.size) throw new Error("Invalid list");
        if (!controller.signal.aborted) setResult({ key: query, attempt, data, error: false });
      }).catch(() => { if (!controller.signal.aborted) setResult({ key: query, attempt, data: null, error: true }); });
    return () => controller.abort();
  }, [query, attempt, hydrated, state.size, enabled]);
  const loading = enabled && (!hydrated || result?.key !== query || result.attempt !== attempt);
  const data = enabled && result?.key === query && result.attempt === attempt ? result.data : null;
  useEffect(() => {
    if (loading || !data || !restore.current) return;
    restore.current = false;
    try { const y = Number(sessionStorage.getItem(`dialogo:list:scroll:${storageKey}`));
      if (y > 0) requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" })); } catch { /* No storage. */ }
  }, [data, loading, storageKey]);
  useEffect(() => {
    let position = window.scrollY, leaving = false;
    const save = () => { try { sessionStorage.setItem(`dialogo:list:scroll:${storageKey}`, String(position)); } catch { /* No storage. */ } };
    const onScroll = () => { if (!leaving) position = window.scrollY; };
    // Capture before the router resets scroll or removes the list DOM.
    const onNavigate = (event: MouseEvent) => { if (event.target instanceof Element && event.target.closest("a[href]")) { position = window.scrollY; leaving = true; save(); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onNavigate, true);
    window.addEventListener("pagehide", save);
    return () => { save(); window.removeEventListener("scroll", onScroll); document.removeEventListener("click", onNavigate, true); window.removeEventListener("pagehide", save); };
  }, [storageKey]);
  const move = (page: number) => {
    if (loading || page < 0) return;
    if (page > state.page && !data?.nextCursor) return;
    const cursors = page > state.page ? [...state.cursors.slice(0, page), data!.nextCursor] : state.cursors;
    setState({ ...state, page, cursors });
    if (anchor.current && anchor.current.getBoundingClientRect().top < 0) anchor.current.scrollIntoView({ block: "start", behavior: "instant" });
  };
  return { state, search, setSearch, data, loading, error: !loading && result?.error === true, anchor: useCallback((node: HTMLDivElement | null) => { anchor.current = node; }, []),
    retry: useCallback(() => setAttempt(n => n + 1), []),
    next: () => move(state.page + 1), previous: () => move(state.page - 1),
    first: () => setState({ ...state, page: 0, cursors: [null] }),
    setWorkId: (workId: string) => setState({ ...state, workId, page: 0, cursors: [null] }),
    setSize: (size: number) => setState({ ...state, size, page: 0, cursors: [null] }),
  };
}
export type CursorList = Omit<ReturnType<typeof useCursorList>, "anchor">;
