import type { AgendaCell } from "./spreadsheet";
export async function readAgendaSpreadsheet(file: File): Promise<AgendaCell[][]> {
  if (file.size > 2 * 1024 * 1024) throw new Error("Use uma planilha de até 2 MB.");
  if (typeof Worker === "undefined") throw new Error("Abra a importação em um navegador atualizado.");
  const bytes = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./spreadsheet.worker.ts", import.meta.url));
    const finish = (error?: Error, rows?: AgendaCell[][]) => { clearTimeout(timer); worker.terminate(); if (error) reject(error); else resolve(rows!); };
    const timer = setTimeout(() => finish(new Error("A leitura demorou. Reduza a planilha e tente novamente.")), 30_000);
    worker.onmessage = event => event.data.error ? finish(new Error(event.data.error)) : finish(undefined, event.data.rows);
    worker.onerror = () => finish(new Error("Não foi possível ler a planilha. Tente novamente."));
    worker.onmessageerror = () => finish(new Error("Não foi possível ler a planilha."));
    worker.postMessage(bytes, [bytes]);
  });
}
