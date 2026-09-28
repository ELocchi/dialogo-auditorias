import { PDFDocument, PDFName, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatAuditDate } from "../../domain/operational-records.ts";
import { moduleLabels } from "../../domain/prototype-access.ts";
import type { ActionPlanPdfInput, ActionPlanRow, PdfAssets } from "./types.ts";

export async function generateActionPlanPdf({ workName, auditDate, auditScore, module, authorName, rows }: ActionPlanPdfInput, assets: PdfAssets) {
  const document = await PDFDocument.create();
  document.setTitle(`Plano de Ação - ${workName}`);
  document.setAuthor(authorName);
  document.setSubject(`Plano de ação de ${moduleLabels[module]}`);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = assets.logo ? await document.embedPng(assets.logo).catch(() => null) : null;
  const width = 631.5, height = 445.5, left = 34, right = width - 33;
  const contentWidth = right - left, contentTop = height - 73.5, contentBottom = 52, summaryContentBottom = 38;
  const navy = rgb(.07, .24, .47), red = rgb(.86, .12, .18), muted = rgb(.39, .47, .57), lineColor = rgb(.87, .90, .94);
  const green = rgb(.10, .55, .34);
  const pages: PDFPage[] = [];
  const addPage = () => { const next = document.addPage([width, height]); pages.push(next); return next; };
  const drawLabel = (page: PDFPage, value: string, x: number, y: number) => page.drawText(value, { x, y, size: 5.5, font: bold, color: muted });
  const drawRoundedCode = (page: PDFPage, value: string, x: number, y: number) => {
    const boxWidth = 43, boxHeight = 17, radius = 4;
    const background = rgb(.93, .95, .98);
    page.drawRectangle({ x: x + radius, y, width: boxWidth - radius * 2, height: boxHeight, color: background });
    page.drawRectangle({ x, y: y + radius, width: boxWidth, height: boxHeight - radius * 2, color: background });
    page.drawCircle({ x: x + radius, y: y + radius, size: radius, color: background });
    page.drawCircle({ x: x + boxWidth - radius, y: y + radius, size: radius, color: background });
    page.drawCircle({ x: x + radius, y: y + boxHeight - radius, size: radius, color: background });
    page.drawCircle({ x: x + boxWidth - radius, y: y + boxHeight - radius, size: radius, color: background });
    const printable = safePdfText(value, bold);
    page.drawText(printable, { x: x + (boxWidth - bold.widthOfTextAtSize(printable, 6.8)) / 2, y: y + 5.2, size: 6.8, font: bold, color: navy });
  };
  const preparedRows: Array<{ row: ActionPlanRow; images: PDFImage[]; photoNames: string[] }> = [];
  for (const row of rows) {
    const evidenceImages: PDFImage[] = [];
    for (const photo of row.evidencePhotos ?? []) {
      if (!photo.url) continue;
      try {
        const asset = assets.photos[photo.url];
        if (!asset) continue;
        evidenceImages.push(asset.mimeType === "image/png" ? await document.embedPng(asset.bytes) : await document.embedJpg(asset.bytes));
      } catch { /* A referência textual permanece no PDF quando a imagem não estiver disponível. */ }
    }
    preparedRows.push({ row, images: evidenceImages, photoNames: (row.evidencePhotos ?? []).map((photo) => photo.name) });
  }

  const drawMetadata = (page: PDFPage) => {
    const metadataColumnWidth = contentWidth / 4;
    const labelY = contentTop;
    const valueY = labelY - 10;
    const metadata = [
      { label: "OBRA", value: workName },
      { label: "DISCIPLINA", value: moduleLabels[module] },
      { label: "NOTA DA AUDITORIA", value: auditScore === null ? "—" : auditScore.toFixed(2).replace(".", ",") },
      { label: "AUDITORIA DE REFERÊNCIA", value: formatAuditDate(auditDate) },
    ];
    const valueLines = metadata.map((entry) => wrapPdfText(safePdfText(entry.value, bold), bold, 7.5, metadataColumnWidth - 10));
    metadata.forEach((entry, index) => {
      const center = left + metadataColumnWidth * (index + .5);
      const label = safePdfText(entry.label, bold);
      page.drawText(label, { x: center - bold.widthOfTextAtSize(label, 5.5) / 2, y: labelY, size: 5.5, font: bold, color: muted });
      valueLines[index].forEach((value, lineIndex) => page.drawText(value, {
        x: center - bold.widthOfTextAtSize(value, 7.5) / 2,
        y: valueY - lineIndex * 9, size: 7.5, font: bold, color: navy,
      }));
    });
    const lastValueBaseline = valueY - (Math.max(...valueLines.map((lines) => lines.length)) - 1) * 9;
    return lastValueBaseline - 14;
  };
  const limitLines = (lines: string[], maximum: number, font: PDFFont, size: number, maxWidth: number) => {
    if (lines.length <= maximum) return lines;
    const result = lines.slice(0, maximum);
    let last = result[maximum - 1]!.trimEnd();
    while (last && font.widthOfTextAtSize(`${last}...`, size) > maxWidth) last = last.slice(0, -1).trimEnd();
    result[maximum - 1] = `${last}...`;
    return result;
  };
  const drawItem = (page: PDFPage, prepared: typeof preparedRows[number], itemLeft: number, itemWidth: number, top: number) => {
    const { row, images } = prepared;
    const fieldGap = 10;
    const upperLeftWidth = itemWidth * .66;
    const statusWidth = itemWidth - upperLeftWidth - fieldGap;
    const lowerLeftWidth = (itemWidth - fieldGap) * .59;
    const lowerRightWidth = itemWidth - lowerLeftWidth - fieldGap;
    const titleWidth = itemWidth - 52;
    const title = limitLines(wrapPdfText(safePdfText(row.description || "—", bold), bold, 7.2, titleWidth), 3, bold, 7.2, titleWidth);
    const description = limitLines(wrapPdfText(safePdfText(row.itemDescription || row.description, regular), regular, 5.4, upperLeftWidth), 3, regular, 5.4, upperLeftWidth);
    const criterion = limitLines(wrapPdfText(safePdfText(row.verificationCriterion || "Não informado", regular), regular, 5.4, upperLeftWidth), 2, regular, 5.4, upperLeftWidth);
    const nonconformity = limitLines(wrapPdfText(safePdfText(row.nonconformity || "—", regular), regular, 5.4, upperLeftWidth), 3, regular, 5.4, upperLeftWidth);
    const correctiveAction = limitLines(wrapPdfText(safePdfText(row.correctiveAction || "—", regular), regular, 5.6, lowerLeftWidth), 5, regular, 5.6, lowerLeftWidth);
    const responsible = limitLines(wrapPdfText(safePdfText(row.responsible || "—", regular), regular, 5.6, lowerRightWidth), 4, regular, 5.6, lowerRightWidth);
    let cursor = top;
    drawRoundedCode(page, row.item, itemLeft, cursor - 17);
    title.forEach((value, index) => page.drawText(value, { x: itemLeft + 52, y: cursor - 12 - index * 8, size: 7.2, font: bold, color: navy }));
    cursor -= Math.max(23, 23 + (title.length - 1) * 8);
    const drawCompactField = (label: string, lines: string[], x: number, fieldTop: number, valueColor = muted, lineHeight = 6.4) => {
      drawLabel(page, label, x, fieldTop);
      lines.forEach((value, index) => page.drawText(value, { x, y: fieldTop - 8 - index * lineHeight, size: 5.4, font: regular, color: valueColor }));
      return fieldTop - 11 - lines.length * lineHeight;
    };
    cursor = drawCompactField("DESCRIÇÃO", description, itemLeft, cursor);
    cursor = drawCompactField("CRITÉRIO DE VERIFICAÇÃO", criterion, itemLeft, cursor, navy);
    cursor = drawCompactField("NÃO CONFORMIDADE", nonconformity, itemLeft, cursor);
    const photoTop = cursor;
    drawLabel(page, "FOTO", itemLeft, photoTop);
    const sectionDividerY = contentBottom + 120;
    if (images.length) {
      const visibleImages = images.slice(0, 3), photoGap = 4;
      const cellWidth = (upperLeftWidth - photoGap * (visibleImages.length - 1)) / visibleImages.length;
      const photoHeight = Math.max(32, Math.min(58, photoTop - sectionDividerY - 17));
      visibleImages.forEach((image, photoIndex) => {
        const dimensions = image.scaleToFit(cellWidth, photoHeight);
        const imageX = itemLeft + photoIndex * (cellWidth + photoGap) + (cellWidth - dimensions.width) / 2;
        page.drawImage(image, { x: imageX, y: photoTop - 10 - dimensions.height, width: dimensions.width, height: dimensions.height });
      });
    } else if (prepared.photoNames.length) {
      const names = limitLines(wrapPdfText(safePdfText(prepared.photoNames.join(", "), regular), regular, 5.2, upperLeftWidth), 4, regular, 5.2, upperLeftWidth);
      names.forEach((value, index) => page.drawText(value, { x: itemLeft, y: photoTop - 10 - index * 6.2, size: 5.2, font: regular, color: muted }));
    } else {
      page.drawText("Nenhuma fotografia anexada.", { x: itemLeft, y: photoTop - 10, size: 5.2, font: regular, color: muted });
    }

    const statusX = itemLeft + upperLeftWidth + fieldGap;
    const statusTop = top - Math.max(23, 23 + (title.length - 1) * 8);
    drawLabel(page, "STATUS", statusX, statusTop);
    const selectedStatus = /não conforme/i.test(row.status ?? "") ? "nonconforming"
      : /conforme/i.test(row.status ?? "") ? "compliant" : "partial";
    const amber = rgb(.94, .62, .08);
    const selectedOption = selectedStatus === "nonconforming" ? { color: red, symbol: "x" as const }
      : selectedStatus === "compliant" ? { color: green, symbol: "check" as const }
      : { color: amber, symbol: "!" as const };
    const statusBoxSize = 24, statusRadius = 3;
    const statusBoxX = statusX + (statusWidth - statusBoxSize) / 2;
    const statusBoxY = statusTop - 34;
    page.drawRectangle({ x: statusBoxX + statusRadius, y: statusBoxY, width: statusBoxSize - statusRadius * 2, height: statusBoxSize, color: selectedOption.color });
    page.drawRectangle({ x: statusBoxX, y: statusBoxY + statusRadius, width: statusBoxSize, height: statusBoxSize - statusRadius * 2, color: selectedOption.color });
    page.drawCircle({ x: statusBoxX + statusRadius, y: statusBoxY + statusRadius, size: statusRadius, color: selectedOption.color });
    page.drawCircle({ x: statusBoxX + statusBoxSize - statusRadius, y: statusBoxY + statusRadius, size: statusRadius, color: selectedOption.color });
    page.drawCircle({ x: statusBoxX + statusRadius, y: statusBoxY + statusBoxSize - statusRadius, size: statusRadius, color: selectedOption.color });
    page.drawCircle({ x: statusBoxX + statusBoxSize - statusRadius, y: statusBoxY + statusBoxSize - statusRadius, size: statusRadius, color: selectedOption.color });
    const symbolColor = rgb(1, 1, 1);
    if (selectedOption.symbol === "x") {
      page.drawLine({ start: { x: statusBoxX + 7, y: statusBoxY + 7 }, end: { x: statusBoxX + 17, y: statusBoxY + 17 }, thickness: 2, color: symbolColor });
      page.drawLine({ start: { x: statusBoxX + 7, y: statusBoxY + 17 }, end: { x: statusBoxX + 17, y: statusBoxY + 7 }, thickness: 2, color: symbolColor });
    } else if (selectedOption.symbol === "!") {
      page.drawText("!", { x: statusBoxX + 9.2, y: statusBoxY + 5.2, size: 13, font: bold, color: symbolColor });
    } else {
      page.drawLine({ start: { x: statusBoxX + 5, y: statusBoxY + 12 }, end: { x: statusBoxX + 10, y: statusBoxY + 7 }, thickness: 2, color: symbolColor });
      page.drawLine({ start: { x: statusBoxX + 10, y: statusBoxY + 7 }, end: { x: statusBoxX + 19, y: statusBoxY + 18 }, thickness: 2, color: symbolColor });
    }

    page.drawLine({ start: { x: itemLeft, y: sectionDividerY }, end: { x: itemLeft + itemWidth, y: sectionDividerY }, thickness: .55, color: navy });
    const lowerTop = sectionDividerY - 13;
    drawLabel(page, "AÇÕES CORRETIVAS", itemLeft, lowerTop);
    correctiveAction.forEach((value, index) => page.drawText(value, { x: itemLeft, y: lowerTop - 9 - index * 6.5, size: 5.6, font: regular, color: navy }));
    const responsibleX = itemLeft + lowerLeftWidth + fieldGap;
    drawLabel(page, "RESPONSÁVEL(IS)", responsibleX, lowerTop);
    responsible.forEach((value, index) => page.drawText(value, { x: responsibleX, y: lowerTop - 9 - index * 6.5, size: 5.6, font: regular, color: navy }));
    const dateTop = lowerTop - 58;
    const dateColumnWidth = (itemWidth - fieldGap) / 2;
    const dates = [
      { label: "DATA DE INÍCIO PREVISTA", value: formatAuditDate(row.startDate), x: itemLeft },
      { label: "DATA FINAL PREVISTA", value: formatAuditDate(row.dueDate), x: itemLeft + dateColumnWidth + fieldGap },
    ];
    dates.forEach((entry) => {
      drawLabel(page, entry.label, entry.x, dateTop);
      page.drawText(entry.value, { x: entry.x, y: dateTop - 9, size: 5.6, font: regular, color: navy });
    });
  };
  const summaryGap = 10;
  const summaryTitleWidth = 172;
  const summaryActionWidth = 184;
  const summaryResponsibleWidth = 92;
  const summaryDateWidth = (contentWidth - summaryTitleWidth - summaryActionWidth - summaryResponsibleWidth - summaryGap * 4) / 2;
  const summaryColumns = [
    { label: "ITEM / TÍTULO", x: left, width: summaryTitleWidth },
    { label: "AÇÕES CORRETIVAS", x: left + summaryTitleWidth + summaryGap, width: summaryActionWidth },
    { label: "RESPONSÁVEL", x: left + summaryTitleWidth + summaryActionWidth + summaryGap * 2, width: summaryResponsibleWidth },
    { label: "DATA INICIAL", x: left + summaryTitleWidth + summaryActionWidth + summaryResponsibleWidth + summaryGap * 3, width: summaryDateWidth },
    { label: "DATA FINAL", x: left + summaryTitleWidth + summaryActionWidth + summaryResponsibleWidth + summaryDateWidth + summaryGap * 4, width: summaryDateWidth },
  ];
  const drawSummaryHeading = (sheet: PDFPage, top: number) => {
    const headerY = top;
    summaryColumns.forEach((column) => drawLabel(sheet, column.label, column.x, headerY));
    sheet.drawLine({ start: { x: left, y: headerY - 6 }, end: { x: right, y: headerY - 6 }, thickness: .6, color: navy });
    return headerY - 8;
  };

  let page = addPage();
  const firstSummaryPage = page;
  const summaryPages = new Set<PDFPage>([page]);
  const detailPages = new Map<string, { page: PDFPage; y: number }>();
  const summaryLinks: Array<{ source: PDFPage; itemId: string; rect: [number, number, number, number] }> = [];
  let y = drawMetadata(page);
  y = drawSummaryHeading(page, y);
  for (const { row } of preparedRows) {
    const titleLines = wrapPdfText(safePdfText(row.description, bold), bold, 6.4, summaryColumns[0].width - 52);
    const correctiveActionLines = wrapPdfText(safePdfText(row.correctiveAction || "—", regular), regular, 5.8, summaryColumns[1].width);
    const responsibleLines = wrapPdfText(safePdfText(row.responsible || "—", regular), regular, 5.8, summaryColumns[2].width);
    const startLines = wrapPdfText(formatAuditDate(row.startDate), regular, 5.8, summaryColumns[3].width);
    const dueLines = wrapPdfText(formatAuditDate(row.dueDate), regular, 5.8, summaryColumns[4].width);
    const lineHeight = 7.2;
    const rowHeight = Math.max(23, Math.max(titleLines.length, correctiveActionLines.length, responsibleLines.length, startLines.length, dueLines.length) * lineHeight + 8);
    if (y - rowHeight < summaryContentBottom) {
      page = addPage();
      summaryPages.add(page);
      y = drawSummaryHeading(page, contentTop);
    }
    const rowTop = y;
    const rowCenter = y - rowHeight / 2;
    const drawCenteredLines = (lines: string[], x: number, size: number, font: PDFFont, color: typeof navy) => {
      const firstBaseline = rowCenter + ((lines.length - 1) * lineHeight) / 2 - size * .35;
      lines.forEach((line, lineIndex) => page.drawText(line, { x, y: firstBaseline - lineIndex * lineHeight, size, font, color }));
    };
    drawRoundedCode(page, row.item, left, rowCenter - 8.5);
    drawCenteredLines(titleLines, left + 52, 6.4, bold, navy);
    drawCenteredLines(correctiveActionLines, summaryColumns[1].x, 5.8, regular, navy);
    drawCenteredLines(responsibleLines, summaryColumns[2].x, 5.8, regular, muted);
    drawCenteredLines(startLines, summaryColumns[3].x, 5.8, regular, navy);
    drawCenteredLines(dueLines, summaryColumns[4].x, 5.8, regular, navy);
    y -= rowHeight;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: .35, color: lineColor });
    summaryLinks.push({ source: page, itemId: row.id, rect: [left, y, right, rowTop] });
  }
  const detailGap = 16;
  const detailDividerX = (left + right) / 2;
  const detailItemWidth = (contentWidth - detailGap) / 2;
  for (const [index, prepared] of preparedRows.entries()) {
    const position = index % 2;
    if (position === 0) {
      page = addPage();
      page.drawLine({ start: { x: detailDividerX, y: contentBottom }, end: { x: detailDividerX, y: contentTop }, thickness: .55, color: lineColor });
    }
    const itemLeft = position === 0 ? left : detailDividerX + detailGap / 2;
    detailPages.set(prepared.row.id, { page, y: contentTop });
    drawItem(page, prepared, itemLeft, detailItemWidth, contentTop);
  }

  pages.forEach((sheet, index) => {
    const centered = (value: string, center: number, baseline: number, font: PDFFont, size: number, color: typeof navy) => {
      const printable = safePdfText(value, font);
      sheet.drawText(printable, { x: center - font.widthOfTextAtSize(printable, size) / 2, y: baseline, size, font, color });
    };
    if (logo) sheet.drawImage(logo, { x: left, y: height - 49.5, width: 83, height: 33 });
    else sheet.drawText("DIÁLOGO ENGENHARIA", { x: left, y: height - 35.5, size: 9, font: bold, color: navy });
    const headerContentLeft = left + 83 + 20;
    const headerContentRight = right - 70;
    centered("Sistema de Gestão da Qualidade", (headerContentLeft + headerContentRight) / 2, height - 31.5, regular, 12.5, muted);
    const processX = 132;
    sheet.drawText("PROCESSO", { x: processX, y: height - 49.5, size: 4.5, font: regular, color: muted });
    sheet.drawText("PLANO DE AÇÃO", { x: processX + 39, y: height - 51, size: 7.2, font: bold, color: navy });
    const reportDate = formatAuditDate(auditDate), dateCenter = right - 24;
    centered("DATA", dateCenter, height - 39.5, regular, 4.5, muted);
    sheet.drawText(reportDate, { x: right - bold.widthOfTextAtSize(reportDate, 6.6), y: height - 51, size: 6.6, font: bold, color: navy });
    sheet.drawLine({ start: { x: left, y: height - 55.5 }, end: { x: right, y: height - 55.5 }, thickness: .6, color: navy });
    sheet.drawLine({ start: { x: left, y: height - 58.5 }, end: { x: right, y: height - 58.5 }, thickness: 1.3, color: red });
    sheet.drawLine({ start: { x: left, y: 34 }, end: { x: right, y: 34 }, thickness: .45, color: lineColor });
    sheet.drawText("Diálogo Auditorias", { x: left, y: 20, size: 5, font: regular, color: muted });
    const footerTitle = safePdfText(summaryPages.has(sheet) ? "Sumário interativo" : "Voltar ao sumário", regular);
    sheet.drawText(footerTitle, { x: Math.max(left, width / 2 - regular.widthOfTextAtSize(footerTitle, 5) / 2), y: 20, size: 5, font: regular, color: muted });
    const pageNumber = `${String(index + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`;
    sheet.drawText(pageNumber, { x: right - regular.widthOfTextAtSize(pageNumber, 5), y: 20, size: 5, font: regular, color: index === 0 ? red : muted });
  });
  const annotations = new Map<PDFPage, ReturnType<typeof document.context.register>[]>();
  const addInternalLink = (source: PDFPage, target: PDFPage, targetY: number, rect: [number, number, number, number]) => {
    const annotation = document.context.register(document.context.obj({
      Type: "Annot", Subtype: "Link", Rect: rect, Border: [0, 0, 0],
      Dest: [target.ref, "XYZ", null, targetY, null],
    }));
    const pageAnnotations = annotations.get(source) ?? [];
    pageAnnotations.push(annotation);
    annotations.set(source, pageAnnotations);
  };
  summaryLinks.forEach(({ source, itemId, rect }) => {
    const target = detailPages.get(itemId);
    if (target) addInternalLink(source, target.page, target.y + 14, rect);
  });
  new Set([...detailPages.values()].map((target) => target.page)).forEach((detailPage) => {
    const label = "Voltar ao sumário", labelWidth = regular.widthOfTextAtSize(label, 5);
    addInternalLink(detailPage, firstSummaryPage, contentTop, [width / 2 - labelWidth / 2 - 5, 14, width / 2 + labelWidth / 2 + 5, 30]);
  });
  annotations.forEach((references, source) => source.node.set(PDFName.of("Annots"), document.context.obj(references)));
  return document.save();
}

function safePdfText(value: string, font: PDFFont) {
  return [...value].map((character) => {
    if (character === "\n" || character === "\r") return character;
    try { font.encodeText(character); return character; } catch { return "?"; }
  }).join("");
}

function wrapPdfText(value: string, font: PDFFont, size: number, maxWidth: number) {
  const result: string[] = [];
  for (const paragraph of value.replace(/\r/g, "").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) current = candidate;
      else { result.push(current); current = word; }
    }
    result.push(current || " ");
  }
  return result;
}
