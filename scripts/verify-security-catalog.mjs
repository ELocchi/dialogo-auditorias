import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const source = JSON.parse(fs.readFileSync(path.join(root, "CATALOGO_SEGURANCA_IT07_R02.json"), "utf8"));
const { securityCriteria } = await import(pathToFileURL(path.join(root, "src", "domain", "catalogs.ts")).href);

const normalize = (value) => String(value).replace(/\s+/g, " ").trim();
const sourceGroups = new Map(source.grupos.map((group) => [group.codigo, group]));
const sourceSubgroups = new Map(source.subgrupos.map((subgroup) => [subgroup.id_tecnico, subgroup]));
const sourceOrientations = new Map(source.orientacoes.map((orientation) => [orientation.id_tecnico, orientation]));
const generalOrientations = source.orientacoes_gerais;
const expectedOrientations = (item) => {
  const subgroup = sourceSubgroups.get(item.subgrupo_id);
  const linked = item.orientacoes_ids;
  const subgroupLinked = subgroup?.orientacoes_ids ?? [];
  const general = generalOrientations
    .filter((orientation) => !orientation.grupos_codigos || orientation.grupos_codigos.includes(item.grupo_codigo))
    .map((orientation) => orientation.id_tecnico);
  return [...linked, ...subgroupLinked, ...general];
};

assert.equal(source.contagens.itens, 205, "A fonte deve declarar 205 itens");
assert.equal(source.grupos.length, 27, "A fonte deve conter 27 grupos");
assert.equal(source.subgrupos.length, 37, "A fonte deve conter 37 subgrupos");
assert.equal(securityCriteria.length, source.itens.length, "A aplicação deve usar todos os itens da fonte");
assert.equal(new Set(securityCriteria.map((item) => item.code)).size, 205, "Os códigos da aplicação devem ser únicos");

source.itens.forEach((sourceItem, index) => {
  const appItem = securityCriteria[index];
  assert.equal(appItem.code, sourceItem.codigo, `Código fora de ordem na posição ${index + 1}`);
  assert.equal(normalize(appItem.text), normalize(sourceItem.texto_original), `Texto divergente em ${sourceItem.codigo}`);
  assert.deepEqual(appItem.locator.match(/\d+/g).map(Number), sourceItem.paginas_fonte, `Página divergente em ${sourceItem.codigo}`);
  assert.equal(appItem.group, `${sourceItem.grupo_codigo} — ${sourceGroups.get(sourceItem.grupo_codigo).nome_original}`, `Grupo divergente em ${sourceItem.codigo}`);
  assert.equal(appItem.subgroup, sourceSubgroups.get(sourceItem.subgrupo_id).nome_original, `Subgrupo divergente em ${sourceItem.codigo}`);
  assert.equal(appItem.documentedWeight, null, `Peso individual não pode deixar de ser null em ${sourceItem.codigo}`);
  assert.deepEqual(appItem.orientations.map((orientation) => orientation.id), expectedOrientations(sourceItem), `Vínculo de orientação divergente em ${sourceItem.codigo}`);
  for (const orientation of appItem.orientations) {
    const sourceOrientation = sourceOrientations.get(orientation.id) ?? generalOrientations.find((item) => item.id_tecnico === orientation.id);
    assert.ok(sourceOrientation, `Orientação ${orientation.id} não existe na fonte`);
    assert.equal(normalize(orientation.text), normalize(sourceOrientation.texto_original), `Texto de orientação divergente em ${sourceItem.codigo}`);
    assert.deepEqual(orientation.pages, sourceOrientation.paginas_fonte, `Página de orientação divergente em ${sourceItem.codigo}`);
  }
  assert.ok(!appItem.text.includes("Quesito ") && !appItem.text.includes("conforme transcrição"), `Placeholder encontrado em ${sourceItem.codigo}`);
});

for (const code of ["01.01.01", "01.01.02", "01.01.03", "17.01.04", "19.01.08"]) {
  assert.ok(securityCriteria.find((item) => item.code === code), `Item de conferência ausente: ${code}`);
}
assert.ok(securityCriteria.find((item) => item.code === "01.01.01").orientations.some((item) => item.id === "IT07-R02-ORI-01"), "Observação de 01.01.01 ausente");
assert.deepEqual(securityCriteria.find((item) => item.code === "17.01.04").orientations.find((item) => item.id === "IT07-R02-ORI-10").pages, [18, 19], "Orientação continuada de 17.01.04 ausente");
assert.ok(securityCriteria.find((item) => item.code === "19.01.08").orientations.some((item) => item.id === "IT07-R02-ORI-11"), "Orientação de 19.01.08 ausente");

console.log(`OK: ${securityCriteria.length} itens, códigos únicos e ordem conferidos.`);
console.log("OK: textos, grupos, subgrupos, páginas e orientações conferidos contra CATALOGO_SEGURANCA_IT07_R02.json.");
console.log("OK: itens específicos 01.01.01, 01.01.02, 01.01.03, 17.01.04 e 19.01.08 conferidos.");
