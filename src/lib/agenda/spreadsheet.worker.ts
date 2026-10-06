import { decodeAgendaSpreadsheet } from "./spreadsheet";
self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try { self.postMessage({ rows: await decodeAgendaSpreadsheet(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Planilha inválida." }); }
};
