import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuditComparisonLoader } from '../src/lib/audits/comparison-loader.ts';

const reference = (n) => ({ id: `b1760000-2026-4923-8000-${String(n).padStart(12, '0')}`,
  workId: 'd1ac0000-0000-4000-8000-000000000101', modelId: 'quality-f176', date: '2026-09-23' });
const refs = [1, 2, 3].map(reference);
const actor = { userId: 'actor-a', profile: 'AUDITOR_QUALIDADE', engineeringScope: null, administrativeScope: null };
const comparison = (ref) => ({ ...ref, answers: { item1: 'Conforme', item2: 'Não conforme', item3: 'N/A' } });
const response = (audits, available = true) => Response.json({ available, audits });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const requestedIds = (url) => new URL(url, 'https://app.example').searchParams.get('ids').split(',');

test('history loads only on demand, batches three answers and reuses a profile cache', async () => {
  const calls = [];
  const loader = createAuditComparisonLoader(actor, async function(url, options) {
    assert.equal(this, undefined, 'Native fetch must not receive the loader as its receiver');
    calls.push(url);
    const query = new URL(url, 'https://app.example');
    assert.equal(query.pathname, '/api/audits/comparison');
    assert.equal(query.searchParams.get('usuario'), actor.userId);
    assert.equal(query.searchParams.get('perfil'), actor.profile);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'same-origin');
    return response(refs.map(comparison));
  });
  assert.equal(calls.length, 0);
  await loader.loadAudits(refs);
  const first = loader.getSnapshot();
  await loader.loadAudits([...refs].reverse());
  assert.equal(calls.length, 1);
  assert.deepEqual(requestedIds(calls[0]), refs.map((ref) => ref.id));
  assert.equal(loader.getSnapshot(), first);
  for (const ref of refs) assert.deepEqual(first[ref.id], { status: 'loaded', audit: comparison(ref) });
});

test('overlapping requests share in-flight IDs and fetch only missing comparisons', async () => {
  const first = deferred(), last = deferred(), calls = [];
  const loader = createAuditComparisonLoader(actor, async (url) => {
    calls.push(requestedIds(url)); return calls.length === 1 ? first.promise : last.promise;
  });
  const a = loader.loadAudits(refs.slice(0, 2));
  const b = loader.loadAudits(refs.slice(1));
  await Promise.resolve();
  assert.deepEqual(calls, [[refs[0].id, refs[1].id], [refs[2].id]]);
  first.resolve(response(refs.slice(0, 2).map(comparison)));
  last.resolve(response([comparison(refs[2])]));
  await Promise.all([a, b]);
  assert.equal(Object.values(loader.getSnapshot()).filter((state) => state.status === 'loaded').length, 3);
});

test('missing records remain errors and a retry requests only the absent audit', async () => {
  const calls = [];
  const loader = createAuditComparisonLoader(actor, async (url) => {
    calls.push(requestedIds(url));
    return response(calls.length === 1 ? [comparison(refs[0])] : [{ ...refs[1], answers: {} }]);
  });
  await loader.loadAudits(refs.slice(0, 2));
  assert.equal(loader.getSnapshot()[refs[0].id].status, 'loaded');
  assert.equal(loader.getSnapshot()[refs[1].id].status, 'error');
  await loader.loadAudits(refs.slice(0, 2));
  assert.deepEqual(calls[1], [refs[1].id]);
  assert.deepEqual(loader.getSnapshot()[refs[1].id].audit.answers, {}, 'A valid audit with no answers still supplies its date column');
});

