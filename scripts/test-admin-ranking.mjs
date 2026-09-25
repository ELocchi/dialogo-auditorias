import assert from "node:assert/strict";
import test from "node:test";
import { getAnnualAdminRanking, getMonthlyAdminRanking } from "../src/domain/admin-ranking.ts";
import { getRecurringFindings } from "../src/domain/finding-recurrence.ts";

const result = (workId, month, score, overrides = {}) => ({
  workId, workName: workId, month, score, discipline: "safety", published: true, ...overrides,
});

test("o ranking anual usa a média dos meses publicados disponíveis, sem exigir doze notas", () => {
  const results = [
    result("Alameda", "2026-01", 8), result("Alameda", "2026-03", 10),
    result("Bosque", "2026-02", 9), result("Campo", "2026-04", 7),
    result("Alameda", "2025-12", 10), result("Campo", "2026-05", 10, { published: false }),
    result("Campo", "2026-06", 10, { discipline: "quality" }),
  ];
  assert.deepEqual(getAnnualAdminRanking(results, "2026", "safety"), [
    { workId: "Alameda", workName: "Alameda", score: 9, monthsCount: 2, position: 1 },
    { workId: "Bosque", workName: "Bosque", score: 9, monthsCount: 1, position: 1 },
    { workId: "Campo", workName: "Campo", score: 7, monthsCount: 1, position: 3 },
  ]);
  assert.deepEqual(getAnnualAdminRanking([...results].reverse(), "2026", "safety"), getAnnualAdminRanking(results, "2026", "safety"));
});

test("duplicatas idênticas contam uma vez e notas mensais conflitantes ficam fora da média", () => {
  const results = [
    result("Alameda", "2026-01", 8), result("Alameda", "2026-01", 8),
    result("Alameda", "2026-02", 9), result("Alameda", "2026-02", 7),
    result("Alameda", "2026-03", 10),
  ];
  assert.deepEqual(getAnnualAdminRanking(results, "2026", "safety"), [
    { workId: "Alameda", workName: "Alameda", score: 9, monthsCount: 2, position: 1 },
  ]);
  assert.deepEqual(getMonthlyAdminRanking(results, "2026-02", "safety"), []);
  assert.deepEqual(getMonthlyAdminRanking(results, "2026-03", "safety"), [
    { workId: "Alameda", workName: "Alameda", score: 10, monthsCount: 1, position: 1 },
  ]);
});

test("notas inválidas, rascunhos e referências fora do formato não geram classificação", () => {
  const results = [
    result("A", "2026-01", -1), result("B", "2026-02", 11),
    result("C", "2026-03", Number.NaN), result("D", "2026-04", 8, { published: false }),
    result("E", "2026-13", 8), result("F", "2026-05", 8, { workName: "" }),
  ];
  assert.deepEqual(getAnnualAdminRanking(results, "2026", "safety"), []);
  assert.deepEqual(getAnnualAdminRanking([result("G", "2026-01", 8)], "20xx", "safety"), []);
  assert.deepEqual(getMonthlyAdminRanking([result("G", "2026-01", 8)], "2026-13", "safety"), []);
});

const finding = (auditId, workId, item, auditDate, overrides = {}) => ({
  auditId, workId, item, auditDate, module: "quality", modelId: "quality-f176",
  description: `Item ${item}`, criterionTitle: `Item ${item}`,
  nonconformity: `Apontamento do item ${item}.`, ...overrides,
});

test("recorrência conta no máximo uma vez por auditoria e exige duas auditorias publicadas", () => {
  const rankings = getRecurringFindings([
    finding("A1", "Obra A", "02.04", "2026-07-01"),
    finding("A1", "Obra A", "02.04", "2026-07-01"),
    finding("A2", "Obra B", "02.04", "2026-08-01"),
    finding("A3", "Obra A", "03.01", "2026-09-01"),
  ]);
  assert.equal(rankings.length, 1);
  assert.equal(rankings[0].item, "02.04");
  assert.equal(rankings[0].occurrences, 2);
  assert.equal(rankings[0].workCount, 2);
});

test("recorrências ordenam por auditorias, obras e data mais recente", () => {
  const rankings = getRecurringFindings([
    finding("A1", "Obra A", "01.01", "2026-06-01"), finding("A2", "Obra A", "01.01", "2026-07-01"), finding("A3", "Obra A", "01.01", "2026-08-01"),
    finding("B1", "Obra A", "02.01", "2026-07-01"), finding("B2", "Obra B", "02.01", "2026-08-01"),
    finding("C1", "Obra A", "03.01", "2026-08-01"), finding("C2", "Obra B", "03.01", "2026-09-01"),
  ]);
  assert.deepEqual(rankings.map((entry) => entry.item), ["01.01", "03.01", "02.01"]);
});

test("subitens quantitativos são agrupados pelo título principal e mantidos nos detalhes", () => {
  const rankings = getRecurringFindings([
    finding("A1", "Obra A", "02.04", "2026-08-01", {
      description: "Armazenamento dos Materiais — Contramarco",
      criterionTitle: "Armazenamento dos Materiais",
      subitem: "Contramarco",
      nonconformity: "Armazenado fora do especificado pela TAM.",
    }),
    finding("A2", "Obra B", "02.04", "2026-09-01", {
      description: "Armazenamento dos Materiais — Sem identificação",
      criterionTitle: "Armazenamento dos Materiais",
      subitem: "Sem identificação",
      nonconformity: "Material sem identificação.",
    }),
  ]);
  assert.equal(rankings.length, 1);
  assert.equal(rankings[0].description, "Armazenamento dos Materiais");
  assert.equal(rankings[0].occurrences, 2);
  assert.deepEqual(rankings[0].details, [
    { label: "Contramarco", description: "Armazenado fora do especificado pela TAM." },
    { label: "Sem identificação", description: "Material sem identificação." },
  ]);
});
