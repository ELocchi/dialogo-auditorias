"use client";

import { useEffect, useState } from "react";
import type { AuditRecord } from "@/domain/operational-records";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import { unavailableAuditDashboard, type AuditDashboardSnapshot } from "@/lib/audits/dashboard-contracts";
import type { PublishedAuditFinding } from "./engineering-resource-panels";

/** Local preview publications stay temporary; only their aggregate is recomputed on the server. */
export function useAuditDashboard(initial: AuditDashboardSnapshot | undefined, actor: AgendaActorContext,
  audits: readonly AuditRecord[], findings: readonly PublishedAuditFinding[], visible: boolean) {
  const locals = audits.filter((audit) => audit.isDemo && audit.status === "Publicada");
  const localIds = new Set(locals.map((audit) => audit.id));
  const overlay = JSON.stringify({ audits: locals, findings: findings.filter((finding) => localIds.has(finding.auditId)).map((finding) => ({
    id: finding.id, auditId: finding.auditId, workId: finding.workId, auditDate: finding.auditDate, auditor: finding.auditor,
    module: finding.module, modelId: finding.modelId, item: finding.item, description: finding.description,
    criterionTitle: finding.criterionTitle ?? finding.description, subitem: finding.subitem,
    serious: finding.serious === true, nonconformity: finding.nonconformity,
  })) });
  const { userId, profile, engineeringScope, administrativeScope } = actor;
  const [result, setResult] = useState<{ key: string; attempt: number; snapshot: AuditDashboardSnapshot } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const hasLocal = locals.length > 0;
  const key = JSON.stringify([userId, profile, engineeringScope, administrativeScope, overlay]);
  const completed = result?.key === key && result.attempt === attempt;
  useEffect(() => {
    if (!initial || !hasLocal || !visible || completed) return;
    const controller = new AbortController();
    const parameters = new URLSearchParams({ usuario: userId, perfil: profile, atuacao: engineeringScope ?? "", administrativo: administrativeScope ?? "" });
    fetch(`/api/audits/dashboard?${parameters}`, { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: overlay, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Dashboard unavailable");
        const snapshot = await response.json() as AuditDashboardSnapshot;
        if (!snapshot.available || !snapshot.ranking || !Array.isArray(snapshot.pendingPlanKeys)) throw new Error("Dashboard unavailable");
        if (!controller.signal.aborted) setResult({ key, attempt, snapshot });
      }).catch(() => { if (!controller.signal.aborted) setResult({ key, attempt, snapshot: unavailableAuditDashboard() }); });
    return () => controller.abort();
  }, [initial, hasLocal, visible, userId, profile, engineeringScope, administrativeScope, overlay, attempt, key, completed]);
  return {
    summary: !initial || !hasLocal ? initial : result?.key === key ? result.snapshot : initial,
    loading: Boolean(initial && hasLocal && !completed),
    retry: () => setAttempt((value) => value + 1),
  };
}
