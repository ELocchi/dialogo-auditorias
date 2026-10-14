import assert from 'node:assert/strict';
import test from 'node:test';
import { createGlobalAuditDashboardReader } from '../src/lib/audits/dashboard-service.ts';

const workId = 'd1d70000-0000-4000-8000-000000000101';
const score = { workId, workName: 'Obra sem vínculo', month: '2026-10', discipline: 'safety', score: 8 };
const context = (profile) => ({ profile,
  engineeringScope: profile === 'ENGENHARIA' ? 'EQUIPE_OBRA' : null,
  administrativeScope: profile === 'ADMINISTRATIVO' ? 'QUALIDADE' : null,
  user: { id: 'd1d70000-0000-4000-8000-000000000001', modules: ['quality'], workIds: [], workModuleScopes: [] }, works: [],
});
function client() {
  return { scores: [score], failure: false, scopedHints: [],
    async rpc(name, args) {
      if (name === 'read_global_audit_ranking') return { data: this.scores, error: this.failure ? { code: '42501' } : null };
      assert.equal(name, 'read_published_audit_overview_if_changed');
      this.scopedHints.push(args.p_known_revision);
      return { data: { revision: 'a'.repeat(32), unchanged: args.p_known_revision === 'a'.repeat(32),
        ...(args.p_known_revision ? {} : { audits: [], findings: [], workFindings: [] }) }, error: null };
    },
  };
}

test('all profiles see both disciplines and unassigned works, without gaining audit details', async () => {
  const read = createGlobalAuditDashboardReader();
  const db = client(); db.scores.push({ ...score, discipline: 'quality', score: 9 });
  let expected;
  for (const profile of ['AUDITOR_SEGURANCA', 'AUDITOR_QUALIDADE', 'ENGENHARIA', 'ADMINISTRATIVO']) {
    const result = await read(db, context(profile));
    assert.equal(result.available, true);
    assert.equal(result.publishedCount, 0);
    assert.deepEqual(result.mostSevere, []);
    assert.deepEqual(result.pendingPlanKeys, []);
    assert.equal(result.ranking.monthly['2026-10'].safety[0].score, 8);
    assert.equal(result.ranking.monthly['2026-10'].quality[0].score, 9);
    if (expected) assert.deepEqual(result.ranking, expected);
    expected = result.ranking;
  }
});

test('reload sees publication and removal even while the scoped summary cache is unchanged', async () => {
  const read = createGlobalAuditDashboardReader(); const db = client(); const ctx = context('AUDITOR_QUALIDADE');
  await read(db, ctx);
  db.scores = [{ ...score, month: '2026-11', score: 10 }];
  const added = await read(db, ctx);
  assert.equal(db.scopedHints.at(-1), 'a'.repeat(32));
  assert.equal(added.ranking.monthly['2026-11'].safety[0].score, 10);
  assert.equal(added.ranking.monthly['2026-10'], undefined);
  db.scores = [];
  assert.deepEqual((await read(db, ctx)).ranking.months, []);
});

test('failed or malformed global reads do not fall back to a misleading scoped ranking', async () => {
  const read = createGlobalAuditDashboardReader(); const db = client(); const ctx = context('AUDITOR_QUALIDADE');
  await read(db, ctx); db.failure = true;
  assert.equal((await read(db, ctx)).available, false);
  db.failure = false; db.scores = [{ ...score, score: 11 }];
  assert.equal((await read(db, ctx)).available, false);
});
