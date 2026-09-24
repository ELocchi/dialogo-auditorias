import assert from "node:assert/strict";
import test from "node:test";
import {
  demoUsers, initialVisits, roleLabels, moduleLabels, modelModule,
  canAccessWork, canAccessModule, canManageAgenda, canConsultAgenda, canStartAudit,
  canEditAudit, canReadAudit, canReadTechnicalWeights, canReadOperationalDocuments,
  canEditCommitteeSchedule, canReadVisit, createVisit,
} from "../src/domain/prototype-access.ts";

// Cenários exclusivamente demonstrativos; não validam autenticação, banco ou permissões reais.
const users = Object.fromEntries(demoUsers.map((user) => [user.id, user]));
const safety = users["auditor-safety"];
const otherSafety = users["auditor-safety-other"];
const quality = users["auditor-quality"];
const site = users["engineering-site"];
const coordination = users["engineering-coordination"];
const admin = users.administrative;
const workIds = ["horizonte", "jardim-norte"];
const meta = { id: "VISITA-TESTE-NOVA", now: "2026-09-12T15:00:00.000Z" };
const input = { workId: "horizonte", module: "safety", kind: "audit", modelId: "security-it07-r02", auditorId: safety.id, date: "2026-09-20", note: "Observação de teste" };
const audit = (overrides = {}) => ({ workId: "horizonte", modelId: "security-it07-r02", auditorId: safety.id, status: "Em preenchimento", ...overrides });

test("quatro perfis e duas atuações internas, sem quinto perfil de Engenharia", () => {
  assert.deepEqual(Object.keys(roleLabels).sort(), ["administrative", "engineering", "quality-auditor", "safety-auditor"]);
  assert.equal(new Set(demoUsers.map((user) => user.role)).size, 4);
  assert.deepEqual(demoUsers.filter((user) => user.role === "engineering").map((user) => user.activity).sort(), ["coordination", "site-team"]);
  assert.deepEqual(moduleLabels, { quality: "Qualidade", safety: "Segurança" });
  assert.equal(modelModule("quality-f175"), "quality");
  assert.equal(modelModule("quality-f176"), "quality");
  assert.equal(modelModule("security-it07-r02"), "safety");
});

test("D01: apenas Administrativo cria visitas", () => {
  for (const user of demoUsers) {
    assert.equal(canManageAgenda(user), user.role === "administrative");
    if (user.role !== "administrative") {
      assert.throws(() => createVisit(user, input, demoUsers, workIds, meta), /Somente o Administrativo/);
    }
  }
});

test("D01: agenda respeita disciplina e obras autorizadas do perfil", () => {
  assert.equal(canConsultAgenda(safety, "horizonte", "safety"), true);
  assert.equal(canConsultAgenda(safety, "horizonte", "quality"), false);
  assert.equal(canConsultAgenda(quality, "horizonte", "quality"), true);
  assert.equal(canConsultAgenda(site, "horizonte", "safety"), true);
  assert.equal(canConsultAgenda(site, "jardim-norte", "safety"), false);
  assert.equal(canConsultAgenda(coordination, "horizonte", "safety"), true);
  assert.equal(canConsultAgenda(coordination, "jardim-norte", "safety"), true);
  assert.equal(canConsultAgenda({ ...coordination, agendaWorkIds: [] }, "horizonte", "safety"), true);
  assert.equal(canConsultAgenda(admin, "jardim-norte", "quality"), true);
});

test("visita atribuída a outro auditor não aparece como agenda própria", () => {
  assert.equal(canReadVisit(safety, initialVisits[0]), true);
  assert.equal(canReadVisit(otherSafety, initialVisits[0]), false);
  assert.equal(canReadVisit(quality, initialVisits[0]), false);
  assert.equal(canReadVisit(site, initialVisits[0]), true);
  assert.equal(canReadVisit(site, initialVisits[1]), false);
  assert.equal(canReadVisit(coordination, initialVisits[1]), true);
  assert.equal(canReadVisit(admin, initialVisits[1]), true);
});

