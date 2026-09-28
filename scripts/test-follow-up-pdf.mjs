import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { PDFDocument, PDFArray, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createFollowUpPdfPhotoPipeline, resizeFollowUpPdfPhoto } from "../src/lib/follow-up/pdf-photos.ts";
import { createFollowUpReportPdf } from "../src/lib/follow-up/report-pdf.ts";

const id = (n) => `d1f90000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const solid = async (color, width = 80, height = 40) => new Blob([
  await sharp({ create: { width, height, channels: 3, background: color } }).jpeg().toBuffer(),
]);
const small = await solid("#20446a");
const source = (findingId, blob = small) => ({ findingId, download: async () => blob });
const consume = async (photos, ids = [id(1)]) => {
  const result = [];
  for (const findingId of ids) for await (const photo of photos(findingId)) result.push(photo);
  return result;
};
const report = {
  id: id(90), visitId: id(91), title: "Relatório com evidências", revision: 1, updatedAt: "2026-09-28T10:00:00Z",
  participants: Array.from({ length: 42 }, (_, n) => `PARTICIPANTE_${String(n).padStart(2, "0")}`).join("\n"),
  subjects: Array.from({ length: 65 }, (_, n) => `ASSUNTO_${String(n).padStart(2, "0")}`).join("\n"),
  decisions: Array.from({ length: 43 }, (_, n) => `DECISAO_${String(n).padStart(2, "0")}`).join("\n"),
  findings: [1, 2, 3].map((n) => ({ id: id(n), location: `LOCAL_${n}`, description: `DESCRICAO_${n}`, correction: `CORRECAO_${n}` })),
};
const details = { report, workName: "Obra teste", visitDate: "2026-09-28", auditorName: "Auditor teste" };

async function inspectPdf(bytes) {
  const pdf = await PDFDocument.load(bytes);
  let text = "";
  const drawnPhotos = [];
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? Array.from({ length: contents.size() }, (_, i) => contents.lookup(i)) : [contents];
    const commands = streams.filter((stream) => stream instanceof PDFRawStream)
      .map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1")).join("\n");
    for (const match of commands.matchAll(/<([0-9a-f]+)>\s*Tj/gi))
      text += new TextDecoder("windows-1252").decode(Buffer.from(match[1], "hex")) + "\n";
    const images = page.node.Resources()?.lookup(PDFName.of("XObject"));
    for (const match of commands.matchAll(/\/(Image-[\w-]+)\s+Do/g)) {
      const stream = images?.lookup(PDFName.of(match[1]));
      if (stream instanceof PDFRawStream && stream.dict.get(PDFName.of("Filter"))?.toString() === "/DCTDecode")
        drawnPhotos.push({ width: Number(stream.dict.get(PDFName.of("Width"))?.toString()),
          height: Number(stream.dict.get(PDFName.of("Height"))?.toString()), bytes: stream.contents });
    }
  }
  return { pdf, text, drawnPhotos };
}

test("real PDF derivatives preserve orientation, aspect ratio, alpha and original bytes", async () => {
  const original = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#ad3e28" } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const resized = await resizeFollowUpPdfPhoto(new Blob([original]));
  const metadata = await sharp(resized).metadata();
  assert.equal(metadata.format, "jpeg"); assert.equal(metadata.width, 800); assert.equal(metadata.height, 1600);
  assert.equal(metadata.orientation, undefined);
  const originalMetadata = await sharp(original).metadata();
  assert.equal(originalMetadata.width, 2400); assert.equal(originalMetadata.orientation, 6);
  const alpha = await sharp({ create: { width: 30, height: 20, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const opaque = await resizeFollowUpPdfPhoto(new Blob([alpha]));
  const { data, info } = await sharp(opaque).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 30); assert.equal(info.height, 20); assert.equal(info.channels, 3);
  assert.deepEqual([...data.subarray(0, 3)], [255, 255, 255]);
});

test("real images reduce PDF bytes while retaining every text section, image and ordering", async (t) => {
  const width = 2400, height = 1600, pixels = Buffer.alloc(width * height * 3);
  let state = 19;
  for (let i = 0; i < pixels.length; i++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; pixels[i] = state >>> 24; }
  const original = await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
  const sources = [source(id(2), await solid("green")), source(id(1), new Blob([original])),
    source(id(3), await solid("blue")), source(id(1), await solid("red"))];
  const derivatives = [];
  const run = createFollowUpPdfPhotoPipeline({ resize: async (blob) => {
    const bytes = await resizeFollowUpPdfPhoto(blob); derivatives.push(bytes); return bytes;
  } });
  const optimized = await run(sources, (photosForFinding) => createFollowUpReportPdf({ ...details, photosForFinding }));
  const originals = await Promise.all(sources.map(async (item) => ({ findingId: item.findingId,
    mimeType: "image/jpeg", bytes: new Uint8Array(await (await item.download()).arrayBuffer()) })));
  const baseline = await createFollowUpReportPdf({ ...details, photos: originals });
  const result = await inspectPdf(optimized);
  const before = await inspectPdf(baseline);
  assert.ok(optimized.length < baseline.length / 2, `${optimized.length} vs ${baseline.length}`);
  assert.ok(result.pdf.getPageCount() >= 6, "Long sections continue on additional pages");
  assert.equal(result.pdf.getPageCount(), before.pdf.getPageCount());
  assert.equal(result.drawnPhotos.length, 4);
  result.drawnPhotos.forEach((photo, index) => {
    assert.deepEqual(photo.bytes, derivatives[index], "Finding order, then original photo order, is preserved");
    assert.ok(photo.width <= 1600 && photo.height <= 1600);
  });
  for (const [prefix, count] of [["PARTICIPANTE", 42], ["ASSUNTO", 65], ["DECISAO", 43]])
    for (let i = 0; i < count; i++) assert.ok(result.text.includes(`${prefix}_${String(i).padStart(2, "0")}`));
  for (const finding of report.findings) for (const key of ["description", "location", "correction"])
    assert.ok(result.text.includes(finding[key]));
  assert.ok(result.text.indexOf("DESCRICAO_1") < result.text.indexOf("DESCRICAO_2"));
  assert.ok(result.text.indexOf("DESCRICAO_2") < result.text.indexOf("DESCRICAO_3"));
  assert.equal((result.text.match(/Foto 1/g) ?? []).length, 3);
  assert.equal((result.text.match(/Foto 2/g) ?? []).length, 1);
  t.diagnostic(`PDF fixture: ${baseline.length} → ${optimized.length} bytes; ${result.pdf.getPageCount()} pages; 4 ordered photos.`);
});

test("global admission bounds concurrent downloads, resize, complete documents and queue", async () => {
  let active = 0, maximum = 0, downloads = 0;
  const releases = [];
  const run = createFollowUpPdfPhotoPipeline({ concurrentReports: 2, maximumPending: 1,
    resize: async () => { active++; maximum = Math.max(maximum, active);
      await new Promise((resolve) => releases.push(resolve)); active--; return new Uint8Array([1]); } });
  const sources = [1, 2].map(() => ({ findingId: id(1), download: async () => { downloads++; return small; } }));
  const first = run(sources, consume), second = run(sources, consume), queued = run(sources, consume);
  await tick(); assert.equal(downloads, 2); assert.equal(maximum, 2);
  await assert.rejects(run(sources, consume), /busy/);
  while (downloads < 6 || releases.length) { releases.splice(0).forEach((release) => release()); await tick(); }
  const output = await Promise.all([first, second, queued]);
  assert.deepEqual(output.map((items) => items.length), [2, 2, 2]); assert.equal(maximum, 2);
});

test("timeouts/cancellation reject promptly while retaining occupied slots until real work settles", async () => {
  let release, downloads = 0;
  const run = createFollowUpPdfPhotoPipeline({ concurrentReports: 1, maximumPending: 0, timeoutMs: 20,
    resize: async () => new Uint8Array([1]) });
  const pending = run([{ findingId: id(1), download: async (signal) => {
    downloads++; await new Promise((resolve) => { release = resolve; });
    assert.equal(signal.aborted, true); return small;
  } }], consume);
  await assert.rejects(pending, /timed out/);
  await assert.rejects(run([source(id(1))], consume), /busy/);
  assert.equal(downloads, 1); release(); await tick();
  assert.equal((await run([source(id(1))], consume)).length, 1);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(run([source(id(1))], consume, aborted.signal), /cancelled/);
});

test("a cancelled queued request starts no download and frees its queue position", async () => {
  let release, started = 0;
  const run = createFollowUpPdfPhotoPipeline({ concurrentReports: 1, maximumPending: 1,
    resize: async () => new Uint8Array([1]) });
  const first = run([{ findingId: id(1), download: async () => {
    await new Promise((resolve) => { release = resolve; }); return small;
  } }], consume);
  const controller = new AbortController();
  const queued = run([{ findingId: id(1), download: async () => { started++; return small; } }], consume, controller.signal);
  controller.abort(); await assert.rejects(queued, /cancelled/);
  const replacement = run([source(id(1))], consume);
  release(); await Promise.all([first, replacement]); assert.equal(started, 0);
});

test("bad images, missing downloads and exhausted byte budgets fail the complete PDF", async () => {
  for (const blob of [new Blob([]), new Blob([new Uint8Array(16 * 1024 * 1024 + 1)]),
    new Blob(["wrong"]), new Blob([new Uint8Array([255, 216, 255, 0, 0])]),
    new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])])])
    await assert.rejects(resizeFollowUpPdfPhoto(blob));
  const huge = await sharp({ create: { width: 6500, height: 6500, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(resizeFollowUpPdfPhoto(new Blob([huge])), /pixel limit/);
  const run = createFollowUpPdfPhotoPipeline();
  for (const blob of [null, new Blob(["broken JPEG"])])
    await assert.rejects(run([source(id(1), small), source(id(2), blob)],
      (photosForFinding) => createFollowUpReportPdf({ ...details, photosForFinding })));
  const bounded = createFollowUpPdfPhotoPipeline({ maximumPhotoBytes: 2, resize: async () => new Uint8Array(3) });
  await assert.rejects(bounded([source(id(1))], consume), /memory budget/);
  assert.equal((await run([source(id(1))], consume)).length, 1, "Failure does not retain a cache or leak a slot");
});
