import type { Criterion } from "../../domain/catalogs.ts";
import type { AuditDrafts, DraftAnswer, DraftCheck, ItemResponse } from "../../domain/audit-draft.ts";
import type { AuditModelId } from "../../domain/operational-records.ts";
import type { SafetyClosure } from "../../domain/safety-audit.ts";

const storagePrefix = "dialogo-auditorias:draft:v1";
const databaseName = "dialogo-auditorias-device-drafts-v1";
const photoStoreName = "photos";
const maxAgeMilliseconds = 30 * 24 * 60 * 60 * 1_000;

export type DeviceAuditDraft = {
  version: 1;
  actorId: string;
  auditId: string;
  workId: string;
  modelId: AuditModelId;
  serverRevision: number;
  updatedAt: string;
  contentKey: string;
  responses: AuditDrafts;
  safetyClosure?: SafetyClosure;
};

const key = (actorId: string, auditId: string) => `${storagePrefix}:${actorId}:${auditId}`;
const positionKey = (actorId: string, auditId: string) => `${key(actorId, auditId)}:position`;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function draftContentKey(responses: AuditDrafts, safetyClosure?: SafetyClosure): string {
  return JSON.stringify([responses, safetyClosure ?? null]);
}

export function readDeviceAuditDraft(storage: Pick<Storage, "getItem" | "removeItem">, actorId: string,
  auditId: string, now = Date.now()): DeviceAuditDraft | null {
  const storageKey = key(actorId, auditId);
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== 1 || value.actorId !== actorId || value.auditId !== auditId
      || typeof value.workId !== "string" || typeof value.modelId !== "string"
      || !Number.isInteger(value.serverRevision) || (value.serverRevision as number) < 0
      || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))
      || now - Date.parse(value.updatedAt) > maxAgeMilliseconds || !record(value.responses)
      || typeof value.contentKey !== "string") {
      storage.removeItem(storageKey);
      return null;
    }
    return value as DeviceAuditDraft;
  } catch {
    storage.removeItem(storageKey);
    return null;
  }
}

export function writeDeviceAuditDraft(storage: Pick<Storage, "setItem">, draft: DeviceAuditDraft): boolean {
  try { storage.setItem(key(draft.actorId, draft.auditId), JSON.stringify(draft)); return true; }
  catch { return false; }
}

export function clearDeviceAuditDraft(storage: Pick<Storage, "removeItem">, actorId: string, auditId: string) {
  storage.removeItem(key(actorId, auditId));
}

export function recoverDeviceAuditDraft(server: {
  actorId: string; auditId: string; workId: string; modelId: AuditModelId; revision: number;
}, local: DeviceAuditDraft | null): DeviceAuditDraft | null {
  return local && local.actorId === server.actorId && local.auditId === server.auditId
    && local.workId === server.workId && local.modelId === server.modelId
    && local.serverRevision === server.revision ? local : null;
}

const cleanText = (value: unknown, maximum: number, fallback = "") =>
  typeof value === "string" && value.length <= maximum && !value.includes("\0") ? value : fallback;

function cleanPhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string =>
    typeof entry === "string" && entry.length > 0 && entry.length <= 500 && !entry.includes("\0")))].slice(0, 12);
}

function cleanChecks(value: unknown, criterion: Criterion): DraftCheck[] {
  if (!Array.isArray(value)) return [];
  const used = new Set<string>();
  return value.slice(0, 150).flatMap((entry, position): DraftCheck[] => {
    if (!record(entry)) return [];
    let id = cleanText(entry.id, 200);
    if (!id || used.has(id)) {
      let suffix = position + 1;
      do { id = `${criterion.id}-recovered-${suffix++}`; } while (used.has(id));
    }
    used.add(id);
    const compliant = entry.compliant === true || entry.compliant === false ? entry.compliant : null;
    const weight = typeof entry.weight === "number" && Number.isFinite(entry.weight) && entry.weight > 0 ? entry.weight : null;
    return [{ id, label: cleanText(entry.label, 500), compliant,
      ...(typeof entry.note === "string" ? { note: cleanText(entry.note, 10_000) } : {}),
      ...(weight !== null ? { weight } : {}), photos: cleanPhotos(entry.photos) }];
  });
}

function cleanResponse(value: unknown, criterion: Criterion, modelId: AuditModelId): ItemResponse | null {
  if (!record(value)) return null;
  const quantitative = criterion.verificationRule === "Dividido pela quantidade verificada";
  const allowsNA = modelId === "security-it07-r02"
    || criterion.verificationRule === "Conforme/Não Conforme/Não Aplicável"
    || criterion.sourceNote?.toLocaleLowerCase("pt-BR").includes("não aplic") === true;
  const allowed = new Set<DraftAnswer>(modelId === "security-it07-r02"
    ? ["0", "5", "10", "N/A"] : ["Conforme", "Não conforme", ...(allowsNA ? ["N/A" as const] : [])]);
  const answer = typeof value.answer === "string" && allowed.has(value.answer as DraftAnswer)
    ? value.answer as DraftAnswer : undefined;
  return {
    note: cleanText(value.note, 10_000),
    serious: value.serious === true,
    photos: cleanPhotos(value.photos),
    ...(answer !== undefined && !quantitative ? { answer } : {}),
    ...(value.autoGroupNA === true && answer === "N/A" ? { autoGroupNA: true } : {}),
    ...(quantitative ? { checks: cleanChecks(value.checks, criterion) } : {}),
  };
}

