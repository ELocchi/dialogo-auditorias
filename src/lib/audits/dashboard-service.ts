import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import type { AppModule } from "../../domain/prototype-access.ts";
import { parsePublishedAuditOverview } from "./service.ts";
import { buildAuditDashboard } from "./dashboard.ts";
import { unavailableAuditDashboard, type AuditDashboardSnapshot } from "./dashboard-contracts.ts";
import { parseAuditDashboardOverlay } from "./dashboard-overlay.ts";
import { isRecord } from "../catalogs/validation.ts";

type Client = Pick<SupabaseClient, "rpc">;
type CachedDashboard = { revision: string; json: string; bytes: number; expires: number };

function dashboardContextKey(context: ProfileWorkspaceContext): string {
  return JSON.stringify([
    context.user.id, context.profile, context.engineeringScope, context.administrativeScope,
    [...context.user.modules].sort(),
    context.works.map((work) => [work.id, work.name]).sort(([first], [second]) => first.localeCompare(second)),
    (context.user.workModuleScopes ?? []).map((scope) => [scope.workId, scope.module])
      .sort(([firstWork, firstModule], [secondWork, secondModule]) => firstWork.localeCompare(secondWork) || firstModule.localeCompare(secondModule)),
  ]);
}

/** The cache stores only calculated summaries. Every read still validates access
 * and the current immutable publication set inside one database snapshot. */
export function createAuditDashboardReader(options: {
  maximumBytes?: number; maximumEntries?: number; ttlMs?: number; now?: () => number;
} = {}) {
  const maximumBytes = options.maximumBytes ?? 8 * 1024 * 1024;
  const maximumEntries = options.maximumEntries ?? 32;
  const ttlMs = options.ttlMs ?? 5 * 60_000;
  const now = options.now ?? Date.now;
  const cache = new Map<string, CachedDashboard>();
  let cacheBytes = 0;
  const remove = (key: string) => {
    const entry = cache.get(key);
    if (entry) { cacheBytes -= entry.bytes; cache.delete(key); }
  };
  const prune = () => {
    const time = now();
    for (const [key, entry] of cache) if (entry.expires <= time) remove(key);
  };
  const remember = (key: string, revision: string, summary: AuditDashboardSnapshot) => {
    remove(key);
    if (!summary.available || maximumEntries < 1 || ttlMs <= 0) return;
    const json = JSON.stringify(summary);
    // Conservative UTF-16 budget for the stored strings plus per-entry overhead.
    const bytes = 2 * (json.length + key.length + revision.length) + 256;
    if (bytes > maximumBytes) return;
    while (cache.size && (cacheBytes + bytes > maximumBytes || cache.size >= maximumEntries)) remove(cache.keys().next().value!);
    cache.set(key, { revision, json, bytes, expires: now() + ttlMs });
    cacheBytes += bytes;
  };

  return async function readDashboard(client: Client, context: ProfileWorkspaceContext, localPublications?: unknown): Promise<AuditDashboardSnapshot> {
    const overlay = localPublications === undefined ? undefined : parseAuditDashboardOverlay(localPublications, context);
    if (overlay === null) return unavailableAuditDashboard();
    prune();
    const key = dashboardContextKey(context);
    const cached = cache.get(key);
    // Local publications need the full authorized projection to preserve ranking
    // conflicts and items that enter the top five. Their result is never cached.
    const knownRevision = overlay ? null : cached?.revision ?? null;
    try {
      const { data, error } = await client.rpc("read_published_audit_overview_if_changed", {
        p_profile: context.profile, p_engineering_scope: context.engineeringScope,
        p_administrative_scope: context.administrativeScope, p_known_revision: knownRevision,
      });
      if (error || !isRecord(data) || typeof data.revision !== "string" || !/^[0-9a-f]{32}$/.test(data.revision)
        || typeof data.unchanged !== "boolean") throw new Error("Dashboard unavailable");
      if (data.unchanged) {
        if (!cached || !knownRevision || data.revision !== knownRevision || "audits" in data || "findings" in data)
          throw new Error("Unexpected dashboard revision");
        // Do not replace a newer concurrent response with this captured entry.
        if (cache.get(key) === cached) { cache.delete(key); cache.set(key, cached); }
        return JSON.parse(cached.json) as AuditDashboardSnapshot;
      }
      const snapshot = parsePublishedAuditOverview(data, context);
      if (!snapshot.available || !Array.isArray(data.audits) || !Array.isArray(data.findings)
        || snapshot.audits.length !== data.audits.length || snapshot.findings?.length !== data.findings.length)
        throw new Error("Dashboard projection unavailable");
      const modules: readonly AppModule[] = context.profile === "AUDITOR_QUALIDADE" ? ["quality"]
        : context.profile === "AUDITOR_SEGURANCA" ? ["safety"] : context.user.modules;
      if (overlay) {
        const persistedIds = new Set(snapshot.audits.map((audit) => audit.id));
        if (overlay.audits.some((audit) => persistedIds.has(audit.id))) throw new Error("Conflicting publication");
      }
      const summary = buildAuditDashboard(snapshot, context.works, modules);
      remember(key, data.revision, summary);
      if (!overlay) return summary;
      return buildAuditDashboard({ ...snapshot,
        audits: [...snapshot.audits, ...overlay.audits],
        findings: [...(snapshot.findings ?? []), ...(overlay.findings ?? [])],
      }, context.works, modules);
    } catch {
      remove(key);
      // Never serve cached data after a failed permission check or database read.
      return unavailableAuditDashboard();
    }
  };
}

export const readAuditDashboard = createAuditDashboardReader();
