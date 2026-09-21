import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { activeProfileCookieName, encodeActiveProfileChoice } from "../src/lib/auth/active-profile.ts";

// Real route and session/profile guards, with offline cookies/Auth/RPC and a
// recording file adapter. No credentials, network, production calls or users.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const privateRoot = path.join(projectRoot, "private", "reference-documents");
const userId = "d1a80000-0000-4000-8000-000000000001";
const otherId = "d1a80000-0000-4000-8000-000000000002";
const pdfType = "application/pdf";
const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const documents = [
  { id: "security-it07-r02", pdf: "security-it07-r02.pdf", original: "security-it07-r02.pdf", originalType: pdfType },
  { id: "quality-f175", pdf: "quality-f175.pdf", original: "quality-f175.docx", originalType: docxType },
  { id: "quality-f176", pdf: "quality-f176.pdf", original: "quality-f176.docx", originalType: docxType },
];
const fileContents = new Map(documents.flatMap((document) => [document.pdf, document.original])
  .map((name) => [path.join(privateRoot, name), Buffer.from(`OFFLINE CONTENT: ${name}`)]));
let state;
function reset(profile = "ADMINISTRATIVO", scope = null) {
  state = {
    user: { id: userId, email: "reference.fixture@dialogo.com.br", email_confirmed_at: "2026-09-16T12:00:00Z" },
    account: { auth_user_id: userId, perfil: "ADMINISTRATIVO", perfis: ["ADMINISTRATIVO", "AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"],
      atuacao_engenharia: "EQUIPE_OBRA", atuacoes_engenharia: ["EQUIPE_OBRA", "COORDENACAO"], atuacao_administrativa: "GERAL", ativo: true, approved_at: "2026-09-16T12:00:00Z" },
    requestStatus: "APROVADO", active: true, administrator: true, administratorError: null, auditorGrant: true, fallbackGrant: true, grantModule: null, requestedModule: null, activeWork: true, authError: null,
    cookies: [{ value: encodeActiveProfileChoice(userId, profile, scope, profile === "ADMINISTRATIVO" ? "GERAL" : null) }],
    fileReads: [], rpcCalls: [], calls: [], fsError: false,
  };
  state.cookieStore = { getAll(name) { assert.equal(name, activeProfileCookieName); return state.cookies; } };
  state.client = {
    auth: { async getUser() { state.calls.push("auth"); return { data: { user: state.user }, error: state.authError }; } },
    from(table) { return {
      select() { return this; }, eq(column, value) { if (table === "access_grants" && column === "modulo") state.requestedModule = value; return this; }, in() { return this; }, limit() { return this; },
      then(resolve, reject) {
        state.calls.push(table);
        const data = table === "access_grants" ? state.fallbackGrant && (!state.grantModule || state.grantModule === state.requestedModule) ? [{ obra_id: otherId }] : []
          : table === "access_works" ? state.activeWork ? [{ id: otherId }] : [] : [];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
      async maybeSingle() {
        state.calls.push(table);
        return { data: table === "access_accounts" ? state.account : {
          auth_user_id: userId, status_acesso: state.requestStatus, email: state.user?.email,
          email_confirmado_em: state.user?.email_confirmed_at,
        }, error: null };
      },
    }; },
    async rpc(name, params) {
      if (name === "read_audit_catalog_document") { state.rpcCalls.push(name); state.documentParams = params; return { data: state.document ?? null, error: state.documentError ?? null }; }
      if (name === "read_auditor_catalog_document") {
        state.calls.push(name); state.rpcCalls.push(name); state.documentParams = params;
        return { data: state.document ?? null, error: state.auditorGrant ? state.documentError ?? null : { code: "42501" } };
      }
      assert.ok(["is_current_access_active", "is_current_access_administrator"].includes(name));
      state.calls.push(name); state.rpcCalls.push(name);
      return name === "is_current_access_active"
        ? { data: state.active, error: null }
        : { data: state.administrator, error: state.administratorError };
    },
  };
  state.readFile = async (filePath) => {
    state.calls.push("readFile"); state.fileReads.push(filePath);
    if (state.fsError) throw new Error("OFFLINE_PRIVATE_PATH_CREDENTIAL_DIAGNOSTIC");
    assert.ok(fileContents.has(filePath), `Unexpected private file read: ${filePath}`);
    return fileContents.get(filePath);
  };
  globalThis.__referenceDocumentsFixture = state;
}
const stubs = {
  "server-only": "export {};",
  "next/headers": "export async function cookies() { return globalThis.__referenceDocumentsFixture.cookieStore; }",
  "next/navigation": "export function redirect(destination) { throw Object.assign(new Error('redirect'), { destination }); }",
  "supabase/server": "export async function createClient() { return globalThis.__referenceDocumentsFixture.client; }",
  "node:fs/promises": "export async function readFile(...args) { return globalThis.__referenceDocumentsFixture.readFile(...args); }",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const key = specifier.endsWith("supabase/server") || specifier.endsWith("supabase/server.ts") ? "supabase/server" : specifier;
    if (Object.hasOwn(stubs, key)) return { url: `data:text/javascript,${encodeURIComponent(stubs[key])}`, shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(pathToFileURL(path.join(projectRoot, "src", `${specifier.slice(2)}.ts`)).href, context);
    return nextResolve(specifier, context);
  },
});
const { GET, runtime, dynamic } = await import("../src/app/api/reference-documents/[modelId]/route.ts");
function load(modelId = documents[0].id, query = "") {
  return GET(new Request(`http://offline.invalid/api/reference-documents/${encodeURIComponent(modelId)}${query}`),
    { params: Promise.resolve({ modelId }) });
}
function assertPrivate(response) {
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Cookie");
}
async function assertDenied(response, status) {
  assert.equal(response.status, status); assertPrivate(response);
  assert.equal(state.fileReads.length, 0);
  assert.equal(response.headers.get("Content-Disposition"), null);
  assert.notEqual(response.headers.get("Content-Type"), pdfType);
  const body = await response.text();
  assert.ok(!body.includes("OFFLINE CONTENT"));
  assert.ok(!body.includes("OFFLINE_PRIVATE_PATH_CREDENTIAL_DIAGNOSTIC"));
}

