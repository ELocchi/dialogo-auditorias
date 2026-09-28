import type { SupabaseClient } from "@supabase/supabase-js";
import { uuidPattern } from "../access/validation.ts";

export const followUpPhotoBucket = "follow-up-photos";
export const maxPhotosPerFinding = 1;
export const maxPhotoBytes = 3 * 1024 * 1024;
export type FindingPhoto = { visitId: string; findingId: string; fileName: string };

const filePattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png)$/i;

export function parsePhotoFileName(fileName: string): { findingId: string; mimeType: "image/jpeg" | "image/png" } | null {
  const match = filePattern.exec(fileName);
  return match ? { findingId: match[1].toLowerCase(), mimeType: match[3].toLowerCase() === "jpg" ? "image/jpeg" : "image/png" } : null;
}

export function photoPath(userId: string, visitId: string, fileName: string): string | null {
  return uuidPattern.test(userId) && uuidPattern.test(visitId) && parsePhotoFileName(fileName)
    ? `${userId.toLowerCase()}/${visitId.toLowerCase()}/${fileName}` : null;
}

export function detectPhotoType(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e
    && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export async function readVisitPhotos(client: Pick<SupabaseClient, "storage">, userId: string, visitId: string,
  options: { missingBucketIsEmpty?: boolean } = {}): Promise<FindingPhoto[] | null> {
  if (!uuidPattern.test(userId) || !uuidPattern.test(visitId)) return null;
  try {
    const { data, error } = await client.storage.from(followUpPhotoBucket)
      .list(`${userId.toLowerCase()}/${visitId.toLowerCase()}`, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    if (error && /bucket not found/i.test(error.message) && options.missingBucketIsEmpty !== false) return [];
    if (error || !data || data.length >= 1000) return null;
    return data.flatMap((file) => {
      const parsed = parsePhotoFileName(file.name);
      return parsed ? [{ visitId: visitId.toLowerCase(), findingId: parsed.findingId, fileName: file.name }] : [];
    });
  } catch { return null; }
}
