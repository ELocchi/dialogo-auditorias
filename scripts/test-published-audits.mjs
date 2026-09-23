import assert from "node:assert/strict";
import test from "node:test";
import { readPublishedAuditSnapshot } from "../src/lib/audits/service.ts";

const workId = "6c735db0-abd6-4ed7-b66e-6c253ed8a880";
const auditId = "b1760000-2026-4923-8000-000000000001";
const userId = "13044e3f-e8d2-4b4b-9981-22a8de22c610";
const criterion = {
  id: "F176-Q01", code: "01.01", title: "Item", text: "Descrição", group: "1. Grupo", subgroup: "",
  source: "F176", locator: "linha 1", documentedWeight: null, orientations: [], verificationRule: "Conforme/Não Conforme",
};
const context = {
  profile: "ENGENHARIA", email: "engenharia@dialogo.com.br", engineeringScope: "EQUIPE_OBRA", administrativeScope: null,
  works: [{ id: workId, name: "BoulevarDiálogo", city: "São Paulo, SP", engineer: "Equipe", coordinator: "Coordenação", status: "Ativa", isDemo: false }],
  user: { id: userId, name: "Emanuel Locchi", role: "engineering", activity: "site-team", modules: ["quality"], workIds: [workId], agendaWorkIds: [workId], documentWorkIds: [], workModuleScopes: [{ workId, module: "quality" }] },
};

function client(data) {
  return {
    rpc: async () => ({ data, error: null }),
    storage: { from: () => ({ createSignedUrls: async (paths) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://storage.example/${path}` })), error: null,
    }) }) },
  };
}

test("loads a published audit and replaces private evidence names with signed URLs", async () => {
  const snapshot = await readPublishedAuditSnapshot(client([{
    id: auditId, workId, modelId: "quality-f176", date: "2026-09-23", auditorId: userId,
    auditor: "Emanuel Locchi", finalScore: 6.74, catalogRevisionId: null, catalogVersion: 1,
    catalogRevisionLabel: "F.176/00", criteria: [criterion],
    responses: { "F176-Q01": { answer: "Não conforme", note: "Pendência", photos: ["p04-01.png"] } },
    evidenceFiles: ["p04-01.png"], reportFileName: "relatorio-final.pdf",
  }]), context);
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.audits[0].finalScore, 6.74);
  assert.match(snapshot.audits[0].reportUrl, /relatorio-final\.pdf$/);
  assert.match(snapshot.responses[auditId]["quality-f176"]["F176-Q01"].photos[0], /p04-01\.png$/);
});

test("rejects a response snapshot that does not match the criterion snapshot", async () => {
  const snapshot = await readPublishedAuditSnapshot(client([{
    id: auditId, workId, modelId: "quality-f176", date: "2026-09-23", auditorId: userId,
    auditor: "Emanuel Locchi", finalScore: 6.74, catalogRevisionId: null, catalogVersion: 1,
    catalogRevisionLabel: "F.176/00", criteria: [criterion], responses: {},
    evidenceFiles: [], reportFileName: "relatorio-final.pdf",
  }]), context);
  assert.equal(snapshot.available, false);
  assert.deepEqual(snapshot.audits, []);
});
