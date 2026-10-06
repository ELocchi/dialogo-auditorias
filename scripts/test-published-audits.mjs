import assert from "node:assert/strict";
import test from "node:test";
import { readPublishedAuditSnapshot, readPublishedAuditOverview, readPublishedAuditDetail, readPublishedAuditReport } from "../src/lib/audits/service.ts";

const workId = "6c735db0-abd6-4ed7-b66e-6c253ed8a880";
const auditId = "b1760000-2026-4923-8000-000000000001";
const userId = "13044e3f-e8d2-4b4b-9981-22a8de22c610";
const criterion = {
  id: "F176-Q01", code: "01.01", title: "Item", text: "Descrição", group: "1. Grupo", subgroup: "",
  source: "F176", locator: "linha 1", documentedWeight: null, orientations: [], verificationRule: "Conforme/Não Conforme",
};
const context = {
  profile: "ENGENHARIA", email: "engenharia@dialogo.com.br", engineeringScope: "EQUIPE_OBRA", administrativeScope: null,
  works: [{ id: workId, name: "BoulevarDiálogo", city: "São Paulo, SP", engineer: "Equipe", coordinator: "Coordenação", status: "Ativa", isDemo: false }],
  user: { id: userId, name: "Emanuel Locchi", role: "engineering", activity: "site-team", modules: ["quality"], workIds: [workId], agendaWorkIds: [workId], documentWorkIds: [], workModuleScopes: [{ workId, module: "quality" }] },
};

const indexRow = {
  id: auditId, workId, modelId: "quality-f176", date: "2026-09-23", auditorId: userId,
  auditor: "Emanuel Locchi", finalScore: 6.74, catalogRevisionId: null, catalogVersion: 1,
  catalogRevisionLabel: "F.176/00",
};

function client(details, { index = [indexRow], indexError = null, storageError = null } = {}) {
  return {
    rpc: async (name) => ({ data: name === "read_published_audit_index" ? index : details,
      error: name === "read_published_audit_index" ? indexError : null }),
    storage: { from: () => ({ createSignedUrls: async (paths) => ({
      data: storageError ? null : paths.map((path) => ({ path, signedUrl: `https://storage.example/${path}` })), error: storageError,
    }) }) },
  };
}

test("loads a published audit and replaces private evidence names with signed URLs", async () => {
  const snapshot = await readPublishedAuditSnapshot(client([{
    ...indexRow, criteria: [criterion],
    responses: { "F176-Q01": { answer: "Não conforme", note: "Pendência", photos: ["p04-01.png"] } },
    evidenceFiles: ["p04-01.png"], reportFileName: "relatorio-final.pdf",
  }]), context);
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.audits[0].finalScore, 6.74);
  assert.match(snapshot.audits[0].reportUrl, /relatorio-final\.pdf$/);
  assert.match(snapshot.responses[auditId]["quality-f176"]["F176-Q01"].photos[0], /p04-01\.png$/);
});

test("preserves the auditor's binary serious-item decision", async () => {
  const snapshot = await readPublishedAuditSnapshot(client([{
    ...indexRow, criteria: [criterion],
    responses: { "F176-Q01": { answer: "Não conforme", note: "Risco imediato", serious: true } },
    evidenceFiles: [], reportFileName: "relatorio-final.pdf",
  }]), context);
  assert.equal(snapshot.responses[auditId]["quality-f176"]["F176-Q01"].serious, true);
});

test("rejects a non-binary serious-item value", async () => {
  const snapshot = await readPublishedAuditSnapshot(client([{
    ...indexRow, criteria: [criterion],
    responses: { "F176-Q01": { answer: "Não conforme", note: "Risco imediato", serious: "alto" } },
    evidenceFiles: [], reportFileName: "relatorio-final.pdf",
  }]), context);
  assert.deepEqual(snapshot.responses, {});
});

test("keeps ranking metadata when detailed responses do not match the criterion snapshot", async () => {
  const snapshot = await readPublishedAuditSnapshot(client([{
    ...indexRow, criteria: [criterion], responses: {},
    evidenceFiles: [], reportFileName: "relatorio-final.pdf",
  }]), context);
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.audits[0].finalScore, 6.74);
  assert.deepEqual(snapshot.responses, {});
});

