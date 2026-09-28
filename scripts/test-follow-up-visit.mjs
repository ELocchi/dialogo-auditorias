import assert from "node:assert/strict";
import { test } from "node:test";
import { readFollowUpReportDetail, readFollowUpVisit } from "../src/lib/follow-up/visit-service.ts";

const id = (n) => `a9350000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const userId = id(1), workId = id(2), visitId = id(3), findingId = id(4), reportId = id(5);
const updatedAt = "2026-09-28T10:00:00.000Z";
const finding = { id: findingId, location: "Pavimento", description: "Execução fora do projeto", correction: "Corrigir a execução" };
const visit = { id: visitId, workId, workName: "Obra de teste", module: "quality", kind: "follow_up", modelId: null,
  auditorId: userId, auditorName: "Auditor", createdBy: id(6), createdByName: "Administrativo", createdAt: updatedAt,
  date: "2026-09-28", note: "Visita de teste", revision: 2, confirmationStatus: "confirmed", confirmedAt: updatedAt,
  history: [{ previousDate: "2026-09-27", date: "2026-09-28", note: "Data ajustada", changedBy: id(6), changedAt: updatedAt }] };
const report = { id: reportId, title: "Relatório de teste", visitId, revision: 1,
  participants: "Equipe da obra", subjects: "Assuntos da visita", decisions: "Decisões da visita", findings: [finding], updatedAt };
const draft = { visitId, revision: 3, findings: [finding], updatedAt };
const fileName = `${findingId}_${id(7)}.jpg`;
const workFinding = { ...finding, workId, module: "quality", photoFileName: fileName, createdAt: updatedAt };
const snapshot = { available: true, visit, reports: [report], draft, workFindings: [workFinding] };
const detail = { available: true, visit, report, workPhotos: [{ findingId, fileName, scopeId: workId }] };

function context(profile = "AUDITOR_QUALIDADE", engineeringScope = null) {
  return { profile, engineeringScope, administrativeScope: null, email: "fixture@dialogo.com.br",
    works: [{ id: workId, name: "Obra de teste" }], user: { id: userId, name: "Auditor",
      role: profile === "ENGENHARIA" ? "engineering" : profile === "AUDITOR_SEGURANCA" ? "safety-auditor" : "quality-auditor",
      activity: engineeringScope === "COORDENACAO" ? "coordination" : "site-team",
      modules: ["quality", "safety"], workIds: [workId], agendaWorkIds: [workId], documentWorkIds: [],
      workModuleScopes: [{ workId, module: "quality" }, { workId, module: "safety" }] } };
}

function fixture(value, error = null) {
  const calls = [];
  const client = new Proxy({ async rpc(name, parameters) {
    calls.push({ name, parameters }); return { data: value, error };
  } }, { get(target, property) {
    assert.equal(property, "rpc", "Targeted readers must not query tables, Storage, agenda or other services");
    return target[property];
  } });
  return { client, calls };
}

test("one visit RPC preserves the full editor payload and persisted visit history", async () => {
  const f = fixture(structuredClone(snapshot));
  assert.deepEqual(await readFollowUpVisit(f.client, context(), visitId), snapshot);
  assert.deepEqual(f.calls, [{ name: "read_follow_up_visit", parameters: {
    p_visit_id: visitId, p_profile: "AUDITOR_QUALIDADE", p_engineering_scope: null, p_administrative_scope: null,
  } }]);
});

test("one report RPC returns only the selected detail and forwards both engineering scopes", async () => {
  for (const scope of [null, "EQUIPE_OBRA", "COORDENACAO"]) {
    const ctx = scope ? context("ENGENHARIA", scope) : context();
    const f = fixture(structuredClone(detail));
    assert.deepEqual(await readFollowUpReportDetail(f.client, ctx, visitId, reportId), detail);
    assert.deepEqual(f.calls, [{ name: "read_follow_up_report_detail", parameters: {
      p_visit_id: visitId, p_report_id: reportId, p_profile: ctx.profile,
      p_engineering_scope: scope, p_administrative_scope: null,
    } }]);
  }
});

test("absent or denied visits and absent or ambiguous reports remain explicit successful misses", async () => {
  const missingVisit = { available: true, visit: null, reports: [], draft: null, workFindings: [] };
  assert.deepEqual(await readFollowUpVisit(fixture(missingVisit).client, context(), visitId), missingVisit);
  for (const currentVisit of [null, visit]) {
    const missingReport = { available: true, visit: currentVisit, report: null, workPhotos: [] };
    const f = fixture(missingReport);
    assert.deepEqual(await readFollowUpReportDetail(f.client, context(), visitId), missingReport);
    assert.equal(f.calls[0].parameters.p_report_id, null);
  }
  const selectedOnly = fixture(detail);
  assert.deepEqual(await readFollowUpReportDetail(selectedOnly.client, context(), visitId), detail);
});

test("wrong roles and malformed requested IDs are rejected before RPC", async () => {
  const f = fixture(snapshot);
  for (const profile of ["ENGENHARIA", "ADMINISTRATIVO"])
    assert.equal((await readFollowUpVisit(f.client, context(profile, "COORDENACAO"), visitId)).available, false);
  assert.equal((await readFollowUpReportDetail(f.client, context("ADMINISTRATIVO"), visitId)).available, false);
  assert.equal((await readFollowUpVisit(f.client, context(), "wrong")).available, false);
  assert.equal((await readFollowUpReportDetail(f.client, context(), visitId, "")).available, false);
  assert.equal((await readFollowUpReportDetail(f.client, context(), "wrong", reportId)).available, false);
  assert.equal(f.calls.length, 0);
});

test("visit projection rejects foreign IDs, owner, module, grants and malformed visit/history fields", async () => {
  for (const mutate of [
    (raw) => { raw.visit.id = id(80); },
    (raw) => { raw.visit.workId = id(80); },
    (raw) => { raw.visit.auditorId = id(80); },
    (raw) => { raw.visit.module = "safety"; },
    (raw) => { raw.visit.kind = "audit"; },
    (raw) => { raw.visit.modelId = "quality-f175"; },
    (raw) => { raw.visit.date = "2026-02-30"; },
    (raw) => { raw.visit.confirmedAt = null; },
    (raw) => { raw.visit.revision = 0; },
    (raw) => { raw.visit.history[0].changedAt = "invalid"; },
  ]) {
    const raw = structuredClone(snapshot); mutate(raw);
    const result = await readFollowUpVisit(fixture(raw).client, context(), visitId);
    assert.equal(result.available, false); assert.equal(result.visit, null); assert.deepEqual(result.reports, []);
  }
  const ctx = context(); ctx.user.workModuleScopes = [{ workId, module: "safety" }];
  assert.equal((await readFollowUpVisit(fixture(snapshot).client, ctx, visitId)).available, false);
});

test("malformed or duplicate visit children fail the complete snapshot instead of dropping rows", async () => {
  for (const mutate of [
    (raw) => { raw.reports.push(raw.reports[0]); },
    (raw) => { raw.reports[0].visitId = id(80); },
    (raw) => { delete raw.reports[0].id; },
    (raw) => { raw.reports[0].subjects = ""; },
    (raw) => { raw.draft.visitId = id(80); },
    (raw) => { delete raw.draft; },
    (raw) => { raw.draft.findings.push(raw.draft.findings[0]); },
    (raw) => { raw.workFindings.push(raw.workFindings[0]); },
    (raw) => { raw.workFindings[0].workId = id(80); },
    (raw) => { raw.workFindings[0].module = "safety"; },
    (raw) => { raw.workFindings[0].photoFileName = `${id(80)}_${id(7)}.jpg`; },
    (raw) => { raw.visit = null; },
  ]) {
    const raw = structuredClone(snapshot); mutate(raw);
    const result = await readFollowUpVisit(fixture(raw).client, context(), visitId);
    assert.equal(result.available, false); assert.deepEqual(result.workFindings, []);
  }
});

test("report detail checks the requested report and restricts photo references to its findings and work", async () => {
  for (const mutate of [
    (raw) => { raw.report.id = id(80); },
    (raw) => { raw.report.visitId = id(80); },
    (raw) => { raw.visit = null; },
    (raw) => { raw.report = null; },
    (raw) => { raw.workPhotos.push(raw.workPhotos[0]); },
    (raw) => { raw.workPhotos[0].findingId = id(80); },
    (raw) => { raw.workPhotos[0].scopeId = id(80); },
    (raw) => { raw.workPhotos[0].fileName = `${id(80)}_${id(7)}.jpg`; },
    (raw) => { delete raw.workPhotos; },
  ]) {
    const raw = structuredClone(detail); mutate(raw);
    const result = await readFollowUpReportDetail(fixture(raw).client, context(), visitId, reportId);
    assert.equal(result.available, false); assert.equal(result.report, null); assert.deepEqual(result.workPhotos, []);
  }
});

test("visit lists are not silently limited to 1000 reports or work findings", async () => {
  const raw = structuredClone(snapshot);
  raw.reports = Array.from({ length: 1001 }, (_, n) => ({ ...report, id: id(1000 + n) }));
  raw.workFindings = Array.from({ length: 1001 }, (_, n) => ({ ...workFinding, id: id(3000 + n),
    photoFileName: `${id(3000 + n)}_${id(7)}.jpg` }));
  const result = await readFollowUpVisit(fixture(raw).client, context(), visitId);
  assert.equal(result.available, true); assert.equal(result.reports.length, 1001); assert.equal(result.workFindings.length, 1001);
});

test("RPC, transport and malformed responses never become successful empty views", async () => {
  for (const reader of [readFollowUpVisit, readFollowUpReportDetail]) {
    for (const raw of [null, [], {}, { available: false }, { available: true }])
      assert.equal((await reader(fixture(raw).client, context(), visitId)).available, false);
    for (const code of ["42501", "PGRST202", "XX000"])
      assert.equal((await reader(fixture(snapshot, { code }).client, context(), visitId)).available, false);
    assert.equal((await reader({ rpc: async () => { throw new Error("Offline"); } }, context(), visitId)).available, false);
  }
});
