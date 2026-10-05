import assert from "node:assert/strict";
import test from "node:test";
import { demoUsers, initialVisits, canBeginScheduledAudit } from "../src/domain/prototype-access.ts";
import { workRecords, auditRecords } from "../src/domain/operational-records.ts";
import { calculateChecksCompliance, calculateSecurityFinalScore, calculateSecurityGroupScore, getItemResponse, getResponseLabel } from "../src/domain/audit-draft.ts";
import {
  criteriaForModel, modelDisplayName, beginPrototypeAudit, beginScheduledVisitAudit,
  completePrototypeAudit, validatePrototypeAuditCompletion, updatePrototypeResponse, updatePrototypeAuditDate,
} from "../src/domain/prototype-audits.ts";
import { fvsServices } from "../src/domain/fvs-services.ts";

// Todas as auditorias criadas abaixo são fixtures isoladas e não representam publicação real.
const safety = demoUsers.find((user) => user.id === "auditor-safety");
const otherSafety = demoUsers.find((user) => user.id === "auditor-safety-other");
const quality = demoUsers.find((user) => user.id === "auditor-quality");
const admin = demoUsers.find((user) => user.role === "administrative");
const horizonte = workRecords.find((work) => work.id === "horizonte");
const jardim = workRecords.find((work) => work.id === "jardim-norte");
const SECURITY = "security-it07-r02";
const F175 = "quality-f175";
const F176 = "quality-f176";
const [first, second] = criteriaForModel(SECURITY);
const emptyState = () => ({ audits: [], responses: {} });
const begin = (state = emptyState(), user = safety, changes = {}) => beginPrototypeAudit(state, user, {
  id: "AUD-CONTEXTO-001", work: horizonte, modelId: SECURITY, date: "2026-09-15", ...changes,
});
const responseOf = (state, auditId, criterion = first) => {
  const record = state.audits.find((audit) => audit.id === auditId);
  return getItemResponse(state.responses[auditId] ?? {}, record.modelId, criterion);
};
function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

test("nota de Segurança pondera itens e grupos e retira N/A do cálculo", () => {
  const criteria = [
    { ...first, id: "A1", group: "A", configuredWeight: 1, groupWeight: 2 },
    { ...first, id: "A2", group: "A", configuredWeight: 3, groupWeight: 2 },
    { ...first, id: "B1", group: "B", configuredWeight: 2, groupWeight: 1 },
  ];
  const drafts = { security: {
    A1: { answer: "10", note: "" },
    A2: { answer: "N/A", note: "" },
    B1: { answer: "5", note: "" },
  } };
  assert.equal(calculateSecurityGroupScore(criteria.slice(0, 2), drafts, "security"), 10);
  assert.equal(calculateSecurityFinalScore(criteria, drafts, "security"), 25 / 3);

  const onlySecondGroup = { security: {
    A1: { answer: "N/A", note: "" },
    A2: { answer: "N/A", note: "" },
    B1: { answer: "5", note: "" },
  } };
  assert.equal(calculateSecurityFinalScore(criteria, onlySecondGroup, "security"), 5);
});

test("FVS usa o peso específico do serviço na proporção do item", () => {
  assert.equal(calculateChecksCompliance([
    { id: "1", label: "FVS-24 - Forro em placas de gesso acartonado", compliant: false },
    { id: "2", label: "FVS-6B - Revestimento interno – Massa Interna", compliant: true },
  ]), 5 / 9);
  assert.equal(calculateChecksCompliance([
    { id: "1", label: "FVS-24 - Forro em placas de gesso acartonado", weight: 1, compliant: false },
    { id: "2", label: "FVS-6B - Revestimento interno – Massa Interna", weight: 5, compliant: true },
  ]), 5 / 6, "o peso salvo no rascunho preserva a revisão usada pela auditoria");
});

