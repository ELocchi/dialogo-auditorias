import assert from "node:assert/strict";
import test from "node:test";
import { auditPhotoReferences, createAuditPhotoStore } from "../src/lib/audits/photo-store.ts";

const draft = (photos = [], checks = []) => ({ model: { item: { note: "", photos, checks } } });
const file = (name = "foto.jpg", content = "evidência") => new File([content], name, { type: "image/jpeg" });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test("evidence shared between items, checks and audits survives until its last reference is removed", () => {
  const store = createAuditPhotoStore();
  const evidence = file();
  const reference = store.add(evidence);
  const firstAudit = draft([reference, reference]);
  const otherAudit = draft([], [{ id: "check", compliant: false, photos: [reference] }]);
  assert.deepEqual([...auditPhotoReferences([firstAudit, otherAudit])], [reference]);
  store.retainDrafts([firstAudit, otherAudit]);
  store.retainDrafts([draft(), otherAudit]);
  assert.equal(store.get(reference), evidence);
  store.retainDrafts([draft(), draft()]);
  assert.equal(store.get(reference), undefined);
});

test("reopening the form and publishing keep referenced originals for previews and PDF generation", async () => {
  const store = createAuditPhotoStore();
  const evidence = file();
  const reference = store.add(evidence);
  const responses = draft([reference]);
  store.retainDrafts([responses]);
  // Navigation and publication retain responses even when NewAudit is not mounted.
  store.retainDrafts([structuredClone(responses)]);
  assert.equal(store.get(reference), evidence);
  const pdfPhoto = { reference, file: store.get(reference) };
  store.retainDrafts([]);
  assert.equal(store.get(reference), undefined);
  assert.equal(await pdfPhoto.file.text(), "evidência", "an already prepared PDF keeps its own Blob reference");
});

test("different photos with the same camera filename never overwrite existing evidence", async () => {
  const store = createAuditPhotoStore([draft(["foto (2).jpg"])]);
  const first = file("foto.jpg", "primeira");
  const second = file("foto.jpg", "segunda");
  const firstReference = store.add(first);
  const secondReference = store.add(second);
  assert.equal(firstReference, "foto.jpg");
  assert.equal(secondReference, "foto (3).jpg");
  assert.equal(store.add(first), firstReference, "the same File may be shared across items");
  store.retainDrafts([draft([firstReference, secondReference])]);
  assert.equal(await store.get(firstReference).text(), "primeira");
  assert.equal(await store.get(secondReference).text(), "segunda");
  store.retainDrafts([draft([secondReference])]);
  assert.equal(store.get(firstReference), undefined);
  assert.equal(store.get(secondReference), second);
});

test("discarded and unreferenced selected files are released without affecting another draft", () => {
  const store = createAuditPhotoStore();
  const kept = store.add(file("manter.jpg"));
  store.retainDrafts([draft([kept])]);
  const removed = store.add(file("remover.jpg"));
  store.discardUnreferenced([kept, removed]);
  assert.ok(store.get(kept));
  assert.equal(store.get(removed), undefined);
});

test("cancelling an evidence request prevents a late fetch from retaining its File", async () => {
  const store = createAuditPhotoStore([draft(["remota.jpg"])]);
  const controller = new AbortController();
  const request = deferred();
  let receivedSignal;
  const pending = store.load("remota.jpg", (signal) => { receivedSignal = signal; return request.promise; }, controller.signal);
  controller.abort();
  assert.equal(receivedSignal.aborted, true);
  request.resolve(file("remota.jpg"));
  assert.equal(await pending, null);
  assert.equal(store.get("remota.jpg"), undefined);
  let calls = 0;
  assert.equal(await store.load("remota.jpg", async () => { calls += 1; return file(); }, controller.signal), null);
  assert.equal(calls, 0);
});

test("a response arriving after removal of the last reference cannot repopulate the cache", async () => {
  const store = createAuditPhotoStore([draft(["remota.jpg"])]);
  const request = deferred();
  const pending = store.load("remota.jpg", () => request.promise, new AbortController().signal);
  store.retainDrafts([]);
  request.resolve(file("remota.jpg"));
  assert.equal(await pending, null);
  assert.equal(store.get("remota.jpg"), undefined);
});

test("closing a workspace releases files and invalidates pending work even if it later reopens", async () => {
  const responses = draft(["remota.jpg"]);
  const store = createAuditPhotoStore([responses]);
  const local = store.add(file());
  const request = deferred();
  const pending = store.load("remota.jpg", () => request.promise, new AbortController().signal);
  store.clear();
  assert.equal(store.get(local), undefined);
  store.retainDrafts([responses]);
  request.resolve(file("remota.jpg"));
  assert.equal(await pending, null);
  assert.equal(store.get("remota.jpg"), undefined);
  const fresh = file("remota.jpg", "nova sessão");
  assert.equal(await store.load("remota.jpg", async () => fresh, new AbortController().signal), fresh);
});
