import assert from "node:assert/strict";
import test from "node:test";
import { getWorkRanking } from "../src/domain/work-ranking.ts";

const SECURITY = "security-it07-r02";
const QUALITY_SIMPLE = "quality-f175";
const QUALITY_COMPLETE = "quality-f176";

// Dados exclusivos dos testes; não são registros de produção.
const work = (id, name = id, overrides = {}) => ({
  id, name, city: "Cidade de teste", engineer: "Engenheiro de teste", coordinator: "Coordenador de teste",
  status: "Ativa", isDemo: false, ...overrides,
});
const audit = (id, workId, overrides = {}) => ({
  id, workId, modelId: SECURITY, date: "2026-09-01", auditor: "Auditor de teste",
  status: "Publicada", collectionStatus: "Coleta concluída", calculationStatus: "Disponível", finalScore: 8, isDemo: false,
  ...overrides,
});
const summary = (rows) => rows.map((row) => ({
  workId: row.work.id, auditId: row.audit?.id ?? null, score: row.finalScore, position: row.position,
}));

test("a última data prevalece sobre a maior nota e sobre a ordem dos arrays", () => {
  const works = [work("a", "Alameda"), work("b", "Bosque")];
  const audits = [
    audit("a-antiga", "a", { date: "2025-12-31", finalScore: 10 }),
    audit("a-recente", "a", { date: "2026-01-01", finalScore: 7 }),
    audit("b-recente", "b", { date: "2026-01-02", finalScore: 8 }),
  ];
  const expected = [
    { workId: "b", auditId: "b-recente", score: 8, position: 1 },
    { workId: "a", auditId: "a-recente", score: 7, position: 2 },
  ];
  assert.deepEqual(summary(getWorkRanking(works, audits, SECURITY)), expected);
  assert.deepEqual(summary(getWorkRanking([...works].reverse(), [...audits].reverse(), SECURITY)), expected);
});

test("auditorias na mesma data são desempatadas pelo ID, independentemente da ordem", () => {
  const works = [work("a")];
  const audits = [audit("auditoria-a", "a", { finalScore: 9 }), audit("auditoria-z", "a", { finalScore: 6 })];
  const expected = [{ workId: "a", auditId: "auditoria-z", score: 6, position: 1 }];
  assert.deepEqual(summary(getWorkRanking(works, audits, SECURITY)), expected);
  assert.deepEqual(summary(getWorkRanking(works, [...audits].reverse(), SECURITY)), expected);
});

test("a última auditoria pendente impede reutilizar uma nota antiga", () => {
  for (const calculationStatus of ["Aguardando configuração", "Nota pendente"]) {
    const audits = [
      audit("antiga", "a", { date: "2026-08-31", finalScore: 9 }),
      audit("atual", "a", { calculationStatus, finalScore: 8 }),
    ];
    assert.deepEqual(summary(getWorkRanking([work("a")], audits, SECURITY)), [
      { workId: "a", auditId: "atual", score: null, position: null },
    ]);
  }
});

test("Segurança, Qualidade Simplificada e Qualidade Completa usam auditorias separadas", () => {
  const works = [work("a")];
  const audits = [
    audit("seguranca", "a", { finalScore: 9 }),
    audit("simplificada", "a", { modelId: QUALITY_SIMPLE, date: "2026-09-02", finalScore: 6 }),
    audit("completa", "a", { modelId: QUALITY_COMPLETE, date: "2026-09-03", finalScore: 7 }),
  ];
  for (const [modelId, auditId, score] of [[SECURITY, "seguranca", 9], [QUALITY_SIMPLE, "simplificada", 6], [QUALITY_COMPLETE, "completa", 7]]) {
    assert.deepEqual(summary(getWorkRanking(works, audits, modelId)), [
      { workId: "a", auditId, score, position: 1 },
    ]);
  }
  assert.equal(getWorkRanking(works, [audits[0]], QUALITY_SIMPLE)[0].audit, null);
});