test("roteiro de Segurança usa pesos por código e mantém os pesos dos grupos", () => {
  const criteria = criteriaForModel(SECURITY);
  assert.equal(new Set(criteria.map((item) => item.configuredWeight)).size, 13);
  assert.ok(criteria.every(item => item.configuredWeight > 0));
  assert.ok(criteria.every((item) => typeof item.groupWeight === "number" && item.groupWeight > 0));
  const drafts = { security: Object.fromEntries(criteria.map((item) => [item.id, { answer: "10", note: "" }])) };
  assert.equal(calculateSecurityFinalScore(criteria, drafts, "security"), 10);
});

test("roteiros continuam distintos e preservam as contagens e os primeiros códigos", () => {
  assert.equal(criteriaForModel(SECURITY).length, 205);
  assert.equal(criteriaForModel(F175).length, 10);
  assert.equal(criteriaForModel(F176).length, 23);
  assert.equal(first.code, "01.01.01");
  assert.equal(second.code, "01.01.02");
  assert.match(modelDisplayName(SECURITY), /Segurança/);
  assert.notEqual(modelDisplayName(F175), modelDisplayName(F176));
});

test("início gera registro vazio com obra, modelo e responsável, sem nota", () => {
  const previous = emptyState();
  const result = begin(previous);
  assert.equal(previous.audits.length, 0);
  assert.equal(result.auditId, "AUD-CONTEXTO-001");
  assert.deepEqual(result.state.responses[result.auditId], {});
  const record = result.state.audits[0];
  assert.equal(record.workId, horizonte.id);
  assert.equal(record.modelId, SECURITY);
  assert.equal(record.auditorId, safety.id);
  assert.equal(record.auditor, safety.name);
  assert.equal(record.status, "Em preenchimento");
  assert.equal(record.finalScore, null);
  assert.equal(record.isDemo, true);
  assert.equal(getResponseLabel(responseOf(result.state, result.auditId)), "Não respondido");
});

test("início nega Administrativo, Engenharia, outra disciplina, obra sem vínculo e obra real", () => {
  for (const user of demoUsers.filter((entry) => entry.role !== "safety-auditor")) {
    assert.throws(() => begin(emptyState(), user), /não pode iniciar/);
  }
  assert.throws(() => begin(emptyState(), otherSafety, { work: jardim }), /não pode iniciar/);
  assert.throws(() => begin(emptyState(), safety, { modelId: F175 }), /não pode iniciar/);
  assert.throws(() => begin(emptyState(), safety, { work: { ...horizonte, isDemo: false } }), /não pode iniciar/);
  assert.equal(begin(emptyState(), quality, { modelId: F175 }).state.audits[0].modelId, F175);
});

test("duas auditorias do mesmo modelo na mesma obra não copiam respostas", () => {
  const one = begin();
  let state = updatePrototypeResponse(one.state, safety, one.auditId, first, { answer: "5", note: "Primeira inspeção" });
  const two = begin(state, safety, { id: "AUD-CONTEXTO-002" });
  assert.equal(getResponseLabel(responseOf(two.state, two.auditId)), "Não respondido");
  state = updatePrototypeResponse(two.state, safety, two.auditId, first, { answer: "10", note: "Outra inspeção" });
  assert.deepEqual(responseOf(state, one.auditId), { answer: "5", note: "Primeira inspeção" });
  assert.deepEqual(responseOf(state, two.auditId), { answer: "10", note: "Outra inspeção" });
});

