import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCreateAgendaVisit, parseConfirmAgendaVisit, readAgendaSnapshot, createAgendaVisit, deleteAgendaVisit, confirmAgendaVisit } from '../src/lib/agenda/service.ts';

// Offline fixtures only. No environment, database, real identity or notification.
const adminId = '10000000-0000-4000-8000-000000000001';
const auditorId = '10000000-0000-4000-8000-000000000002';
const otherId = '10000000-0000-4000-8000-000000000003';
const workId = '20000000-0000-4000-8000-000000000001';
const visitId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const creation = { requestId, workId, auditorId, module: 'safety', kind: 'audit', modelId: 'security-it07-r02', date: '2030-02-20', note: 'Observação' };
const followUp = { ...creation, kind: 'follow_up', modelId: null };
const confirmation = { requestId, visitId, expectedRevision: 1 };
const visit = { id: visitId, workId, auditorId, module: 'safety', kind: 'audit', modelId: 'security-it07-r02', date: '2030-02-20', note: '',
  createdBy: adminId, createdAt: '2030-02-01T12:00:00+00:00', history: [], revision: 1,
  confirmationStatus: 'pending_confirmation', confirmedAt: null, auditorName: 'Auditor de teste', createdByName: 'Administrativo de teste' };
function context(role = 'administrative') {
  const profile = { administrative: 'ADMINISTRATIVO', 'safety-auditor': 'AUDITOR_SEGURANCA', 'quality-auditor': 'AUDITOR_QUALIDADE', engineering: 'ENGENHARIA' }[role];
  return { profile, engineeringScope: role === 'engineering' ? 'EQUIPE_OBRA' : null, email: 'fixture@dialogo.com.br',
    works: [{ id: workId, name: 'Obra de teste', status: 'Ativa' }],
    user: { id: role === 'administrative' ? adminId : auditorId, name: 'Fixture', role,
      ...(role === 'engineering' ? { activity: 'site-team' } : {}), modules: role === 'quality-auditor' ? ['quality'] : ['safety', 'quality'],
      workIds: [workId], agendaWorkIds: [workId], documentWorkIds: [], workModuleScopes: [{ workId, module: 'safety' }, { workId, module: 'quality' }] } };
}
function fixture({ visits = [visit], auditors = [], error = null, mutationData = visitId, throws = false, readError = null, postConfirmationVisits } = {}) {
  const calls = [];
  let currentVisits = structuredClone(visits);
  return { calls, client: { rpc: async (name, params) => {
    calls.push({ name, params: structuredClone(params) });
    if (throws) throw new Error('private provider diagnostic');
    if (name === 'confirm_audit_visit' && !error) currentVisits = postConfirmationVisits ?? currentVisits.map((entry) => ({ ...entry, confirmationStatus: 'confirmed', confirmedAt: '2030-02-02T12:00:00Z' }));
    if (name === 'delete_audit_visit' && !error) currentVisits = currentVisits.filter((entry) => entry.id !== params.p_visit_id);
    return name === 'read_audit_agenda' ? { data: { visits: currentVisits, auditors }, error: readError } : { data: mutationData, error };
  } } };
}

test('creation validates exact fields, real dates, discipline/model and canonical UUIDs', () => {
  assert.deepEqual(parseCreateAgendaVisit({ ...creation, note: '  Local  ' }), { ...creation, note: 'Local' });
  assert.deepEqual(parseCreateAgendaVisit(followUp), followUp);
  for (const input of [null, [], { ...creation, date: '2030-02-29' }, { ...creation, module: 'quality' },
    { ...creation, modelId: '__proto__' }, { ...creation, workId: 'invalid' }, { ...creation, note: 'x'.repeat(2001) },
    { ...creation, note: '\u0000' }, { ...creation, createdBy: otherId }, { ...creation, confirmationStatus: 'confirmed' },
    { ...followUp, modelId: 'security-it07-r02' }, { ...creation, modelId: null }]) {
    assert.equal(parseCreateAgendaVisit(input), null);
  }
});

test('confirmation and deletion require a stable request key and integer revision', () => {
  assert.deepEqual(parseConfirmAgendaVisit(confirmation), confirmation);
  for (const rev of [0, -1, 1.5, '1', null, 2147483647]) assert.equal(parseConfirmAgendaVisit({ ...confirmation, expectedRevision: rev }), null);
  assert.equal(parseConfirmAgendaVisit({ ...confirmation, auditorId }), null);
  assert.equal(parseConfirmAgendaVisit({ ...confirmation, date: '2030-03-01' }), null);
});

test('snapshot sends selected profile and strips fields outside the public agenda contract', async () => {
  const auditor = { id: auditorId, name: 'Auditor', role: 'safety-auditor', email: 'not-for-browser@dialogo.com.br', workModuleScopes: [{ workId, module: 'safety' }] };
  const f = fixture({ visits: [{ ...visit, private: 'secret' }], auditors: [auditor] });
  const result = await readAgendaSnapshot(f.client, context());
  assert.equal(result.available, true);
  assert.equal(result.visits[0].private, undefined);
  assert.equal(result.auditors[0].email, undefined);
  assert.deepEqual(result.auditors[0].workIds, [workId]);
  assert.deepEqual(f.calls[0].params, { p_profile: 'ADMINISTRATIVO', p_engineering_scope: null });
  assert.equal(result.notifications[0].type, 'visit_scheduled');
});

