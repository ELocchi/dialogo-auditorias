import assert from 'node:assert/strict';
import test from 'node:test';
import { archivedReportPdf } from '../src/lib/documents/archive.ts';
const id = '10000000-0000-4000-8000-000000000001';
const pdf = new TextEncoder().encode('%PDF-1.7\noriginal');
function fixture() {
  const state = { bytes: null, uploads: 0, outage: false, failedUpload: false, competitor: null };
  return { state, client: { storage: { from: bucket => {
    assert.equal(bucket, 'orientative-report-pdfs');
    return {
      download: async () => state.outage ? { error: { statusCode: '503' } }
        : state.bytes ? { data: new Blob([state.bytes]) } : { error: { statusCode: '404' } },
      upload: async (path, bytes, options) => {
        assert.equal(options.upsert, false);
        assert.equal(path, `standalone/${id}.pdf`);
        state.uploads++;
        if (state.failedUpload) return { error: { statusCode: '503' } };
        if (state.competitor) { state.bytes = state.competitor; return { error: { statusCode: '409' } }; }
        state.bytes = bytes; return {};
      },
    };
  } } } };
}
test('preserved PDF remains byte-identical when originals disappear', async () => {
  const { client, state } = fixture();
  assert.deepEqual(await archivedReportPdf(client, 'standalone', id, async () => pdf), pdf);
  assert.deepEqual(await archivedReportPdf(client, 'standalone', id, async () => { throw Error('Photo removed'); }), pdf);
  assert.equal(state.uploads, 1);
});
test('concurrent creation returns the winner without overwriting', async () => {
  const { client, state } = fixture();
  state.competitor = pdf;
  assert.deepEqual(await archivedReportPdf(client, 'standalone', id, async () => new TextEncoder().encode('%PDF-other')), pdf);
});
test('storage failure never regenerates or claims preservation', async () => {
  const { client, state } = fixture(); state.outage = true;
  await assert.rejects(archivedReportPdf(client, 'standalone', id, async () => assert.fail('Must not regenerate')));
  state.outage = false; state.failedUpload = true;
  await assert.rejects(archivedReportPdf(client, 'standalone', id, async () => pdf));
  assert.equal(state.bytes, null);
});
test('invalid PDFs and paths are rejected', async () => {
  const { client, state } = fixture();
  await assert.rejects(archivedReportPdf(client, 'standalone', '../secret', async () => pdf));
  await assert.rejects(archivedReportPdf(client, 'standalone', id, async () => new Uint8Array([1])));
  assert.equal(state.uploads, 0);
});