test("rascunhos por obra e responsável ficam independentes, inclusive nomes iguais de usuários", () => {
  const one = begin();
  let state = updatePrototypeResponse(one.state, safety, one.auditId, first, { answer: "5", note: "Marina no Horizonte" });
  const two = begin(state, safety, { id: "AUD-JARDIM", work: jardim });
  state = updatePrototypeResponse(two.state, safety, two.auditId, first, { answer: "10", note: "Marina no Jardim" });
  const three = begin(state, otherSafety, { id: "AUD-OUTRO-AUDITOR" });
  state = updatePrototypeResponse(three.state, otherSafety, three.auditId, first, { answer: "0", note: "Rafael no Horizonte" });
  const four = begin(state, quality, { id: "AUD-QUALIDADE", modelId: F175 });
  assert.equal(four.state.audits.length, 4);
  assert.equal(getResponseLabel(responseOf(four.state, four.auditId, criteriaForModel(F175)[0])), "Não respondido");
  assert.deepEqual(responseOf(four.state, one.auditId), { answer: "5", note: "Marina no Horizonte" });
  assert.deepEqual(responseOf(four.state, two.auditId), { answer: "10", note: "Marina no Jardim" });
  assert.deepEqual(responseOf(four.state, three.auditId), { answer: "0", note: "Rafael no Horizonte" });
  assert.throws(() => updatePrototypeResponse(four.state, otherSafety, one.auditId, first, { answer: "10", note: "" }), /Sem permissão/);
  assert.throws(() => updatePrototypeResponse(four.state, quality, one.auditId, first, { answer: "10", note: "" }), /Sem permissão/);
});

test("itens 01.01.01/01.01.02 mantêm 5/10, observações próprias, zero, N/A e não respondido distintos", () => {
  const started = begin();
  let state = updatePrototypeResponse(started.state, safety, started.auditId, first, { answer: "5", note: "Observação exclusiva A" });
  state = updatePrototypeResponse(state, safety, started.auditId, second, { answer: "10", note: "Observação exclusiva B" });
  assert.deepEqual(responseOf(state, started.auditId, first), { answer: "5", note: "Observação exclusiva A" });
  assert.deepEqual(responseOf(state, started.auditId, second), { answer: "10", note: "Observação exclusiva B" });
  assert.equal(getResponseLabel(responseOf(state, started.auditId, criteriaForModel(SECURITY)[2])), "Não respondido");
  state = updatePrototypeResponse(state, safety, started.auditId, first, { answer: "0", note: "Zero escolhido" });
  assert.equal(getResponseLabel(responseOf(state, started.auditId, first)), "0");
  state = updatePrototypeResponse(state, safety, started.auditId, first, { answer: "N/A", note: "Justificativa de teste" });
  assert.equal(getResponseLabel(responseOf(state, started.auditId, first)), "N/A");
  assert.deepEqual(responseOf(state, started.auditId, second), { answer: "10", note: "Observação exclusiva B" });
  assert.equal(state.audits[0].finalScore, null);
});

test("item grave é uma escolha binária manual e independente da nota", () => {
  const started = begin();
  let state = updatePrototypeResponse(started.state, safety, started.auditId, first, { answer: "10", note: "Conforme, mas exige atenção", serious: true });
  assert.equal(responseOf(state, started.auditId, first).serious, true);
  state = updatePrototypeResponse(state, safety, started.auditId, first, { ...responseOf(state, started.auditId, first), serious: false });
  assert.equal(responseOf(state, started.auditId, first).serious, false);
  assert.throws(() => updatePrototypeResponse(started.state, safety, started.auditId, first, { answer: "0", note: "", serious: "alto" }), /verdadeira ou falsa/);
});

test("itens de outro modelo ou versão são recusados, sem misturar F.175/F.176", () => {
  const securityAudit = begin();
  const qualityAudit = begin(securityAudit.state, quality, { id: "AUD-F175", modelId: F175 });
  assert.throws(() => updatePrototypeResponse(qualityAudit.state, safety, securityAudit.auditId, criteriaForModel(F175)[0], { note: "" }), /não pertence/);
  assert.throws(() => updatePrototypeResponse(qualityAudit.state, quality, qualityAudit.auditId, first, { note: "" }), /não pertence/);
  assert.throws(() => updatePrototypeResponse(qualityAudit.state, quality, qualityAudit.auditId, criteriaForModel(F176)[0], { note: "" }), /não pertence/);
  assert.throws(() => updatePrototypeResponse(qualityAudit.state, safety, securityAudit.auditId, { ...first, id: "OUTRA-VERSAO-01" }, { note: "" }), /não pertence/);
});

