import assert from 'node:assert/strict';
import test from 'node:test';
import { auditHistoryKey, createAuditHistoryLoader } from '../src/lib/audits/history-loader.ts';

const actor = { userId: 'actor-a', profile: 'AUDITOR_QUALIDADE', engineeringScope: null, administrativeScope: null };
const uuid = (id) => `d1ab0000-0000-4000-8000-${String(id).padStart(12, '0')}`;
const audit = (id = 1) => ({ id: uuid(id), workId: uuid(101), auditorId: uuid(201), auditor: 'Auditor',
  modelId: 'quality-f176', date: '2026-09-23', status: 'Publicada', isDemo: false,
  collectionStatus: 'Coleta concluída', calculationStatus: 'Disponível', finalScore: 8,
  reportUrl: `/api/audits/${uuid(id)}/report` });
const finding = (record = audit()) => ({ id: 'criterion1', auditId: record.id, workId: record.workId,
  modelId: record.modelId, auditDate: record.date, auditor: record.auditor, module: 'quality',
  item: '01.01', description: 'Finding', criterionTitle: 'Criterion', serious: false, nonconformity: 'Finding' });
const page = (query = {}, audits = [audit()]) => ({ available: true, page: query.page ?? 1, pageSize: query.pageSize ?? 10,
  total: ((query.page ?? 1) - 1) * (query.pageSize ?? 10) + audits.length, audits, findings: query.includeFindings === false ? [] : audits.map(finding) });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test('pages load only on demand, deduplicate canonical filters and bind native fetch correctly', async () => {
  const delayed = deferred(); let calls = 0;
  const query = { module: 'quality', workId: uuid(101), page: 1 };
  const loader = createAuditHistoryLoader(actor, async function(url, options) {
    assert.equal(this, undefined);
    calls++;
    const requested = new URL(url, 'https://test.example');
    assert.equal(requested.pathname, '/api/audits/history');
    assert.equal(requested.searchParams.get('usuario'), actor.userId);
    assert.equal(requested.searchParams.get('perfil'), actor.profile);
    assert.equal(requested.searchParams.get('workId'), query.workId);
    assert.equal(requested.searchParams.get('pageSize'), '10');
    assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store');
    return delayed.promise;
  });
  assert.equal(calls, 0);
  const a = loader.loadPage(query);
  const b = loader.loadPage({ workId: query.workId.toUpperCase(), module: 'quality', pageSize: 10, includeFindings: true });
  assert.equal(a, b);
  await Promise.resolve(); assert.equal(calls, 1);
  delayed.resolve(Response.json(page(query))); await a;
  const ready = loader.getState(auditHistoryKey(query));
  await loader.loadPage(query); assert.equal(calls, 1); assert.equal(loader.getState(auditHistoryKey(query)), ready);
  assert.deepEqual(ready.snapshot, page(query));
});

test('separate filters and pages cannot overwrite each other after responses arrive out of order', async () => {
  const first = deferred(), second = deferred();
  const loader = createAuditHistoryLoader(actor, async (url) => new URL(url, 'https://test.example').searchParams.get('page') === '1' ? first.promise : second.promise);
  const one = loader.loadPage({ page: 1 }), two = loader.loadPage({ page: 2 });
  second.resolve(Response.json(page({ page: 2 }, [audit(2)]))); await two;
  first.resolve(Response.json(page({ page: 1 }, [audit(1)]))); await one;
  assert.equal(loader.getState(auditHistoryKey({ page: 1 })).snapshot.audits[0].id, uuid(1));
  assert.equal(loader.getState(auditHistoryKey({ page: 2 })).snapshot.audits[0].id, uuid(2));
});

test('only the final subscriber leaving aborts pending work; StrictMode resubscription reuses it', async () => {
  const delayed = deferred(); let calls = 0, signal;
  const loader = createAuditHistoryLoader(actor, async (_, options) => { calls++; signal = options.signal; return delayed.promise; });
  const key = auditHistoryKey({});
  const first = loader.subscribe(key, () => {}), other = loader.subscribe(key, () => {});
  const loading = loader.loadPage({}); await Promise.resolve();
  first(); await Promise.resolve(); assert.equal(signal.aborted, false);
  other(); const remounted = loader.subscribe(key, () => {}); await Promise.resolve();
  assert.equal(signal.aborted, false); assert.equal(calls, 1);
  remounted(); await Promise.resolve(); assert.equal(signal.aborted, true);
  delayed.resolve(Response.json(page())); await loading;
  assert.equal(loader.getState(key).status, 'idle');
});

test('expired pages revalidate and temporary failures preserve rows while explicit retry recovers', async () => {
  let time = 1000, calls = 0;
  const loader = createAuditHistoryLoader(actor, async () => ++calls === 2
    ? new Response(null, { status: 503 }) : Response.json(page({}, [audit(calls)])), () => time);
  const key = auditHistoryKey({});
  await loader.loadPage({}); time += 59_999; await loader.loadPage({}); assert.equal(calls, 1);
  time++; await loader.loadPage({});
  assert.equal(loader.getState(key).status, 'error'); assert.equal(loader.getState(key).snapshot.audits[0].id, uuid(1));
  await loader.loadPage({}, true); assert.equal(loader.getState(key).status, 'ready');
  assert.equal(loader.getState(key).snapshot.audits[0].id, uuid(3));
});

