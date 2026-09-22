import assert from "node:assert/strict";
import test from "node:test";
import { bundledCatalog, catalogModelIds } from "../src/lib/catalogs/contracts.ts";
import { parseCriteria, parseRevisionForm, parseUpload, MAX_PDF_BYTES, MAX_WORD_BYTES } from "../src/lib/catalogs/validation.ts";
import { readCatalogSnapshot, saveCatalogRevision } from "../src/lib/catalogs/service.ts";

const actor = "d1a80000-0000-4000-8000-000000000001";
const request = "d1a80000-0000-4000-8000-000000000002";
const revisionId = "d1a80000-0000-4000-8000-000000000003";
const context = { profile: "ADMINISTRATIVO", engineeringScope: null, user: { id: actor, role: "administrative", modules: ["safety", "quality"] } };
const revision = (modelId = "security-it07-r02") => ({ ...bundledCatalog(modelId), id: revisionId, version: 1, createdAt: "2026-09-16T12:00:00Z" });
function form(model = "security-it07-r02") {
  const result = new FormData();
  for (const [key,value] of Object.entries({ requestId: request, actorId: actor, modelId: model, expectedVersion: "0", revisionLabel: "03", changeNote: "Atualização de teste isolada", criteria: JSON.stringify(bundledCatalog(model).criteria) })) result.set(key,value);
  return result;
}
const pdf = () => new File(["%PDF-1.7\nfixture"], "Revisão 03.pdf", { type: "application/pdf" });
const word = () => new File([new Uint8Array([80,75,3,4,0])], "Original.docx");

test("All catalog fields can be edited without mutating the bundled source", () => {
  for (const id of catalogModelIds) {
    const source = bundledCatalog(id).criteria;
    assert.ok(parseCriteria(source), "Full catalog must parse: " + id);
    assert.deepEqual(parseCriteria(source), source);
    const input = form(id), changed = structuredClone(source);
    changed[0].code = `REV-${changed[0].code}`; changed[0].title = "Título revisado";
    changed[0].group = "Módulo revisado"; changed[0].subgroup = "Subgrupo revisado";
    changed[0].text = "Texto revisado"; changed[0].configuredWeight = 0.02;
    changed[1].configuredWeight = (changed[1].configuredWeight ?? changed[1].documentedWeight ?? 0) + ((source[0].configuredWeight ?? source[0].documentedWeight ?? 0) - 0.02);
    changed[0].source = "Fonte revisada"; changed[0].locator = "Localizador revisado"; changed[0].documentedWeight = 123;
    changed[0].interpretation = "Interpretação revisada";
    if (changed[0].orientations.length) changed[0].orientations[0].text = "Orientação revisada";
    input.set("criteria", JSON.stringify(changed));
    const parsed = parseRevisionForm(input); assert.ok(parsed);
    assert.equal(parsed.criteria[0].title, "Título revisado"); assert.equal(parsed.criteria[0].group, "Módulo revisado");
    assert.equal(parsed.criteria[0].text, "Texto revisado"); assert.equal(parsed.criteria[0].configuredWeight, 0.02);
    assert.equal(parsed.criteria[0].source, "Fonte revisada"); assert.equal(parsed.criteria[0].documentedWeight, 123);
    assert.equal(parsed.criteria[0].weightConfigurationId, "manual:" + request);
    assert.deepEqual(source, bundledCatalog(id).criteria);
  }
});

test("A new audit item is accepted and persisted in the selected order", () => {
  const input = form("quality-f175");
  const items = JSON.parse(input.get("criteria"));
  items.splice(1, 0, {
    id: "ITEM-d1a80000-0000-4000-8000-000000000099", code: "NOVO-11", title: "Novo item",
    text: "Verificar o novo requisito", group: "Novo módulo", subgroup: "Teste", source: "Revisão administrativa",
    locator: "Item incluído", documentedWeight: null, configuredWeight: .25, orientations: [],
  });
  items.at(-1).configuredWeight = (items.at(-1).configuredWeight ?? items.at(-1).documentedWeight) - .25;
  input.set("criteria", JSON.stringify(items));
  const parsed = parseRevisionForm(input);
  assert.ok(parsed); assert.equal(parsed.criteria.length, 11); assert.equal(parsed.criteria[1].code, "NOVO-11");
  assert.equal(parsed.criteria[1].weightConfigurationId, "manual:" + request);
});

test("Invalid, duplicate or expanded form fields, IDs and criteria are rejected", () => {
  for (const mutate of [
    (f) => f.append("actorId", actor), (f) => f.set("unexpected", "ignored?"),
    (f) => f.set("requestId", "bad"), (f) => f.set("expectedVersion", "-1"), (f) => f.set("modelId", "constructor"),
    (f) => f.set("revisionLabel", " "), (f) => f.set("revisionLabel", "x".repeat(81)), (f) => f.set("changeNote", ""),
    (f) => f.set("criteria", "bad json"), (f) => f.set("criteria", "[]"),
    (f) => { const items = bundledCatalog("security-it07-r02").criteria; items[0].id = items[1].id; f.set("criteria",JSON.stringify(items)); },
    (f) => { const items = bundledCatalog("quality-f175").criteria; items[0].configuredWeight = -1; f.set("criteria",JSON.stringify(items)); },
    (f) => { const items = bundledCatalog("quality-f175").criteria; items[0].verificationRule = "Regra livre"; f.set("criteria",JSON.stringify(items)); },
    (f) => { const items = bundledCatalog("security-it07-r02").criteria; items[0].orientations[0].text = ""; f.set("criteria",JSON.stringify(items)); },
  ]) { const input = form(); mutate(input); assert.equal(parseRevisionForm(input), null); }
  const invalidTotal = form("quality-f175");
  const qualityItems = JSON.parse(invalidTotal.get("criteria")); qualityItems[0].configuredWeight = 1;
  invalidTotal.set("criteria", JSON.stringify(qualityItems)); assert.equal(parseRevisionForm(invalidTotal), null);
  const invalidSecurityTotal = form("security-it07-r02");
  const securityItems = JSON.parse(invalidSecurityTotal.get("criteria")); securityItems[0].configuredWeight += 1;
  invalidSecurityTotal.set("criteria", JSON.stringify(securityItems)); assert.equal(parseRevisionForm(invalidSecurityTotal), null);
});