test("Segurança e Qualidade não compartilham escalas de resposta", () => {
  const securityAudit = begin();
  for (const answer of ["Não verificado", "Constatação qualitativa", "Não conforme", "Conforme"]) {
    assert.throws(() => updatePrototypeResponse(securityAudit.state, safety, securityAudit.auditId, first, { answer, note: "" }), /incompatível/);
  }
  for (const modelId of [F175, F176]) {
    const qualityAudit = begin(emptyState(), quality, { modelId });
    const criterion = criteriaForModel(modelId)[0];
    for (const answer of ["0", "5", "10", "N/A"]) {
      assert.throws(() => updatePrototypeResponse(qualityAudit.state, quality, qualityAudit.auditId, criterion, { answer, note: "" }), /incompatível/);
    }
    for (const answer of ["Não verificado", "Constatação qualitativa"]) {
      assert.throws(() => updatePrototypeResponse(qualityAudit.state, quality, qualityAudit.auditId, criterion, { answer, note: "" }), /incompatível/);
    }
    for (const answer of ["Não conforme", "Conforme"]) {
      const state = updatePrototypeResponse(qualityAudit.state, quality, qualityAudit.auditId, criterion, { answer, note: "Observação de Qualidade" });
      assert.equal(responseOf(state, qualityAudit.auditId, criterion).answer, answer);
      assert.equal(state.audits[0].finalScore, null);
    }
  }
});

test("fechamento abre revisão somente completo e publicação grava a nota na sessão", () => {
  const started = begin(emptyState(), quality, { id: "AUD-REVISAO", modelId: F175 });
  assert.throws(() => validatePrototypeAuditCompletion(started.state, quality, started.auditId), /Responda o item/);
  let state = started.state;
  for (const criterion of criteriaForModel(F175)) {
    const response = criterion.verificationRule === "Dividido pela quantidade verificada"
      ? { note: "", checks: [{ id: `${criterion.id}-1`, label: /\bfvs\b/i.test(`${criterion.title} ${criterion.text}`) ? fvsServices[0].label : "Item verificado 1", compliant: true }] }
      : { answer: "Conforme", note: "" };
    state = updatePrototypeResponse(state, quality, started.auditId, criterion, response);
  }
  assert.doesNotThrow(() => validatePrototypeAuditCompletion(state, quality, started.auditId));
  const published = completePrototypeAudit(state, quality, started.auditId);
  assert.equal(published.audits[0].status, "Publicada");
  assert.equal(published.audits[0].collectionStatus, "Coleta concluída");
  assert.equal(published.audits[0].calculationStatus, "Disponível");
  assert.equal(published.audits[0].finalScore, 10);
});

test("visita inicia uma vez e retomada mantém o mesmo rascunho sem duplicar", () => {
  const started = begin(emptyState(), safety, { visit: initialVisits[0] });
  const state = updatePrototypeResponse(started.state, safety, started.auditId, first, { answer: "5", note: "Mantida ao retomar" });
  const resumed = begin(state, safety, { id: "ID-QUE-NAO-SERA-CRIADO", visit: initialVisits[0] });
  assert.equal(resumed.auditId, started.auditId);
  assert.equal(resumed.state, state);
  assert.equal(resumed.state.audits.length, 1);
  assert.equal(resumed.state.audits[0].date, "2026-09-15");
  assert.deepEqual(responseOf(resumed.state, resumed.auditId), { answer: "5", note: "Mantida ao retomar" });
  assert.throws(() => begin(state, safety, { date: "2026-09-20", visit: initialVisits[0] }), /outro responsável ou contexto/);
});

