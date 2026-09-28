import type { AuditRecord } from "../../domain/operational-records.ts";
import { modelModule } from "../../domain/prototype-access.ts";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { isModel, isRecord, isUuid, validText } from "../catalogs/validation.ts";
import type { PublishedAuditFinding, PublishedAuditSnapshot } from "./contracts.ts";

/** Session-only publications affect this viewer's preview, never persisted audit records. */
export function parseAuditDashboardOverlay(value: unknown, context: ProfileWorkspaceContext): PublishedAuditSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.audits) || value.audits.length > 50
    || !Array.isArray(value.findings) || value.findings.length > 10_000) return null;
  if (value.audits.length && !["AUDITOR_QUALIDADE", "AUDITOR_SEGURANCA"].includes(context.profile)) return null;
  const audits: AuditRecord[] = [];
  const byId = new Map<string, AuditRecord>();
  const works = new Set(context.works.map((work) => work.id));
  for (const raw of value.audits) {
    if (!isRecord(raw) || !isModel(raw.modelId)) return null;
    const discipline = modelModule(raw.modelId);
    if (!isUuid(raw.id) || raw.id !== raw.id.toLowerCase() || byId.has(raw.id)
      || !isUuid(raw.workId) || !works.has(raw.workId) || !context.user.modules.includes(discipline)
      || (context.profile === "AUDITOR_QUALIDADE" && discipline !== "quality")
      || (context.profile === "AUDITOR_SEGURANCA" && discipline !== "safety")
      || !context.user.workModuleScopes?.some((scope) => scope.workId === raw.workId && scope.module === discipline)
      || raw.auditorId !== context.user.id || raw.auditor !== context.user.name
      || raw.isDemo !== true || raw.status !== "Publicada"
      || typeof raw.finalScore !== "number" || !Number.isFinite(raw.finalScore) || raw.finalScore < 0 || raw.finalScore > 10
      || typeof raw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)
      || !Number.isFinite(Date.parse(`${raw.date}T12:00:00.000Z`))
      || new Date(`${raw.date}T12:00:00.000Z`).toISOString().slice(0, 10) !== raw.date) return null;
    const audit: AuditRecord = {
      id: raw.id, workId: raw.workId, modelId: raw.modelId, date: raw.date,
      auditorId: context.user.id, auditor: context.user.name,
      status: "Publicada", isDemo: true, finalScore: raw.finalScore,
      collectionStatus: "Coleta concluída", calculationStatus: "Disponível",
    };
    audits.push(audit);
    byId.set(audit.id, audit);
  }
  const keys = new Set<string>();
  const findings: PublishedAuditFinding[] = [];
  for (const raw of value.findings) {
    if (!isRecord(raw) || typeof raw.auditId !== "string") return null;
    const audit = byId.get(raw.auditId);
    if (!audit || raw.workId !== audit.workId || raw.modelId !== audit.modelId || raw.auditDate !== audit.date
      || raw.module !== modelModule(audit.modelId) || raw.auditor !== audit.auditor
      || !validText(raw.id, 500) || !raw.id || !validText(raw.item, 100)
      || !validText(raw.description, 30_000) || !validText(raw.criterionTitle, 30_000)
      || !validText(raw.nonconformity, 30_000) || typeof raw.serious !== "boolean"
      || (raw.subitem !== undefined && !validText(raw.subitem, 10_000))) return null;
    const key = `${audit.id}\0${raw.id}`;
    if (keys.has(key)) return null;
    keys.add(key);
    findings.push({
      id: raw.id, auditId: audit.id, workId: audit.workId, modelId: audit.modelId,
      module: modelModule(audit.modelId), auditDate: audit.date, auditor: audit.auditor,
      item: raw.item, description: raw.description, criterionTitle: raw.criterionTitle,
      nonconformity: raw.nonconformity, serious: raw.serious,
      ...(raw.subitem === undefined ? {} : { subitem: raw.subitem }),
    });
  }
  return { available: true, audits, findings, responses: {}, criteriaSnapshots: {} };
}