test("Security revisions reject an item without a positive configured or documented weight", () => {
  const input = form(); const items = JSON.parse(input.get("criteria")); delete items[0].configuredWeight;
  input.set("criteria",JSON.stringify(items)); const result = parseRevisionForm(input);
  assert.equal(result, null);
});

test("PDF/Word boundaries, traversal filenames and signature mismatches are checked before RPC", async () => {
  assert.equal((await parseUpload(pdf(),"pdf")).name, "Revisão 03.pdf");
  assert.equal((await parseUpload(word(),"original")).name,"Original.docx");
  assert.equal(await parseUpload(null,"pdf"),null);
  for (const [file,kind] of [
    [new File(["%PDF-"], "../x.pdf"), "pdf"], [new File(["%PDF-"], ".x.pdf"), "pdf"],
    [new File(["<html>"], "x.pdf"), "pdf"], [new File(["%PDF-"], "x.docx"), "original"],
    [new File([new Uint8Array(MAX_PDF_BYTES+1)], "x.pdf"), "pdf"], [new File([new Uint8Array(MAX_WORD_BYTES+1)], "x.docx"), "original"],
    ["not a file", "pdf"],
  ]) await assert.rejects(parseUpload(file,kind));
});

test("Unauthorized roles, wrong actors and DOCX uploads never call persistence", async () => {
  const client = { rpc: async () => assert.fail("Unexpected RPC") };
  for (const changed of [{...context, profile:"AUDITOR_SEGURANCA"}, {...context,user:{...context.user,id:revisionId}}]) {
    assert.equal((await saveCatalogRevision(form(),changed,client)).status,"error");
  }
  const input=form(); input.set("original",word()); assert.equal((await saveCatalogRevision(input,context,client)).status,"error");
});

test("Save passes complete criteria/documents atomically and normalization stays identical on retry", async () => {
  const payloads=[];
  const client={ rpc:async(name,params)=>{
    if(name === "save_audit_catalog_revision") { payloads.push(params); return {data:revisionId,error:null}; }
    assert.equal(name,"read_audit_catalogs"); return {data:[revision()],error:null};
  }};
  const input=form(); input.set("pdf",pdf());
  const first=await saveCatalogRevision(input,context,client); const retry=await saveCatalogRevision(input,context,client);
  assert.equal(first.status,"success"); assert.equal(retry.status,"success"); assert.equal(first.snapshot.available,true);
  assert.deepEqual(payloads[0],payloads[1]); assert.equal(payloads[0].p_criteria.length,205);
  assert.equal(Buffer.from(payloads[0].p_pdf_base64,"base64").subarray(0,5).toString(),"%PDF-");
  assert.equal(payloads[0].p_original_base64, null); assert.equal(payloads[0].p_original_name, null);
});

test("Conflicts, revocations, missing migration and unknown save failures never announce success", async () => {
  for (const code of ["40001","42501","22023","PGRST202","42883","unknown"]) {
    const result=await saveCatalogRevision(form(),context,{rpc:async()=>({data:null,error:{code,message:"PRIVATE_DIAGNOSTIC"}})});
    assert.equal(result.status,"error"); assert.ok(!result.message.includes("PRIVATE_DIAGNOSTIC"));
  }
});

test("Fresh catalogs merge initial versions and reject malformed, duplicate or out-of-scope data", async () => {
  const initial=await readCatalogSnapshot({rpc:async()=>({data:[],error:null})},context);
  assert.equal(initial.available,true); assert.deepEqual(initial.versions.map(v=>v.criteria.length),[205,10,23]);
  for (const data of [null,{},[revision(),revision()],[{...revision(),criteria:[]}],[{...revision(),createdAt:"invalid"}]]) {
    assert.equal((await readCatalogSnapshot({rpc:async()=>({data,error:null})},context)).available,false);
  }
  const safety={...context,profile:"AUDITOR_SEGURANCA",user:{...context.user,role:"safety-auditor",modules:["safety"]}};
  assert.equal((await readCatalogSnapshot({rpc:async()=>({data:[revision("quality-f175")],error:null})},safety)).available,false);
});

test("Engineering receives no technical weights; leaks fail closed", async () => {
  const engineering={...context,profile:"ENGENHARIA",engineeringScope:"EQUIPE_OBRA",user:{...context.user,role:"engineering"}};
  const initial=await readCatalogSnapshot({rpc:async()=>({data:[],error:null})},engineering);
  assert.equal(initial.available,true);
  assert.ok(initial.versions.every(v=>v.criteria.every(c=>c.documentedWeight===null && c.configuredWeight===undefined && c.weightConfigurationId===undefined)));
  assert.equal((await readCatalogSnapshot({rpc:async()=>({data:[revision()],error:null})},engineering)).available,false);
});

test("Only a specifically missing migration permits legacy preview fallback; outages stay unavailable", async () => {
  const missing=await readCatalogSnapshot({rpc:async()=>({data:null,error:{code:"PGRST202"}})},context);
  const outage=await readCatalogSnapshot({rpc:async()=>{throw Error("offline")}},context);
  assert.equal(missing.setupPending,true); assert.equal(outage.available,false); assert.ok(!outage.setupPending);
});