test('General administrator discipline views omit visits and auditors from the other module', async () => {
  const qualityVisit = { ...visit, id: '30000000-0000-4000-8000-000000000002', module: 'quality', modelId: 'quality-f175' };
  const auditors = [
    { id: auditorId, name: 'Segurança', role: 'safety-auditor', workModuleScopes: [{ workId, module: 'safety' }] },
    { id: otherId, name: 'Qualidade', role: 'quality-auditor', workModuleScopes: [{ workId, module: 'quality' }] },
  ];
  const safetyContext = context(); safetyContext.administrativeScope = 'SEGURANCA'; safetyContext.user.modules = ['safety'];
  const qualityContext = context(); qualityContext.administrativeScope = 'QUALIDADE'; qualityContext.user.modules = ['quality'];
  const f = fixture({ visits: [visit, qualityVisit], auditors });
  const safety = await readAgendaSnapshot(f.client, safetyContext);
  const quality = await readAgendaSnapshot(f.client, qualityContext);
  assert.deepEqual(safety.visits.map((entry) => entry.id), [visitId]);
  assert.deepEqual(quality.visits.map((entry) => entry.id), [qualityVisit.id]);
  assert.deepEqual(safety.auditors.map((entry) => entry.id), [auditorId]);
  assert.deepEqual(quality.auditors.map((entry) => entry.id), [otherId]);
});

test('auditor bell includes only their pending visits, with a link to the exact visit', async () => {
  const f = fixture();
  const result = await readAgendaSnapshot(f.client, context('safety-auditor'));
  assert.equal(result.notifications.length, 1);
  assert.equal(result.notifications[0].type, 'visit_confirmation_requested');
  assert.equal(result.notifications[0].href, `/app?secao=agenda&visita=${visitId}`);
  const confirmed = fixture({ visits: [{ ...visit, confirmationStatus: 'confirmed', confirmedAt: '2030-02-02T12:00:00Z' }] });
  assert.equal((await readAgendaSnapshot(confirmed.client, context('safety-auditor'))).notifications.length, 0);
  const admin = await readAgendaSnapshot(confirmed.client, context());
  assert.equal(admin.notifications[0].type, 'visit_confirmed');
  assert.equal((await readAgendaSnapshot(f.client, context('engineering'))).notifications.length, 0);
});

test('snapshots fail closed for inconsistent, duplicate and unauthorized records', async () => {
  for (const bad of [{ ...visit, auditorId: otherId }, { ...visit, workId: otherId }, { ...visit, module: 'quality' },
    { ...visit, date: '2030-02-30' }, { ...visit, confirmedAt: '2030-02-02T12:00:00Z' },
    { ...visit, confirmationStatus: 'confirmed', confirmedAt: null }, { ...visit, revision: 0 },
    { ...visit, history: [{ date: 'bad' }] }]) {
    assert.equal((await readAgendaSnapshot(fixture({ visits: [bad] }).client, context('safety-auditor'))).available, false);
  }
  assert.equal((await readAgendaSnapshot(fixture({ visits: [visit, visit] }).client, context())).available, false);
  assert.equal((await readAgendaSnapshot(fixture({ auditors: [{}] }).client, context())).available, false);
  assert.equal((await readAgendaSnapshot(fixture({ auditors: [{}] }).client, context('safety-auditor'))).available, false);
  assert.equal((await readAgendaSnapshot(fixture({ throws: true }).client, context())).available, false);
});

test('new scheduling reaches only the admin RPC with exact fields and no caller override', async () => {
  const f = fixture();
  const result = await createAgendaVisit(creation, context(), f.client);
  assert.equal(result.status, 'success');
  assert.equal(result.snapshot.available, true);
  assert.deepEqual(f.calls[0], { name: 'create_audit_visit', params: {
    p_request_id: requestId, p_obra_id: workId, p_modulo: 'SEGURANCA', p_modelo_id: 'security-it07-r02',
    p_auditor_auth_user_id: auditorId, p_data_prevista: creation.date, p_observacao: creation.note } });
  for (const [input, ctx] of [[creation, context('safety-auditor')], [{ ...creation, date: 'bad' }, context()],
    [{ ...creation, workId: otherId }, context()]]) {
    const blocked = fixture(); assert.equal((await createAgendaVisit(input, ctx, blocked.client)).status, 'error'); assert.equal(blocked.calls.length, 0);
  }
});