test("início agendado exige auditor responsável, confirmação e o dia da visita", () => {
  const user = { ...safety, workModuleScopes: [{ workId: horizonte.id, module: "safety" }] };
  const visit = { ...initialVisits[0], confirmationStatus: "confirmed", revision: 1 };
  assert.equal(canBeginScheduledAudit(user, visit, visit.date), true);
  const started = beginScheduledVisitAudit(emptyState(), user, { id: "VISITA-INICIADA", work: horizonte, visit }, visit.date);
  assert.equal(started.state.audits[0].visitId, visit.id);
  assert.equal(started.state.audits[0].date, visit.date);
  assert.equal(started.state.audits[0].finalScore, null);
  assert.equal(beginScheduledVisitAudit(started.state, user, { id: "IGNORADO", work: horizonte, visit }, visit.date).auditId, started.auditId);
  for (const [actor, changed, day] of [
    [user, visit, "2026-09-14"],
    [user, { ...visit, confirmationStatus: "pending_confirmation" }, visit.date],
    [user, { ...visit, kind: "follow_up", modelId: null }, visit.date],
    [otherSafety, visit, visit.date],
  ]) {
    assert.equal(canBeginScheduledAudit(actor, changed, day), false);
    assert.throws(() => beginScheduledVisitAudit(emptyState(), actor, { id: "NEGADO", work: horizonte, visit: changed }, day), /data confirmada/);
  }
});

test("auditor designado preenche apenas o rascunho da visita sem ganhar acesso geral à obra", () => {
  const visit = { ...initialVisits[0], workId: jardim.id, confirmationStatus: "confirmed", revision: 1 };
  const assignment = { visitId: visit.id, workId: visit.workId, modelId: visit.modelId };
  const user = { ...safety, workIds: [], agendaWorkIds: [], workModuleScopes: [], auditAssignments: [assignment] };
  const started = beginScheduledVisitAudit(emptyState(), user, { id: "DESIGNADA-SEM-VINCULO", work: { ...jardim, isDemo: false }, visit }, visit.date);
  assert.equal(started.state.audits[0].visitId, visit.id);
  const filled = updatePrototypeResponse(started.state, user, started.auditId, first, { answer: "10", note: "Visita designada" });
  assert.equal(responseOf(filled, started.auditId).note, "Visita designada");
  assert.deepEqual(user.workIds, []);
  assert.deepEqual(user.workModuleScopes, []);
  for (const auditAssignments of [[], [{ ...assignment, visitId: "OUTRA" }], [{ ...assignment, workId: horizonte.id }], [{ ...assignment, modelId: F175 }]]) {
    assert.throws(() => updatePrototypeResponse(filled, { ...user, auditAssignments }, started.auditId, first, { answer: "0", note: "" }), /Sem permissão/);
  }
  assert.throws(() => begin(emptyState(), user, { work: jardim }), /não pode iniciar/);
  assert.throws(() => beginScheduledVisitAudit(emptyState(), user, { id: "INCORRETA", work: horizonte, visit }, visit.date), /não pode iniciar/);
});

test("visita não transfere autoria nem aceita obra/modelo de outro contexto", () => {
  assert.throws(() => begin(emptyState(), otherSafety, { visit: initialVisits[0] }), /outro responsável ou contexto/);
  assert.throws(() => begin(emptyState(), safety, { work: jardim, visit: initialVisits[0] }), /outro responsável ou contexto/);
  assert.throws(() => begin(emptyState(), quality, { modelId: F176, work: jardim, visit: initialVisits[1] }), /outro responsável ou contexto/);
  assert.throws(() => begin(emptyState(), admin, { visit: initialVisits[0] }), /não pode iniciar/);
});

test("acompanhamento da obra não inicia auditoria nem cria registro para nota mensal", () => {
  const followUp = { ...initialVisits[0], kind: "follow_up", modelId: null };
  assert.throws(() => begin(emptyState(), safety, { visit: followUp }), /não é uma auditoria/);
  assert.equal(emptyState().audits.length, 0);
});

