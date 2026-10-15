import type { AuditDrafts } from "../../domain/audit-draft.ts";
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