export function reconcileDeviceAuditDraft(server: {
  actorId: string; auditId: string; workId: string; modelId: AuditModelId; revision: number;
  responses: AuditDrafts; criteria: readonly Criterion[]; safetyClosure?: SafetyClosure;
}, local: DeviceAuditDraft | null): { draft: DeviceAuditDraft; repaired: boolean } | null {
  if (!local || local.actorId !== server.actorId || local.auditId !== server.auditId
    || local.workId !== server.workId || local.modelId !== server.modelId) return null;
  const serverItems = record(server.responses[server.modelId]) ? server.responses[server.modelId] : {};
  const localItems = record(local.responses[server.modelId]) ? local.responses[server.modelId] : {};
  const mergedItems: Record<string, ItemResponse> = {};
  for (const criterion of server.criteria) {
    const localHasValue = Object.prototype.hasOwnProperty.call(localItems, criterion.id);
    const serverValue = record(serverItems[criterion.id]) ? serverItems[criterion.id] : {};
    const localValue = record(localItems[criterion.id]) ? localItems[criterion.id] : null;
    const preferredValue = localHasValue && localValue ? { ...serverValue, ...localValue } : serverValue;
    const preferred = cleanResponse(preferredValue, criterion, server.modelId);
    const fallback = cleanResponse(serverItems[criterion.id], criterion, server.modelId);
    if (preferred ?? fallback) mergedItems[criterion.id] = (preferred ?? fallback)!;
  }
  const responses: AuditDrafts = Object.keys(mergedItems).length ? { [server.modelId]: mergedItems } : {};
  const safetyClosure = local.safetyClosure ?? server.safetyClosure;
  const draft: DeviceAuditDraft = { ...local, serverRevision: server.revision, responses,
    contentKey: draftContentKey(responses, safetyClosure), ...(safetyClosure ? { safetyClosure } : {}) };
  return { draft, repaired: local.serverRevision !== server.revision
    || draft.contentKey !== local.contentKey || JSON.stringify(responses) !== JSON.stringify(local.responses) };
}

export function readDeviceAuditPosition(storage: Pick<Storage, "getItem">, actorId: string, auditId: string): number | null {
  const raw = storage.getItem(positionKey(actorId, auditId));
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function writeDeviceAuditPosition(storage: Pick<Storage, "setItem">, actorId: string, auditId: string, position: number) {
  if (Number.isInteger(position) && position >= 0) storage.setItem(positionKey(actorId, auditId), String(position));
}

export function clearDeviceAuditPosition(storage: Pick<Storage, "removeItem">, actorId: string, auditId: string) {
  storage.removeItem(positionKey(actorId, auditId));
}

type StoredPhoto = { key: string; actorId: string; auditId: string; reference: string; file: File; updatedAt: string };

function openPhotoDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(photoStoreName, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function photoKey(actorId: string, auditId: string, reference: string) {
  return `${actorId}\0${auditId}\0${reference}`;
}

export async function persistDeviceAuditPhotos(actorId: string, auditId: string,
  photos: readonly { reference: string; file: File }[]): Promise<boolean> {
  let database: IDBDatabase | null = null;
  try {
    database = await openPhotoDatabase();
    if (!database) return photos.length === 0;
    await new Promise<void>((resolve, reject) => {
      const transaction = database!.transaction(photoStoreName, "readwrite");
      const store = transaction.objectStore(photoStoreName);
      const keep = new Set(photos.map((photo) => photoKey(actorId, auditId, photo.reference)));
      const all = store.getAll();
      all.onsuccess = () => (all.result as StoredPhoto[]).filter((entry) => entry.actorId === actorId && entry.auditId === auditId && !keep.has(entry.key))
        .forEach((entry) => store.delete(entry.key));
      const updatedAt = new Date().toISOString();
      photos.forEach(({ reference, file }) => store.put({ key: photoKey(actorId, auditId, reference), actorId, auditId, reference, file, updatedAt } satisfies StoredPhoto));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return true;
  } catch { return false; }
  finally { database?.close(); }
}

export async function restoreDeviceAuditPhotos(actorId: string, auditId: string): Promise<Array<{ reference: string; file: File }>> {
  let database: IDBDatabase | null = null;
  try {
    database = await openPhotoDatabase();
    if (!database) return [];
    return await new Promise((resolve, reject) => {
      const transaction = database!.transaction(photoStoreName, "readonly");
      const request = transaction.objectStore(photoStoreName).getAll();
      request.onsuccess = () => resolve((request.result as StoredPhoto[])
        .filter((entry) => entry.actorId === actorId && entry.auditId === auditId && entry.file instanceof File)
        .map(({ reference, file }) => ({ reference, file })));
      request.onerror = () => reject(request.error);
    });
  } catch { return []; }
  finally { database?.close(); }
}

export async function clearDeviceAuditPhotos(actorId: string, auditId: string): Promise<void> {
  let database: IDBDatabase | null = null;
  try {
    database = await openPhotoDatabase();
    if (!database) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = database!.transaction(photoStoreName, "readwrite");
      const store = transaction.objectStore(photoStoreName);
      const request = store.getAll();
      request.onsuccess = () => (request.result as StoredPhoto[])
        .filter((entry) => entry.actorId === actorId && entry.auditId === auditId)
        .forEach((entry) => store.delete(entry.key));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch { /* The server copy remains authoritative when browser storage is unavailable. */ }
  finally { database?.close(); }
}