test("obras sem resultado vêm ao final em ordem nominal; auditorias órfãs não criam obras", () => {
  const works = [work("z", "Zênite"), work("a", "Árvore"), work("b", "Bosque"), work("v", "Vila")];
  const audits = [
    audit("nota-vila", "v", { finalScore: 5 }),
    audit("pendente-bosque", "b", { calculationStatus: "Nota pendente", finalScore: null }),
    audit("orfa", "inexistente", { finalScore: 10 }),
  ];
  const expected = [
    { workId: "v", auditId: "nota-vila", score: 5, position: 1 },
    { workId: "a", auditId: null, score: null, position: null },
    { workId: "b", auditId: "pendente-bosque", score: null, position: null },
    { workId: "z", auditId: null, score: null, position: null },
  ];
  assert.deepEqual(summary(getWorkRanking(works, audits, SECURITY)), expected);
  assert.deepEqual(summary(getWorkRanking([...works].reverse(), [...audits].reverse(), SECURITY)), expected);
});

test("notas zero e dez são válidas, e zero não significa ausência", () => {
  const rows = getWorkRanking(
    [work("zero"), work("sem"), work("dez")],
    [audit("nota-zero", "zero", { finalScore: 0 }), audit("nota-dez", "dez", { finalScore: 10 })],
    SECURITY,
  );
  assert.deepEqual(summary(rows), [
    { workId: "dez", auditId: "nota-dez", score: 10, position: 1 },
    { workId: "zero", auditId: "nota-zero", score: 0, position: 2 },
    { workId: "sem", auditId: null, score: null, position: null },
  ]);
});

test("empates recebem posições de competição 1, 1, 3 e ordem nominal estável", () => {
  const works = [work("b", "Bosque"), work("c", "Campo"), work("a", "Alameda")];
  const audits = [audit("b", "b", { finalScore: 9 }), audit("c", "c", { finalScore: 8 }), audit("a", "a", { finalScore: 9 })];
  const expected = [
    { workId: "a", auditId: "a", score: 9, position: 1 },
    { workId: "b", auditId: "b", score: 9, position: 1 },
    { workId: "c", auditId: "c", score: 8, position: 3 },
  ];
  assert.deepEqual(summary(getWorkRanking(works, audits, SECURITY)), expected);
  assert.deepEqual(summary(getWorkRanking([...works].reverse(), [...audits].reverse(), SECURITY)), expected);
  const sameNames = [work("b", "Mesma obra"), work("a", "Mesma obra")];
  assert.deepEqual(getWorkRanking(sameNames, [], SECURITY).map((row) => row.work.id), ["a", "b"]);
});

test("coleta inconclusa não entra no ranking mesmo com cálculo disponível", () => {
  for (const collectionStatus of ["Em preenchimento", "Rascunho"]) {
    const audits = [
      audit("antiga", "a", { date: "2026-08-31", finalScore: 10 }),
      audit("atual", "a", { collectionStatus, finalScore: 9 }),
    ];
    assert.deepEqual(summary(getWorkRanking([work("a")], audits, SECURITY)), [
      { workId: "a", auditId: "atual", score: null, position: null },
    ]);
  }
});

test("notas ausentes, não numéricas, não finitas ou fora de 0 a 10 não geram posição", () => {
  for (const finalScore of [null, undefined, "9", NaN, Infinity, -Infinity, -0.01, 10.01]) {
    const audits = [
      audit("antiga", "a", { date: "2026-08-31", finalScore: 9 }),
      audit("atual", "a", { finalScore }),
    ];
    assert.deepEqual(summary(getWorkRanking([work("a")], audits, SECURITY)), [
      { workId: "a", auditId: "atual", score: null, position: null },
    ]);
  }
});

