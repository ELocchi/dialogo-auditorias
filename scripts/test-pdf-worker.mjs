import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Worker as NodeWorker } from "node:worker_threads";
import { PDFDocument, PDFName, PDFArray, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { createAuditReviewPdf } from "../src/lib/pdf/audit-report.ts";
import { generateActionPlanPdf } from "../src/lib/pdf/action-plan.ts";
import { generatePdf } from "../src/lib/pdf/client.ts";

globalThis.Worker = undefined;

const photoBytes = new Uint8Array(await readFile(new URL("../public/logo-relatorio-orientativo.png", import.meta.url)));
const photoUrl = "https://evidence.example/foto.png";
const assets = { logo: photoBytes, photos: { "foto.png": { bytes: photoBytes, mimeType: "image/png", url: photoUrl }, [photoUrl]: { bytes: photoBytes, mimeType: "image/png", url: photoUrl } } };
const criterion = {
  id: "item-1", code: "02.04", title: "Armazenamento dos Materiais", text: "Conferir materiais armazenados.",
  group: "02. Materiais", subgroup: "02.01 — Armazenamento", source: "F176", locator: "linha 1",
  documentedWeight: 1, orientations: [], verificationRule: "Conforme/Não Conforme",
};
const audit = {
  model: "Qualidade Completa", modelId: "quality-f176", workName: "Obra Teste", details: { date: "2026-09-28", auditor: "Equipe Teste" },
  criteria: [criterion], drafts: { "quality-f176": { "item-1": { answer: "Não conforme", note: "Regularizar materiais.", photos: ["foto.png"] } } },
};
const plan = {
  workName: "Obra Teste", auditDate: "2026-09-28", auditScore: 6.74, module: "quality", authorName: "Equipe Teste",
  rows: [{ id: "finding-1", item: "02.04", description: "Armazenamento", nonconformity: "Regularizar materiais.",
    status: "Não conforme", correctiveAction: "Organizar e identificar materiais.", responsible: "Almoxarifado",
    startDate: "2026-09-28", dueDate: "2026-09-30", evidencePhotos: [{ name: "foto.png", url: photoUrl }] }],
};

function pageText(document, page) {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((reference) => document.context.lookup(reference)) : [contents];
  return streams.filter((stream) => stream instanceof PDFRawStream).map((stream) => {
    const content = Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
    return [...content.matchAll(/<([0-9a-f]+)>\s*Tj/gi)].map((match) => Buffer.from(match[1], "hex").toString("latin1")).join(" ");
  }).join(" ");
}

function imageCount(page) {
  const xObjects = page.node.Resources()?.lookup(PDFName.of("XObject"));
  return xObjects?.entries().filter(([, reference]) => {
    const object = page.doc.context.lookup(reference);
    return object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image";
  }).length ?? 0;
}

function annotations(document) {
  return document.getPages().flatMap((page) => page.node.Annots()?.asArray().map((reference) => document.context.lookup(reference)) ?? []);
}

test("audit renderer preserves pages, evidence, summary destinations and observations", async () => {
  const bytes = await createAuditReviewPdf(audit, assets);
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getTitle(), "Relatório de Auditoria - Obra Teste");
  assert.equal(document.getPageCount(), 3);
  assert.deepEqual(document.getPage(0).getSize(), { width: 445.5, height: 631.5 });
  const text = document.getPages().map((page) => pageText(document, page)).join(" ");
  assert.match(text, /Obra Teste/);
  assert.match(text, /02\.04/);
  assert.match(text, /Regularizar materiais\./);
  assert.ok(imageCount(document.getPage(2)) >= 2, "detail page includes logo and evidence image");
  const links = annotations(document);
  assert.ok(links.some((link) => link.has(PDFName.of("Dest"))), "summary links point to detail pages");
  assert.ok(links.some((link) => link.lookup(PDFName.of("A"))?.get(PDFName.of("URI"))?.decodeText() === photoUrl));
});

