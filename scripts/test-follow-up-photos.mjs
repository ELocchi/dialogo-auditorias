import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { detectPhotoType, parsePhotoFileName, photoPath, readVisitPhotos } from "../src/lib/follow-up/photos.ts";
import { createFollowUpReportPdf } from "../src/lib/follow-up/report-pdf.ts";

const userId = "d1a80000-0000-4000-8000-000000000001";
const visitId = "d1a80000-0000-4000-8000-000000000002";
const findingId = "d1a80000-0000-4000-8000-000000000003";
const photoId = "d1a80000-0000-4000-8000-000000000004";
const fileName = `${findingId}_${photoId}.png`;

test("photo names and file signatures are validated", () => {
  assert.deepEqual(parsePhotoFileName(fileName), { findingId, mimeType: "image/png" });
  assert.equal(photoPath(userId, visitId, fileName), `${userId}/${visitId}/${fileName}`);
  assert.equal(parsePhotoFileName("../photo.png"), null);
  assert.equal(photoPath("invalid", visitId, fileName), null);
  assert.equal(detectPhotoType(new Uint8Array(readFileSync("public/logo-relatorio-orientativo.png"))), "image/png");
  assert.equal(detectPhotoType(new Uint8Array([0, 1, 2])), null);
});

test("private photo listing keeps only valid names for the requested visit", async () => {
  let requestedPath = "";
  const client = { storage: { from: () => ({ list: async (path) => {
    requestedPath = path;
    return { data: [{ name: fileName }, { name: "unrelated.txt" }], error: null };
  } }) } };
  assert.deepEqual(await readVisitPhotos(client, userId, visitId), [{ visitId, findingId, fileName }]);
  assert.equal(requestedPath, `${userId}/${visitId}`);
});

test("PDF keeps cover sections and renders a photo on findings pages", async () => {
  const bytes = new Uint8Array(readFileSync("public/logo-relatorio-orientativo.png"));
  const report = { visitId, revision: 1, title: "Proteção de periferia", participants: "Emanuel Locchi", subjects: "Proteção de periferia",
    decisions: "Instalar guarda-corpo", updatedAt: "2026-09-18T12:00:00Z",
    findings: [{ id: findingId, location: "Lazer", description: "Proteção incompleta",
      correction: "Instalar proteção rígida" }] };
  const result = await createFollowUpReportPdf({ report, workName: "Landmark Santa Cruz",
    visitDate: "2026-09-18", auditorName: "Emanuel Locchi",
    photos: [{ findingId, mimeType: "image/png", bytes }] });
  const pdf = await PDFDocument.load(result);
  assert.equal(pdf.getPageCount(), 2);
  assert.match(pdf.getTitle(), /Landmark Santa Cruz/);
});
