"use client";
import { requestSignal } from "@/lib/request-signal";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { FollowUpWorkspaceSnapshot, FollowUpReportIndexSnapshot } from "@/lib/follow-up/workspace-contracts";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const finding = (value: unknown) => object(value) && [value.id, value.location, value.description, value.correction].every(text);
const header = (value: unknown) => object(value) && [value.id, value.title, value.visitId, value.updatedAt].every(text);
export function isFollowUpWorkspaceSnapshot(value: unknown): value is FollowUpWorkspaceSnapshot {
  return object(value) && value.available === true
    && Array.isArray(value.reports) && value.reports.every((entry) => header(entry) && object(entry) && Number.isInteger(entry.revision) && Array.isArray(entry.findings) && entry.findings.every(finding))
    && Array.isArray(value.drafts) && value.drafts.every((entry) => object(entry) && text(entry.visitId) && Number.isInteger(entry.revision) && text(entry.updatedAt) && Array.isArray(entry.findings) && entry.findings.every(finding))
    && Array.isArray(value.completed) && value.completed.every(text)
    && Array.isArray(value.workFindings) && value.workFindings.every((entry) => finding(entry) && object(entry)
      && [entry.workId, entry.photoFileName, entry.createdAt].every(text) && (entry.module === "quality" || entry.module === "safety"));
}
export function isFollowUpReportIndexSnapshot(value: unknown): value is FollowUpReportIndexSnapshot {
  return object(value) && value.available === true && Array.isArray(value.reports) && value.reports.every(header);
}

/** Mount this hook in an actor-keyed component so a profile change also clears local form state. */
export function useFollowUpSnapshot<T>(actor: AgendaActorContext, endpoint: string, validate: (value: unknown) => value is T) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; data: T | null; error: boolean } | null>(null);
  const version = useRef(0);
  const { userId, profile, engineeringScope, administrativeScope } = actor;
  const key = JSON.stringify([userId, profile, engineeringScope, administrativeScope, endpoint]);
  useEffect(() => {
    const controller = new AbortController();
    const generation = version.current;
    let denied = false;
    const parameters = new URLSearchParams({ usuario: userId, perfil: profile, atuacao: engineeringScope ?? "", administrativo: administrativeScope ?? "" });
    void fetch(`${endpoint}?${parameters}`, { cache: "no-store", credentials: "same-origin", signal: requestSignal(controller.signal) })
      .then(async (response) => {
        denied = response.status === 401 || response.status === 403;
        if (!response.ok) throw new Error("Follow-up unavailable");
        const data: unknown = await response.json();
        if (!validate(data)) throw new Error("Follow-up unavailable");
        if (!controller.signal.aborted && generation === version.current) setResult({ key, attempt, data, error: false });
      }).catch(() => {
        if (!controller.signal.aborted && generation === version.current)
          setResult((current) => ({ key, attempt, data: denied || current?.key !== key ? null : current.data, error: true }));
      });
    return () => controller.abort();
  }, [userId, profile, engineeringScope, administrativeScope, endpoint, validate, attempt, key]);
  const update = useCallback((change: (current: T) => T) => {
    version.current += 1;
    setResult((current) => current?.key === key && current.data ? { key, attempt, data: change(current.data), error: false } : current);
  }, [attempt, key]);
  return { data: result?.key === key ? result.data : null, loading: result?.key !== key || result.attempt !== attempt, error: result?.key === key && result.attempt === attempt && result.error,
    retry: useCallback(() => setAttempt((current) => current + 1), []), update };
}
