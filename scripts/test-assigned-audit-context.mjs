import assert from 'node:assert/strict';
import test from 'node:test';
import { assignedAgendaWorks, currentAuditAssignments } from '../src/domain/assigned-audit-context.ts';
import { canAccessWorkModule, canEditAudit } from '../src/domain/prototype-access.ts';

const user = {
  id: 'auditor', name: 'Auditor de teste', role: 'safety-auditor', modules: ['safety'],
  workIds: ['acompanhada'], agendaWorkIds: ['acompanhada'], documentWorkIds: [],
  workModuleScopes: [{ workId: 'acompanhada', module: 'safety' }],
};
const works = [
  { id: 'acompanhada', name: 'Obra acompanhada', city: 'Cidade autorizada', engineer: 'Responsável', coordinator: 'Coordenação', address: 'Endereço autorizado', status: 'Ativa', isDemo: false },
  { id: 'externa', name: 'Nome interno', city: 'Cidade privada', engineer: 'Pessoa privada', coordinator: 'Coordenação privada', address: 'Endereço privado', status: 'Ativa', isDemo: false },
];
const visit = {
  id: 'visita-designada', workId: 'externa', workName: 'Obra da visita', module: 'safety', kind: 'audit',
  modelId: 'security-it07-r02', auditorId: user.id, date: '2026-09-24', note: '', createdBy: 'admin',
  createdAt: '2026-09-23T12:00:00Z', history: [], confirmationStatus: 'confirmed',
};
const audit = { visitId: visit.id, workId: visit.workId, modelId: visit.modelId, auditorId: user.id, status: 'Em preenchimento' };

test('designações incluem apenas auditorias confirmadas, próprias e da disciplina selecionada', () => {
  const ignored = [
    { ...visit, id: 'outro-auditor', auditorId: 'outro' },
    { ...visit, id: 'pendente', confirmationStatus: 'pending_confirmation' },
    { ...visit, id: 'sem-confirmacao', confirmationStatus: undefined },
    { ...visit, id: 'acompanhamento', kind: 'follow_up', modelId: null },
    { ...visit, id: 'qualidade', module: 'quality', modelId: 'quality-f175' },
    { ...visit, id: 'modelo-incompativel', modelId: 'quality-f175' },
  ];
  const result = currentAuditAssignments(user, [visit, ...ignored, visit], true);
  assert.deepEqual(result, [{ visitId: visit.id, workId: visit.workId, modelId: visit.modelId }]);
  assert.equal(canEditAudit({ ...user, auditAssignments: result }, audit), true);
  assert.deepEqual(currentAuditAssignments({ ...user, role: 'engineering', activity: 'site-team' }, [visit], true), []);
  assert.deepEqual(currentAuditAssignments({ ...user, role: 'administrative' }, [visit], true), []);
  assert.deepEqual(currentAuditAssignments({ ...user, modules: [] }, [visit], true), []);
});

test('agenda indisponível ou visita removida revoga permissão sem manter atribuições antigas', () => {
  const assignedUser = { ...user, auditAssignments: currentAuditAssignments(user, [visit], true) };
  for (const assignments of [currentAuditAssignments(assignedUser, [visit], false), currentAuditAssignments(assignedUser, [], true)]) {
    assert.deepEqual(assignments, []);
    assert.equal(canEditAudit({ ...assignedUser, auditAssignments: assignments }, audit), false);
  }
});

test('obra externa recebe apenas identificação mínima da visita e não copia cadastro privado', () => {
  const result = assignedAgendaWorks(user, works, [visit, visit]);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], works[0]);
  assert.deepEqual(result[1], { id: 'externa', name: 'Obra da visita', city: '', engineer: '', coordinator: '', status: 'Ativa', isDemo: false });
  assert.equal(result[1].address, undefined);
  assert.equal(canAccessWorkModule(user, 'externa', 'safety'), false);
  assert.deepEqual(assignedAgendaWorks(user, works, []), [works[0]]);
});

test('obra designada pendente aparece para confirmação; visitas de outros perfis não criam obras', () => {
  assert.equal(assignedAgendaWorks(user, [], [{ ...visit, confirmationStatus: 'pending_confirmation' }]).length, 1);
  for (const changed of [
    { ...visit, auditorId: 'outro' }, { ...visit, kind: 'follow_up', modelId: null },
    { ...visit, module: 'quality', modelId: 'quality-f175' },
  ]) assert.deepEqual(assignedAgendaWorks(user, [], [changed]), []);
  assert.deepEqual(assignedAgendaWorks({ ...user, role: 'administrative' }, works, [visit]), [works[0]]);
});

test('nome vazio usa identificação neutra, mantendo dados das obras acompanhadas', () => {
  for (const workName of [undefined, '', '   ']) {
    assert.equal(assignedAgendaWorks(user, [], [{ ...visit, workName }])[0].name, 'Obra da auditoria');
  }
  assert.equal(assignedAgendaWorks(user, [], [{ ...visit, workName: '  Nome autorizado  ' }])[0].name, 'Nome autorizado');
  const followedVisit = { ...visit, workId: works[0].id, workName: 'Nome secundário' };
  assert.deepEqual(assignedAgendaWorks(user, works, [followedVisit]), [works[0]]);
});

test('helpers preservam usuário, concessões, obras e agenda sem conceder novos acessos', () => {
  const fixture = structuredClone({ user, works, visits: [visit] });
  const original = structuredClone(fixture);
  currentAuditAssignments(fixture.user, fixture.visits, true);
  assignedAgendaWorks(fixture.user, fixture.works, fixture.visits);
  assert.deepEqual(fixture, original);
  assert.deepEqual(fixture.user.workIds, ['acompanhada']);
  assert.deepEqual(fixture.user.workModuleScopes, [{ workId: 'acompanhada', module: 'safety' }]);
});
