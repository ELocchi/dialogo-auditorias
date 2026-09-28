import assert from "node:assert/strict";
import { test } from "node:test";
import { readAgendaSnapshot, readAgendaUpdate, parseAgendaVisit } from "../src/lib/agenda/service.ts";
import { readAgendaVisitDetail } from "../src/lib/agenda/detail-service.ts";
import { agendaDetailQuery, matchesAgendaDetailActor, agendaDetailKey, fetchAgendaVisitDetail } from "../src/lib/agenda/detail-client.ts";

const id = (n) => `ab120000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = { id: id(1), name: "Auditor", role: "quality-auditor", modules: ["quality"], workIds: [id(2)], agendaWorkIds: [id(2)], documentWorkIds: [] };
const context = { user, works: [{ id: id(2), name: "Obra autorizada" }], profile: "AUDITOR_QUALIDADE", engineeringScope: null, administrativeScope: null };
const full = { id: id(3), workId: id(2), auditorId: id(1), module: "quality", kind: "audit", modelId: "quality-f175", date: "2026-09-28",
  createdBy: id(4), createdAt: "2026-09-01T12:00:00Z", revision: 2, confirmationStatus: "pending_confirmation", confirmedAt: null,
  auditorName: "Auditor", createdByName: "Administrativo", workName: "Obra autorizada", note: "Observação mantida",
  history: [{ previousDate: "2026-09-20", date: "2026-09-28", note: "Remarcada", changedBy: id(4), changedAt: "2026-09-25T14:00:00Z" }] };
const compact = ({ history, ...visit }) => {
  const summary = { ...visit, lastChangedAt: history.at(-1)?.changedAt ?? visit.createdAt, detailVersion: "a".repeat(32) };
  delete summary.note;
  return summary;
};
const rpc = (data) => ({ rpc: async () => ({ data, error: null }) });
const envelope = (visits) => ({ unchanged: false, revision: "a".repeat(32), snapshot: { visits, auditors: [] } });

test("legacy synchronization remains compatible for tabs opened before deployment", async () => {
  const calls = [];
  const client = { rpc: async (name) => { calls.push(name); return { data: envelope([full]), error: null }; } };
  const result = await readAgendaUpdate(client, context, null, false);
  assert.deepEqual(calls, ["read_audit_agenda_if_changed"]);
  assert.equal(result.snapshot.visits[0].note, full.note);
  assert.deepEqual(result.snapshot.visits[0].history, full.history);
});

test("compact snapshot keeps every visit and exact notification time without notes or histories", async () => {
  const visits = Array.from({ length: 1100 }, (_, index) => ({ ...full, id: id(100 + index), date: index % 2 ? "2026-10-02" : full.date }));
  const old = await readAgendaSnapshot(rpc(envelope(visits)), context);
  const snapshot = await readAgendaSnapshot(rpc(envelope(visits.map(compact))), context);
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.visits.length, 1100);
  assert.deepEqual(snapshot.notifications, old.notifications);
  assert.equal(snapshot.visits[0].detailsLoaded, false);
  assert.equal(snapshot.visits[0].note, "");
  assert.deepEqual(snapshot.visits[0].history, []);
  assert.equal(snapshot.visits[0].lastChangedAt, full.history[0].changedAt);
});

test("incomplete or unauthorized compact rows fail closed instead of fabricating empty details", async () => {
  for (const changes of [{ lastChangedAt: null }, { lastChangedAt: "invalid" }, { detailVersion: null }, { note: "unexpected without history" },
    { history: [] }, { auditorId: id(88) }, { workId: id(90), kind: "follow_up", modelId: null }, { date: "2026-02-30" }]) {
    const result = await readAgendaSnapshot(rpc(envelope([{ ...compact(full), ...changes }])), context);
    assert.equal(result.available, false, JSON.stringify(changes));
  }
  assert.equal(parseAgendaVisit(compact(full), context), null);
});

test("detail reads exactly one authorized visit and keeps complete rescheduling history", async () => {
  const calls = [];
  const data = { ...full, history: Array.from({ length: 1100 }, () => full.history[0]), lastChangedAt: full.history[0].changedAt };
  const result = await readAgendaVisitDetail({ rpc: async (name, args) => { calls.push({ name, args }); return { data, error: null }; } }, context, full.id);
  assert.equal(result.available, true);
  assert.equal(result.visit.note, full.note);
  assert.equal(result.visit.history.length, 1100);
  assert.equal(result.visit.detailsLoaded, undefined);
  assert.deepEqual(calls, [{ name: "read_audit_agenda_visit_detail", args: {
    p_profile: "AUDITOR_QUALIDADE", p_visit_id: full.id, p_engineering_scope: null, p_administrative_scope: null,
  } }]);
});

test("detail null, denied, malformed, wrong target and provider failure remain distinct", async () => {
  assert.deepEqual(await readAgendaVisitDetail(rpc(null), context, full.id), { available: true, visit: null });
  assert.deepEqual(await readAgendaVisitDetail({ rpc: async () => ({ error: { code: "42501" } }) }, context, full.id), { available: false, forbidden: true });
  for (const data of [compact(full), { ...full, id: id(8) }, { ...full, auditorId: id(8) }, { ...full, history: [null] }]) {
    assert.deepEqual(await readAgendaVisitDetail(rpc(data), context, full.id), { available: false });
  }
  const noCall = { rpc: async () => { throw Error("Must not call"); } };
  assert.deepEqual(await readAgendaVisitDetail(noCall, context, "invalid"), { available: false });
  assert.deepEqual(await readAgendaVisitDetail(noCall, context, full.id), { available: false });
});

test("display actor comparison rejects stale user, profile, scope, module and duplicate parameters", () => {
  assert.equal(matchesAgendaDetailActor(agendaDetailQuery(user), user), true);
  for (const changed of [{ id: id(99) }, { role: "safety-auditor" }, { activity: "coordination" }, { modules: ["quality", "safety"] }]) {
    assert.equal(matchesAgendaDetailActor(agendaDetailQuery({ ...user, ...changed }), user), false);
  }
  const query = agendaDetailQuery(user); query.append("usuario", user.id);
  assert.equal(matchesAgendaDetailActor(query, user), false);
  assert.notEqual(agendaDetailKey(user, full), agendaDetailKey({ ...user, workIds: [] }, full));
  assert.notEqual(agendaDetailKey(user, full), agendaDetailKey(user, { ...full, revision: 3 }));
  assert.notEqual(agendaDetailKey(user, { ...full, detailVersion: "a".repeat(32) }), agendaDetailKey(user, { ...full, detailVersion: "b".repeat(32) }));
});

test("browser detail requests are private, abortable, tied to current visit revision and never expose provider errors", async () => {
  const controller = new AbortController();
  const result = await fetchAgendaVisitDetail(full, user, controller.signal, async (url, init) => {
    assert.match(url, new RegExp(`/api/agenda/visits/${full.id}\\?`));
    assert.equal(init.cache, "no-store"); assert.equal(init.credentials, "same-origin"); assert.equal(init.signal, controller.signal);
    return Response.json({ available: true, visit: full });
  });
  assert.deepEqual(result, full);
  await assert.rejects(fetchAgendaVisitDetail({ ...full, detailVersion: "a".repeat(32) }, user, controller.signal,
    async () => Response.json({ available: true, visit: { ...full, detailVersion: "b".repeat(32) } })), /agendamento mudou/);
  for (const changed of [{ id: id(33) }, { revision: 3 }, { workId: id(33) }, { date: "2026-10-01" }, { modelId: "quality-f176" }, { detailsLoaded: false }]) {
    await assert.rejects(fetchAgendaVisitDetail(full, user, controller.signal, async () => Response.json({ available: true, visit: { ...full, ...changed } })), /agendamento mudou/);
  }
  for (const status of [401, 403, 404, 500, 503]) {
    await assert.rejects(fetchAgendaVisitDetail(full, user, controller.signal, async () => new Response("PRIVATE_DIAGNOSTIC", { status })), (error) => !error.message.includes("PRIVATE_DIAGNOSTIC"));
  }
});
