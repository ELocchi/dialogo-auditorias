import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemResponse } from "../../domain/audit-draft.ts";
import type { AuditModelId, AuditRecord } from "../../domain/operational-records.ts";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { isModel, isRecord, isUuid, parseCriteria, validText } from "../catalogs/validation.ts";
import { unavailablePublishedAudits, type PublishedAuditSnapshot } from "./contracts.ts";

export const publishedAuditBucket = "published-audits";

type Client = Pick<SupabaseClient, "rpc" | "storage">;

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

export async function readPublishedAuditSnapshot(client: Client, context: ProfileWorkspaceContext): Promise<PublishedAuditSnapshot> {
  try {
    const { data, error } = await client.rpc("read_published_audits", {
      p_profile: context.profile,
      p_engineering_scope: context.engineeringScope,
      p_administrative_scope: context.administrativeScope,
    });
    if (error || !Array.isArray(data) || data.length > 1_000) return unavailablePublishedAudits();
    const audits: AuditRecord[] = [];
    const responses: PublishedAuditSnapshot["responses"] = {};
    const criteriaSnapshots: NonNullable<PublishedAuditSnapshot["criteriaSnapshots"]> = {};
    const authorizedWorks = new Set(context.works.map((work) => work.id));
    for (const raw of data) {
      if (!isRecord(raw) || !isUuid(raw.id) || !isUuid(raw.workId) || !authorizedWorks.has(raw.workId)
        || !isModel(raw.modelId) || !validDate(raw.date) || !isUuid(raw.auditorId)
        || !validText(raw.auditor, 200) || !raw.auditor.trim()
        || typeof raw.finalScore !== "number" || !Number.isFinite(raw.finalScore) || raw.finalScore < 0 || raw.finalScore > 10
        || (raw.catalogRevisionId !== null && !isUuid(raw.catalogRevisionId))
        || !Number.isInteger(raw.catalogVersion) || Number(raw.catalogVersion) < 0
        || !validText(raw.catalogRevisionLabel, 80) || !Array.isArray(raw.evidenceFiles)
        || raw.evidenceFiles.some((name) => typeof name !== "string" || !/^p\d{2}-\d{2}\.png$/.test(name))
        || !validText(raw.reportFileName, 180)) return unavailablePublishedAudits();
      const criteria = parseCriteria(raw.criteria);
      if (!criteria || (context.profile === "ENGENHARIA" && criteria.some((entry) => entry.documentedWeight !== null
        || entry.configuredWeight !== undefined || entry.weightConfigurationId !== undefined))) return unavailablePublishedAudits();
      const parsedResponses = parseResponses(raw.responses, criteria.map((criterion) => criterion.id));
      if (!parsedResponses || (context.profile === "ENGENHARIA" && Object.values(parsedResponses)
        .some((response) => response.checks?.some((check) => check.weight !== undefined)))) return unavailablePublishedAudits();
      const evidencePaths = raw.evidenceFiles.map((name) => `${raw.workId}/${raw.id}/${name}`);
      const reportPath = `${raw.workId}/${raw.id}/${raw.reportFileName}`;
      const { data: signed, error: signedError } = await client.storage.from(publishedAuditBucket)
        .createSignedUrls([...evidencePaths, reportPath], 60 * 60);
      if (signedError || !signed || signed.length !== evidencePaths.length + 1 || signed.some((entry) => !entry.signedUrl))
        return unavailablePublishedAudits();
      const signedUrls = signed.map((entry) => entry.signedUrl);
      if (signedUrls.some((url): url is null => url === null)) return unavailablePublishedAudits();
      const confirmedUrls = signedUrls as string[];
      const evidenceUrls = new Map<string, string>(raw.evidenceFiles.map((name, index) => [name, confirmedUrls[index]!]));
      const modelId = raw.modelId as AuditModelId;
      audits.push({
        id: raw.id, workId: raw.workId, modelId, date: raw.date, auditor: raw.auditor,
        auditorId: raw.auditorId, status: "Publicada", collectionStatus: "Coleta concluída",
        calculationStatus: "Disponível", finalScore: raw.finalScore, isDemo: false,
        catalogRevisionId: raw.catalogRevisionId, catalogVersion: Number(raw.catalogVersion),
        catalogRevisionLabel: raw.catalogRevisionLabel,
        reportUrl: confirmedUrls[confirmedUrls.length - 1],
      });
      responses[raw.id] = { [modelId]: replaceEvidenceReferences(parsedResponses, evidenceUrls) };
      criteriaSnapshots[raw.id] = criteria;
    }
    return { available: true, audits, responses, criteriaSnapshots };
  } catch {
    return unavailablePublishedAudits();
  }
}