test("auditoria publicada de teste bloqueia respostas, data e reinício pela mesma visita para todos", () => {
  const started = begin(emptyState(), safety, { visit: initialVisits[0] });
  const published = deepFreeze({ ...started.state, audits: started.state.audits.map((audit) => ({ ...audit, status: "Publicada" })) });
  for (const user of demoUsers) {
    assert.throws(() => updatePrototypeResponse(published, user, started.auditId, first, { answer: "0", note: "Não pode mudar" }), /Sem permissão/);
    assert.throws(() => updatePrototypeAuditDate(published, user, started.auditId, "2026-09-25"), /Sem permissão/);
    assert.throws(() => begin(published, user, { visit: initialVisits[0] }));
  }
  assert.equal(published.audits[0].status, "Publicada");
  assert.equal(published.audits[0].date, "2026-09-15");
});

test("alterar data pelo proprietário preserva autor, obra, versão e respostas", () => {
  const started = begin();
  const filled = updatePrototypeResponse(started.state, safety, started.auditId, first, { answer: "10", note: "Não muda com a data" });
  const changed = updatePrototypeAuditDate(filled, safety, started.auditId, "2026-09-25");
  assert.equal(changed.audits[0].date, "2026-09-25");
  assert.equal(filled.audits[0].date, "2026-09-15");
  for (const key of ["id", "workId", "modelId", "auditor", "auditorId", "status", "isDemo"]) assert.equal(changed.audits[0][key], filled.audits[0][key]);
  assert.deepEqual(changed.responses, filled.responses);
  for (const user of demoUsers.filter((entry) => entry.id !== safety.id)) {
    assert.throws(() => updatePrototypeAuditDate(filled, user, started.auditId, "2026-09-25"), /Sem permissão/);
  }
});

test("datas inválidas são rejeitadas tanto ao iniciar quanto ao editar", () => {
  const started = begin();
  for (const date of ["", "15/09/2026", "2026-2-03", "2026-02-29", "2026-04-31", "2026-13-01"]) {
    assert.throws(() => begin(emptyState(), safety, { date }), /data válida/);
    assert.throws(() => updatePrototypeAuditDate(started.state, safety, started.auditId, date), /data válida/);
  }
  assert.equal(begin(emptyState(), safety, { date: "2028-02-29" }).state.audits[0].date, "2028-02-29");
});

test("IDs não duplicam registros; auditoria desconhecida não recebe respostas nem data", () => {
  const started = begin();
  assert.throws(() => begin(started.state), /já utilizada/);
  assert.throws(() => begin(emptyState(), safety, { id: "" }), /Identificação/);
  assert.throws(() => updatePrototypeResponse(started.state, safety, "inexistente", first, { note: "" }), /Sem permissão/);
  assert.throws(() => updatePrototypeAuditDate(started.state, safety, "inexistente", "2026-09-25"), /Sem permissão/);
});

test("alterações não mutam entradas congeladas, catálogos ou registros iniciais", () => {
  const sourcesBefore = structuredClone({ workRecords, auditRecords, demoUsers, initialVisits, criteria: criteriaForModel(SECURITY) });
  const state = deepFreeze({ audits: structuredClone(auditRecords), responses: {} });
  const before = structuredClone(state);
  const started = begin(state, safety, { id: "AUD-ISOLADA", work: deepFreeze(structuredClone(horizonte)), visit: deepFreeze(structuredClone(initialVisits[0])) });
  const filled = updatePrototypeResponse(deepFreeze(started.state), safety, started.auditId, first, deepFreeze({ answer: "5", note: "Teste isolado" }));
  updatePrototypeAuditDate(deepFreeze(filled), safety, started.auditId, "2026-09-25");
  assert.deepEqual(state, before);
  assert.deepEqual({ workRecords, auditRecords, demoUsers, initialVisits, criteria: criteriaForModel(SECURITY) }, sourcesBefore);
});
