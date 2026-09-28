import assert from "node:assert/strict";
import { test } from "node:test";
import { indexFollowUpReports, mergeFollowUpFindings } from "../src/lib/follow-up/display.ts";

const finding = (id, description) => ({ id, description, location: "Local", correction: "Correção" });
const visits = [{ id: "v1", workId: "w1", date: "2026-09-25" }, { id: "v2", workId: "w2", date: "2026-09-24" }];
const works = new Map([["w1", { name: "Obra um" }], ["w2", { name: "Obra dois" }]]);

test("active findings preserve draft precedence, latest report text and per-visit completion", () => {
  const reports = [
    { visitId: "v1", updatedAt: "2026-09-26", findings: [finding("a", "Novo relatório"), finding("b", "Última orientação"), finding("c", "Concluído")] },
    { visitId: "v1", updatedAt: "2026-09-25", findings: [finding("a", "Antigo"), finding("b", "Anterior")] },
    { visitId: "v2", updatedAt: "2026-09-25", findings: [finding("c", "Ainda ativo na outra visita")] },
    { visitId: "hidden", updatedAt: "2026-09-25", findings: [finding("x", "Visita não listada")] },
  ];
  const before = structuredClone(reports);
  const indexed = indexFollowUpReports(reports);
  const drafts = new Map([["v1", { findings: [finding("a", "Rascunho atualizado"), finding("d", "Somente salvo")] }]]);
  const result = mergeFollowUpFindings(visits, drafts, indexed, ["v1:c", "unknown:c"], works);
  assert.deepEqual(result.map(({ id, description, source, visitId, workName, date }) =>
    ({ id, description, source, visitId, workName, date })), [
    { id: "a", description: "Rascunho atualizado", source: "report", visitId: "v1", workName: "Obra um", date: "2026-09-25" },
    { id: "d", description: "Somente salvo", source: "saved", visitId: "v1", workName: "Obra um", date: "2026-09-25" },
    { id: "b", description: "Última orientação", source: "report", visitId: "v1", workName: "Obra um", date: "2026-09-25" },
    { id: "c", description: "Ainda ativo na outra visita", source: "report", visitId: "v2", workName: "Obra dois", date: "2026-09-24" },
  ]);
  assert.deepEqual(reports, before, "display indexing never changes the saved reports");
});

test("same timestamp preserves source order and empty/completed lists do not create findings", () => {
  const indexed = indexFollowUpReports([
    { visitId: "v1", updatedAt: "2026-09-25", findings: [finding("a", "Primeiro")] },
    { visitId: "v1", updatedAt: "2026-09-25", findings: [finding("a", "Segundo")] },
  ]);
  const result = mergeFollowUpFindings(visits, new Map(), indexed, [], works);
  assert.equal(result.length, 1); assert.equal(result[0].description, "Segundo");
  assert.deepEqual(mergeFollowUpFindings(visits, new Map(), indexed, ["v1:a"], works), []);
  assert.deepEqual(mergeFollowUpFindings(visits, new Map(), new Map(), [], works), []);
});