test('work follow-up schedules without a model and still asks the assigned professional to confirm', async () => {
  const scheduled = { ...visit, kind: 'follow_up', modelId: null };
  const f = fixture({ visits: [scheduled] });
  const result = await createAgendaVisit(followUp, context(), f.client);
  assert.equal(result.status, 'success');
  assert.deepEqual(f.calls[0], { name: 'create_work_follow_up_visit', params: {
    p_request_id: requestId, p_obra_id: workId, p_modulo: 'SEGURANCA',
    p_auditor_auth_user_id: auditorId, p_data_prevista: followUp.date, p_observacao: followUp.note,
  } });
  const assigned = await readAgendaSnapshot(f.client, context('safety-auditor'));
  assert.equal(assigned.visits[0].kind, 'follow_up');
  assert.equal(assigned.visits[0].modelId, null);
  assert.equal(assigned.notifications[0].type, 'visit_confirmation_requested');
  assert.equal((await confirmAgendaVisit(confirmation, context('safety-auditor'), f.client)).status, 'success');
  const qualityFollowUp = { ...followUp, module: 'quality' };
  const qualityVisit = { ...scheduled, module: 'quality' };
  const qualityFixture = fixture({ visits: [qualityVisit] });
  assert.equal((await createAgendaVisit(qualityFollowUp, context(), qualityFixture.client)).status, 'success');
  assert.equal(qualityFixture.calls[0].params.p_modulo, 'QUALIDADE');
  assert.equal((await readAgendaSnapshot(qualityFixture.client, context('quality-auditor'))).notifications[0].type,
    'visit_confirmation_requested');
});

test('confirmation is scoped to the currently selected auditor before mutation', async () => {
  for (const role of ['administrative', 'engineering', 'quality-auditor']) {
    const f = fixture(); assert.equal((await confirmAgendaVisit(confirmation, context(role), f.client)).status, 'error');
    assert.ok(f.calls.every((call) => call.name === 'read_audit_agenda'));
  }
  const other = fixture({ visits: [{ ...visit, auditorId: otherId }] });
  assert.equal((await confirmAgendaVisit(confirmation, context('safety-auditor'), other.client)).status, 'error');
  assert.equal(other.calls.length, 1);
  const own = fixture();
  assert.equal((await confirmAgendaVisit(confirmation, context('safety-auditor'), own.client)).status, 'success');
  assert.deepEqual(own.calls[1], { name: 'confirm_audit_visit', params: { p_request_id: requestId, p_visit_id: visitId, p_expected_revision: 1 } });
});

test('only the administrator can delete a current visit, removing its notifications', async () => {
  const f = fixture();
  const result = await deleteAgendaVisit(confirmation, context(), f.client);
  assert.equal(result.status, 'success');
  assert.equal(result.snapshot.visits.length, 0);
  assert.equal(result.snapshot.notifications.length, 0);
  assert.deepEqual(f.calls[0], { name: 'delete_audit_visit', params: { p_request_id: requestId, p_visit_id: visitId, p_expected_revision: 1 } });
  const blocked = fixture();
  assert.equal((await deleteAgendaVisit(confirmation, context('safety-auditor'), blocked.client)).status, 'error');
  assert.equal(blocked.calls.length, 0);
  assert.equal((await deleteAgendaVisit(confirmation, context(), f.client)).status, 'success');
  assert.equal(f.calls.filter((call) => call.name === 'delete_audit_visit').length, 2);
  const stale = fixture({ error: { code: '40001' } });
  assert.equal((await deleteAgendaVisit({ ...confirmation, expectedRevision: 2 }, context(), stale.client)).status, 'error');
});

test('a concurrent revision change cannot produce a stale confirmed message', async () => {
  const f = fixture({ postConfirmationVisits: [{ ...visit, revision: 2, date: '2030-03-01', history: [
    { previousDate: visit.date, date: '2030-03-01', note: '', changedBy: adminId, changedAt: '2030-02-02T12:00:01Z' },
  ] }] });
  const result = await confirmAgendaVisit(confirmation, context('safety-auditor'), f.client);
  assert.equal(result.status, 'error');
  assert.match(result.message, /programação mudou/);
  assert.equal(result.snapshot.visits[0].revision, 2);
  assert.equal(result.snapshot.visits[0].confirmationStatus, 'pending_confirmation');
});

test('conflicts, uncertain writes and provider diagnostics never become fake success', async () => {
  const conflicting = fixture({ error: { code: '40001', message: 'private SQL diagnostic' } });
  const result = await confirmAgendaVisit(confirmation, context('safety-auditor'), conflicting.client);
  assert.equal(result.status, 'error'); assert.match(result.message, /programação mudou/);
  assert.doesNotMatch(result.message, /private/);
  for (const f of [fixture({ throws: true }), fixture({ mutationData: null }), fixture({ error: { code: 'PGRST202' } })]) {
    const failed = await createAgendaVisit(creation, context(), f.client);
    assert.equal(failed.status, 'error'); assert.doesNotMatch(failed.message, /private/);
  }
  const savedReadFailed = fixture({ readError: { code: 'unavailable' } });
  const saved = await createAgendaVisit(creation, context(), savedReadFailed.client);
  assert.equal(saved.status, 'success'); assert.equal(saved.snapshot.available, false); assert.match(saved.message, /Atualize/);
  const pendingMigration = fixture({ error: { code: 'PGRST202' } });
  const deletion = await deleteAgendaVisit(confirmation, context(), pendingMigration.client);
  assert.equal(deletion.status, 'error'); assert.match(deletion.message, /atualização do banco/);
});
