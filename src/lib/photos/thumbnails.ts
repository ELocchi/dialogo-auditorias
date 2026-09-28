import sharp from "sharp";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const maximumSourceBytes = 16 * 1024 * 1024;

export type PrivatePhotoSource = {
  /** Immutable storage path; access is checked separately on every request. */
  key: string;
  mimeType: "image/png" | "image/jpeg";
  download: () => Promise<Blob | null>;
};

export async function resizePhotoThumbnail(source: Blob): Promise<Uint8Array> {
  if (!source.size || source.size > maximumSourceBytes) throw new Error("Invalid photo size");
  const bytes = await source.arrayBuffer();
  const signature = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 8));
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte);
  const jpeg = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  if (!png && !jpeg) throw new Error("Unsupported photo format");
  return new Uint8Array(await sharp(bytes, { limitInputPixels: 40_000_000, animated: false })
    .rotate().resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 76, effort: 3 }).timeout({ seconds: 8 }).toBuffer());
}

/** Only image bytes are reused. Authorization results never enter this cache. */
export function createPrivatePhotoResponder(options: {
  maximumBytes?: number; maximumEntries?: number; ttlMs?: number;
  concurrentJobs?: number; maximumPending?: number; now?: () => number;
  resize?: (source: Blob) => Promise<Uint8Array>;
} = {}) {
  const maximumBytes = options.maximumBytes ?? 8 * 1024 * 1024;
  const maximumEntries = options.maximumEntries ?? 256;
  const ttlMs = options.ttlMs ?? 5 * 60 * 1000;
  const concurrentJobs = options.concurrentJobs ?? 2;
  const maximumPending = options.maximumPending ?? 32;
  const now = options.now ?? Date.now;
  const resize = options.resize ?? resizePhotoThumbnail;
  const cache = new Map<string, { bytes: Uint8Array; expires: number }>();
  const pending = new Map<string, Promise<Uint8Array>>();
  const queue: Array<() => void> = [];
  let cacheBytes = 0;
  let active = 0;
  function remove(key: string) {
    const item = cache.get(key);
    if (item) { cacheBytes -= item.bytes.byteLength; cache.delete(key); }
  }
  async function thumbnail(source: PrivatePhotoSource): Promise<Uint8Array> {
    for (const [key, entry] of cache) if (entry.expires <= now()) remove(key);
    const cached = cache.get(source.key);
    if (cached) { cache.delete(source.key); cache.set(source.key, cached); return cached.bytes; }
    const current = pending.get(source.key);
    if (current) return current;
    if (pending.size >= maximumPending) throw new Error("Photo processing is busy");
    const job = (async () => {
      if (active >= concurrentJobs) await new Promise<void>((resolve) => queue.push(resolve));
      else active++;
      try {
        const original = await source.download();
        if (!original) throw new Error("Photo unavailable");
        const bytes = await resize(original);
        if (bytes.byteLength <= maximumBytes) {
          while (cache.size && (cacheBytes + bytes.byteLength > maximumBytes || cache.size >= maximumEntries)) remove(cache.keys().next().value!);
          cache.set(source.key, { bytes, expires: now() + ttlMs });
          cacheBytes += bytes.byteLength;
        }
        return bytes;
      } finally {
        const next = queue.shift();
        if (next) next(); else active--;
      }
    })();
    pending.set(source.key, job);
    try { return await job; } finally { pending.delete(source.key); }
  }
  return async function respond(request: Request, authorize: () => Promise<PrivatePhotoSource | null>): Promise<Response> {
    // This always executes, including hits in the completed and in-flight caches.
    try {
      const source = await authorize();
      if (!source) return new Response(null, { status: 404, headers });
      if (new URL(request.url).searchParams.get("miniatura") === "1") {
        const bytes = await thumbnail(source);
        return new Response(Uint8Array.from(bytes).buffer, { headers: { ...headers, "Content-Type": "image/webp" } });
      }
      const original = await source.download();
      if (!original) return new Response(null, { status: 404, headers });
      return new Response(original, { headers: { ...headers, "Content-Type": source.mimeType } });
    } catch { return new Response(null, { status: 503, headers }); }
  };
}

export const privatePhotoResponse = createPrivatePhotoResponder();
