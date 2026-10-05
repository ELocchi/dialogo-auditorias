import type { AgendaActorContext } from "../agenda/contracts.ts";

const evidenceFile = /^(?:p\d{2}-\d{2}\.png|[a-f0-9]{64}\.jpg)$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identityKeys = ["usuario", "perfil", "atuacao", "administrativo"] as const;

/** Never replaces the original reference used by downloads or PDF generation. */
export function auditPhotoThumbnailUrl(auditId: string, reference: string, reportUrl?: string): string | undefined {
  if (!uuid.test(auditId) || !reportUrl?.startsWith(`/api/audits/${auditId}/report?`)) return undefined;
  try {
    const fileName = decodeURIComponent(new URL(reference, "https://local.invalid").pathname.split("/").at(-1) ?? "");
    if (!evidenceFile.test(fileName)) return undefined;
    const report = new URL(reportUrl, "https://local.invalid");
    const query = new URLSearchParams({ miniatura: "1" });
    for (const key of identityKeys) {
      const value = report.searchParams.get(key);
      if (value === null) return undefined;
      query.set(key, value);
    }
    return `/api/audits/${auditId}/photos/${fileName}?${query}`;
  } catch { return undefined; }
}

export function followUpPhotoThumbnailUrl(originalUrl: string, actor: AgendaActorContext): string {
  const query = new URLSearchParams({ miniatura: "1", usuario: actor.userId, perfil: actor.profile,
    atuacao: actor.engineeringScope ?? "", administrativo: actor.administrativeScope ?? "" });
  return `${originalUrl}?${query}`;
}
