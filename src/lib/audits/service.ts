import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemResponse } from "../../domain/audit-draft.ts";
import type { AuditModelId, AuditRecord } from "../../domain/operational-records.ts";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { isModel, isRecord, isUuid, parseCriteria, validText } from "../catalogs/validation.ts";
import { unavailablePublishedAudits, type PublishedAuditFinding, type PublishedAuditSnapshot } from "./contracts.ts";

export const publishedAuditBucket = "published-audits";

type Client = Pick<SupabaseClient, "rpc" | "storage">;

type PublishedAuditIndexRow = {
  id: string;
  workId: string;
  modelId: AuditModelId;
  date: string;
  auditorId: string;
  auditor: string;
  finalScore: number;
  catalogRevisionId: string | null;
  catalogVersion: number;
  catalogRevisionLabel: string;
};

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T12:00:00.000Z`))
    && new Date(`${value}T12:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function parseResponses(value: unknown, criteriaIds: readonly string[]): Record<string, ItemResponse> | null {
  if (!isRecord(value) || Object.keys(value).length !== criteriaIds.length
    || Object.keys(value).some((id) => !criteriaIds.includes(id))) return null;
  for (const id of criteriaIds) {
    const response = value[id];
    if (!isRecord(response) || typeof response.note !== "string" || response.note.length > 30_000
      || (response.answer !== undefined && typeof response.answer !== "string")
      || (response.serious !== undefined && typeof response.serious !== "boolean")
      || (response.photos !== undefined && (!Array.isArray(response.photos)
        || response.photos.some((photo) => typeof photo !== "string" || photo.length > 1_000)))
      || (response.checks !== undefined && (!Array.isArray(response.checks) || response.checks.length > 500))) return null;
  }
  return structuredClone(value) as Record<string, ItemResponse>;
}

function replaceEvidenceReferences(value: Record<string, ItemResponse>, urls: Map<string, string>) {
  const replace = (references: string[] | undefined) => references?.map((reference) => urls.get(reference) ?? reference);
  return Object.fromEntries(Object.entries(value).map(([id, response]) => [id, {
    ...response,
    ...(response.photos ? { photos: replace(response.photos) } : {}),
    ...(response.checks ? { checks: response.checks.map((check) => ({
      ...check,
      ...(check.photos ? { photos: replace(check.photos) } : {}),
    })) } : {}),
  }]));
}

function parseAuditIndex(value: unknown, context: ProfileWorkspaceContext): PublishedAuditIndexRow[] | null {
  if (!Array.isArray(value)) return null;
  const authorizedWorks = new Set(context.works.map((work) => work.id.toLowerCase()));
  const parsed: PublishedAuditIndexRow[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const id = typeof raw.id === "string" ? raw.id.toLowerCase() : "";
    const workId = typeof raw.workId === "string" ? raw.workId.toLowerCase() : "";
    const auditorId = typeof raw.auditorId === "string" ? raw.auditorId.toLowerCase() : "";
    const finalScore = typeof raw.finalScore === "number" ? raw.finalScore
      : typeof raw.finalScore === "string" && /^\d+(?:\.\d+)?$/.test(raw.finalScore) ? Number(raw.finalScore) : Number.NaN;
    const catalogVersion = typeof raw.catalogVersion === "number" ? raw.catalogVersion
      : typeof raw.catalogVersion === "string" && /^\d+$/.test(raw.catalogVersion) ? Number(raw.catalogVersion) : Number.NaN;
    const catalogRevisionId = raw.catalogRevisionId === null ? null
      : typeof raw.catalogRevisionId === "string" ? raw.catalogRevisionId.toLowerCase() : "";
    if (!isUuid(id) || ids.has(id) || !isUuid(workId) || !authorizedWorks.has(workId)
      || !isModel(raw.modelId) || !validDate(raw.date) || !isUuid(raw.auditorId)
      || !validText(raw.auditor, 200) || !raw.auditor.trim()
      || !Number.isFinite(finalScore) || finalScore < 0 || finalScore > 10
      || (catalogRevisionId !== null && !isUuid(catalogRevisionId))
      || !Number.isInteger(catalogVersion) || catalogVersion < 0
      || !validText(raw.catalogRevisionLabel, 80) || !raw.catalogRevisionLabel.trim()) continue;
    const discipline = raw.modelId === "security-it07-r02" ? "safety" : "quality";
    if (!context.user.workModuleScopes?.some((scope) => scope.workId.toLowerCase() === workId && scope.module === discipline)) continue;
    ids.add(id);
    parsed.push({
      id, workId, modelId: raw.modelId, date: raw.date, auditorId,
      auditor: raw.auditor, finalScore, catalogRevisionId,
      catalogVersion, catalogRevisionLabel: raw.catalogRevisionLabel,
    });
  }
  return value.length > 0 && parsed.length === 0 ? null : parsed;
}

