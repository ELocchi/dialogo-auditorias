import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { isRecord } from "../catalogs/validation.ts";
import { parsePublishedAuditOverview } from "./service.ts";
import { normalizeAuditHistoryQuery, unavailableAuditHistory, type AuditHistoryQuery, type AuditHistorySnapshot } from "./history-contracts.ts";

export async function readPublishedAuditHistory(client: Pick<SupabaseClient, "rpc">,
  context: ProfileWorkspaceContext, input: AuditHistoryQuery = {}): Promise<AuditHistorySnapshot> {
  const query = normalizeAuditHistoryQuery(input);
  if (!query) return unavailableAuditHistory();
  const unavailable = () => unavailableAuditHistory(query);
  try {
    const { data, error } = await client.rpc("read_published_audit_history", {
      p_profile: context.profile, p_engineering_scope: context.engineeringScope, p_administrative_scope: context.administrativeScope,
      p_page: query.page, p_page_size: query.pageSize, p_work_id: query.workId ?? null,
      p_module: query.module ?? null, p_model_id: query.modelId ?? null,
      p_date_from: query.dateFrom ?? null, p_date_to: query.dateTo ?? null,
      p_only_with_findings: query.onlyWithFindings, p_include_findings: query.includeFindings,
      p_audit_id: query.auditId ?? null, p_exclude_audit_id: query.excludeAuditId ?? null,
    });
    if (error || !isRecord(data) || !Number.isSafeInteger(data.total) || (data.total as number) < 0
      || data.page !== query.page || data.pageSize !== query.pageSize
      || !Array.isArray(data.audits) || !Array.isArray(data.findings)) return unavailable();
    const total = data.total as number;
    const expectedLength = Math.min(query.pageSize, Math.max(0, total - (query.page - 1) * query.pageSize));
    if (data.audits.length !== expectedLength || (!query.includeFindings && data.findings.length)) return unavailable();
    const snapshot = parsePublishedAuditOverview(data, context);
    if (!snapshot.available || snapshot.audits.length !== data.audits.length || snapshot.findings?.length !== data.findings.length)
      return unavailable();
    const findings = snapshot.findings ?? [];
    const idsWithFindings = new Set(findings.map((finding) => finding.auditId));
    for (const [index, audit] of snapshot.audits.entries()) {
      const previous = snapshot.audits[index - 1];
      const discipline = audit.modelId === "security-it07-r02" ? "safety" : "quality";
      if ((query.workId && audit.workId !== query.workId) || (query.module && discipline !== query.module)
        || (query.modelId && audit.modelId !== query.modelId) || (query.dateFrom && audit.date < query.dateFrom)
        || (query.dateTo && audit.date > query.dateTo) || (query.auditId && audit.id !== query.auditId)
        || (query.excludeAuditId && audit.id === query.excludeAuditId)
        || (query.onlyWithFindings && query.includeFindings && !idsWithFindings.has(audit.id))
        || (previous && (previous.date < audit.date || (previous.date === audit.date && previous.id < audit.id)))) return unavailable();
    }
    return { available: true, total, page: query.page, pageSize: query.pageSize, audits: [...snapshot.audits], findings };
  } catch { return unavailable(); }
}