test("início e edição exigem auditor da disciplina, obra e autoria", () => {
  for (const user of demoUsers) {
    assert.equal(canStartAudit(user, "horizonte", "security-it07-r02"), user.role === "safety-auditor");
    assert.equal(canStartAudit(user, "horizonte", "quality-f175"), user.role === "quality-auditor");
    assert.equal(canEditAudit(user, audit()), user.id === safety.id);
  }
  assert.equal(canStartAudit(otherSafety, "jardim-norte", "security-it07-r02"), false);
  assert.equal(canEditAudit(otherSafety, audit()), false);
  assert.equal(canEditAudit(otherSafety, audit({ auditorId: otherSafety.id })), true);
  assert.equal(canEditAudit(safety, audit({ workId: "obra-sem-vinculo" })), false);
});

test("nenhum perfil edita auditoria Publicada, incluindo seu autor", () => {
  for (const user of demoUsers) {
    assert.equal(canEditAudit(user, audit({ status: "Publicada", auditorId: user.id })), false);
  }
});

test("rascunho só do responsável; obra lê discussão, coordenação somente publicação", () => {
  assert.equal(canReadAudit(safety, audit()), true);
  assert.equal(canReadAudit(otherSafety, audit()), false);
  assert.equal(canReadAudit(site, audit()), false);
  assert.equal(canReadAudit(site, audit({ status: "Em discussão com a obra" })), true);
  assert.equal(canReadAudit(coordination, audit({ status: "Em discussão com a obra" })), false);
  assert.equal(canReadAudit(coordination, audit({ status: "Publicada" })), true);
  assert.equal(canReadAudit(otherSafety, audit({ status: "Publicada" })), true);
  assert.equal(canReadAudit(quality, audit({ status: "Publicada" })), false);
  assert.equal(canReadAudit(site, audit({ workId: "jardim-norte", status: "Publicada" })), false);
});

test("Administrativo consulta auditoria publicada sem receber outros documentos ou rascunhos", () => {
  assert.equal(canReadOperationalDocuments(admin, "horizonte", "safety"), false);
  assert.equal(canReadAudit(admin, audit({ status: "Publicada" })), true);
  assert.equal(canReadAudit(admin, audit()), false);
  assert.equal(canReadAudit(admin, audit({ status: "Em discussão com a obra" })), false);
  const explicitlyGranted = { ...admin, documentWorkIds: ["horizonte"] };
  assert.equal(canReadOperationalDocuments(explicitlyGranted, "horizonte", "safety"), true);
  assert.equal(canReadAudit(explicitlyGranted, audit({ status: "Publicada" })), true);
  assert.equal(canReadAudit(explicitlyGranted, audit()), false);
  assert.equal(canReadOperationalDocuments(explicitlyGranted, "jardim-norte", "safety"), false);
  assert.equal(canReadOperationalDocuments({ ...explicitlyGranted, workIds: [] }, "horizonte", "safety"), false);
});

test("publicação administrativa respeita exatamente obra e disciplina autorizadas", () => {
  const scopedAdmin = { ...admin, modules: ["quality"], workIds: ["horizonte", "jardim-norte"],
    workModuleScopes: [{ workId: "horizonte", module: "quality" }], documentWorkIds: [] };
  const publishedQuality = audit({ modelId: "quality-f176", status: "Publicada" });
  assert.equal(canReadAudit(scopedAdmin, publishedQuality), true);
  assert.equal(canReadAudit(scopedAdmin, { ...publishedQuality, workId: "jardim-norte" }), false);
  assert.equal(canReadAudit(scopedAdmin, { ...publishedQuality, workId: "desconhecida" }), false);
  assert.equal(canReadAudit(scopedAdmin, audit({ status: "Publicada" })), false);
  assert.equal(canReadAudit({ ...scopedAdmin, modules: [] }, publishedQuality), false);
  assert.equal(canReadAudit({ ...scopedAdmin, workIds: [] }, publishedQuality), false);
  assert.equal(canReadOperationalDocuments(scopedAdmin, "horizonte", "quality"), false);
});

