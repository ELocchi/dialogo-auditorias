import assert from "node:assert/strict";
import { test } from "node:test";
import { createFollowUpPhotoLoader } from "../src/lib/follow-up/photo-loader.ts";

const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = { userId: id(1), profile: "AUDITOR_QUALIDADE", engineeringScope: null, administrativeScope: null };
const photo = (visit, n = 1) => ({ visitId: visit, findingId: id(n), fileName: `${id(n)}_${id(999)}.jpg` });
const tick = async () => { await new Promise((resolve) => setImmediate(resolve)); };
function fixture() {
  const calls = [];
  const fetcher = (url, options) => new Promise((resolve, reject) => { calls.push({ url, options, resolve, reject }); });
  const resolve = async (index, photos = [], status = 200) => {
    calls[index].resolve(new Response(JSON.stringify({ available: status === 200, photos }), { status }));
    await tick();
  };
  return { calls, fetcher, resolve };
}

test("does not read photos until a row is visible; subscriptions alone are inert", async () => {
  const f = fixture(); const store = createFollowUpPhotoLoader(actor, f.fetcher);
  const stop = store.subscribe(id(10), () => {});
  assert.equal(store.getState(id(10)).status, "idle");
  await tick(); assert.equal(f.calls.length, 0);
  const release = store.acquire(id(10)); await tick();
  assert.equal(f.calls.length, 1);
  const url = new URL(f.calls[0].url, "http://fixture");
  assert.equal(url.pathname, `/api/follow-up/visits/${id(10)}/photos`);
  assert.equal(url.searchParams.get("usuario"), actor.userId);
  assert.equal(url.searchParams.get("perfil"), actor.profile);
  assert.equal(f.calls[0].options.cache, "no-store");
  assert.equal(f.calls[0].options.credentials, "same-origin");
  await f.resolve(0, [photo(id(10))]);
  assert.deepEqual(store.getState(id(10)).photos, [photo(id(10))]);
  release(); stop();
});

test("two findings from one visit share a request; only the last departure cancels it", async () => {
  const f = fixture(); const store = createFollowUpPhotoLoader(actor, f.fetcher);
  const a = store.acquire(id(10)); const b = store.acquire(id(10)); await tick();
  assert.equal(f.calls.length, 1);
  a(); await tick(); assert.equal(f.calls[0].options.signal.aborted, false);
  b(); await tick(); assert.equal(f.calls[0].options.signal.aborted, true);
  await f.resolve(0, [photo(id(10))]);
  assert.equal(store.getState(id(10)).status, "idle");
});

test("at most two listings run concurrently and an offscreen queued visit is skipped", async () => {
  const f = fixture(); const store = createFollowUpPhotoLoader(actor, f.fetcher);
  const releases = [10, 11, 12, 13].map((n) => store.acquire(id(n)));
  await tick(); assert.equal(f.calls.length, 2);
  releases[2](); await tick();
  await f.resolve(0); assert.equal(f.calls.length, 3);
  assert.ok(f.calls[2].url.includes(id(13)));
  await f.resolve(1); await f.resolve(2);
  releases.forEach((release) => release());
});

test("StrictMode release and immediate reacquire preserve the shared request", async () => {
  const f = fixture(); const store = createFollowUpPhotoLoader(actor, f.fetcher);
  const a = store.acquire(id(10)); a(); const b = store.acquire(id(10)); await tick();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.signal.aborted, false);
  await f.resolve(0); b();
});

test("upload replacement wins even if the old listing ignores cancellation", async () => {
  const f = fixture(); const store = createFollowUpPhotoLoader(actor, f.fetcher);
  const release = store.acquire(id(10)); await tick();
  store.replace(id(10), [photo(id(10), 2)]);
  assert.equal(f.calls[0].options.signal.aborted, true);
  await f.resolve(0, []);
  assert.deepEqual(store.getState(id(10)).photos, [photo(id(10), 2)]);
  assert.equal(store.getState(id(10)).status, "ready"); release();
});

test("listing failure is distinct from empty photos and only an explicit retry refetches", async () => {
  const f = fixture(); const store = createFollowUpPhotoLoader(actor, f.fetcher);
  const release = store.acquire(id(10)); await tick(); await f.resolve(0, [], 503);
  assert.equal(store.getState(id(10)).status, "error");
  const second = store.acquire(id(10)); await tick(); assert.equal(f.calls.length, 1);
  store.retry(id(10)); await tick(); assert.equal(f.calls.length, 2);
  await f.resolve(1, []);
  assert.deepEqual(store.getState(id(10)), { status: "ready", photos: [] });
  release(); second();
});

