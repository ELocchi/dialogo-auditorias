"use client";

import { useEffect, useState } from "react";
import type { AuditRecord } from "@/domain/operational-records";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import { unavailableAuditDashboard, type AuditDashboardSnapshot } from "@/lib/audits/dashboard-contracts";
import type { PublishedAuditFinding } from "./engineering-resource-panels";

/** A selected identity retains its summaries while other sections are open. No authorization is shared. */
export function useAuditDashboard(initial: AuditDashboardSnapshot | undefined, actor: AgendaActorContext,
  audits: readonly AuditRecord[], findings: readonly PublishedAuditFinding[], visible: boolean, remote = Boolean(initial)) {
  const locals = audits.filter((audit) => audit.isDemo && audit.status === "Publicada");
  const localIds = new Set(locals.map((audit) => audit.id));
  const overlay = JSON.stringify({ audits: locals, findings: findings.filter((finding) => localIds.has(finding.auditId)).map((finding) => ({
    id: finding.id, auditId: finding.auditId, workId: finding.workId, auditDate: finding.auditDate, auditor: finding.auditor,
    module: finding.module, modelId: finding.modelId, item: finding.item, description: finding.description,
    criterionTitle: finding.criterionTitle ?? finding.description, subitem: finding.subitem,
    serious: finding.serious === true, nonconformity: finding.nonconformity,
  })) });
  const { userId, profile, engineeringScope, administrativeScope } = actor;
  const actorKey = JSON.stringify([userId, profile, engineeringScope, administrativeScope]);
  const [hydration] = useState(() => ({ actorKey, initial }));
  const hydrated = hydration.actorKey === actorKey ? hydration.initial : undefined;
  const [result, setResult] = useState<{ key: string; attempt: number; snapshot: AuditDashboardSnapshot } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const hasLocal = remote && locals.length > 0;
  const key = JSON.stringify([actorKey, overlay]);
  const completed = result?.key === key && result.attempt === attempt
    || !hasLocal && hydrated !== undefined && attempt === 0;
  useEffect(() => {
    if (!visible || completed) return;
    const controller = new AbortController();
    const parameters = new URLSearchParams({ usuario: userId, perfil: profile, atuacao: engineeringScope ?? "", administrativo: administrativeScope ?? "" });
    fetch(`/api/audits/dashboard?${parameters}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal,
      ...(hasLocal ? { method: "POST", headers: { "Content-Type": "application/json" }, body: overlay } : { method: "GET" }) })
      .then(async (response) => {
        if (!response.ok) throw new Error("Dashboard unavailable");
        const snapshot = await response.json() as AuditDashboardSnapshot;
        if (!snapshot.available || !snapshot.ranking || !Array.isArray(snapshot.pendingPlanKeys)) throw new Error("Dashboard unavailable");
        if (!controller.signal.aborted) setResult({ key, attempt, snapshot });
      }).catch(() => { if (!controller.signal.aborted) setResult({ key, attempt, snapshot: unavailableAuditDashboard() }); });
    return () => controller.abort();
  }, [visible, hasLocal, userId, profile, engineeringScope, administrativeScope, overlay, attempt, key, completed]);
  const selected = result?.key === key ? result.snapshot : hydrated ?? unavailableAuditDashboard();
  return {
    summary: !remote && !selected.available ? undefined : selected,
    loading: Boolean(visible && !completed),
    retry: () => setAttempt((value) => value + 1),
  };
}
