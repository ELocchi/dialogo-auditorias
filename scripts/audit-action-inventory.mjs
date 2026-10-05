import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const rows=[];
function walk(dir){ for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(file.endsWith('.tsx')){
 const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function visit(node){if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
  const tag=node.tagName.getText(source); const attrs=Object.fromEntries(node.attributes.properties.filter(ts.isJsxAttribute).map(p=>[p.name.getText(source),p.initializer?.getText(source)??'true']));
  if(['button','a','Link','summary','select','input','textarea'].includes(tag)||attrs.onClick||attrs.role==='"button"'){
   const element=ts.isJsxOpeningElement(node)?node.parent:node;
   rows.push({file:path.relative(root,file),line:source.getLineAndCharacterOfPosition(node.getStart()).line+1,tag,label:attrs['aria-label']??'',tooltip:attrs['data-tooltip']??attrs.title??'',text:ts.isJsxElement(element)?element.children.map(n=>n.getText(source)).join(' ').replace(/\s+/g,' ').slice(0,220):'',disabled:attrs.disabled??'',attributes:attrs});
  }
 }ts.forEachChild(node,visit);}visit(source);
 }}}
walk(path.join(root,'src/app'));
const output=process.argv[2]??'docs/evidence/action-audit/inventory.json';fs.writeFileSync(output,JSON.stringify(rows,null,2)+'\n');
console.log(JSON.stringify({controls:rows.length,files:new Set(rows.map(r=>r.file)).size,output}));
for(const r of rows.filter(r=>['button','a','Link'].includes(r.tag)&&r.label&&!r.tooltip))console.log(`${r.file}:${r.line} ${r.label}`);