test('authorization denial clears cached pages and rejects late successful responses', async () => {
  const delayed = deferred();
  const loader = createAuditHistoryLoader(actor, async (url) => {
    const number = Number(new URL(url, 'https://test.example').searchParams.get('page'));
    return number === 1 ? Response.json(page()) : number === 2 ? delayed.promise : new Response(null, { status: 403 });
  });
  await loader.loadPage({}); const pending = loader.loadPage({ page: 2 }); await Promise.resolve();
  await loader.loadPage({ page: 3 });
  delayed.resolve(Response.json(page({ page: 2 }))); await pending;
  assert.equal(loader.getState(auditHistoryKey({})).snapshot, undefined);
  assert.equal(loader.getState(auditHistoryKey({ page: 2 })).snapshot, undefined);
  assert.equal(loader.getState(auditHistoryKey({ page: 3 })).status, 'error');
});

test('cancel prevents late JSON writes and allows a new StrictMode request for the same page', async () => {
  const delayed = deferred(); let calls = 0;
  const loader = createAuditHistoryLoader(actor, async () => ++calls === 1
    ? { ok: true, status: 200, json: () => delayed.promise } : Response.json(page({}, [audit(2)])));
  const previous = loader.loadPage({}); await Promise.resolve(); await Promise.resolve();
  loader.cancel(); await loader.loadPage({}); delayed.resolve(page({}, [audit(1)])); await previous;
  assert.equal(loader.getState(auditHistoryKey({})).snapshot.audits[0].id, uuid(2));
});

test('cache has at most twelve inactive pages, evicted pages reload and profiles never share data', async () => {
  let calls = 0;
  const fetcher = async (url) => {
    calls++; const number = Number(new URL(url, 'https://test.example').searchParams.get('page'));
    return Response.json(page({ page: number }, [audit(number)]));
  };
  const loader = createAuditHistoryLoader(actor, fetcher);
  for (let number = 1; number <= 15; number++) await loader.loadPage({ page: number });
  assert.equal(Array.from({ length: 15 }, (_, i) => loader.getState(auditHistoryKey({ page: i + 1 }))).filter((state) => state.status === 'ready').length, 12);
  assert.equal(loader.getState(auditHistoryKey({ page: 1 })).status, 'idle');
  await loader.loadPage({ page: 1 }); assert.equal(calls, 16);
  const otherProfile = createAuditHistoryLoader({ ...actor, profile: 'ENGENHARIA', engineeringScope: 'COORDENACAO' }, fetcher);
  await otherProfile.loadPage({ page: 1 }); assert.equal(calls, 17);
});

test('malformed pages, foreign findings and unrequested filters never become ready', async () => {
  const query = { workId: uuid(101), module: 'quality', modelId: 'quality-f176', dateFrom: '2026-09-01', dateTo: '2026-09-30', excludeAuditId: uuid(2) };
  for (const change of [
    { available: false }, { page: 2 }, { pageSize: 50 }, { total: -1 }, { total: 30 }, { audits: [] },
    { audits: [audit(), audit()], total: 2 }, { audits: [audit(1), audit(3)], total: 2 },
    { audits: [{ ...audit(), workId: uuid(102) }] }, { audits: [{ ...audit(), modelId: 'security-it07-r02' }] },
    { audits: [{ ...audit(), date: '2026-08-31' }] }, { audits: [{ ...audit(), date: '2026-02-30' }] },
    { audits: [audit(2)] }, { audits: [{ ...audit(), isDemo: true }] },
    { findings: [{ ...finding(), auditId: uuid(3) }] },
  ]) {
    const loader = createAuditHistoryLoader(actor, async () => Response.json({ ...page(query), ...change }));
    await loader.loadPage(query); assert.equal(loader.getState(auditHistoryKey(query)).status, 'error');
  }
  const loader = createAuditHistoryLoader(actor, async () => Response.json(page()));
  await loader.loadPage({ includeFindings: false }); assert.equal(loader.getState(auditHistoryKey({ includeFindings: false })).status, 'error');
});

test('projection excludes detail fields and permits valid empty pages beyond the end', async () => {
  const loader = createAuditHistoryLoader(actor, async () => Response.json({ ...page(), responses: { private: 'data' }, criteriaSnapshots: {},
    audits: [{ ...audit(), responses: { private: 'data' }, photos: ['private.png'] }], findings: [{ ...finding(), photos: ['private.png'] }] }));
  await loader.loadPage({}); assert.deepEqual(loader.getState(auditHistoryKey({})).snapshot, page());
  const empty = createAuditHistoryLoader(actor, async () => Response.json({ ...page({ page: 100 }, []), total: 1 }));
  await empty.loadPage({ page: 100 }); assert.equal(empty.getState(auditHistoryKey({ page: 100 })).status, 'ready');
});

test('invalid queries never fetch, and synchronous failures can be retried', async () => {
  let calls = 0;
  const loader = createAuditHistoryLoader(actor, () => {
    if (++calls === 1) throw new Error('offline');
    return Promise.resolve(Response.json(page()));
  });
  for (const query of [{ page: 0 }, { pageSize: 51 }, { workId: 'invalid' }, { dateFrom: '2026-02-30' }]) await assert.rejects(loader.loadPage(query));
  assert.equal(calls, 0); await loader.loadPage({}); assert.equal(loader.getState(auditHistoryKey({})).status, 'error');
  await loader.loadPage({}); assert.equal(loader.getState(auditHistoryKey({})).status, 'ready');
});
