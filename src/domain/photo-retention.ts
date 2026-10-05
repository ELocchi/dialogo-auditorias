/** Eligibility only. This module never deletes data or authorizes deletion. */
export type FollowUpRetention = { publishedAt: string; completedAt: string | null };
function instant(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new Error("A timestamp with timezone is required");
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error("Invalid timestamp");
  return result;
}

/** Three calendar months in São Paulo (UTC-03), clamping month-end dates.
 * Do not substitute ninety days for the agreed three-month period. */
export function followUpExpiresAt(publishedAt: string): string {
  const local = new Date(instant(publishedAt) - 3 * 3600_000);
  const target = new Date(local);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + 3);
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(local.getUTCDate(), lastDay));
  return new Date(target.getTime() + 3 * 3600_000).toISOString();
}

export function followUpRemovalReason(photo: FollowUpRetention, now: string): "completed" | "expired" | null {
  const time = instant(now);
  const publication = instant(photo.publishedAt);
  if (time < publication) return null;
  if (photo.completedAt && instant(photo.completedAt) <= time) return "completed";
  return instant(followUpExpiresAt(photo.publishedAt)) <= time ? "expired" : null;
}

export type AuditPublication = { id: string; workId: string; module: "quality" | "safety"; publishedAt: string };
export function auditPhotosSuperseded(previous: AuditPublication, next: AuditPublication, now: string): boolean {
  return previous.id !== next.id && previous.workId === next.workId && previous.module === next.module
    && instant(next.publishedAt) > instant(previous.publishedAt) && instant(next.publishedAt) <= instant(now);
}

export function backupExpiresAt(completedAt: string): string {
  return new Date(instant(completedAt) + 7 * 24 * 3600_000).toISOString();
}

/** Every gate is mandatory; eligibility alone must never enable a deletion.
 * The worker will need to prove these gates against live DB/storage state. */
export function canRemovePhoto(gates: {
  eligible: boolean; allPublishedPdfsPreserved: boolean; verifiedDailyBackup: boolean;
  activeDraftReferences: boolean; cleanupEnabled: boolean;
}): boolean {
  return gates.eligible && gates.allPublishedPdfsPreserved && gates.verifiedDailyBackup
    && !gates.activeDraftReferences && gates.cleanupEnabled;
}
