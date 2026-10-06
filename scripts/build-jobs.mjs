// Compile the worker's dependency graph with the project's TypeScript compiler.
// No Next server, browser runtime, credentials or extra bundler required.
import ts from 'typescript';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(), output=path.join(root,'build/jobs'), seen=new Set();
async function compile(file) {
 if(seen.has(file))return; seen.add(file);
 const target=path.join(output,path.relative(root,file)).replace(/\.ts$/,'.js');
 await mkdir(path.dirname(target),{recursive:true});
 const input=await readFile(file,'utf8');
 if(file.endsWith('.json')) {await writeFile(target,input);return;}
 const dependencies=[];
 const result=ts.transpileModule(input,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true},transformers:{before:[context=>{
  const visit=node=>{
   if(ts.isImportDeclaration(node)&&node.moduleSpecifier.text==='server-only')return undefined;
   if(ts.isStringLiteral(node)&&(ts.isImportDeclaration(node.parent)||ts.isExportDeclaration(node.parent))) {
    const name=node.text;
    if(name.startsWith('@/')||name.startsWith('.')) {
     let dep=name.startsWith('@/')?path.join(root,'src',name.slice(2)):path.resolve(path.dirname(file),name);
     if(!path.extname(dep))dep+='.ts';dependencies.push(dep);
     let relative=path.relative(path.dirname(file),dep).replace(/\.ts$/,'.js');if(!relative.startsWith('.'))relative='./'+relative;
     return ts.factory.createStringLiteral(relative);
    }
   }
   return ts.visitEachChild(node,visit,context);
  };return source=>ts.visitNode(source,visit);
 }]}});
 await writeFile(target,result.outputText);
 for(const dependency of dependencies)await compile(dependency);
}
await compile(path.join(root,'src/jobs/execute.ts'));
await compile(path.join(root,'src/lib/publications/admin.ts'));
console.log(`Worker compiled: ${seen.size} modules`);