test("pesos técnicos respeitam perfil e módulo; concessão de módulo não troca disciplina do auditor", () => {
  assert.equal(canReadTechnicalWeights(safety, "safety"), true);
  assert.equal(canReadTechnicalWeights(safety, "quality"), false);
  assert.equal(canReadTechnicalWeights(quality, "quality"), true);
  assert.equal(canReadTechnicalWeights(site, "safety"), false);
  assert.equal(canReadTechnicalWeights(coordination, "quality"), false);
  assert.equal(canReadTechnicalWeights(admin, "quality"), true);
  assert.equal(canAccessModule({ ...safety, modules: ["quality", "safety"] }, "quality"), false);
  assert.equal(canAccessModule({ ...admin, modules: [] }, "quality"), false);
  assert.equal(canAccessWork(site, "jardim-norte"), false);
});

test("P08: nenhum perfil recebe edição da agenda/ata de comitê por D01", () => {
  for (const user of demoUsers) assert.equal(canEditCommitteeSchedule(user), false);
});

test("criação guarda autor administrativo distinto do auditor sem respostas ou nota", () => {
  const visit = createVisit(admin, input, demoUsers, workIds, meta);
  assert.equal(visit.createdBy, admin.id);
  assert.equal(visit.auditorId, safety.id);
  assert.notEqual(visit.createdBy, visit.auditorId);
  assert.equal(visit.createdAt, meta.now);
  assert.deepEqual(visit.history, []);
  assert.equal("answers" in visit, false);
  assert.equal("finalScore" in visit, false);
  assert.equal(canStartAudit(admin, visit.workId, visit.modelId), false);
  assert.equal(canEditAudit(admin, audit({ auditorId: admin.id })), false);
});

test("criação valida obra, módulo, modelo e auditor autorizado", () => {
  const create = (patch = {}, user = admin, knownWorks = workIds) => createVisit(user, { ...input, ...patch }, demoUsers, knownWorks, meta);
  assert.throws(() => create({ workId: "desconhecida" }), /não autorizado/);
  assert.throws(() => create({}, admin, []), /não está cadastrada/);
  assert.throws(() => create({}, { ...admin, modules: ["quality"] }), /não autorizado/);
  assert.throws(() => create({ modelId: "quality-f175" }), /pertencer à disciplina/);
  for (const auditorId of [quality.id, admin.id, site.id, "nao-existe"]) assert.throws(() => create({ auditorId }), /profissional autorizado/);
  assert.throws(() => create({ workId: "jardim-norte", auditorId: otherSafety.id }), /profissional autorizado/);
  assert.throws(() => create({ modelId: "modelo-nao-existe" }), /Modelo.*desconhecido/);
  assert.equal(create({ module: "quality", modelId: "quality-f176", auditorId: quality.id }).modelId, "quality-f176");
});

test("datas reais, texto opcional e metadados de autoria são validados", () => {
  for (const date of ["", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-15", "20/09/2026", "2026-9-20", "0000-01-01"]) {
    assert.throws(() => createVisit(admin, { ...input, date }, demoUsers, workIds, meta), /data/i);
  }
  assert.equal(createVisit(admin, { ...input, date: "2028-02-29", note: "" }, demoUsers, workIds, meta).date, "2028-02-29");
  assert.throws(() => createVisit(admin, { ...input, note: "x".repeat(2001) }, demoUsers, workIds, meta), /2.000/);
  assert.throws(() => createVisit(admin, input, demoUsers, workIds, { ...meta, id: " " }), /identificação/);
  assert.throws(() => createVisit(admin, input, demoUsers, workIds, { ...meta, now: "ontem" }), /horário/);
});

test("criação preserva inputs, usuários e registros de demonstração", () => {
  const usersBefore = structuredClone(demoUsers);
  const initialBefore = structuredClone(initialVisits);
  const inputBefore = structuredClone(input);
  createVisit(admin, Object.freeze({ ...input }), demoUsers, Object.freeze([...workIds]), Object.freeze({ ...meta }));
  assert.deepEqual(demoUsers, usersBefore);
  assert.deepEqual(initialVisits, initialBefore);
  assert.deepEqual(input, inputBefore);
});
