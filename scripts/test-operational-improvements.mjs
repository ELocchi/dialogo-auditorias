import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { calculateQualityGroupScore, nextDraftCheckId, nextDraftCheckNumber } from "../src/domain/audit-draft.ts";
import { criteriaForModel } from "../src/domain/prototype-audits.ts";
import { qualityGroupResultLabel, qualityItemResultLabel } from "../src/lib/pdf/audit-format.ts";
import {
  draftContentKey,
  readDeviceAuditDraft,
  readDeviceAuditPosition,
  reconcileDeviceAuditDraft,
  recoverDeviceAuditDraft,
  writeDeviceAuditDraft,
  writeDeviceAuditPosition,
} from "../src/lib/audits/device-draft.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const actorId = "00000000-0000-4000-8000-000000000101";
const auditId = "00000000-0000-4000-8000-000000000201";
const workId = "00000000-0000-4000-8000-000000000301";
const modelId = "quality-f175";

test("rascunho do dispositivo recupera respostas, observações e verificações somente no contexto exato", () => {
  const storage = new MemoryStorage();
  const responses = { [modelId]: { item: {
    answer: "Não conforme", note: "Regularizar armazenamento.",
    checks: [{ id: "check-1", label: "Setor A", compliant: false, note: "Material sem identificação", photos: ["camera.jpg"] }],
  } } };
  const snapshot = { version: 1, actorId, auditId, workId, modelId, serverRevision: 3,
    updatedAt: new Date().toISOString(), contentKey: draftContentKey(responses), responses };
  assert.equal(writeDeviceAuditDraft(storage, snapshot), true);
  const loaded = readDeviceAuditDraft(storage, actorId, auditId);
  assert.deepEqual(loaded?.responses, responses);
  assert.equal(recoverDeviceAuditDraft({ actorId, auditId, workId, modelId, revision: 3 }, loaded)?.contentKey, snapshot.contentKey);
  assert.equal(recoverDeviceAuditDraft({ actorId: "outro", auditId, workId, modelId, revision: 3 }, loaded), null);
  assert.equal(recoverDeviceAuditDraft({ actorId, auditId, workId: "outra-obra", modelId, revision: 3 }, loaded), null);
  assert.equal(recoverDeviceAuditDraft({ actorId, auditId, workId, modelId: "quality-f176", revision: 3 }, loaded), null);
  assert.equal(recoverDeviceAuditDraft({ actorId, auditId, workId, modelId, revision: 4 }, loaded), null,
    "uma revisão local antiga nunca substitui a confirmação mais nova do servidor");
});

test("posição do quesito é preservada por usuário e auditoria", () => {
  const storage = new MemoryStorage();
  assert.equal(readDeviceAuditPosition(storage, actorId, auditId), null);
  writeDeviceAuditPosition(storage, actorId, auditId, 7);
  assert.equal(readDeviceAuditPosition(storage, actorId, auditId), 7);
  assert.equal(readDeviceAuditPosition(storage, "outro", auditId), null);
});

function criterion(id, group, weight, verificationRule = "Conforme/Não Conforme") {
  return { id, code: id, title: id, text: id, group, subgroup: "", source: "F.175", locator: id,
    documentedWeight: weight, orientations: [], verificationRule };
}

test("remoção e nova inclusão nunca reutilizam o identificador de uma verificação existente", () => {
  const criterionId = "F175-F175-Q01";
  const checks = [{ id: `${criterionId}-1` }, { id: `${criterionId}-3` }];
  assert.equal(nextDraftCheckNumber(criterionId, checks), 2);
  assert.equal(nextDraftCheckId(criterionId, checks), `${criterionId}-2`);
  checks.push({ id: `${criterionId}-2` });
  assert.equal(nextDraftCheckId(criterionId, checks), `${criterionId}-4`);
});

