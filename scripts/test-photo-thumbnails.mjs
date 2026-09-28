import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createPrivatePhotoResponder, resizePhotoThumbnail } from "../src/lib/photos/thumbnails.ts";
import { auditPhotoThumbnailUrl, followUpPhotoThumbnailUrl } from "../src/lib/photos/urls.ts";

const request = (thumbnail = true) => new Request(`https://offline.invalid/photo${thumbnail ? "?miniatura=1" : ""}`);
const original = new Blob([await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#345d8a" } })
  .png().toBuffer()], { type: "image/png" });
const source = (key, download = async () => original) => ({ key, mimeType: "image/png", download });

test("real thumbnail is bounded WebP, much smaller, and leaves original bytes intact", async () => {
  const bytes = await resizePhotoThumbnail(original);
  const image = await sharp(bytes).metadata();
  assert.equal(image.format, "webp");
  assert.equal(image.width, 320);
  assert.equal(image.height, 213);
  assert.ok(bytes.length < original.size / 10, `${bytes.length} < ${original.size / 10}`);
  assert.equal((await sharp(await original.arrayBuffer()).metadata()).width, 2400);
  const small = new Blob([await sharp({ create: { width: 40, height: 20, channels: 3, background: "red" } }).jpeg().toBuffer()]);
  assert.equal((await sharp(await resizePhotoThumbnail(small)).metadata()).width, 40);
});

test("source size, malformed images and pixel bombs are rejected", async () => {
  await assert.rejects(() => resizePhotoThumbnail(new Blob([])));
  await assert.rejects(() => resizePhotoThumbnail(new Blob([new Uint8Array(16 * 1024 * 1024 + 1)])));
  await assert.rejects(() => resizePhotoThumbnail(new Blob(["not an image"])));
  const huge = new Blob([await sharp({ create: { width: 6500, height: 6500, channels: 3, background: "white" } }).png().toBuffer()]);
  await assert.rejects(() => resizePhotoThumbnail(huge), /pixel limit/);
});

test("authorization runs before every cache lookup; revocation cannot reveal a cached image", async () => {
  const respond = createPrivatePhotoResponder();
  let allowed = true, authorizations = 0, downloads = 0;
  const authorize = async () => { authorizations++; return allowed ? source("a", async () => { downloads++; return original; }) : null; };
  for (let i = 0; i < 2; i++) {
    const response = await respond(request(), authorize);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/webp");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("Vary"), "Cookie");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  }
  allowed = false;
  const denied = await respond(request(), authorize);
  assert.equal(denied.status, 404);
  assert.equal((await denied.arrayBuffer()).byteLength, 0);
  assert.equal(authorizations, 3);
  assert.equal(downloads, 1);
});

test("original requests bypass derivative cache and preserve exact original bytes and MIME", async () => {
  const respond = createPrivatePhotoResponder();
  let downloads = 0;
  const authorize = async () => source("original", async () => { downloads++; return original; });
  await respond(request(), authorize);
  const response = await respond(request(false), authorize);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.deepEqual(await response.arrayBuffer(), await original.arrayBuffer());
  assert.equal(downloads, 2);
});

test("cache evicts by bytes, entry count and expiry, reusing only fresh image bytes", async () => {
  let clock = 0, downloads = 0;
  const respond = createPrivatePhotoResponder({ maximumBytes: 6, maximumEntries: 2, ttlMs: 10, now: () => clock,
    resize: async () => new Uint8Array(3) });
  const read = (key) => respond(request(), async () => source(key, async () => { downloads++; return original; }));
  await read("a"); await read("b"); await read("a"); await read("c");
  assert.equal(downloads, 3);
  await read("b"); assert.equal(downloads, 4);
  clock = 11; await read("b"); assert.equal(downloads, 5);
  const large = createPrivatePhotoResponder({ maximumBytes: 2, resize: async () => new Uint8Array(3) });
  const authorize = async () => source("large", async () => { downloads++; return original; });
  await large(request(), authorize); await large(request(), authorize);
  assert.equal(downloads, 7, "Oversized entries are returned but never retained");
  const singleEntry = createPrivatePhotoResponder({ maximumBytes: 100, maximumEntries: 1, resize: async () => new Uint8Array(1) });
  for (const key of ["first", "second", "first"]) await singleEntry(request(), async () => source(key, async () => { downloads++; return original; }));
  assert.equal(downloads, 10, "Entry limit evicts even when byte capacity remains available");
});

test("duplicate requests authorize separately and share one bounded processing job", async () => {
  let releases = [], active = 0, maximum = 0, authorizations = 0, downloads = 0;
  const respond = createPrivatePhotoResponder({ concurrentJobs: 2, maximumPending: 3,
    resize: async () => { active++; maximum = Math.max(maximum, active);
      await new Promise((resolve) => releases.push(resolve)); active--; return new Uint8Array(3); } });
  const read = (key) => respond(request(), async () => { authorizations++; return source(key, async () => { downloads++; return original; }); });
  const a = read("a"), duplicate = read("a"), b = read("b"), queued = read("c");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await read("d")).status, 503);
  assert.equal(downloads, 2);
  assert.equal(maximum, 2);
  releases.splice(0).forEach((release) => release());
  await new Promise((resolve) => setImmediate(resolve));
  releases.splice(0).forEach((release) => release());
  assert.deepEqual((await Promise.all([a, duplicate, b, queued])).map((response) => response.status), [200, 200, 200, 200]);
  assert.equal(downloads, 3);
  assert.equal(authorizations, 5);
  assert.equal(maximum, 2);
});

test("failed authorization, download and resize are private errors and can be retried", async () => {
  let fails = true;
  const respond = createPrivatePhotoResponder({ resize: async () => { if (fails) throw new Error("decode"); return new Uint8Array(2); } });
  const badAccess = await respond(request(), async () => { throw new Error("Database unavailable"); });
  assert.equal(badAccess.status, 503);
  assert.equal(badAccess.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await respond(request(), async () => source("a", async () => null))).status, 503);
  assert.equal((await respond(request(), async () => source("a"))).status, 503);
  fails = false;
  assert.equal((await respond(request(), async () => source("a"))).status, 200);
});

test("thumbnail URLs keep exact profile identity and never change signed original references", () => {
  const auditId = "d1a70000-0000-4000-8000-000000000201";
  const reference = `https://storage.invalid/object/sign/published-audits/work/${auditId}/p01-01.png?token=secret`;
  const report = `/api/audits/${auditId}/report?usuario=u&perfil=ENGENHARIA&atuacao=COORDENACAO&administrativo=`;
  const result = auditPhotoThumbnailUrl(auditId, reference, report);
  assert.equal(result, `/api/audits/${auditId}/photos/p01-01.png?miniatura=1&usuario=u&perfil=ENGENHARIA&atuacao=COORDENACAO&administrativo=`);
  assert.equal(auditPhotoThumbnailUrl(auditId, "photo.jpg", report), undefined);
  assert.equal(auditPhotoThumbnailUrl(auditId, reference, "https://other.invalid/report"), undefined);
  assert.equal(auditPhotoThumbnailUrl("demo", reference, report), undefined);
  assert.ok(reference.endsWith("token=secret"));
  assert.equal(followUpPhotoThumbnailUrl("/app/acompanhamento/fotos/visit/photo.png", {
    userId: "u", profile: "AUDITOR_QUALIDADE", engineeringScope: null, administrativeScope: null,
  }), "/app/acompanhamento/fotos/visit/photo.png?miniatura=1&usuario=u&perfil=AUDITOR_QUALIDADE&atuacao=&administrativo=");
});