test("obras e auditorias reais e demonstrativas nunca são cruzadas", () => {
  const works = [work("real", "Real"), work("demo", "Demo", { isDemo: true }), work("sem-real"), work("sem-demo", "Sem demo", { isDemo: true })];
  const audits = [
    audit("real-valida", "real", { date: "2026-08-31", finalScore: 7 }),
    audit("demo-em-real", "real", { date: "2026-09-02", finalScore: 10, isDemo: true }),
    audit("demo-valida", "demo", { date: "2026-08-31", finalScore: 8, isDemo: true }),
    audit("real-em-demo", "demo", { date: "2026-09-02", finalScore: 9 }),
    audit("somente-demo", "sem-real", { isDemo: true }),
    audit("somente-real", "sem-demo"),
  ];
  const rows = getWorkRanking(works, audits, SECURITY);
  assert.equal(rows.length, 4);
  assert.deepEqual(summary(rows).slice(0, 2), [
    { workId: "demo", auditId: "demo-valida", score: 8, position: 1 },
    { workId: "real", auditId: "real-valida", score: 7, position: 2 },
  ]);
  assert.ok(rows.slice(2).every((row) => row.audit === null && row.finalScore === null && row.position === null));

  const sharedIdRows = getWorkRanking(
    [work("mesmo-id", "Real"), work("mesmo-id", "Demo", { isDemo: true })],
    [audit("real", "mesmo-id", { finalScore: 6 }), audit("demo", "mesmo-id", { finalScore: 8, isDemo: true })],
    SECURITY,
  );
  assert.deepEqual(sharedIdRows.map((row) => [row.work.isDemo, row.audit.isDemo, row.finalScore]), [[true, true, 8], [false, false, 6]]);
});

test("a função não modifica arrays ou registros recebidos", () => {
  const works = [work("b", "Bosque"), work("a", "Alameda")];
  const audits = [audit("b", "b", { finalScore: 7 }), audit("a", "a", { finalScore: 9 })];
  const originalWorks = structuredClone(works);
  const originalAudits = structuredClone(audits);
  works.forEach(Object.freeze);
  audits.forEach(Object.freeze);
  Object.freeze(works);
  Object.freeze(audits);
  const rows = getWorkRanking(works, audits, SECURITY);
  assert.deepEqual(works, originalWorks);
  assert.deepEqual(audits, originalAudits);
  assert.notEqual(rows, works);
  assert.equal(rows[0].work, works[1]);
  assert.equal(rows[0].audit, audits[1]);
});

test("nova chamada reflete as obras e auditorias substituídas, sem estado anterior", () => {
  const works = [work("a", "Alameda")];
  const audits = [audit("a", "a", { calculationStatus: "Nota pendente", finalScore: null })];
  const initial = getWorkRanking(works, audits, SECURITY);
  assert.equal(initial[0].position, null);

  const nextWorks = [work("a", "Alameda atualizada"), work("b", "Bosque")];
  const nextAudits = [{ ...audits[0], calculationStatus: "Disponível", finalScore: 8 }, audit("b", "b", { finalScore: 9 })];
  const updated = getWorkRanking(nextWorks, nextAudits, SECURITY);
  assert.deepEqual(summary(updated), [
    { workId: "b", auditId: "b", score: 9, position: 1 },
    { workId: "a", auditId: "a", score: 8, position: 2 },
  ]);
  assert.equal(updated[1].work.name, "Alameda atualizada");
  assert.equal(initial[0].work.name, "Alameda");
  assert.equal(initial[0].finalScore, null);
  assert.equal(getWorkRanking(works, [], SECURITY)[0].audit, null);
});

test("sem obras, inclusive com auditorias órfãs, retorna lista vazia", () => {
  assert.deepEqual(getWorkRanking([], [], SECURITY), []);
  assert.deepEqual(getWorkRanking([], [audit("orfa", "desconhecida")], SECURITY), []);
});

test("coleta concluída com nota disponível não vira resultado publicado por inferência", () => {
  for (const status of ["Agendada", "Em preenchimento", "Em discussão com a obra", undefined]) {
    const rows = getWorkRanking([work("a")], [audit("a", "a", { status, finalScore: 9 })], SECURITY);
    assert.equal(rows[0].finalScore, null);
    assert.equal(rows[0].position, null);
  }
});