function profileParameters(context: ProfileWorkspaceContext) {
  return { p_profile: context.profile, p_engineering_scope: context.engineeringScope,
    p_administrative_scope: context.administrativeScope };
}

function reportLink(id: string, context: ProfileWorkspaceContext) {
  const query = new URLSearchParams({ usuario: context.user.id, perfil: context.profile,
    atuacao: context.engineeringScope ?? "", administrativo: context.administrativeScope ?? "" });
  return `/api/audits/${id}/report?${query}`;
}

function indexAudit(row: PublishedAuditIndexRow, context: ProfileWorkspaceContext): AuditRecord {
  return { ...row, status: "Publicada", collectionStatus: "Coleta concluída", calculationStatus: "Disponível",
    isDemo: false, reportUrl: reportLink(row.id, context) };
}

/** Validate a compact projection shared by overview and paged-history readers. */
export function parsePublishedAuditOverview(data: unknown, context: ProfileWorkspaceContext): PublishedAuditSnapshot {
  if (!isRecord(data) || !Array.isArray(data.findings)) return unavailablePublishedAudits();
  const index = parseAuditIndex(data.audits, context);
  if (!index) return unavailablePublishedAudits();
  const byId = new Map(index.map((row) => [row.id, row]));
  const findings: PublishedAuditFinding[] = [];
  const keys = new Set<string>();
  for (const raw of data.findings) {
    if (!isRecord(raw) || typeof raw.auditId !== "string") return unavailablePublishedAudits();
    const audit = byId.get(raw.auditId);
    if (!audit) continue;
    const discipline = audit.modelId === "security-it07-r02" ? "safety" : "quality";
    if (raw.workId !== audit.workId || raw.auditDate !== audit.date || raw.auditor !== audit.auditor
      || raw.modelId !== audit.modelId || raw.module !== discipline
      || !validText(raw.id, 500) || !raw.id || !validText(raw.item, 100)
      || !validText(raw.description, 30_000) || !validText(raw.criterionTitle, 30_000)
      || !validText(raw.nonconformity, 30_000) || typeof raw.serious !== "boolean"
      || (raw.subitem !== undefined && !validText(raw.subitem, 10_000))) return unavailablePublishedAudits();
    const key = `${audit.id}\0${raw.id}`;
    if (keys.has(key)) return unavailablePublishedAudits();
    keys.add(key);
    findings.push({ id: raw.id, auditId: audit.id, workId: audit.workId, auditDate: audit.date,
      auditor: audit.auditor, modelId: audit.modelId, module: discipline, item: raw.item, description: raw.description,
      criterionTitle: raw.criterionTitle, serious: raw.serious, nonconformity: raw.nonconformity,
      ...(typeof raw.subitem === "string" ? { subitem: raw.subitem } : {}) });
  }
  return { available: true, audits: index.map((row) => indexAudit(row, context)), responses: {}, criteriaSnapshots: {}, findings };
}

/** Initial dashboard data contains no responses, photos, full criteria or signed URLs. */
export async function readPublishedAuditOverview(client: Client, context: ProfileWorkspaceContext): Promise<PublishedAuditSnapshot> {
  try {
    const { data, error } = await client.rpc("read_published_audit_overview", profileParameters(context));
    return error ? unavailablePublishedAudits() : parsePublishedAuditOverview(data, context);
  } catch { return unavailablePublishedAudits(); }
}

