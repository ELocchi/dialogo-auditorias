import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve('src'); const findings = []; let scanned = 0;
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { await scan(file); continue; }
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const relative = path.relative(process.cwd(), file).replaceAll('\\', '/');
    if (relative.includes('/revisao-')) continue;
    scanned++;
    const source = ts.createSourceFile(relative, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const signals = [];
    function visit(node) {
      if (ts.isAwaitExpression(node)) signals.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, await: node.expression.getText(source).slice(0, 120) });
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(source);
        if (/^(fetch|fetcher|fetchPdf|useActionState|useTransition|dynamic|publicationFetch|readWithDeadline)$/.test(name) || /Action$/.test(name)) signals.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, call: name });
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (signals.length) findings.push({ file: relative, signals });
  }
}
await scan(root);
const out = 'docs/evidence/async-flows-20261005'; await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'inventario.json'), JSON.stringify({ generatedAt: new Date().toISOString(), scannedSourceFiles: scanned, filesWithAsyncEntryPoints: findings.length, note: 'Inventory of entry points, not a claim that every path/profile combination was browser-tested.', findings }, null, 2));
console.log(`${scanned} arquivos examinados; ${findings.length} com entradas assíncronas identificadas.`);
