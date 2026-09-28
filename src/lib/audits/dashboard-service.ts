import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import type { AppModule } from "../../domain/prototype-access.ts";
import { readPublishedAuditOverview } from "./service.ts";
import { buildAuditDashboard } from "./dashboard.ts";
import { unavailableAuditDashboard, type AuditDashboardSnapshot } from "./dashboard-contracts.ts";
import { parseAuditDashboardOverlay } from "./dashboard-overlay.ts";

/** The full authorized projection stays on the server; the browser receives aggregates only. */
export async function readAuditDashboard(client: Pick<SupabaseClient, "rpc" | "storage">, context: ProfileWorkspaceContext, localPublications?: unknown): Promise<AuditDashboardSnapshot> {
  const overlay = localPublications === undefined ? undefined : parseAuditDashboardOverlay(localPublications, context);
  if (overlay === null) return unavailableAuditDashboard();
  const snapshot = await readPublishedAuditOverview(client, context);
  if (!snapshot.available) return unavailableAuditDashboard();
  const modules: readonly AppModule[] = context.profile === "AUDITOR_QUALIDADE" ? ["quality"]
    : context.profile === "AUDITOR_SEGURANCA" ? ["safety"] : context.user.modules;
  if (!overlay) return buildAuditDashboard(snapshot, context.works, modules);
  const persistedIds = new Set(snapshot.audits.map((audit) => audit.id));
  if (overlay.audits.some((audit) => persistedIds.has(audit.id))) return unavailableAuditDashboard();
  return buildAuditDashboard({ ...snapshot,
    audits: [...snapshot.audits, ...overlay.audits],
    findings: [...(snapshot.findings ?? []), ...(overlay.findings ?? [])],
  }, context.works, modules);
}
