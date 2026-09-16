import type { Criterion } from "../../domain/catalogs.ts";
import { uuidPattern } from "../access/validation.ts";
import { bundledCatalog, catalogModelIds } from "./contracts.ts";
import type { AuditModelId } from "../../domain/operational-records.ts";

export const MAX_CRITERIA_BYTES = 4 * 1024 * 1024;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_WORD_BYTES = 2 * 1024 * 1024;
export const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const isUuid = (value: unknown): value is string => typeof value === "string" && uuidPattern.test(value);
export const validText = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max && !value.includes("\u0000");
export const isModel = (value: unknown): value is AuditModelId => catalogModelIds.includes(value as AuditModelId);
const weight = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000;

export function parseCriteria(value: unknown): Criterion[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 500 || Buffer.byteLength(JSON.stringify(value)) > MAX_CRITERIA_BYTES) return null;
  const required = { id: 200, code: 100, title: 2000, text: 30000, group: 2000, subgroup: 2000, source: 1000, locator: 2000 };
  const optional = ["verificationRule", "sourceNote", "interpretation", "weightConfigurationId"];
  const allowed = [...Object.keys(required), ...optional, "documentedWeight", "configuredWeight", "orientations"];
  for (const item of value) {
    if (!isRecord(item) || Object.keys(item).some((key) => !allowed.includes(key))
      || Object.entries(required).some(([key, max]) => !validText(item[key], max))
      || !String(item.id).trim() || !String(item.code).trim() || !String(item.text).trim()
      || (item.documentedWeight !== null && !weight(item.documentedWeight))
      || (item.configuredWeight !== undefined && !weight(item.configuredWeight))
      || ["title", "group", "source"].some((key) => !String(item[key]).trim())
      || (item.weightConfigurationId !== undefined && (!validText(item.weightConfigurationId, 200) || !item.weightConfigurationId.trim()))
      || optional.some((key) => item[key] !== undefined && !validText(item[key], 30000))
      || !Array.isArray(item.orientations) || item.orientations.length > 500) return null;
    for (const orientation of item.orientations) {
      if (!isRecord(orientation) || Object.keys(orientation).some((key) => !["id", "scope", "text", "pages", "highlighted", "groups"].includes(key))
        || !validText(orientation.id, 200) || !validText(orientation.scope, 2000) || !validText(orientation.text, 30000)
        || !orientation.id.trim() || !orientation.text.trim()
        || (orientation.groups !== undefined && (!Array.isArray(orientation.groups) || orientation.groups.length > 100 || orientation.groups.some((group) => !validText(group, 100))))
        || typeof orientation.highlighted !== "boolean" || !Array.isArray(orientation.pages) || orientation.pages.length > 100
        || orientation.pages.some((page) => !Number.isInteger(page) || page < 1 || page > 9999)) return null;
    }
  }
  if (new Set(value.map((item) => item.id)).size !== value.length || new Set(value.map((item) => item.code)).size !== value.length) return null;
  return structuredClone(value) as Criterion[];
}

/** Keep identities and documentary provenance while editing the supported fields.
 * Normalization depends on the request, not the latest revision, making retries stable. */
export function normalizeEditedCriteria(modelId: AuditModelId, value: unknown, requestId: string): Criterion[] | null {
  const edited = parseCriteria(value);
  const baseline = bundledCatalog(modelId).criteria;
  if (!edited || edited.length !== baseline.length) return null;
  const result: Criterion[] = [];
  for (let index = 0; index < baseline.length; index++) {
    const original = baseline[index];
    const item = edited[index];
    if (item.id !== original.id || item.code !== original.code || item.orientations.length !== original.orientations.length
      || item.orientations.some((entry, i) => entry.id !== original.orientations[i].id)) return null;
    const next = { ...original, text: item.text.trim(),
      orientations: original.orientations.map((entry, i) => ({ ...entry, text: item.orientations[i].text.trim() })) };
    for (const key of ["verificationRule", "sourceNote"] as const) {
      if (item[key] !== undefined) next[key] = item[key].trim();
    }
    delete next.configuredWeight;
    delete next.weightConfigurationId;
    if (item.configuredWeight !== undefined) {
      next.configuredWeight = item.configuredWeight;
      next.weightConfigurationId = item.configuredWeight === original.configuredWeight && original.weightConfigurationId ? original.weightConfigurationId : `manual:${requestId}`;
    }
    result.push(next);
  }
  return result;
}

function field(form: FormData, key: string): string | null {
  const entries = form.getAll(key);
  return entries.length === 1 && typeof entries[0] === "string" ? entries[0] : null;
}
export function parseRevisionForm(form: FormData) {
  const permitted = ["requestId", "actorId", "modelId", "expectedVersion", "revisionLabel", "changeNote", "criteria", "pdf", "original"];
  if ([...form.keys()].some((key) => !permitted.includes(key))) return null;
  const requestId = field(form, "requestId"), actorId = field(form, "actorId"), modelId = field(form, "modelId");
  const version = field(form, "expectedVersion"), label = field(form, "revisionLabel"), note = field(form, "changeNote"), raw = field(form, "criteria");
  if (!isUuid(requestId) || !isUuid(actorId) || !isModel(modelId) || !version || !/^\d{1,9}$/.test(version)
    || !validText(label, 80) || !label.trim() || !validText(note, 2000) || !note.trim()
    || !raw || Buffer.byteLength(raw) > MAX_CRITERIA_BYTES || form.getAll("pdf").length > 1 || form.getAll("original").length > 1) return null;
  try {
    const criteria = normalizeEditedCriteria(modelId, JSON.parse(raw), requestId.toLowerCase());
    if (!criteria) return null;
    return { requestId: requestId.toLowerCase(), actorId: actorId.toLowerCase(), modelId, expectedVersion: Number(version), label: label.trim(), note: note.trim(), criteria };
  } catch { return null; }
}

export async function parseUpload(value: FormDataEntryValue | null, kind: "pdf" | "original") {
  if (value === null) return null;
  if (typeof value === "string") throw new Error("Arquivo inválido.");
  if (!value.name && value.size === 0) return null;
  const maximum = kind === "pdf" ? MAX_PDF_BYTES : MAX_WORD_BYTES;
  const suffix = kind === "pdf" ? /\.pdf$/i : /\.docx$/i;
  if (!value.name || value.name.startsWith(".") || value.name !== value.name.trim() || value.name.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(value.name)
    || !suffix.test(value.name) || value.size < 5 || value.size > maximum) {
    throw new Error(kind === "pdf" ? "Selecione um PDF de até 5 MB." : "Selecione um Word (.docx) de até 2 MB.");
  }
  const bytes = Buffer.from(await value.arrayBuffer());
  if (kind === "pdf" ? bytes.subarray(0, 5).toString("ascii") !== "%PDF-" : !bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error("O conteúdo não corresponde ao formato do arquivo.");
  return { name: value.name, base64: bytes.toString("base64") };
}
