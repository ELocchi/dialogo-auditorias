import assert from 'node:assert/strict';
import test from 'node:test';
import { AgendaSyncClient } from '../src/lib/agenda/sync-client.ts';
import { readAgendaUpdate } from '../src/lib/agenda/service.ts';

const revision = 'a'.repeat(32), nextRevision = 'b'.repeat(32);
const actor = { userId: 'fixture-user', profile: 'ENGENHARIA', engineeringScope: 'COORDENACAO', administrativeScope: null };
const snapshot = { available: true, revision, visits: [{ id: 'visit-1' }], auditors: [], notifications: [{ id: 'visit-1:1:pending' }] };
const changed = { ...snapshot, revision: nextRevision, visits: [{ id: 'visit-2' }] };
const ok = (data) => Response.json(data, { headers: { ETag: `"${data.revision}"` } });
const defer = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function fixture(fetcher, initial = snapshot) {
  const calls = [];
  const client = new AgendaSyncClient(initial, actor, (...args) => { calls.push(args); return fetcher(...args); });
  client.activate();
  return { client, calls };
}

test('unchanged poll sends the current revision, has no JSON parse and no React store notification', async () => {
  const { client, calls } = fixture(async () => ({ status: 304, headers: new Headers({ ETag: `"${revision}"` }), json() { throw new Error('304 has no body'); } }));
  let notifications = 0; client.subscribe(() => notifications++);
  await client.refresh(); await client.refresh();
  assert.equal(client.getState().agenda, snapshot); assert.equal(notifications, 0);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1].headers['If-None-Match'], `"${revision}"`);
  assert.match(calls[0][0], /atuacao=COORDENACAO/);
  assert.equal(calls[0][1].cache, 'no-store');
});

test('temporary failures preserve available data; recovery clears error; authorization failure clears data', async () => {
  let status = 503;
  const { client } = fixture(async () => status === 200 ? ok(changed) : new Response(null, { status }));
  for (status of [503, 404, 500]) {
    await client.refresh(); assert.equal(client.getState().agenda, snapshot); assert.ok(client.getState().agendaSyncError);
  }
  status = 200; await client.refresh(); assert.deepEqual(client.getState().agenda, changed);
  assert.equal(client.getState().agenda.revision, nextRevision); assert.equal(client.getState().agendaSyncError, '');
  for (status of [401, 403]) { await client.refresh(); assert.equal(client.getState().agenda.available, false); assert.equal(client.getState().agenda.visits.length, 0); }
});

test('one poll at a time; changing profile/disposal prevents old results from applying', async () => {
  const pending = defer(); const { client, calls } = fixture(() => pending.promise);
  const first = client.refresh(); await client.refresh(); assert.equal(calls.length, 1);
  client.dispose(); assert.equal(calls[0][1].signal.aborted, true);
  const other = fixture(async () => ok(changed), { ...snapshot, visits: [] });
  pending.resolve(ok(changed)); await first;
  assert.equal(client.getState().agenda, snapshot); assert.deepEqual(other.client.getState().agenda.visits, []);
});

test('late response and late JSON parsing cannot overwrite a completed mutation', async () => {
  for (const stage of ['response', 'json']) {
    const pending = defer();
    const response = stage === 'response' ? pending.promise : Promise.resolve({ ok: true, status: 200,
      headers: new Headers({ ETag: `"${revision}"` }), json: () => pending.promise });
    const { client, calls } = fixture(() => response);
    const refreshing = client.refresh(); await Promise.resolve();
    const mutation = await client.runAction('confirm', { id: 'visit-1' }, async () => ({ status: 'success', message: '', snapshot: changed }));
    assert.equal(mutation.status, 'success'); assert.equal(calls[0][1].signal.aborted, true);
    pending.resolve(stage === 'response' ? ok(snapshot) : snapshot); await refreshing;
    assert.equal(client.getState().agenda, changed); assert.equal(client.getState().mutationPending, false);
  }
});

test('publication cancels a pending read, clears its token and prevents a completed visit returning', async () => {
  const pending = defer(); const { client, calls } = fixture(() => pending.promise);
  const refreshing = client.refresh(); client.removePublishedVisit('visit-1');
  assert.equal(calls[0][1].signal.aborted, true);
  pending.resolve(ok(snapshot)); await refreshing;
  assert.deepEqual(client.getState().agenda.visits, []); assert.deepEqual(client.getState().agenda.notifications, []);
  assert.equal(client.getState().agenda.revision, undefined);
});

test('mutation idempotency survives retry, unknown success forces a full read, and profile cancellation discards mutation', async () => {
  const { client, calls } = fixture(async () => ok(changed));
  let requestId;
  await client.runAction('delete', { id: 1 }, async (id) => { requestId = id; throw new Error('connection lost'); });
  await client.runAction('delete', { id: 1 }, async (id) => {
    assert.equal(id, requestId); return { status: 'success', message: '', snapshot: { available: false, visits: [], auditors: [], notifications: [] } };
  });
  assert.equal(client.getState().agenda.available, true); assert.equal(client.getState().agenda.revision, undefined);
  await client.refresh(); assert.equal(calls[0][1].headers, undefined);
  const pending = defer(); const mutation = client.runAction('create', {}, () => pending.promise);
  client.dispose(); pending.resolve({ status: 'success', message: '', snapshot }); await mutation;
  assert.equal(client.getState().agenda.revision, nextRevision);
});

test('invalid or unsolicited 304 never clears existing errors or introduces a snapshot', async () => {
  for (const initial of [snapshot, { ...snapshot, revision: undefined }]) {
    const { client } = fixture(async () => new Response(null, { status: 304, headers: { ETag: `"${nextRevision}"` } }), initial);
    await client.refresh(); assert.equal(client.getState().agenda, initial); assert.ok(client.getState().agendaSyncError);
  }
});

test('server DAL performs one conditional RPC and validates unchanged revision before accepting it', async () => {
  const context = { profile: 'ENGENHARIA', engineeringScope: 'COORDENACAO', administrativeScope: null };
  let calls = 0;
  const rpc = async (name, args) => { calls++; assert.equal(name, 'read_audit_agenda_if_changed');
    assert.deepEqual(args, { p_profile: context.profile, p_engineering_scope: context.engineeringScope,
      p_administrative_scope: null, p_known_revision: revision });
    return { data: { unchanged: true, revision }, error: null }; };
  assert.deepEqual(await readAgendaUpdate({ rpc }, context, revision), { unchanged: true, revision }); assert.equal(calls, 1);
  for (const data of [{ unchanged: true, revision: nextRevision }, { unchanged: true, revision: 'bad' }, { unchanged: null, revision }]) {
    const result = await readAgendaUpdate({ rpc: async () => ({ data, error: null }) }, context, revision);
    assert.equal(result.unchanged, false); assert.equal(result.snapshot.available, false);
  }
});

test('native browser fetch is invoked without assigning the synchronizer as its receiver', async () => {
  let called = false;
  const client = new AgendaSyncClient(snapshot, actor, async function () {
    assert.equal(this, undefined); called = true;
    return new Response(null, { status: 304, headers: { ETag: `"${revision}"` } });
  });
  client.activate(); await client.refresh();
  assert.equal(called, true); assert.equal(client.getState().agendaSyncError, '');
});