test("Unauthenticated or rejected Auth session cannot read PDF or original bytes", async () => {
  for (const mutate of [(s) => { s.user = null; }, (s) => { s.authError = { message: "Offline Auth failure" }; }]) {
    for (const query of ["", "?download=original"]) {
      reset(); mutate(state); await assertDenied(await load("quality-f175", query), 401);
      assert.equal(state.rpcCalls.length, 0);
    }
  }
});

test("Pending, inactive or database-revoked accounts are rejected before private file access", async () => {
  for (const mutate of [
    (s) => { s.requestStatus = "PENDENTE_APROVACAO"; },
    (s) => { s.account.ativo = false; },
    (s) => { s.active = false; },
    (s) => { s.user.email_confirmed_at = undefined; },
  ]) {
    reset(); mutate(state); await assertDenied(await load(), 403);
  }
});

test("Engineering profiles open reports only for an authorized discipline and active work", async () => {
  for (const [profile, scope] of [
    ["ENGENHARIA", "EQUIPE_OBRA"], ["ENGENHARIA", "COORDENACAO"],
  ]) {
    for (const query of ["?revision=bundled", "?revision=bundled&download=original"]) {
      reset(profile, scope); state.grantModule = "QUALIDADE";
      const response = await load("quality-f176", query);
      assert.equal(response.status, 200); assertPrivate(response);
      assert.ok(state.calls.indexOf("access_grants") < state.calls.indexOf("readFile"));
      assert.ok(!state.rpcCalls.includes("read_auditor_catalog_document"));
      reset(profile, scope); state.grantModule = "QUALIDADE";
      await assertDenied(await load("security-it07-r02", query), 403);
      reset(profile, scope); state.fallbackGrant = false;
      await assertDenied(await load("quality-f176", query), 403);
      reset(profile, scope); state.activeWork = false;
      await assertDenied(await load("quality-f176", query), 403);
    }
  }
});

test("Auditors can read only their discipline while an active grant exists", async () => {
  for (const [profile, allowed, denied] of [
    ["AUDITOR_SEGURANCA", "security-it07-r02", "quality-f175"],
    ["AUDITOR_QUALIDADE", "quality-f176", "security-it07-r02"],
  ]) {
    for (const query of ["", "?download=original", "?revision=bundled"]) {
      reset(profile);
      const response = await load(allowed, query);
      assert.equal(response.status, 200); assertPrivate(response);
      assert.ok(state.calls.indexOf("read_auditor_catalog_document") < state.calls.indexOf("readFile"));
      assert.equal(state.documentParams.p_profile, profile);
      reset(profile); await assertDenied(await load(denied, query), 403);
      assert.ok(!state.rpcCalls.includes("read_auditor_catalog_document"));
      reset(profile); state.auditorGrant = false;
      await assertDenied(await load(allowed, query), 403);
    }
  }
});

