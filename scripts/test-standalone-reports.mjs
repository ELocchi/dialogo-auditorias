import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStandaloneInput, parseStandaloneReport } from "../src/lib/follow-up/standalone-contracts.ts";
import { readStandaloneReports, readStandaloneReport, readStandaloneFindings, saveStandaloneReport } from "../src/lib/follow-up/standalone-service.ts";

const id = n => `bbcc0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = { profile: "AUDITOR_QUALIDADE", engineeringScope: null, administrativeScope: null,
  user: { id: id(1), workModuleScopes: [{ workId: id(2), module: "quality" }] }, works: [{ id: id(2), name: "Obra" }] };
const input = { requestId: id(3), workId: id(2), date: "2026-09-30", title: "Relatório",
  participants: "", subjects: "Orientações da obra", decisions: "", findingIds: [] };
const header = { id: id(4), workId: id(2), module: "quality", workName: "Obra", auditorId: id(1),
  auditorName: "Auditor", date: "2026-09-30", title: "Relatório", updatedAt: "2026-10-02T13:00:00Z" };
const report = { ...header, participants: "", subjects: "Orientações", decisions: "", findings: [], photos: [] };
function client(data, error = null) {
  const calls = [];
  return { calls, async rpc(name, params) { calls.push({ name, params }); return { data, error }; } };
}

test("standalone input requires a real date/work/body but no visit or findings", () => {
  assert.deepEqual(parseStandaloneInput(input, "2026-10-02"), input);
  for (const change of [{ date: "2026-02-30" }, { date: "2026-10-03" }, { date: "0000-01-01" }, { workId: "bad" },
    { subjects: " " }, { title: " " }, { findingIds: [id(5), id(5)] }, { findingIds: Array.from({ length: 31 }, (_, n) => id(n)) }]) {
    assert.equal(parseStandaloneInput({ ...input, ...change }, "2026-10-02"), null);
  }
});

test("saving invokes only the standalone RPC and retains the retry identity", async () => {
  const db = client(id(4));
  assert.deepEqual(await saveStandaloneReport(db, context, input), { status: "success", reportId: id(4) });
  await saveStandaloneReport(db, context, input);
  assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls[0], db.calls[1]);
  assert.equal(db.calls[0].name, "save_standalone_follow_up_report");
  assert.deepEqual(db.calls[0].params.p_finding_ids, []);
  assert.equal(db.calls[0].params.p_request_id, input.requestId);
  assert.equal(Object.keys(db.calls[0].params).some(key => /visit|agenda|auditor_id/.test(key)), false);
});

test("engineering, wrong work and wrong discipline cannot write", async () => {
  for (const unauthorized of [{ ...context, profile: "ENGENHARIA" }, { ...context, works: [] },
    { ...context, user: { ...context.user, workModuleScopes: [{ workId: id(2), module: "safety" }] } }]) {
    const db = client(id(4));
    assert.equal((await saveStandaloneReport(db, unauthorized, input)).status, "error");
    assert.equal(db.calls.length, 0);
  }
});

test("missing migration and failed writes never report success", async () => {
  const missing = await saveStandaloneReport(client(null, { code: "PGRST202" }), context, input);
  assert.equal(missing.status, "error");
  assert.match(missing.message, /banco de dados/);
  assert.equal((await saveStandaloneReport(client(null), context, input)).status, "error");
});

test("index and exact detail read without agenda, reject cross-profile data", async () => {
  const db = client({ available: true, reports: [header] });
  assert.equal((await readStandaloneReports(db, context)).available, true);
  assert.equal(db.calls[0].name, "read_standalone_follow_up_reports");
  const detailDb = client({ available: true, reports: [report] });
  assert.deepEqual(await readStandaloneReport(detailDb, context, id(4)), { available: true, report });
  assert.equal(detailDb.calls[0].params.p_report_id, id(4));
  for (const change of [{ workId: id(10) }, { module: "safety" }, { auditorId: id(10) }]) {
    assert.equal((await readStandaloneReports(client({ available: true, reports: [{ ...header, ...change }] }), context)).available, false);
  }
  assert.equal((await readStandaloneReport(client({ available: true, reports: [{ ...report, id: id(6) }] }), context, id(4))).available, false);
});

test("exact report rejects missing/substituted/duplicate evidence", () => {
  const finding = { id: id(5), location: "", description: "Description", correction: "Correction", serious: true };
  const photo = { findingId: id(5), fileName: `${id(5)}_${id(6)}.png` };
  const withPhoto = { ...report, findings: [finding], photos: [photo] };
  assert.deepEqual(parseStandaloneReport(withPhoto), withPhoto);
  assert.equal(parseStandaloneReport({ ...withPhoto, photos: [] }), null);
  assert.equal(parseStandaloneReport({ ...withPhoto, photos: [{ ...photo, fileName: `${id(7)}_${id(6)}.png` }] }), null);
  assert.equal(parseStandaloneReport({ ...withPhoto, photos: [photo, photo] }), null);
});

function findingClient(rows, options = {}) {
  const calls = [];
  return { calls, from(table) {
    const call = { table, filters: [], orders: [] }; calls.push(call);
    const query = {
      select(columns, config) { call.columns = columns; call.config = config; return query; },
      eq(field, value) { call.filters.push([field, "eq", value]); return query; },
      is(field, value) { call.filters.push([field, "is", value]); return query; },
      order(field, config) { call.orders.push([field, config]); return query; },
      async range(start, end) {
        call.range = [start, end];
        return options.result ?? { data: rows.slice(start, Math.min(end + 1, start + (options.cap ?? 200))), count: rows.length, error: null };
      },
    };
    return query;
  } };
}
const findingRow = n => ({ id: id(n + 10), work_id: id(2), auditor_auth_user_id: id(1), modulo: "QUALIDADE", completed_at: null,
  location: "", description: "Description", correction: "Correction", serious: false });
const findingFields = ({ id, location, description, correction, serious }) => ({ id, location, description, correction, serious });

test("existing work findings load without the report migration and remain scoped to the selected work/author/discipline", async () => {
  const rows = Array.from({ length: 35 }, (_, n) => findingRow(n));
  const db = findingClient(rows);
  assert.deepEqual(await readStandaloneFindings(db, context, id(2)), { available: true, findings: rows.map(findingFields) });
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].table, "follow_up_work_findings");
  assert.deepEqual(db.calls[0].filters, [["work_id", "eq", id(2)], ["auditor_auth_user_id", "eq", id(1)],
    ["modulo", "eq", "QUALIDADE"], ["completed_at", "is", null]]);
  assert.deepEqual(db.calls[0].orders, [["created_at", { ascending: false }], ["id", { ascending: false }]]);
});

test("findings are not truncated at a server page cap or the 30-item document selection limit", async () => {
  const rows = Array.from({ length: 250 }, (_, n) => findingRow(n));
  const db = findingClient(rows, { cap: 80 });
  assert.deepEqual(await readStandaloneFindings(db, context, id(2)), { available: true, findings: rows.map(findingFields) });
  assert.deepEqual(db.calls.map(call => call.range[0]), [0, 80, 160, 240]);
});

test("only a successful empty query is shown as no findings", async () => {
  assert.deepEqual(await readStandaloneFindings(findingClient([]), context, id(2)), { available: true, findings: [] });
  for (const result of [{ data: [], count: 2, error: null }, { data: [], count: null, error: null },
    { data: null, count: null, error: { code: "42501" } }]) {
    assert.deepEqual(await readStandaloneFindings(findingClient([], { result }), context, id(2)), { available: false, findings: [] });
  }
});

test("out-of-scope, completed, malformed and duplicate findings are rejected", async () => {
  for (const change of [{ work_id: id(99) }, { auditor_auth_user_id: id(99) }, { modulo: "SEGURANCA" },
    { completed_at: "2026-10-02T13:00:00Z" }, { serious: null }, { description: "" }]) {
    assert.equal((await readStandaloneFindings(findingClient([{ ...findingRow(0), ...change }]), context, id(2))).available, false);
  }
  assert.equal((await readStandaloneFindings(findingClient([findingRow(0), findingRow(0)]), context, id(2))).available, false);
  for (const denied of [{ ...context, profile: "ENGENHARIA" }, { ...context, works: [] }]) {
    const db = findingClient([findingRow(0)]);
    assert.equal((await readStandaloneFindings(db, denied, id(2))).available, false);
    assert.equal(db.calls.length, 0);
  }
});
