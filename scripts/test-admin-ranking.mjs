import assert from "node:assert/strict";
import test from "node:test";
import { getAnnualAdminRanking, getMonthlyAdminRanking } from "../src/domain/admin-ranking.ts";

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