test("401/403 clears cached names, aborts all listings and blocks further reads for this context", async () => {
  for (const status of [401, 403]) {
    const f = fixture(); const store = createFollowUpPhotoLoader(actor, f.fetcher);
    const releases = [10, 11, 12].map((n) => store.acquire(id(n)));
    await tick(); await f.resolve(0, [photo(id(10))]);
    await f.resolve(1, [], status);
    assert.equal(f.calls[2].options.signal.aborted, true);
    await f.resolve(2, [photo(id(12))]);
    for (const n of [10, 11, 12]) {
      assert.equal(store.getState(id(n)).status, "error");
      assert.deepEqual(store.getState(id(n)).photos, []);
      assert.match(store.getState(id(n)).message, /acesso/);
    }
    store.replace(id(10), [photo(id(10))]); store.retry(id(10)); store.acquire(id(13));
    await tick(); assert.equal(f.calls.length, 3); assert.deepEqual(store.getState(id(10)).photos, []);
    releases.forEach((release) => release()); store.cancel();
  }
});

test("switching profiles cancels and isolates data, including late responses", async () => {
  const f = fixture(); const oldStore = createFollowUpPhotoLoader(actor, f.fetcher);
  oldStore.acquire(id(10)); await tick(); oldStore.cancel();
  const next = createFollowUpPhotoLoader({ ...actor, profile: "AUDITOR_SEGURANCA" }, f.fetcher);
  next.acquire(id(10)); await tick();
  await f.resolve(1, []); await f.resolve(0, [photo(id(10))]);
  assert.equal(oldStore.getState(id(10)).status, "idle");
  assert.deepEqual(next.getState(id(10)).photos, []);
  assert.ok(f.calls[1].url.includes("AUDITOR_SEGURANCA")); next.cancel();
});

test("rejects malformed lists, duplicate filenames and photos belonging to another visit/finding", async () => {
  for (const photos of [[photo(id(11))], [{ ...photo(id(10)), findingId: id(30) }],
    [{ ...photo(id(10)), fileName: "../wrong.jpg" }], [photo(id(10)), photo(id(10))]]) {
    const f = fixture(); const store = createFollowUpPhotoLoader(actor, f.fetcher);
    store.acquire(id(10)); await tick(); await f.resolve(0, photos);
    assert.equal(store.getState(id(10)).status, "error");
    assert.deepEqual(store.getState(id(10)).photos, []); store.cancel();
  }
});

test("cache is bounded for inactive visits without dropping visits beyond the old 100 limit", async () => {
  let calls = 0;
  const store = createFollowUpPhotoLoader(actor, async (url) => {
    calls++; const visit = url.split("/")[4];
    return new Response(JSON.stringify({ available: true, photos: [photo(visit)] }));
  });
  for (let n = 10; n < 120; n++) {
    const release = store.acquire(id(n)); await tick();
    assert.equal(store.getState(id(n)).status, "ready"); release(); await tick();
  }
  assert.equal(calls, 110);
  assert.equal(store.getState(id(10)).status, "idle");
  assert.equal(store.getState(id(119)).status, "ready");
  const release = store.acquire(id(10)); await tick();
  assert.equal(calls, 111); assert.equal(store.getState(id(10)).status, "ready"); release();
});

test("returning to a visible visit reuses fresh metadata and refreshes it after expiration", async () => {
  const f = fixture(); let time = 1000;
  const store = createFollowUpPhotoLoader(actor, f.fetcher, () => time);
  const a = store.acquire(id(10)); await tick(); await f.resolve(0, [photo(id(10))]); a(); await tick();
  const b = store.acquire(id(10)); await tick(); assert.equal(f.calls.length, 1); b(); await tick();
  time += 60_001;
  const c = store.acquire(id(10)); await tick(); assert.equal(f.calls.length, 2);
  assert.equal(store.getState(id(10)).status, "loading");
  await f.resolve(1, []); assert.deepEqual(store.getState(id(10)).photos, []); c();
});

test("cancel stops queued reads and a synchronous fetch failure releases concurrency slots", async () => {
  let calls = 0;
  const store = createFollowUpPhotoLoader(actor, () => { calls++; throw new Error("offline"); });
  [10, 11, 12].forEach((n) => store.acquire(id(n))); await tick();
  assert.equal(calls, 3);
  assert.equal(store.getState(id(12)).status, "error");
  store.cancel(); assert.equal(store.getState(id(12)).status, "idle");
});
