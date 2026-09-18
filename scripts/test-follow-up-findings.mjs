import assert from "node:assert/strict";
import test from "node:test";
import { readFindingDrafts, saveFindingDrafts } from "../src/lib/follow-up/findings.ts";

const visitId = "d1a80000-0000-4000-8000-000000000001";
const finding = { id: "d1a80000-0000-4000-8000-000000000002", location: "Pavimento 2",
  description: "Proteção lateral incompleta", correction: "Completar a proteção lateral" };
const draft = { visitId, revision: 1, findings: [finding], updatedAt: "2026-09-18T12:00:00Z" };
const context = { profile: "AUDITOR_SEGURANCA" };

test("Findings saved before a report are read through the profile scoped RPC", async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push([name, args]); return { data: [draft], error: null }; } };
  const result = await readFindingDrafts(client, context);
  assert.deepEqual(result, { available: true, drafts: [draft] });
  assert.deepEqual(calls, [["read_follow_up_finding_drafts", { p_profile: "AUDITOR_SEGURANCA" }]]);
});

test("Saving a finding passes its revision and rejects invalid text before RPC", async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push([name, args]); return { data: draft, error: null }; } };
  assert.equal((await saveFindingDrafts(client, context, { visitId, expectedRevision: 0,
    findings: [{ ...finding, description: " " }] })).status, "error");
  assert.equal(calls.length, 0);
  const saved = await saveFindingDrafts(client, context, { visitId, expectedRevision: 0, findings: [finding] });
  assert.equal(saved.status, "success");
  assert.deepEqual(calls, [["save_follow_up_finding_drafts", {
    p_profile: "AUDITOR_SEGURANCA", p_visit_id: visitId, p_expected_revision: 0, p_findings: [finding],
  }]]);
});

test("Unauthorized profiles and stale revisions cannot save findings", async () => {
  let calls = 0;
  const client = { rpc: async () => { calls++; return { data: null, error: { code: "40001" } }; } };
  assert.equal((await saveFindingDrafts(client, { profile: "ADMINISTRATIVO" }, { visitId, expectedRevision: 0, findings: [finding] })).status, "error");
  assert.equal(calls, 0);
  const result = await saveFindingDrafts(client, context, { visitId, expectedRevision: 1, findings: [finding] });
  assert.match(result.message, /mudaram em outra sessão/);
});
