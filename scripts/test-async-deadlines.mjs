import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as pause } from 'node:timers/promises';
import { requestSignal } from '../src/lib/request-signal.ts';
import { readWithDeadline } from '../src/lib/read-with-deadline.ts';

test('a network deadline expires without marking caller cancellation', async () => {
  const caller = new AbortController(); const signal = requestSignal(caller.signal, 20);
  await pause(40); assert.equal(signal.aborted, true); assert.equal(signal.reason.name, 'TimeoutError'); assert.equal(caller.signal.aborted, false);
});
test('leaving a page cancels its request immediately and preserves the reason', () => {
  const caller = new AbortController(); const signal = requestSignal(caller.signal); caller.abort(new Error('page changed'));
  assert.equal(signal.aborted, true); assert.equal(signal.reason, caller.signal.reason);
});
test('the same deadline also interrupts a stalled response body', async () => {
  const signal = requestSignal(null, 20);
  const response = new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(signal.reason), { once: true }); } }));
  await Promise.all([assert.rejects(response.json(), { name: 'TimeoutError' }), pause(40)]);
});
test('a read timeout rejects once and never retries or accepts a late result', async () => {
  let requests = 0, resolve; const read = new Promise(done => { requests++; resolve = done; });
  await assert.rejects(readWithDeadline(read, 20), /consulta demorou/); resolve('late'); await pause(10); assert.equal(requests, 1);
});
test('reads return success and propagate failures without a retry', async () => {
  assert.deepEqual(await readWithDeadline(Promise.resolve({ available: true })), { available: true });
  await assert.rejects(readWithDeadline(Promise.reject(new Error('API failed'))), /API failed/);
});
