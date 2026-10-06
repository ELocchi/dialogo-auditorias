"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
const listeners = new Set<() => void>();
const fallback = new Map<string, string>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function read(key: string) {
  try { return sessionStorage.getItem(key) ?? fallback.get(key) ?? ""; } catch { return fallback.get(key) ?? ""; }
}
/** Session-only preferences, keyed by account/profile/list. Never stores response data. */
export function useListState<T>(scope: string, initial: T, validate: (value: unknown) => value is T) {
  const key = `dialogo:list:v1:${scope}`;
  const raw = useSyncExternalStore(subscribe, () => read(key), () => "");
  const state = useMemo(() => { try { const value: unknown = JSON.parse(raw); return validate(value) ? value : initial; } catch { return initial; } }, [raw, initial, validate]);
  const change = useCallback((value: T) => {
    const next = JSON.stringify(value);
    fallback.set(key, next);
    try { sessionStorage.setItem(key, next); } catch { /* Private browsing can disable storage. */ }
    listeners.forEach(listener => listener());
  }, [key]);
  return [state, change] as const;
}

const isString = (value: unknown): value is string => typeof value === "string" && value.length <= 500;
export function useListFilter(scope: string, initial = "") { return useListState(scope, initial, isString); }

const isNullableString = (value: unknown): value is string | null => value === null || isString(value);
export function useListSelection(scope: string) { return useListState<string | null>(scope, null, isNullableString); }