test("security and quantitative reports render their response details without a DOM", async () => {
  const security = { ...audit, modelId: "security-it07-r02", model: "Segurança", drafts: { "security-it07-r02": { "item-1": { answer: "5", note: "Protecao parcial." } } } };
  const securityDoc = await PDFDocument.load(await createAuditReviewPdf(security, { logo: null, photos: {} }));
  assert.match(securityDoc.getPages().map((page) => pageText(securityDoc, page)).join(" "), /Protecao parcial\./);
  const quantitative = { ...audit, criteria: [{ ...criterion, verificationRule: "Dividido pela quantidade verificada" }], drafts: { "quality-f176": { "item-1": { answer: "Não conforme", note: "", checks: [{ id: "check-1", label: "Contramarco", compliant: false, note: "Sem protecao", photos: ["foto.png"] }] } } } };
  const quantitativeDoc = await PDFDocument.load(await createAuditReviewPdf(quantitative, assets));
  const text = quantitativeDoc.getPages().map((page) => pageText(quantitativeDoc, page)).join(" ");
  assert.match(text, /Contramarco/);
  assert.match(text, /Sem protecao/);
  assert.ok(imageCount(quantitativeDoc.getPage(2)) >= 2);
});

test("action plan preserves landscape layout, corrective actions, images and summary links", async () => {
  const document = await PDFDocument.load(await generateActionPlanPdf(plan, assets));
  assert.equal(document.getTitle(), "Plano de Ação - Obra Teste");
  assert.equal(document.getAuthor(), "Equipe Teste");
  assert.deepEqual(document.getPage(0).getSize(), { width: 631.5, height: 445.5 });
  assert.ok(document.getPageCount() >= 2);
  const text = document.getPages().map((page) => pageText(document, page)).join(" ");
  assert.match(text, /Organizar e identificar materiais\./);
  assert.match(text, /Almoxarifado/);
  assert.match(text, /6,74/);
  assert.ok(document.getPages().some((page) => imageCount(page) >= 2));
  assert.ok(annotations(document).length >= 2, "sumary and return links are preserved");
});

test("production worker fetches assets and transfers an actual PDF with no browser globals", async (t) => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.writeHead(200, { "content-type": "image/png" });
    response.end(photoBytes);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const worker = new NodeWorker(new URL("./fixtures/pdf-worker.mjs", import.meta.url));
  t.after(() => worker.terminate());
  const result = await new Promise((resolve, reject) => {
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.postMessage({ kind: "audit", input: audit, baseUrl, photos: [{ reference: "foto.png", name: "foto.png", url: `${baseUrl}/foto.png` }] });
  });
  assert.equal(result.error, undefined);
  const document = await PDFDocument.load(result.bytes);
  assert.equal(document.getPageCount(), 3);
  assert.ok(imageCount(document.getPage(2)) >= 2);
  assert.ok(requests.includes("/logo-relatorio-orientativo.png"));
  assert.ok(requests.includes("/foto.png"));
});

test("cancelling a preview terminates its worker and rejects the pending result", async (t) => {
  let terminated = false;
  class StubWorker { terminate() { terminated = true; } postMessage() {} }
  t.mock.property(globalThis, "Worker", StubWorker);
  const controller = new AbortController();
  const promise = generatePdf({ kind: "audit", input: audit, baseUrl: "https://example.test", photos: [] }, controller.signal);
  controller.abort();
  await assert.rejects(promise, { name: "AbortError" });
  assert.equal(terminated, true);
});

test("unsupported workers use a small text-only fallback and reject heavy previews", async (t) => {
  t.mock.property(globalThis, "Worker", undefined);
  const bytes = await generatePdf({ kind: "action-plan", input: plan, baseUrl: "https://example.test", photos: [] }, new AbortController().signal);
  assert.equal((await PDFDocument.load(bytes)).getTitle(), "Plano de Ação - Obra Teste");
  await assert.rejects(generatePdf({kind:"action-plan",input:plan,baseUrl:"https://example.test",photos:[{reference:photoUrl,name:"foto.png",url:photoUrl}]},new AbortController().signal),/processamento em segundo plano/);
});
