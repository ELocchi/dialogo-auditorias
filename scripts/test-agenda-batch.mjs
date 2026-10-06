import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgendaVisitsBatch, parseCreateAgendaBatch } from '../src/lib/agenda/batch-service.ts';

const id = n => `d1b80000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const audit = { requestId: id(1), workId: id(2), auditorId: id(3), module: 'safety', kind: 'audit', modelId: 'security-it07-r02', date: '2030-02-20', note: '' };
const followUp = { ...audit, requestId: id(4), kind: 'follow_up', modelId: null };
const context = { profile: 'ADMINISTRATIVO', engineeringScope: null, administrativeScope: 'GERAL', works: [{ id: id(2), name: 'Fixture work', status: 'Ativa' }],
  user: { id: id(5), name: 'Admin fixture', role: 'administrative', modules: ['safety', 'quality'], workIds: [id(2)], agendaWorkIds: [id(2)], documentWorkIds: [] } };
function fixture(options = {}) {
  const calls = [];
  return { calls, client: { async rpc(name, params) {
    calls.push({ name, params: structuredClone(params) });
    if (options.throws) throw new Error('private provider diagnostic');
    if (name === 'create_agenda_visits_batch') return { data: Object.hasOwn(options, 'data') ? options.data : params.p_visits.map((_, index) => id(100 + index)), error: options.error ?? null };
    assert.equal(name, 'read_audit_agenda_month');
    return { data: { unchanged: false, revision: 'a'.repeat(32), snapshot: { visits: [], auditors: [] } }, error: options.readError ?? null };
  } } };
}

test('batch accepts 1 to 200 valid rows and rejects duplicate canonical request UUIDs, empty or invalid items', () => {
  assert.deepEqual(parseCreateAgendaBatch([audit, followUp]), [audit, followUp]);
  for (const input of [null, {}, [], [null], [audit, audit], [audit, { ...audit, requestId: audit.requestId.toUpperCase() }],
    [audit, { ...followUp, date: '2030-02-30' }], [audit, { ...followUp, actor: id(5) }], Array.from({ length: 201 }, (_, i) => ({ ...audit, requestId: id(i + 10) }))]) {
    assert.equal(parseCreateAgendaBatch(input), null);
  }
  assert.equal(parseCreateAgendaBatch(Array.from({ length: 200 }, (_, i) => ({ ...audit, requestId: id(i + 10) }))).length, 200);
});

test('mixed batch creates once and refreshes once regardless of number of visits', async () => {
  for (const rows of [[audit, followUp], Array.from({ length: 200 }, (_, i) => ({ ...audit, requestId: id(i + 1000) }))]) {
    const f = fixture(); const result = await createAgendaVisitsBatch(rows, context, f.client);
    assert.equal(result.status, 'success'); assert.equal(result.snapshot.available, true);
    assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[0], { name: 'create_agenda_visits_batch', params: { p_visits: rows } });
  }
});

test('invalid payload or unauthorized single row rejects complete batch before any RPC', async () => {
  for (const [rows, ctx] of [[[], context], [[audit, { ...followUp, workId: id(999) }], context],
    [[audit], { ...context, user: { ...context.user, role: 'engineering', activity: 'coordination' } }],
    [[audit], { ...context, user: { ...context.user, modules: ['quality'] } }]]) {
    const f = fixture(); assert.equal((await createAgendaVisitsBatch(rows, ctx, f.client)).status, 'error'); assert.equal(f.calls.length, 0);
  }
});

test('SQL error preserves safe retries and never reads partial or supposedly successful snapshot', async () => {
  for (const code of ['42501', '22023', '22008', '40001', 'PGRST202', '42883', 'XX000']) {
    const f = fixture({ error: { code, message: 'private database diagnostic' } });
    const result = await createAgendaVisitsBatch([audit, followUp], context, f.client);
    assert.equal(result.status, 'error'); assert.equal(f.calls.length, 1); assert.doesNotMatch(result.message, /private/);
  }
});

test('invalid response cannot silently accept a partial batch', async () => {
  for (const data of [null, id(100), [], [id(100)], [id(100), id(100)], [id(100), 'invalid']]) {
    const f = fixture({ data }); assert.equal((await createAgendaVisitsBatch([audit, followUp], context, f.client)).status, 'error'); assert.equal(f.calls.length, 1);
  }
});

test('unavailable final read still reports committed batch and does not resubmit mutation', async () => {
  const f = fixture({ readError: { code: '42501' } }); const result = await createAgendaVisitsBatch([audit, followUp], context, f.client);
  assert.equal(result.status, 'success'); assert.equal(result.snapshot.available, false); assert.match(result.message, /Atualize/); assert.equal(f.calls.length, 2);
});

test('retry forwards exactly the same per-row UUIDs and catches unknown network failure without success', async () => {
  const rows = [audit, followUp]; const f = fixture({ throws: true });
  for (let attempt = 0; attempt < 2; attempt++) assert.equal((await createAgendaVisitsBatch(rows, context, f.client)).status, 'error');
  assert.deepEqual(f.calls[0], f.calls[1]); assert.deepEqual(rows, [audit, followUp]);
});
