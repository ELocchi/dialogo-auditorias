import assert from "node:assert/strict";
import test from "node:test";
import { parseSaveFollowUp, readFollowUpReports, resolveReportFindings } from "../src/lib/follow-up/service.ts";

const visitId = "d1a80000-0000-4000-8000-000000000001";
const input = { visitId, expectedRevision: 0, title: "Proteção de periferia", participants: "Auditor e encarregado",
  subjects: "Proteção de periferia", decisions: "Instalar guarda-corpo", findings: [] };

test("report input requires and trims the three independent sections", () => {
  assert.deepEqual(parseSaveFollowUp({ ...input, participants: ` ${input.participants} ` }), input);
  for (const field of ["title", "participants", "subjects", "decisions"]) {
    assert.equal(parseSaveFollowUp({ ...input, [field]: " " }), null);
  }
});

test("read reports accepts three sections and flags an old database response", async () => {
  const report = { id: "d1a80000-0000-4000-8000-000000000010", visitId, revision: 1, title: input.title, participants: input.participants,
    subjects: input.subjects, decisions: input.decisions, findings: [], updatedAt: "2026-09-18T12:00:00Z" };
  const context = { profile: "AUDITOR_SEGURANCA" };
  const client = { rpc: async () => ({ data: [report], error: null }) };
  assert.deepEqual(await readFollowUpReports(client, context), { available: true, reports: [report] });
  assert.deepEqual(await readFollowUpReports(client, { profile: "ENGENHARIA" }), { available: true, reports: [report] });
  const second = { ...report, id: "d1a80000-0000-4000-8000-000000000011" };
  assert.deepEqual(await readFollowUpReports({ rpc: async () => ({ data: [report, second], error: null }) }, context),
    { available: true, reports: [report, second] });
  const oldClient = { rpc: async () => ({ data: [{ ...report, subjects: undefined, guidance: input.subjects }], error: null }) };
  const result = await readFollowUpReports(oldClient, context);
  assert.equal(result.available, false);
  assert.match(result.message, /atualização do banco/);
});

test("only checked findings enter the report, using current saved content", () => {
  const first = { id: "d1a80000-0000-4000-8000-000000000002", location: "A",
    description: "Proteção antiga", correction: "Corrigir proteção" };
  const second = { id: "d1a80000-0000-4000-8000-000000000003", location: "B",
    description: "Escada sem corrimão", correction: "Instalar corrimão" };
  const revised = { ...first, description: "Proteção atualizada" };
  assert.deepEqual(resolveReportFindings([first], [first, second], [revised]), [revised]);
  assert.equal(resolveReportFindings([], [first], [second]), null);
  assert.equal(resolveReportFindings([{ ...first, id: "d1a80000-0000-4000-8000-000000000004" }], [first], [second]), null);
});
