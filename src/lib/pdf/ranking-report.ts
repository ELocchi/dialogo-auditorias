import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type RankingPdfRow = { workName: string; position: number | null; score: number | null };

const scoreFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** PDF com o ranking exibido: as duas disciplinas lado a lado, no mesmo período e na mesma ordem da tela. */
export async function rankingPdf({ annual, label, tables, logo }: {
  annual: boolean; label: string; tables: { title: string; rows: readonly RankingPdfRow[] }[]; logo?: Uint8Array | null;
}): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`Ranking das Obras - ${annual ? `Anual ${label}` : label}`);
  document.setAuthor("Diálogo Engenharia");
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const image = logo ? await document.embedPng(logo).catch(() => null) : null;
  const navy = rgb(.07, .24, .47), red = rgb(.86, .12, .18), muted = rgb(.39, .47, .57), line = rgb(.87, .90, .94), band = rgb(.96, .97, .98);
  const width = 595.28, height = 841.89, left = 40, right = width - 40, bottom = 50;
  const columnGap = 20, columnWidth = tables.length > 1 ? (right - left - columnGap) / 2 : right - left;
  const fit = (text: string, size: number, max: number) => {
    let value = text;
    while (value.length > 1 && bold.widthOfTextAtSize(value, size) > max) value = value.slice(0, -2) + "…";
    return value;
  };
  let page = document.addPage([width, height]);
  const header = () => {
    if (image) { const size = image.scaleToFit(110, 36); page.drawImage(image, { x: left, y: height - 40 - size.height, width: size.width, height: size.height }); }
    const title = "Ranking das Obras";
    page.drawText(title, { x: right - bold.widthOfTextAtSize(title, 16), y: height - 52, size: 16, font: bold, color: navy });
    const period = annual ? `Anual · ${label}` : label.charAt(0).toUpperCase() + label.slice(1);
    page.drawText(period, { x: right - regular.widthOfTextAtSize(period, 10), y: height - 68, size: 10, font: regular, color: muted });
    page.drawLine({ start: { x: left, y: height - 82 }, end: { x: right, y: height - 82 }, thickness: .6, color: navy });
    page.drawLine({ start: { x: left, y: height - 85 }, end: { x: right, y: height - 85 }, thickness: 1.3, color: red });
  };
  header();
  const rowHeight = 22, top = height - 112;
  const longest = Math.max(1, ...tables.map((table) => table.rows.length));
  // Uma página comporta as linhas que cabem; tabelas maiores continuam nas páginas seguintes com o mesmo cabeçalho.
  const perPage = Math.floor((top - 34 - bottom) / rowHeight);
  for (let start = 0; start < longest; start += perPage) {
    if (start) { page = document.addPage([width, height]); header(); }
    tables.forEach(({ title, rows }, column) => {
      const x = left + column * (columnWidth + columnGap);
      page.drawRectangle({ x, y: top - 4, width: 3, height: 14, color: red });
      page.drawText(title, { x: x + 9, y: top, size: 11, font: bold, color: navy });
      const headY = top - 26;
      page.drawRectangle({ x, y: headY - 6, width: columnWidth, height: 18, color: band });
      page.drawText("Pos.", { x: x + 6, y: headY, size: 7.5, font: bold, color: muted });
      page.drawText("Obra", { x: x + 40, y: headY, size: 7.5, font: bold, color: muted });
      const scoreLabel = annual ? "Média" : "Nota";
      page.drawText(scoreLabel, { x: x + columnWidth - 6 - bold.widthOfTextAtSize(scoreLabel, 7.5), y: headY, size: 7.5, font: bold, color: muted });
      const slice = rows.slice(start, start + perPage);
      if (!slice.length && start === 0) page.drawText(`Nenhum resultado disponível neste ${annual ? "ano" : "mês"}.`, { x: x + 6, y: headY - rowHeight, size: 8.5, font: regular, color: muted });
      slice.forEach((row, index) => {
        const y = headY - (index + 1) * rowHeight;
        const position = row.position !== null && Number.isInteger(row.position) && row.position > 0 ? `${row.position}º` : "—";
        const score = row.score !== null && Number.isFinite(row.score) ? scoreFormatter.format(row.score) : "—";
        page.drawText(position, { x: x + 6, y, size: 8.5, font: regular, color: muted });
        page.drawText(fit(row.workName, 8.5, columnWidth - 90), { x: x + 40, y, size: 8.5, font: bold, color: navy });
        page.drawText(score, { x: x + columnWidth - 6 - bold.widthOfTextAtSize(score, 8.5), y, size: 8.5, font: bold, color: navy });
        page.drawLine({ start: { x, y: y - 8 }, end: { x: x + columnWidth, y: y - 8 }, thickness: .4, color: line });
      });
    });
  }
  const pages = document.getPages();
  pages.forEach((current, index) => {
    const footer = `${String(index + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`;
    current.drawText("Diálogo Auditorias", { x: left, y: 28, size: 7, font: regular, color: muted });
    current.drawText(footer, { x: right - regular.widthOfTextAtSize(footer, 7), y: 28, size: 7, font: regular, color: muted });
  });
  return document.save();
}