test('unavailable, invalid or out-of-context payloads cannot become comparison data', async () => {
  const valid = comparison(refs[0]);
  for (const body of [
    { available: false, audits: [valid] },
    { available: true, audits: [{ ...valid, id: refs[1].id }] },
    { available: true, audits: [{ ...valid, workId: 'other-work' }] },
    { available: true, audits: [{ ...valid, modelId: 'security-it07-r02' }] },
    { available: true, audits: [{ ...valid, date: '2025-01-01' }] },
    { available: true, audits: [{ ...valid, answers: { item1: 10 } }] },
    { available: true, audits: [valid, valid] },
  ]) {
    const loader = createAuditComparisonLoader(actor, async () => Response.json(body));
    await loader.loadAudits([refs[0]]);
    assert.equal(loader.getSnapshot()[refs[0].id].status, 'error');
  }
});

test('synchronous failures and HTTP denial can be retried without a stuck in-flight entry', async () => {
  for (const status of ['throw', 401, 403, 503]) {
    let calls = 0;
    const loader = createAuditComparisonLoader(actor, () => {
      if (++calls > 1) return Promise.resolve(response([comparison(refs[0])]));
      if (status === 'throw') throw new Error('offline');
      return Promise.resolve(new Response(null, { status }));
    });
    await loader.loadAudits([refs[0]]);
    assert.equal(loader.getSnapshot()[refs[0].id].status, 'error');
    await loader.loadAudits([refs[0]]);
    assert.equal(calls, 2);
    assert.equal(loader.getSnapshot()[refs[0].id].status, 'loaded');
  }
});

test('profile disposal clears cached answers and ignores late network and JSON completions', async () => {
  for (const phase of ['network', 'json']) {
    const late = deferred(); let signal;
    const loader = createAuditComparisonLoader(actor, async (_, options) => {
      signal = options.signal;
      return phase === 'network' ? late.promise : { ok: true, json: () => late.promise };
    });
    const loading = loader.loadAudits([refs[0]]);
    await Promise.resolve(); await Promise.resolve();
    loader.cancel(); assert.equal(signal.aborted, true);
    late.resolve(phase === 'network' ? response([comparison(refs[0])]) : { available: true, audits: [comparison(refs[0])] });
    await loading;
    assert.deepEqual(loader.getSnapshot(), {});
  }
  let calls = 0;
  const fetcher = async () => { calls++; return response([comparison(refs[0])]); };
  const a = createAuditComparisonLoader(actor, fetcher);
  const b = createAuditComparisonLoader({ ...actor, userId: 'actor-b' }, fetcher);
  await a.loadAudits([refs[0]]); await b.loadAudits([refs[0]]);
  assert.equal(calls, 2);
});

test('StrictMode cancellation can restart immediately and old responses cannot overwrite it', async () => {
  const late = deferred(); let calls = 0;
  const loader = createAuditComparisonLoader(actor, async () => ++calls === 1 ? late.promise : response([comparison(refs[0])]));
  const old = loader.loadAudits([refs[0]]); await Promise.resolve();
  loader.cancel(); await loader.loadAudits([refs[0]]);
  late.resolve(response([{ ...refs[0], answers: { item1: 'stale' } }])); await old;
  assert.equal(loader.getSnapshot()[refs[0].id].audit.answers.item1, 'Conforme');
});

test('cache stays bounded and an evicted history loads again; invalid batches never fetch', async () => {
  const all = Array.from({ length: 18 }, (_, index) => reference(index + 1)); let calls = 0;
  const loader = createAuditComparisonLoader(actor, async (url) => {
    calls++;
    return response(requestedIds(url).map((id) => comparison(all.find((ref) => ref.id === id))));
  });
  for (const ref of all) await loader.loadAudits([ref]);
  assert.equal(Object.keys(loader.getSnapshot()).length, 12);
  assert.equal(loader.getSnapshot()[all[0].id], undefined);
  await loader.loadAudits([all[0]]); assert.equal(calls, 19);
  await loader.loadAudits([]);
  for (const batch of [all.slice(0, 4), [all[0], all[0]], [{ ...all[0], id: 'invalid' }]]) await assert.rejects(loader.loadAudits(batch));
  assert.equal(calls, 19);
});