test("keeps ranking metadata when private evidence signing is temporarily unavailable", async () => {
  const snapshot = await readPublishedAuditSnapshot(client([{
    ...indexRow, criteria: [criterion],
    responses: { "F176-Q01": { answer: "Não conforme", note: "Pendência", photos: ["p04-01.png"] } },
    evidenceFiles: ["p04-01.png"], reportFileName: "relatorio-final.pdf",
  }], { storageError: { message: "unavailable" } }), context);
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.audits[0].finalScore, 6.74);
  assert.equal(snapshot.audits[0].reportUrl, undefined);
});

test("rejects malformed ranking metadata before loading any audit", async () => {
  const snapshot = await readPublishedAuditSnapshot(client([], { index: [{ ...indexRow, finalScore: 99 }] }), context);
  assert.equal(snapshot.available, false);
  assert.deepEqual(snapshot.audits, []);
});

test("normalizes numeric strings returned by PostgREST for ranking metadata", async () => {
  const snapshot = await readPublishedAuditSnapshot(client([], { index: [{
    ...indexRow, finalScore: "6.74", catalogVersion: "1",
  }] }), context);
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.audits[0].finalScore, 6.74);
  assert.equal(snapshot.audits[0].catalogVersion, 1);
});

test("uses the authorized detailed reader when the index RPC is temporarily unavailable", async () => {
  const details = [{
    ...indexRow, criteria: [criterion],
    responses: { "F176-Q01": { answer: "Conforme", note: "Aprovado" } },
    evidenceFiles: [], reportFileName: "relatorio-final.pdf",
  }];
  const snapshot = await readPublishedAuditSnapshot(client(details, {
    index: null, indexError: { code: "PGRST202" },
  }), context);
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.audits[0].id, auditId);
});

test("signs legacy audit files together rather than per audit", async () => {
  const indexes = Array.from({ length: 7 }, (_, position) => ({
    ...indexRow,
    id: `b1760000-2026-4923-8000-${String(position + 1).padStart(12, "0")}`,
  }));
  const details = indexes.map((entry) => ({
    ...entry, criteria: [criterion],
    responses: { "F176-Q01": { answer: "Conforme", note: "Aprovado" } },
    evidenceFiles: [], reportFileName: "relatorio-final.pdf",
  }));
  let active = 0;
  let maximumActive = 0;
  let signingCalls = 0;
  const batchedClient = {
    rpc: async (name) => ({ data: name === "read_published_audit_index" ? indexes : details, error: null }),
    storage: { from: () => ({ createSignedUrls: async (paths) => {
      active += 1; signingCalls++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return { data: paths.map((path) => ({ path, signedUrl: `https://storage.example/${path}` })), error: null };
    } }) },
  };
  const snapshot = await readPublishedAuditSnapshot(batchedClient, context);
  assert.equal(snapshot.audits.length, 7);
  assert.equal(Object.keys(snapshot.responses).length, 7);
  assert.equal(maximumActive, 1);
  assert.equal(signingCalls, 1);
});

const compactFinding = {
  id: criterion.id, auditId, workId, auditDate: indexRow.date, auditor: indexRow.auditor,
  modelId: indexRow.modelId, module: "quality", item: criterion.code, description: criterion.title,
  criterionTitle: criterion.title, serious: true, nonconformity: "Pendência",
};