test("An auditor receives the selected private revision through the guarded reader", async () => {
  reset("AUDITOR_SEGURANCA");
  const id = "d1a80000-0000-4000-8000-000000000003";
  const bytes = Buffer.from("%PDF-1.7 auditor revision");
  state.document = { name: "IT.07 atualizado.pdf", contentType: pdfType, base64: bytes.toString("base64") };
  const response = await load("security-it07-r02", `?revision=${id}`);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal(state.documentParams.p_revision_id, id);
  assert.equal(state.fileReads.length, 0);
});

test("Bundled auditor documents work with existing RLS grants before the new RPC is deployed", async () => {
  for (const query of ["", "?revision=bundled", "?revision=bundled&download=original"]) {
    reset("AUDITOR_SEGURANCA"); state.documentError = { code: "PGRST202" };
    assert.equal((await load("security-it07-r02", query)).status, 200);
    assert.deepEqual(state.fileReads, [path.join(privateRoot, "security-it07-r02.pdf")]);
    assert.ok(state.calls.indexOf("access_works") < state.calls.indexOf("readFile"));
    for (const revoked of ["fallbackGrant", "activeWork"]) {
      reset("AUDITOR_SEGURANCA"); state.documentError = { code: "PGRST202" }; state[revoked] = false;
      await assertDenied(await load("security-it07-r02", query), 403);
    }
  }
  reset("AUDITOR_SEGURANCA"); state.documentError = { code: "PGRST202" };
  await assertDenied(await load("security-it07-r02", `?revision=${otherId}`), 503);
});

test("Missing, duplicate or wrong-user cookie and removed Administrative membership do not authorize a document", async () => {
  for (const mutate of [
    (s) => { s.cookies = []; },
    (s) => { s.cookies.push({ value: encodeActiveProfileChoice(userId, "AUDITOR_SEGURANCA") }); },
    (s) => { s.cookies = [{ value: encodeActiveProfileChoice(otherId, "ADMINISTRATIVO", null, "GERAL") }]; },
    (s) => { s.account.perfis = ["AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"]; s.account.perfil = "AUDITOR_SEGURANCA"; },
  ]) {
    reset(); mutate(state); await assertDenied(await load(), 403);
  }
});

test("The current database administrator predicate must succeed even for an approved Administrative cookie", async () => {
  for (const mutate of [
    (s) => { s.administrator = false; },
    (s) => { s.administratorError = { message: "Offline RPC rejection" }; },
  ]) {
    reset(); mutate(state); await assertDenied(await load(), 403);
    assert.ok(state.rpcCalls.includes("is_current_access_administrator"));
  }
});

test("Only the three fixed document identifiers resolve: filenames, object keys and traversal attempts return 404", async () => {
  for (const id of ["unknown", "security-it07-r02.pdf", "quality-f175.docx", "__proto__", "constructor", "toString",
    "../security-it07-r02", "../../.env.local", "..%2f..%2f.env.local", "/etc/passwd", "C:\\Windows\\win.ini", ""]) {
    reset(); await assertDenied(await load(id), 404);
  }
});

test("Each Administrative PDF request returns exactly its private file with inline disposition and no shared cache", async () => {
  assert.equal(runtime, "nodejs"); assert.equal(dynamic, "force-dynamic");
  for (const document of documents) {
    reset(); const response = await load(document.id);
    assert.equal(response.status, 200); assertPrivate(response);
    assert.equal(response.headers.get("Content-Type"), pdfType);
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
    const disposition = response.headers.get("Content-Disposition");
    assert.match(disposition, /^inline;/); assert.ok(disposition.includes(document.pdf));
    const expectedPath = path.join(privateRoot, document.pdf);
    assert.deepEqual(state.fileReads, [expectedPath]);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fileContents.get(expectedPath));
    assert.ok(state.calls.indexOf("is_current_access_administrator") < state.calls.indexOf("readFile"));
    assert.ok(!response.headers.has("Access-Control-Allow-Origin"));
  }
});