/** Read just the requested immutable publication; evidence signing is deferred until this call. */
export async function readPublishedAuditDetail(client: Client, context: ProfileWorkspaceContext, auditId: string): Promise<PublishedAuditSnapshot> {
  if (!isUuid(auditId)) return unavailablePublishedAudits();
  try {
    const { data, error } = await client.rpc("read_published_audit_detail", { ...profileParameters(context), p_audit_id: auditId });
    if (error || !Array.isArray(data) || data.length > 1) return unavailablePublishedAudits();
    if (!data.length) return { available: true, audits: [], responses: {}, criteriaSnapshots: {} };
    const index = parseAuditIndex(data, context);
    const raw = data[0];
    const row = index?.[0];
    if (!row || row.id !== auditId.toLowerCase() || !isRecord(raw) || !indexRowMatchesDetail(row, raw)
      || !Array.isArray(raw.evidenceFiles) || raw.evidenceFiles.some((name) => typeof name !== "string" || !/^p\d{2}-\d{2}\.png$/.test(name)))
      return unavailablePublishedAudits();
    const criteria = parseCriteria(raw.criteria);
    if (!criteria || (context.profile === "ENGENHARIA" && criteria.some((entry) => entry.documentedWeight !== null
      || entry.configuredWeight !== undefined || entry.weightConfigurationId !== undefined))) return unavailablePublishedAudits();
    const responses = parseResponses(raw.responses, criteria.map((entry) => entry.id));
    if (!responses || (context.profile === "ENGENHARIA" && Object.values(responses)
      .some((response) => response.checks?.some((check) => check.weight !== undefined)))) return unavailablePublishedAudits();
    const urls = new Map<string, string>();
    if (raw.evidenceFiles.length) {
      const paths = raw.evidenceFiles.map((name) => `${row.workId}/${row.id}/${name}`);
      const signed = await client.storage.from(publishedAuditBucket).createSignedUrls(paths, 60 * 60);
      if (signed.error || !signed.data || signed.data.length !== paths.length || signed.data.some((entry) => !entry.signedUrl))
        return unavailablePublishedAudits();
      raw.evidenceFiles.forEach((name, position) => urls.set(name, signed.data![position]!.signedUrl!));
    }
    return { available: true, audits: [indexAudit(row, context)],
      responses: { [row.id]: { [row.modelId]: replaceEvidenceReferences(responses, urls) } }, criteriaSnapshots: { [row.id]: criteria } };
  } catch { return unavailablePublishedAudits(); }
}

export async function readPublishedAuditReport(client: Client, context: ProfileWorkspaceContext, auditId: string): Promise<{ available: boolean; url: string | null }> {
  if (!isUuid(auditId)) return { available: false, url: null };
  try {
    const { data, error } = await client.rpc("read_published_audit_report", { ...profileParameters(context), p_audit_id: auditId });
    if (error) return { available: false, url: null };
    if (data === null) return { available: true, url: null };
    if (!isRecord(data) || data.id !== auditId.toLowerCase() || !isUuid(data.workId) || !isModel(data.modelId)
      || !context.user.workModuleScopes?.some((scope) => scope.workId === data.workId
        && scope.module === (data.modelId === "security-it07-r02" ? "safety" : "quality"))
      || typeof data.reportFileName !== "string" || !/^[^/\\\x00-\x1f]{1,176}\.pdf$/i.test(data.reportFileName))
      return { available: false, url: null };
    const signed = await client.storage.from(publishedAuditBucket)
      .createSignedUrl(`${data.workId}/${data.id}/${data.reportFileName}`, 60 * 5);
    if (signed.error || !signed.data?.signedUrl) return { available: false, url: null };
    return { available: true, url: signed.data.signedUrl };
  } catch { return { available: false, url: null }; }
}

function indexRowMatchesDetail(index: PublishedAuditIndexRow, raw: Record<string, unknown>) {
  return raw.id === index.id && raw.workId === index.workId && raw.modelId === index.modelId
    && raw.date === index.date && raw.auditorId === index.auditorId && raw.auditor === index.auditor
    && raw.finalScore === index.finalScore && raw.catalogRevisionId === index.catalogRevisionId
    && raw.catalogVersion === index.catalogVersion && raw.catalogRevisionLabel === index.catalogRevisionLabel;
}

