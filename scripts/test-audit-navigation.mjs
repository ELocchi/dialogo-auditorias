import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const [{ securityCriteria, qualityModels }, draftModule] = await Promise.all([
  import(pathToFileURL(path.join(root, "src", "domain", "catalogs.ts")).href),
  import(pathToFileURL(path.join(root, "src", "domain", "audit-draft.ts")).href),
]);
const { getAdjacentIndex, getItemResponse, updateItemResponse, getResponseLabel } = draftModule;

assert.equal(securityCriteria.length, 205);
assert.equal(getAdjacentIndex(0, 205, -1), 0, "Anterior deve permanecer no primeiro item");
assert.equal(getAdjacentIndex(204, 205, 1), 204, "Próximo deve permanecer no último item");
assert.equal(getAdjacentIndex(0, 205, 1), 1);
assert.equal(getAdjacentIndex(204, 205, -1), 203);

let drafts = {};
const first = securityCriteria[0];
const second = securityCriteria[1];
drafts = updateItemResponse(drafts, "Segurança — IT.07 rev. 02", first, { answer: "5", note: "TESTE — observação exclusiva do item 01.01.01" });
assert.equal(getResponseLabel(getItemResponse(drafts, "Segurança — IT.07 rev. 02", second)), "Não respondido");
drafts = updateItemResponse(drafts, "Segurança — IT.07 rev. 02", second, { answer: "10", note: "TESTE — observação exclusiva do item 01.01.02" });
assert.equal(getItemResponse(drafts, "Segurança — IT.07 rev. 02", first).answer, "5");
assert.equal(getItemResponse(drafts, "Segurança — IT.07 rev. 02", first).note, "TESTE — observação exclusiva do item 01.01.01");
assert.equal(getItemResponse(drafts, "Segurança — IT.07 rev. 02", second).answer, "10");
assert.equal(getItemResponse(drafts, "Segurança — IT.07 rev. 02", second).note, "TESTE — observação exclusiva do item 01.01.02");
drafts = updateItemResponse(drafts, "Segurança — IT.07 rev. 02", first, { answer: "0", note: "nota zero válida" });
assert.equal(getResponseLabel(getItemResponse(drafts, "Segurança — IT.07 rev. 02", first)), "0", "Nota 0 não pode ser ausência");
drafts = updateItemResponse(drafts, "Segurança — IT.07 rev. 02", first, { answer: "0", note: "nota zero válida", serious: true });
assert.equal(getItemResponse(drafts, "Segurança — IT.07 rev. 02", first).serious, true, "A marcação manual de item grave deve permanecer no rascunho");
assert.equal(getItemResponse(drafts, "Segurança — IT.07 rev. 02", second).serious, undefined, "A marcação não pode atingir outro item");
assert.equal(getResponseLabel(getItemResponse(drafts, "F.175/00", first)), "Não respondido", "Modelos devem ter rascunhos separados");
assert.equal(getResponseLabel(getItemResponse(drafts, "Segurança — IT.07 rev. 02", securityCriteria[204])), "Não respondido", "Itens não visitados começam sem resposta");
assert.equal(qualityModels.find((model) => model.id === "F175").criteria.length, 10);
assert.equal(qualityModels.find((model) => model.id === "F176").criteria.length, 23);
console.log("OK: limites, avanço sem resposta, nota 0, item grave manual, respostas independentes e rascunhos por modelo conferidos.");
