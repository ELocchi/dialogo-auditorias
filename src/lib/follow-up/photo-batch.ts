import { uuidPattern } from "../access/validation.ts";
import { parsePhotoFileName, type FindingPhoto } from "./photos.ts";

export const photoBatchSize = 50;
export type PhotoBatch = { available: true; visitIds: string[]; photos: FindingPhoto[] };
export function parsePhotoBatch(value: unknown, ids: string[]): PhotoBatch | null {
  const data = value as PhotoBatch;
  const expected = new Set(ids);
  if (!data || data.available !== true || !Array.isArray(data.visitIds) || data.visitIds.length !== expected.size
    || new Set(data.visitIds).size !== expected.size || data.visitIds.some(id => !expected.has(id))
    || !Array.isArray(data.photos) || data.photos.length > 5000) return null;
  const names = new Set<string>(), counts = new Map<string, number>();
  for (const p of data.photos) {
    if (!p || !expected.has(p.visitId) || typeof p.fileName !== "string"
      || parsePhotoFileName(p.fileName)?.findingId !== p.findingId || !uuidPattern.test(p.findingId)) return null;
    const key = `${p.visitId}/${p.fileName}`;
    const count = (counts.get(p.visitId) ?? 0) + 1;
    if (names.has(key) || count >= 1000) return null;
    counts.set(p.visitId, count); names.add(key);
  }
  return { available: true, visitIds: data.visitIds, photos: data.photos.map(({visitId,findingId,fileName}) => ({visitId,findingId,fileName})) };
}
