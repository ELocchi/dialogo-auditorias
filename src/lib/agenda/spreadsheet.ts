export type AgendaCell = { text: string; value: string | Date | null };
export async function decodeAgendaSpreadsheet(bytes: ArrayBuffer): Promise<AgendaCell[][]> {
  if (bytes.byteLength > 2 * 1024 * 1024) throw new Error("Use uma planilha de até 2 MB.");
  const excel = await import("exceljs");
  const Workbook = excel.Workbook ?? excel.default.Workbook;
  const workbook = new Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("A planilha não possui uma aba com dados.");
  if (sheet.rowCount > 201 || sheet.columnCount > 20) throw new Error("Use até 200 agendamentos e 20 colunas por planilha.");
  return Array.from({ length: sheet.rowCount }, (_, row) => Array.from({ length: sheet.columnCount }, (_, column) => {
    const cell = sheet.getRow(row + 1).getCell(column + 1);
    if (cell.text.length > 5000) throw new Error("Uma célula excede o limite de texto.");
    return { text: cell.text, value: cell.value instanceof Date ? cell.value : cell.text };
  }));
}
