import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { isModel, isRecord, isUuid } from "../catalogs/validation.ts";
import { parseComparisonAuditIds, unavailableAuditComparison, type AuditComparisonSnapshot } from "./comparison-contracts.ts";

/** A separate projection; it must never populate the full-detail cache. */
export async function readPublishedAuditComparison(client: Pick<SupabaseClient, "rpc">,
  context: ProfileWorkspaceContext, auditIds: readonly string[]): Promise<AuditComparisonSnapshot> {
  const ids = parseComparisonAuditIds(auditIds);
  if (!ids) return unavailableAuditComparison();
  try {
    const { data, error } = await client.rpc("read_published_audit_comparison", {
      p_audit_ids: ids, p_profile: context.profile, p_engineering_scope: context.engineeringScope,
      p_administrative_scope: context.administrativeScope,
    });
    if (error || !Array.isArray(data) || data.length > ids.length) return unavailableAuditComparison();
    const works = new Set(context.works.map((work) => work.id));
    const seen = new Set<string>();
    const audits: AuditComparisonSnapshot["audits"] = [];
    for (const raw of data) {
      if (!isRecord(raw) || !isUuid(raw.id) || !ids.includes(raw.id) || seen.has(raw.id)
        || !isUuid(raw.workId) || !works.has(raw.workId) || !isModel(raw.modelId)
        || typeof raw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)
        || !Number.isFinite(Date.parse(`${raw.date}T12:00:00.000Z`))
        || new Date(`${raw.date}T12:00:00.000Z`).toISOString().slice(0, 10) !== raw.date
        || !isRecord(raw.answers) || Object.entries(raw.answers).some(([id, answer]) => !id || typeof answer !== "string"))
        return unavailableAuditComparison();
      const discipline = raw.modelId === "security-it07-r02" ? "safety" : "quality";
      if (!context.user.workModuleScopes?.some((scope) => scope.workId === raw.workId && scope.module === discipline))
        return unavailableAuditComparison();
      seen.add(raw.id);
      audits.push({ id: raw.id, workId: raw.workId, modelId: raw.modelId, date: raw.date,
        answers: Object.fromEntries(Object.entries(raw.answers)) as Record<string, string> });
    }
    // Missing/denied IDs remain absent. A caller must not mark them as loaded.
    return { available: true, audits };
  } catch { return unavailableAuditComparison(); }
}