test("rascunho mais recente do celular prevalece, é reparado e preserva campos existentes no servidor", () => {
  const quantitative = criterion("F175-F175-Q01", "1. Materiais", .5, "Dividido pela quantidade verificada");
  const qualitative = criterion("F175-F175-Q02", "1. Materiais", .5);
  const serverResponses = { [modelId]: {
    [quantitative.id]: { note: "Servidor", checks: [{ id: "server-1", label: "Servidor", compliant: true }] },
    [qualitative.id]: { answer: "Conforme", note: "Resposta do servidor" },
  } };
  const localResponses = { [modelId]: {
    [quantitative.id]: { note: "Celular", checks: [
      { id: "duplicado", label: "Primeiro", compliant: true },
      { id: "duplicado", label: "Segundo", compliant: false, note: "Corrigir", photos: ["foto-local"] },
    ] },
    [qualitative.id]: { answer: "Não conforme" },
    desconhecido: { answer: "Conforme", note: "Não pertence ao roteiro" },
  } };
  const local = { version: 1, actorId, auditId, workId, modelId, serverRevision: 2,
    updatedAt: new Date().toISOString(), contentKey: draftContentKey(localResponses), responses: localResponses };
  const result = reconcileDeviceAuditDraft({ actorId, auditId, workId, modelId, revision: 4,
    responses: serverResponses, criteria: [quantitative, qualitative] }, local);
  assert.ok(result?.repaired);
  assert.equal(result.draft.serverRevision, 4);
  assert.equal(result.draft.responses[modelId][quantitative.id].note, "Celular");
  assert.equal(new Set(result.draft.responses[modelId][quantitative.id].checks.map((check) => check.id)).size, 2);
  assert.equal(result.draft.responses[modelId][quantitative.id].checks[1].note, "Corrigir");
  assert.equal(result.draft.responses[modelId][qualitative.id].answer, "Não conforme");
  assert.equal(result.draft.responses[modelId][qualitative.id].note, "Resposta do servidor");
  assert.equal(result.draft.responses[modelId].desconhecido, undefined);
});

test("Qualidade distingue nota normalizada do grupo e contribuição ponderada dos quesitos", () => {
  const criteria = [
    criterion("01.01", "1. Armazenamento de Materiais", .5),
    criterion("01.02", "1. Armazenamento de Materiais", .5),
    criterion("01.03", "1. Armazenamento de Materiais", .5),
    criterion("01.04", "1. Armazenamento de Materiais", 1.5, "Dividido pela quantidade verificada"),
  ];
  const responses = { [modelId]: {
    "01.01": { answer: "Conforme", note: "" }, "01.02": { answer: "Conforme", note: "" },
    "01.03": { answer: "Conforme", note: "" }, "01.04": { note: "", checks: [
      { id: "a", label: "A", compliant: true, weight: 41 },
      { id: "b", label: "B", compliant: false, weight: 34 },
    ] },
  } };
  const score = calculateQualityGroupScore(criteria, responses, modelId);
  assert.equal(qualityGroupResultLabel(score), "7,7 / 10");
  assert.equal(qualityItemResultLabel(criteria[0], responses[modelId]["01.01"]), "0,50 / 0,50");
  assert.equal(qualityItemResultLabel(criteria[3], responses[modelId]["01.04"]), "0,82 / 1,50");
});

test("grupos de F.175 e F.176 usam a mesma escala de apresentação sem mudar os pesos", () => {
  for (const currentModel of ["quality-f175", "quality-f176"]) {
    const criteria = criteriaForModel(currentModel);
    const responses = { [currentModel]: Object.fromEntries(criteria.map((item) => [item.id,
      item.verificationRule === "Dividido pela quantidade verificada"
        ? { note: "", checks: [{ id: `${item.id}-1`, label: "Verificação", compliant: true, weight: 1 }] }
        : { answer: "Conforme", note: "" }])) };
    const groups = Map.groupBy(criteria, (item) => item.group);
    assert.ok(criteria.length > 0);
    for (const items of groups.values()) assert.equal(qualityGroupResultLabel(calculateQualityGroupScore(items, responses, currentModel)), "10,0 / 10");
  }
});

test("captura e seleção de arquivo usam entradas nativas separadas e mantêm o mesmo processamento", async () => {
  const source = await readFile(new URL("../src/app/components/audit-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, />Tirar foto<\/button>/);
  assert.match(source, />Selecionar arquivo<\/button>/);
  assert.match(source, /capture="environment"/);
  assert.equal((source.match(/onChange=\{receivePhotos\}/g) ?? []).length, 2);
});