export async function readPublishedAuditSnapshot(client: Client, context: ProfileWorkspaceContext): Promise<PublishedAuditSnapshot> {
  try {
    const parameters = {
      p_profile: context.profile,
      p_engineering_scope: context.engineeringScope,
      p_administrative_scope: context.administrativeScope,
    };
    const safeRpc = async (name: "read_published_audit_index" | "read_published_audits") => {
      try {
        const result = await client.rpc(name, parameters);
        return { data: result.data as unknown, error: result.error as unknown };
      } catch {
        return { data: null, error: true as unknown };
      }
    };
    const [indexResult, detailResult] = await Promise.all([
      safeRpc("read_published_audit_index"), safeRpc("read_published_audits"),
    ]);
    const index = parseAuditIndex(indexResult.error ? detailResult.data : indexResult.data, context);
    if (!index) return unavailablePublishedAudits();
    const audits: AuditRecord[] = index.map((raw): AuditRecord => ({
      id: raw.id, workId: raw.workId, modelId: raw.modelId, date: raw.date, auditor: raw.auditor,
      auditorId: raw.auditorId, status: "Publicada", collectionStatus: "Coleta concluída",
      calculationStatus: "Disponível", finalScore: raw.finalScore, isDemo: false,
      catalogRevisionId: raw.catalogRevisionId, catalogVersion: raw.catalogVersion,
      catalogRevisionLabel: raw.catalogRevisionLabel,
    }));
    const responses: PublishedAuditSnapshot["responses"] = {};
    const criteriaSnapshots: NonNullable<PublishedAuditSnapshot["criteriaSnapshots"]> = {};
    const { data, error } = detailResult;
    if (error || !Array.isArray(data) || data.length > 1_000) return { available: true, audits, responses, criteriaSnapshots };
    const indexById = new Map(index.map((row) => [row.id, row]));
    const auditPositions = new Map(audits.map((audit, position) => [audit.id, position]));
    const detailedIds = new Set<string>();
    const prepared: Array<{
      auditId: string;
      indexed: PublishedAuditIndexRow;
      criteria: NonNullable<ReturnType<typeof parseCriteria>>;
      parsedResponses: Record<string, ItemResponse>;
      evidenceFiles: string[];
      evidencePaths: string[];
      reportPath: string;
    }> = [];
    for (const raw of data) {
      if (!isRecord(raw) || typeof raw.id !== "string" || detailedIds.has(raw.id)) continue;
      const indexed = indexById.get(raw.id);
      if (!indexed || !indexRowMatchesDetail(indexed, raw) || !Array.isArray(raw.evidenceFiles)
        || raw.evidenceFiles.some((name) => typeof name !== "string" || !/^p\d{2}-\d{2}\.png$/.test(name))
        || !validText(raw.reportFileName, 180)) continue;
      detailedIds.add(raw.id);
      const criteria = parseCriteria(raw.criteria);
      if (!criteria || (context.profile === "ENGENHARIA" && criteria.some((entry) => entry.documentedWeight !== null
        || entry.configuredWeight !== undefined || entry.weightConfigurationId !== undefined))) continue;
      const parsedResponses = parseResponses(raw.responses, criteria.map((criterion) => criterion.id));
      if (!parsedResponses || (context.profile === "ENGENHARIA" && Object.values(parsedResponses)
        .some((response) => response.checks?.some((check) => check.weight !== undefined)))) continue;
      const evidenceFiles = raw.evidenceFiles as string[];
      const evidencePaths = evidenceFiles.map((name) => `${raw.workId}/${raw.id}/${name}`);
      const reportPath = `${raw.workId}/${raw.id}/${raw.reportFileName}`;
      prepared.push({ auditId: raw.id, indexed, criteria, parsedResponses, evidenceFiles, evidencePaths, reportPath });
    }
    for (let offset = 0; offset < prepared.length; offset += 6) {
      const batch = await Promise.all(prepared.slice(offset, offset + 6).map(async (entry) => {
        const result = await client.storage.from(publishedAuditBucket)
          .createSignedUrls([...entry.evidencePaths, entry.reportPath], 60 * 60);
        return { entry, ...result };
      }));
      for (const { entry, data: signed, error: signedError } of batch) {
        if (signedError || !signed || signed.length !== entry.evidencePaths.length + 1 || signed.some((item) => !item.signedUrl))
          continue;
        const signedUrls = signed.map((item) => item.signedUrl);
        if (signedUrls.some((url): url is null => url === null)) continue;
        const confirmedUrls = signedUrls as string[];
        const evidenceUrls = new Map<string, string>(entry.evidenceFiles.map((name, index) => [name, confirmedUrls[index]!]));
        const auditPosition = auditPositions.get(entry.auditId)!;
        audits[auditPosition] = { ...audits[auditPosition]!, reportUrl: confirmedUrls[confirmedUrls.length - 1] };
        responses[entry.auditId] = { [entry.indexed.modelId]: replaceEvidenceReferences(entry.parsedResponses, evidenceUrls) };
        criteriaSnapshots[entry.auditId] = entry.criteria;
      }
    }
    return { available: true, audits, responses, criteriaSnapshots };
  } catch {
    return unavailablePublishedAudits();
  }
}