test("A General administrator's selected discipline limits reference documents in that view", async () => {
  reset(); state.cookies = [{ value: encodeActiveProfileChoice(userId, "ADMINISTRATIVO", null, "SEGURANCA") }];
  await assertDenied(await load("quality-f175"), 403);
  assert.equal(state.fileReads.length, 0);
  assert.equal((await load("security-it07-r02")).status, 200);
  reset(); state.cookies = [{ value: encodeActiveProfileChoice(userId, "ADMINISTRATIVO", null, "QUALIDADE") }];
  await assertDenied(await load("security-it07-r02"), 403);
  assert.equal((await load("quality-f175")).status, 200);
});

test("Original downloads preserve the source PDF/DOCX per model and require the same Administrative authorization", async () => {
  for (const document of documents) {
    reset(); const response = await load(document.id, "?download=original");
    assert.equal(response.status, 200); assertPrivate(response);
    assert.equal(response.headers.get("Content-Type"), document.originalType);
    const disposition = response.headers.get("Content-Disposition");
    assert.match(disposition, /^attachment;/); assert.ok(disposition.includes(document.original));
    const expectedPath = path.join(privateRoot, document.original);
    assert.deepEqual(state.fileReads, [expectedPath]);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fileContents.get(expectedPath));
    assert.ok(state.calls.indexOf("is_current_access_administrator") < state.calls.indexOf("readFile"));
  }
});

test("Private file failure returns uncached 503 without disclosing paths or provider diagnostics", async () => {
  reset(); state.fsError = true;
  const response = await load();
  assert.equal(response.status, 503); assertPrivate(response);
  assert.equal(state.fileReads.length, 1);
  const body = await response.text();
  assert.ok(!body.includes("OFFLINE_PRIVATE_PATH_CREDENTIAL_DIAGNOSTIC"));
  assert.ok(!body.includes(privateRoot)); assert.ok(!body.includes("OFFLINE CONTENT"));
});

test("Versioned reference assets have the declared PDF/DOCX signatures in the private directory", () => {
  for (const document of documents) {
    const pdf = readFileSync(path.join(privateRoot, document.pdf));
    assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(pdf.length > 100, `Empty PDF: ${document.pdf}`);
    if (document.originalType === docxType) {
      const original = readFileSync(path.join(privateRoot, document.original));
      assert.equal(original.subarray(0, 4).toString("hex"), "504b0304");
      assert.ok(original.includes(Buffer.from("[Content_Types].xml")), `Invalid DOCX container: ${document.original}`);
    }
  }
});


test("Private revision PDFs and originals are served without filesystem fallback", async () => {
  for (const original of [false,true]) {
    reset(); const bytes=original?Buffer.from([80,75,3,4,0]):Buffer.from("%PDF-1.7 revised");
    state.document={name:original?"Novo original.docx":"Revisão 03.pdf",contentType:original?docxType:pdfType,base64:bytes.toString("base64")};
    const response=await load("quality-f175",original?"?download=original":"");
    assert.equal(response.status,200);assertPrivate(response);assert.equal(state.fileReads.length,0);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
    assert.equal(state.documentParams.p_original,original);
  }
});

test("Revision read errors and malformed contents cannot silently expose an older document", async () => {
  for (const mutate of [
    s=>{s.documentError={code:"42501",message:"PRIVATE_DIAGNOSTIC"};},
    s=>{s.documentError={code:"offline"};},
    s=>{s.document={name:"wrong.pdf",contentType:pdfType,base64:Buffer.from("<html>").toString("base64")};},
  ]) { reset();mutate(state);await assertDenied(await load(),503); }
});

test("Explicit versions pass the revision identity; invalid IDs fail before file reads", async () => {
  reset();await assertDenied(await load("quality-f175","?revision=not-a-uuid"),400);
  reset();const id="d1a80000-0000-4000-8000-000000000003";
  state.document={name:"Historical.pdf",contentType:pdfType,base64:Buffer.from("%PDF-1.7 old").toString("base64")};
  assert.equal((await load("quality-f175","?revision="+id)).status,200);
  assert.equal(state.documentParams.p_revision_id,id);
  reset("AUDITOR_SEGURANCA");
  await assertDenied(await load("security-it07-r02", `?revision=${id}`), 503);
  assert.equal(state.fileReads.length, 0);
  reset();state.documentError={code:"PGRST202"};assert.equal((await load()).status,200);
});
