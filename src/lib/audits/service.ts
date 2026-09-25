import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemResponse } from "../../domain/audit-draft.ts";
import type { AuditModelId, AuditRecord } from "../../domain/operational-records.ts";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { isModel, isRecord, isUuid, parseCriteria, validText } from "../catalogs/validation.ts";
import { unavailablePublishedAudits, type PublishedAuditSnapshot } from "./contracts.ts";

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
  if (!Array.isArray(value) || value.length > 1_000) return null;
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
    ids.add(id);
    parsed.push({
      id, workId, modelId: raw.modelId, date: raw.date, auditorId,
      auditor: raw.auditor, finalScore, catalogRevisionId,
      catalogVersion, catalogRevisionLabel: raw.catalogRevisionLabel,
    });
  }
  return value.length > 0 && parsed.length === 0 ? null : parsed;
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
    const detailedIds = new Set<string>();
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
      const evidencePaths = raw.evidenceFiles.map((name) => `${raw.workId}/${raw.id}/${name}`);
      const reportPath = `${raw.workId}/${raw.id}/${raw.reportFileName}`;
      const { data: signed, error: signedError } = await client.storage.from(publishedAuditBucket)
        .createSignedUrls([...evidencePaths, reportPath], 60 * 60);
      if (signedError || !signed || signed.length !== evidencePaths.length + 1 || signed.some((entry) => !entry.signedUrl))
        continue;
      const signedUrls = signed.map((entry) => entry.signedUrl);
      if (signedUrls.some((url): url is null => url === null)) continue;
      const confirmedUrls = signedUrls as string[];
      const evidenceUrls = new Map<string, string>(raw.evidenceFiles.map((name, index) => [name, confirmedUrls[index]!]));
      const auditPosition = audits.findIndex((audit) => audit.id === raw.id);
      audits[auditPosition] = { ...audits[auditPosition]!, reportUrl: confirmedUrls[confirmedUrls.length - 1] };
      responses[raw.id] = { [indexed.modelId]: replaceEvidenceReferences(parsedResponses, evidenceUrls) };
      criteriaSnapshots[raw.id] = criteria;
    }
    return { available: true, audits, responses, criteriaSnapshots };
  } catch {
    return unavailablePublishedAudits();
  }
}
