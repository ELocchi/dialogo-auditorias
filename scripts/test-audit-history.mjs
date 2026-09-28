import assert from "node:assert/strict";
import test from "node:test";
import { getHistoryPage, groupAuditHistoryFindings, resolveHistoryPageState, sortAuditHistory } from "../src/domain/audit-history.ts";

const audits = Array.from({ length: 23 }, (_, index) => ({ id: `audit-${String(index).padStart(2, "0")}`, date: "2026-09-01", score: index }));

test("o histórico percorre todas as auditorias uma vez e mantém a ordem entre datas iguais", () => {
  const sorted = sortAuditHistory(audits);
  const reversed = sortAuditHistory([...audits].reverse());
  assert.deepEqual(sorted, reversed);
  const pages = [1, 2, 3].map((page) => getHistoryPage(sorted, page));
  assert.deepEqual(pages.map((page) => page.items.length), [10, 10, 3]);
  assert.deepEqual(pages.map((page) => [page.first, page.last]), [[1, 10], [11, 20], [21, 23]]);
  assert.deepEqual(pages.flatMap((page) => page.items), sorted);
  assert.equal(audits[0].id, "audit-00", "paginar não altera os dados usados nos indicadores e rankings");
});

test("limites vazios, páginas inválidas e redução dos dados não criam uma página vazia", () => {
  assert.deepEqual(getHistoryPage([], 5), { items: [], total: 0, page: 1, pageCount: 1, first: 0, last: 0 });
  assert.equal(getHistoryPage(audits, -2).page, 1);
  assert.equal(getHistoryPage(audits, Number.NaN).page, 1);
  assert.equal(getHistoryPage(audits, 99).page, 3);
  const clamped = resolveHistoryPageState({ contextKey: "quality", page: 3 }, "quality", 2);
  assert.deepEqual(clamped, { contextKey: "quality", page: 2 });
  assert.equal(resolveHistoryPageState(clamped, "quality", 3), clamped, "voltar a receber dados mantém a página corrigida");
});

test("mudar obra, disciplina ou perfil volta à primeira página e o retorno não restaura página antiga", () => {
  let state = { contextKey: "quality:all:auditor", page: 3 };
  for (const key of ["quality:work-a:auditor", "safety:work-a:auditor", "safety:work-a:coordination", "quality:all:auditor"]) {
    state = resolveHistoryPageState(state, key, 5);
    assert.deepEqual(state, { contextKey: key, page: 1 });
  }
});

test("apontamentos são paginados por auditoria preservando todos os itens da auditoria expandida", () => {
  const findings = audits.slice(0, 11).flatMap((audit) => Array.from({ length: 15 }, (_, index) => ({
    auditId: audit.id, auditDate: audit.date, workId: "work-1", auditor: "Auditor", id: `finding-${index}`,
  })));
  const groups = groupAuditHistoryFindings(findings);
  const first = getHistoryPage(groups, 1);
  const last = getHistoryPage(groups, 2);
  assert.equal(first.items.length, 10);
  assert.equal(last.items.length, 1);
  assert.equal(first.total, 11);
  assert.ok([...first.items, ...last.items].every((group) => group.findings.length === 15));
  assert.deepEqual(groupAuditHistoryFindings([...findings].reverse()).map((group) => group.auditId), groups.map((group) => group.auditId));
  assert.equal(findings.length, 165);
});
