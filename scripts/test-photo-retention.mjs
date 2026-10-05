import assert from 'node:assert/strict';
import test from 'node:test';
import { followUpExpiresAt, followUpRemovalReason, auditPhotosSuperseded, backupExpiresAt, canRemovePhoto } from '../src/domain/photo-retention.ts';
test('three calendar months from finding publication, including month-end and São Paulo midnight', () => {
  assert.equal(followUpExpiresAt('2026-10-05T12:00:00-03:00'), '2027-01-05T15:00:00.000Z');
  assert.equal(followUpExpiresAt('2026-01-31T23:30:00-03:00'), '2026-05-01T02:30:00.000Z');
  assert.equal(followUpExpiresAt('2027-11-30T10:00:00-03:00'), '2028-02-29T13:00:00.000Z');
  assert.throws(() => followUpExpiresAt('2026-10-05'));
});
test('completion or expiration, never before publication', () => {
  const photo = { publishedAt: '2026-10-05T12:00:00Z', completedAt: null };
  assert.equal(followUpRemovalReason(photo, '2027-01-05T11:59:59Z'), null);
  assert.equal(followUpRemovalReason(photo, '2027-01-05T12:00:00Z'), 'expired');
  photo.completedAt = '2026-10-06T12:00:00Z';
  assert.equal(followUpRemovalReason(photo, '2026-10-06T12:00:00Z'), 'completed');
  assert.equal(followUpRemovalReason(photo, '2026-10-04T12:00:00Z'), null);
});
test('only a later published audit of the same work and discipline supersedes photos', () => {
  const a = { id: 'a', workId: 'work1', module: 'safety', publishedAt: '2026-10-05T12:00:00Z' };
  const b = { ...a, id: 'b', publishedAt: '2026-11-05T12:00:00Z' };
  const now = '2026-11-06T12:00:00Z';
  assert.equal(auditPhotosSuperseded(a, b, now), true);
  for (const override of [{ workId: 'work2' }, { module: 'quality' }, { id: 'a' }, { publishedAt: a.publishedAt }])
    assert.equal(auditPhotosSuperseded(a, { ...b, ...override }, now), false);
  assert.equal(auditPhotosSuperseded(a, b, a.publishedAt), false);
});
test('daily backup retained seven days and every cleanup gate is required', () => {
  assert.equal(backupExpiresAt('2026-10-05T03:00:00Z'), '2026-10-12T03:00:00.000Z');
  const gates = { eligible: true, allPublishedPdfsPreserved: true, verifiedDailyBackup: true, activeDraftReferences: false, cleanupEnabled: true };
  assert.equal(canRemovePhoto(gates), true);
  for (const key of Object.keys(gates)) assert.equal(canRemovePhoto({ ...gates, [key]: !gates[key] }), false);
});
