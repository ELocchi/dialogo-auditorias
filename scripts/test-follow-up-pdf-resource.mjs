import assert from "node:assert/strict";
import { test } from "node:test";
import { createReportPdfResource } from "../src/lib/follow-up/report-pdf-resource.ts";

const response = (name = "vistoria-2026-09-28-report.pdf") => new Response("%PDF-1.7\nfixture", {
  headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"` },
});
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function fixture(fetchPdf = async () => response()) {
  const requests = [], created = [], revoked = [];
  const resource = createReportPdfResource({ href: "/app/acompanhamento/relatorio/visit/pdf?relatorio=report", fallbackFileName: "fallback.pdf",
    fetchPdf: (...args) => { requests.push(args); return fetchPdf(...args); },
    createUrl: (blob) => { created.push(blob); return `blob:report-${created.length}`; }, revokeUrl: (url) => revoked.push(url),
  });
  return { resource, requests, created, revoked };
}

test("preview, open and download reuse one authenticated PDF and its server file name", async () => {
  const pending = deferred(); const f = fixture(() => pending.promise);
  const first = f.resource.load(); const second = f.resource.load();
  assert.equal(first, second); await Promise.resolve(); assert.equal(f.requests.length, 1);
  assert.deepEqual(f.requests[0][1], { credentials: "same-origin", cache: "no-store", signal: f.requests[0][1].signal });
  pending.resolve(response()); const ready = await first;
  assert.equal(ready.status, "ready"); assert.equal(ready.url, "blob:report-1"); assert.equal(ready.fileName, "vistoria-2026-09-28-report.pdf");
  assert.equal(await f.resource.load(), ready); assert.equal(f.created.length, 1); assert.equal(f.requests.length, 1);
  f.resource.dispose(); assert.deepEqual(f.revoked, [ready.url]); assert.equal(f.resource.getSnapshot().status, "idle");
  f.resource.dispose(); assert.equal(f.revoked.length, 1);
});

test("leaving aborts pending transport and ignores a response that finishes after cancellation", async () => {
  const pending = deferred(); const f = fixture(() => pending.promise);
  const result = f.resource.load(); await Promise.resolve();
  f.resource.dispose(); assert.equal(f.requests[0][1].signal.aborted, true);
  pending.resolve(response()); assert.equal(await result, null);
  assert.equal(f.created.length, 0); assert.equal(f.resource.getSnapshot().status, "idle");
});

test("immediate disposal cancels before making a network request", async () => {
  const f = fixture(); const pending = f.resource.load(); f.resource.dispose();
  assert.equal(await pending, null); assert.equal(f.requests.length, 0); assert.deepEqual(f.created, []);
});

test("leaving during blob reading cannot retain a URL or publish a stale report", async () => {
  const body = deferred(); const f = fixture(async () => ({ ok: true, headers: new Headers({ "Content-Type": "application/pdf" }), blob: () => body.promise }));
  const pending = f.resource.load(); await Promise.resolve(); await Promise.resolve();
  f.resource.dispose(); body.resolve(new Blob(["%PDF-1.7\nfixture"], { type: "application/pdf" }));
  assert.equal(await pending, null); assert.deepEqual(f.created, []); assert.equal(f.resource.getSnapshot().status, "idle");
});

test("retry after server error fetches again without replacing the saved report or reusing failures", async () => {
  let count = 0; const f = fixture(async () => ++count === 1 ? new Response("Unavailable", { status: 503 }) : response());
  assert.equal(await f.resource.load(), null); assert.equal(f.resource.getSnapshot().status, "error");
  assert.equal((await f.resource.load()).status, "ready"); assert.equal(f.requests.length, 2); assert.equal(f.created.length, 1);
});

test("synchronous transport failure can retry and a login redirect or invalid document is never displayed", async () => {
  const f = fixture(() => { throw new Error("offline"); });
  await f.resource.load(); await f.resource.load(); assert.equal(f.requests.length, 2);
  for (const invalid of [new Response("<html>login</html>", { headers: { "Content-Type": "text/html" } }),
    new Response("", { headers: { "Content-Type": "application/pdf" } }),
    new Response("broken", { headers: { "Content-Type": "application/pdf" } }), new Response(null, { status: 403 })]) {
    const denied = fixture(async () => invalid); assert.equal(await denied.resource.load(), null);
    assert.equal(denied.resource.getSnapshot().status, "error"); assert.equal(denied.created.length, 0);
  }
});

test("old requests cannot overwrite a new load, including Strict Mode disposal and restart", async () => {
  const old = deferred(); let count = 0;
  const f = fixture(() => ++count === 1 ? old.promise : Promise.resolve(response("new.pdf")));
  const first = f.resource.load(); await Promise.resolve(); f.resource.dispose();
  const second = await f.resource.load(); old.resolve(response("old.pdf")); await first;
  assert.equal(f.resource.getSnapshot(), second); assert.equal(second.fileName, "new.pdf"); assert.equal(f.created.length, 1);
  f.resource.dispose(); assert.deepEqual(f.revoked, [second.url]);
});

test("separate report/profile resources never share a Blob or pending request", async () => {
  const first = fixture(), second = fixture();
  const [a, b] = await Promise.all([first.resource.load(), second.resource.load()]);
  assert.notEqual(a, b); assert.equal(first.requests.length, 1); assert.equal(second.requests.length, 1);
  first.resource.dispose(); assert.equal(second.resource.getSnapshot(), b); assert.equal(second.revoked.length, 0);
});

test("subscriptions and download names remain safe across loading, failure, retry and disposal", async () => {
  const f = fixture(async () => response("../unexpected.pdf")); const snapshots = [];
  const unsubscribe = f.resource.subscribe(() => snapshots.push(f.resource.getSnapshot().status));
  const ready = await f.resource.load(); assert.equal(ready.fileName, "fallback.pdf");
  f.resource.dispose(); assert.deepEqual(snapshots, ["loading", "ready", "idle"]);
  unsubscribe(); await f.resource.load(); assert.equal(snapshots.length, 3); f.resource.dispose();
});