test("overview uses one compact read and never loads detail or signs files", async () => {
  const calls = [];
  const overviewClient = {
    rpc: async (name, parameters) => {
      calls.push({ name, parameters });
      return { data: { audits: [indexRow], findings: [{ ...compactFinding, photos: ["private.png"], checks: ["full"] }] }, error: null };
    },
    storage: { from: () => { throw new Error("Overview must not touch Storage"); } },
  };
  const result = await readPublishedAuditOverview(overviewClient, context);
  assert.equal(result.available, true);
  assert.deepEqual(result.findings, [compactFinding]);
  assert.deepEqual(result.responses, {});
  assert.deepEqual(result.criteriaSnapshots, {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "read_published_audit_overview");
  const report = new URL(result.audits[0].reportUrl, "https://app.example");
  assert.equal(report.pathname, `/api/audits/${auditId}/report`);
  assert.equal(report.searchParams.get("perfil"), "ENGENHARIA");
  assert.equal(report.searchParams.get("atuacao"), "EQUIPE_OBRA");
  assert.equal(report.searchParams.get("usuario"), userId);
});

test("compact read fails closed for a mismatched finding and has no eager fallback", async () => {
  let calls = 0;
  const summaryClient = {
    rpc: async (name) => {
      calls++;
      assert.equal(name, "read_published_audit_overview");
      return { data: { audits: [indexRow], findings: [{ ...compactFinding, workId: userId }] }, error: null };
    },
  };
  const result = await readPublishedAuditOverview(summaryClient, context);
  assert.equal(result.available, false);
  assert.equal(calls, 1);
});

test("compact read refuses an unauthorized discipline even on an authorized work", async () => {
  const result = await readPublishedAuditOverview({ rpc: async () => ({
    data: { audits: [{ ...indexRow, modelId: "security-it07-r02" }], findings: [] }, error: null,
  }) }, context);
  assert.equal(result.available, false);
  assert.deepEqual(result.audits, []);
});

test("single detail requests only the selected publication and signs only its evidence", async () => {
  let calls = 0;
  const detail = { ...indexRow, criteria: [criterion], responses: { [criterion.id]: {
    answer: "Não conforme", note: "Pendência", photos: ["p04-01.png"],
  } }, evidenceFiles: ["p04-01.png"], reportFileName: "relatorio-final.pdf" };
  const detailClient = {
    rpc: async (name, params) => {
      calls++;
      assert.equal(name, "read_published_audit_detail");
      assert.equal(params.p_audit_id, auditId);
      return { data: [detail], error: null };
    },
    storage: { from: () => ({ createSignedUrls: async (paths) => {
      assert.deepEqual(paths, [`${workId}/${auditId}/p04-01.png`]);
      return { data: paths.map((path) => ({ signedUrl: `https://storage.example/${path}` })), error: null };
    } }) },
  };
  const result = await readPublishedAuditDetail(detailClient, context, auditId);
  assert.equal(result.available, true);
  assert.equal(calls, 1);
  assert.equal(result.audits.length, 1);
  assert.match(result.audits[0].reportUrl, /^\/api\/audits\//);
  assert.match(result.responses[auditId][indexRow.modelId][criterion.id].photos[0], /^https:/);
});

test("single detail without evidence never calls Storage", async () => {
  const result = await readPublishedAuditDetail({ rpc: async () => ({ data: [{ ...indexRow, criteria: [criterion],
    responses: { [criterion.id]: { note: "Pendência" } }, evidenceFiles: [], reportFileName: "report.pdf" }], error: null }),
    storage: { from: () => { throw new Error("No evidence to sign"); } },
  }, context, auditId);
  assert.equal(result.available, true);
  assert.deepEqual(result.responses[auditId][indexRow.modelId][criterion.id], { note: "Pendência" });
});

test("inaccessible single audit remains absent and does not sign files", async () => {
  const result = await readPublishedAuditDetail({ rpc: async () => ({ data: [], error: null }) }, context, auditId);
  assert.equal(result.available, true);
  assert.deepEqual(result.audits, []);
});

test("report click authorizes the exact profile then signs only the selected PDF", async () => {
  const result = await readPublishedAuditReport({
    rpc: async (name, params) => {
      assert.equal(name, "read_published_audit_report");
      assert.equal(params.p_audit_id, auditId);
      assert.equal(params.p_engineering_scope, "EQUIPE_OBRA");
      return { data: { id: auditId, workId, modelId: indexRow.modelId, reportFileName: "report.pdf" }, error: null };
    },
    storage: { from: () => ({ createSignedUrl: async (path, expiration) => {
      assert.equal(path, `${workId}/${auditId}/report.pdf`);
      assert.equal(expiration, 300);
      return { data: { signedUrl: "https://storage.example/report.pdf" }, error: null };
    } }) },
  }, context, auditId);
  assert.deepEqual(result, { available: true, url: "https://storage.example/report.pdf" });
});

test("report click refuses paths outside the immutable audit directory", async () => {
  const result = await readPublishedAuditReport({ rpc: async () => ({ data: {
    id: auditId, workId, modelId: indexRow.modelId, reportFileName: "../../private.pdf",
  }, error: null }) }, context, auditId);
  assert.equal(result.available, false);
  assert.equal(result.url, null);
});
