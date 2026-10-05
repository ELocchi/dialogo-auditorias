import { safetyScore } from "../../domain/safety-audit.ts";
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { getCriterionDisplayTitle, getCriterionWeight, type Criterion } from "../../domain/catalogs.ts";
import { calculateAuditFinalScore, calculateChecksCompliance, calculateSecurityGroupScore, getDraftCheckWeight, getItemResponse, type ItemResponse } from "../../domain/audit-draft.ts";
import { awardedItemScore, scoreLabel, getGroupHeading, getSubgroupHeading, displayAuditDate } from "./audit-format.ts";
import type { AuditPdfInput, PdfAssets } from "./types.ts";

const pdfPageSize = { width: 612, height: 792 };
const pdfLeft = 57;
const pdfRight = 555;

function wrapPdfText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  const printable = Array.from(text.replace(/\s+/g, " ").trim(), (character) => {
    try { font.encodeText(character); return character; } catch { return "?"; }
  }).join("");
  for (const word of printable.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else { if (current) lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function createAuditReviewPdf({ model, modelId, workName, details, criteria, drafts, safetyClosure }: AuditPdfInput, assets: PdfAssets): Promise<Uint8Array> {
  if (["security-it07-r02", "quality-f175", "quality-f176"].includes(modelId)) return createSecurityAuditReportPdf({ model, modelId, workName, details, criteria, drafts, safetyClosure }, assets);
  const document = await PDFDocument.create();
  document.setTitle(`Relatório de auditoria - ${workName}`);
  document.setAuthor("Diálogo Engenharia");
  document.setSubject(model);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = assets.logo ? await document.embedPng(assets.logo).catch(() => null) : null;
  const navy = rgb(.10, .25, .48), red = rgb(.75, .09, .09), muted = rgb(.39, .47, .57), divider = rgb(.77, .82, .88);
  let page: PDFPage = document.addPage([pdfPageSize.width, pdfPageSize.height]);
  let y = 657;
  const addPage = () => {
    page = document.addPage([pdfPageSize.width, pdfPageSize.height]);
    y = 657;
    return page;
  };
  const ensure = (height: number) => { if (y - height < pdfLeft) addPage(); };
  const line = (text: string, options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number } = {}) => {
    const font = options.font ?? regular, size = options.size ?? 10, indent = options.indent ?? 0;
    const wrapped = wrapPdfText(text, font, size, pdfRight - pdfLeft - indent);
    ensure(wrapped.length * (size + 4));
    for (const value of wrapped) { page.drawText(value, { x: pdfLeft + indent, y, size, font, color: options.color ?? navy }); y -= size + 4; }
  };
  const metadata = [
    ["OBRA", workName], ["DATA DA AUDITORIA", displayAuditDate(details.date)],
    ["MODELO", model], ["AUDITOR RESPONSÁVEL", details.auditor],
  ] as const;
  for (const [label, value] of metadata) {
    line(label, { font: bold, size: 7, color: muted });
    line(value, { size: 9 });
    y -= 4;
  }
  line(`NOTA FINAL  ${calculateAuditFinalScore(criteria, drafts, modelId)?.toFixed(2).replace(".", ",") ?? "—"}`, { font: bold, size: 12, color: navy });
  y -= 14;
  const groups = criteria.reduce<Record<string, Criterion[]>>((result, criterion) => { (result[criterion.group] ??= []).push(criterion); return result; }, {});
  for (const [group, items] of Object.entries(groups)) {
    ensure(34);
    page.drawRectangle({ x: pdfLeft, y: y + 3, width: pdfRight - pdfLeft, height: 1.5, color: red });
    y -= 9;
    line(group, { font: bold, size: 11, color: navy });
    for (const item of items) {
      const response = getItemResponse(drafts, modelId, item);
      const score = awardedItemScore(item, response, modelId === "security-it07-r02");
      line(`${item.code}  ${getCriterionDisplayTitle(item)}  |  Nota: ${scoreLabel(score, response.answer)}`, { size: 9, indent: 8 });
    }
    y -= 7;
  }
  const date = displayAuditDate(details.date);
  const pages = document.getPages();
  pages.forEach((sheet, index) => {
    if (logo) sheet.drawImage(logo, { x: pdfLeft + 5, y: 729, width: 97.5, height: 38 });
    const centered = (value: string, center: number, baseline: number, font: PDFFont, size: number, color = navy) =>
      sheet.drawText(value, { x: center - font.widthOfTextAtSize(value, size) / 2, y: baseline, size, font, color });
    centered("Sistema de Gestão da Qualidade", 360, 746, regular, 10, muted);
    sheet.drawText("PROCESSO", { x: pdfLeft, y: 718, size: 8, font: regular, color: muted });
    centered("RELATÓRIO DE AUDITORIA", 224, 704, bold, 12, navy);
    centered("DATA", 484, 718, regular, 7, muted);
    centered(date, 484, 704, bold, 8, navy);
    centered("FOLHA Nº", 532, 718, regular, 7, muted);
    centered(`${index + 1} / ${pages.length}`, 532, 704, bold, 9, red);
    sheet.drawLine({ start: { x: pdfLeft, y: 697 }, end: { x: pdfRight, y: 697 }, thickness: .6, color: navy });
    sheet.drawLine({ start: { x: pdfLeft, y: 693 }, end: { x: pdfRight, y: 693 }, thickness: 1.5, color: red });
    sheet.drawLine({ start: { x: pdfLeft, y: 49 }, end: { x: pdfRight, y: 49 }, thickness: .5, color: divider });
    sheet.drawText("Relatório de Auditoria", { x: pdfLeft, y: 35, size: 7, font: regular, color: muted });
    centered(workName, pdfPageSize.width / 2, 35, regular, 7, muted);
    const author = `Elaborado por: ${details.auditor}`;
    sheet.drawText(author, { x: pdfRight - regular.widthOfTextAtSize(author, 7), y: 35, size: 7, font: regular, color: muted });
  });
  return document.save();
}

async function createSecurityAuditReportPdf({ model, modelId, workName, details, criteria, drafts, safetyClosure }: AuditPdfInput, assets: PdfAssets): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const security = modelId === "security-it07-r02";
  const disciplineTitle = security ? "Segurança do Trabalho" : "Farol da Qualidade";
  document.setTitle(`Relatório de Auditoria - ${workName}`);
  document.setAuthor("Diálogo Engenharia");
  document.setSubject(disciplineTitle);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = assets.logo ? await document.embedPng(assets.logo).catch(() => null) : null;
  const photoReferences = [...new Set(criteria.flatMap((criterion) => {
    const response = getItemResponse(drafts, modelId, criterion);
    return [...(response.photos ?? []), ...(response.checks ?? []).flatMap((check) => check.photos ?? [])];
  }))];
  const embeddedPhotos = new Map<string, PDFImage>();
  const photoUrls = new Map<string, string>();
  for (const reference of photoReferences) {
    try {
      const photo = assets.photos[reference];
      if (!photo) continue;
      embeddedPhotos.set(reference, photo.mimeType === "image/png" ? await document.embedPng(photo.bytes) : await document.embedJpg(photo.bytes));
      if (photo.url) photoUrls.set(reference, photo.url);
    } catch { /* A identificação do arquivo permanece visível quando a imagem não puder ser incorporada. */ }
  }
  const width = 445.5, height = 631.5, left = 34, right = width - 33;
  const navy = rgb(.07, .24, .47), red = rgb(.86, .12, .18), muted = rgb(.39, .47, .57), lineColor = rgb(.87, .90, .94);
  const green = rgb(.10, .55, .34), orange = rgb(.85, .48, .07), gray = rgb(.40, .46, .54);
  const pages: PDFPage[] = [];
  const summaryLinks: { source: PDFPage; itemId: string; rect: [number, number, number, number] }[] = [];
  const photoLinks: { source: PDFPage; url: string; rect: [number, number, number, number] }[] = [];
  const detailPages = new Map<string, { page: PDFPage; y: number }>();
  const addPage = () => { const page = document.addPage([width, height]); pages.push(page); return page; };
  const reportDate = displayAuditDate(details.date);
  const writeWrapped = (page: PDFPage, text: string, x: number, y: number, maxWidth: number, size = 8, font = regular, color = navy, leading = size + 3) => {
    const lines = wrapPdfText(text || "—", font, size, maxWidth);
    lines.forEach((value, index) => page.drawText(value, { x, y: y - index * leading, size, font, color }));
    return y - lines.length * leading;
  };
  const drawLabel = (page: PDFPage, value: string, x: number, y: number) => page.drawText(value, { x, y, size: 5.5, font: bold, color: muted });
  const drawPageHeader = (page: PDFPage) => {
    if (logo) page.drawImage(logo, { x: left, y: 582, width: 83, height: 33 });
    const reportTypeWidth = regular.widthOfTextAtSize(disciplineTitle, 12.5);
    page.drawText(disciplineTitle, { x: (width - reportTypeWidth) / 2, y: 600, size: 12.5, font: regular, color: muted });
    const processX = 132;
    page.drawText("PROCESSO", { x: processX, y: 582, size: 4.5, font: regular, color: muted });
    page.drawText("RELATÓRIO DE AUDITORIA", { x: processX + 39, y: 580.5, size: 7.2, font: bold, color: navy });
    const dateCenter = right - 24;
    const dateLabelWidth = regular.widthOfTextAtSize("DATA", 4.5);
    page.drawText("DATA", { x: dateCenter - dateLabelWidth / 2, y: 592, size: 4.5, font: regular, color: muted });
    page.drawText(reportDate, { x: right - bold.widthOfTextAtSize(reportDate, 6.6), y: 580.5, size: 6.6, font: bold, color: navy });
    page.drawLine({ start: { x: left, y: 576 }, end: { x: right, y: 576 }, thickness: .6, color: navy });
    page.drawLine({ start: { x: left, y: 573 }, end: { x: right, y: 573 }, thickness: 1.3, color: red });
  };
  const calculateGroupScore = (items: Criterion[]) => {
    if (security) return calculateSecurityGroupScore(items, drafts, modelId);
    let obtained = 0, possible = 0;
    items.forEach((item) => {
      const response = getItemResponse(drafts, modelId, item);
      const weight = getCriterionWeight(item) ?? 0;
      if (response.answer === "N/A") return;
      if (item.verificationRule === "Dividido pela quantidade verificada") {
        const checks = (response.checks ?? []).filter((check) => check.compliant !== null);
        const compliance = calculateChecksCompliance(checks);
        if (compliance === null) return;
        possible += weight;
        obtained += weight * compliance;
      } else if (response.answer === "Conforme" || response.answer === "Não conforme") {
        possible += weight;
        if (response.answer === "Conforme") obtained += weight;
      }
    });
    return possible > 0 ? obtained / possible * 10 : null;
  };
  const drawStatus = (page: PDFPage, response: ItemResponse, x: number, y: number, scale = 1) => {
    const answer = response.answer;
    const color = answer === "0" || answer === "Não conforme" ? red : answer === "5" ? orange : answer === "10" || answer === "Conforme" ? green : gray;
    const size = 7 * scale;
    if (answer === "10" || answer === "Conforme") {
      page.drawLine({ start: { x: x - size * .75, y }, end: { x: x - size * .15, y: y - size * .65 }, thickness: 1.8 * scale, color });
      page.drawLine({ start: { x: x - size * .15, y: y - size * .65 }, end: { x: x + size * .85, y: y + size * .75 }, thickness: 1.8 * scale, color });
    } else if (answer === "0" || answer === "Não conforme") {
      page.drawLine({ start: { x: x - size * .65, y: y - size * .65 }, end: { x: x + size * .65, y: y + size * .65 }, thickness: 1.7 * scale, color });
      page.drawLine({ start: { x: x - size * .65, y: y + size * .65 }, end: { x: x + size * .65, y: y - size * .65 }, thickness: 1.7 * scale, color });
    } else if (answer === "5") page.drawText("!", { x: x - size * .2, y: y - size * .7, size: size * 1.7, font: bold, color });
    else page.drawLine({ start: { x: x - size * .8, y }, end: { x: x + size * .8, y }, thickness: 1.7 * scale, color });
  };
  const drawRoundedCode = (page: PDFPage, value: string, x: number, y: number, boxWidth: number, boxHeight: number,
    size: number, background: ReturnType<typeof rgb>, foreground: ReturnType<typeof rgb>) => {
    const radius = Math.min(4, boxHeight / 2);
    page.drawRectangle({ x: x + radius, y, width: boxWidth - radius * 2, height: boxHeight, color: background });
    page.drawRectangle({ x, y: y + radius, width: boxWidth, height: boxHeight - radius * 2, color: background });
    page.drawCircle({ x: x + radius, y: y + radius, size: radius, color: background });
    page.drawCircle({ x: x + boxWidth - radius, y: y + radius, size: radius, color: background });
    page.drawCircle({ x: x + radius, y: y + boxHeight - radius, size: radius, color: background });
    page.drawCircle({ x: x + boxWidth - radius, y: y + boxHeight - radius, size: radius, color: background });
    const textWidth = bold.widthOfTextAtSize(value, size);
    page.drawText(value, { x: x + (boxWidth - textWidth) / 2, y: y + (boxHeight - size) / 2 + 1.5, size, font: bold, color: foreground });
  };
  const drawItemScore = (page: PDFPage, item: Criterion, response: ItemResponse, x: number, y: number) => {
    const value = scoreLabel(awardedItemScore(item, response, false), response.answer);
    page.drawText(value, { x: x - bold.widthOfTextAtSize(value, 8), y: y - 3, size: 8, font: bold, color: navy });
  };
  const cover = addPage();
  drawPageHeader(cover);
  cover.drawText("RELATÓRIO DE AUDITORIA", { x: left, y: 422, size: 6, font: bold, color: muted });
  writeWrapped(cover, disciplineTitle, left, 385, right - left, 18, bold, navy, 22);
  cover.drawLine({ start: { x: left, y: 335 }, end: { x: left + 31, y: 335 }, thickness: 2, color: red });
  drawLabel(cover, "OBRA AUDITADA", left, 292);
  writeWrapped(cover, workName, left, 270, right - left, 14, bold, navy, 17);
  drawLabel(cover, "IDENTIFICAÇÃO", left, 247);
  cover.drawText(`Auditoria de ${disciplineTitle} · ${model}`, { x: left, y: 235, size: 6.5, font: regular, color: muted });
  cover.drawLine({ start: { x: left, y: 205 }, end: { x: right, y: 205 }, thickness: .5, color: lineColor });
  const scores = safetyScore(criteria, drafts, modelId, safetyClosure);
  const finalScore = security ? scores.final : calculateAuditFinalScore(criteria, drafts, modelId);
  const coverFields = [["DATA DA AUDITORIA", displayAuditDate(details.date)], ["AUDITOR RESPONSÁVEL", details.auditor], ["NOTA FINAL", finalScore?.toFixed(2).replace(".", ",") ?? "—"]] as const;
  coverFields.forEach(([label, value], index) => { const x = left + index * 126; drawLabel(cover, label, x, 184); writeWrapped(cover, value, x, 166, 112, 8, index === 2 ? bold : regular, navy, 10); });
  if (security && safetyClosure?.accidents.length) {
    const value = coverFields[2][1];
    const x = left + 252 + bold.widthOfTextAtSize(value, 8) + 8;
    const y = 164;
    const alertRed = rgb(.9, .12, .18);
    cover.drawLine({ start: { x, y }, end: { x: x + 7, y: y + 13 }, thickness: 1, color: alertRed });
    cover.drawLine({ start: { x: x + 7, y: y + 13 }, end: { x: x + 14, y }, thickness: 1, color: alertRed });
    cover.drawLine({ start: { x: x + 14, y }, end: { x, y }, thickness: 1, color: alertRed });
    cover.drawLine({ start: { x: x + 7, y: y + 9 }, end: { x: x + 7, y: y + 5 }, thickness: 1.2, color: alertRed });
    cover.drawCircle({ x: x + 7, y: y + 2.5, size: .65, color: alertRed });
  }
  cover.drawLine({ start: { x: left, y: 143 }, end: { x: right, y: 143 }, thickness: .5, color: lineColor });

  const groups = criteria.reduce<Record<string, Criterion[]>>((result, criterion) => { (result[criterion.group] ??= []).push(criterion); return result; }, {});
  const drawSummaryTitle = (page: PDFPage) => page.drawText("SUMÁRIO", { x: left, y: 558, size: 13, font: bold, color: navy });
  let summary = addPage(), summaryY = 535;
  drawSummaryTitle(summary);
  const startSummaryPage = () => { summary = addPage(); summaryY = 558; };
  const drawSummaryItems = (summaryItems: Criterion[]) => {
    for (const item of summaryItems) {
      if (summaryY < 52) startSummaryPage();
      const response = getItemResponse(drafts, modelId, item);
      const titleLines = wrapPdfText(getCriterionDisplayTitle(item), bold, 6.8, right - left - 105);
      const rowHeight = Math.max(19, titleLines.length * 9 + 6);
      const itemTop = summaryY + 10;
      drawRoundedCode(summary, item.code, left + 8, summaryY - 7, 43, 17, 6.8, rgb(.93, .95, .98), navy);
      titleLines.forEach((value, index) => summary.drawText(value, { x: left + 60, y: summaryY - index * 9, size: 6.8, font: bold, color: navy }));
      if (security) drawStatus(summary, response, right - 15, summaryY, .75);
      else {
        const itemScore = scoreLabel(awardedItemScore(item, response, false), response.answer);
        summary.drawText(itemScore, { x: right - bold.widthOfTextAtSize(itemScore, 7), y: summaryY - 2, size: 7, font: bold, color: navy });
      }
      summaryLinks.push({ source: summary, itemId: item.id, rect: [left + 5, summaryY - rowHeight + 3, right, itemTop] });
      summaryY -= rowHeight;
      summary.drawLine({ start: { x: left + 60, y: summaryY + 11 }, end: { x: right, y: summaryY + 11 }, thickness: .35, color: lineColor });
    }
  };
  for (const [group, items] of Object.entries(groups)) {
    if (summaryY < 82) startSummaryPage();
    const heading = getGroupHeading(group);
    drawRoundedCode(summary, heading.number, left, summaryY - 8, 24, 21, 9.5, navy, rgb(1, 1, 1));
    summary.drawText(heading.title, { x: left + 34, y: summaryY, size: 10.5, font: bold, color: navy });
    const headingWidth = Math.min(right - left - 90, bold.widthOfTextAtSize(heading.title, 10.5));
    summary.drawLine({ start: { x: left + 34, y: summaryY - 7 }, end: { x: left + 34 + headingWidth, y: summaryY - 7 }, thickness: 1.6, color: red });
    const groupResult = calculateGroupScore(items);
    const groupScoreLabel = groupResult === null ? "—" : groupResult.toFixed(1).replace(".", ",");
    summary.drawText(groupScoreLabel, { x: right - bold.widthOfTextAtSize(groupScoreLabel, 8), y: summaryY, size: 8, font: bold, color: navy });
    summaryY -= 25;
    if (!security) {
      drawSummaryItems(items);
      summaryY -= 6;
      continue;
    }
    const summarySubgroups = items.reduce<Record<string, Criterion[]>>((result, item) => {
      (result[item.subgroup || "Itens do grupo"] ??= []).push(item);
      return result;
    }, {});
    for (const subgroupItems of Object.values(summarySubgroups)) {
      if (summaryY < 68) startSummaryPage();
      const subgroupScore = calculateGroupScore(subgroupItems);
      const subgroupHeading = getSubgroupHeading(subgroupItems[0]);
      drawRoundedCode(summary, subgroupHeading.code, left + 8, summaryY - 6, 32, 17, 6.8, red, rgb(1, 1, 1));
      const subgroupLines = wrapPdfText(subgroupHeading.title, bold, 7.4, right - left - 102);
      subgroupLines.forEach((value, index) => summary.drawText(value, { x: left + 49, y: summaryY - index * 9, size: 7.4, font: bold, color: navy }));
      const subgroupScoreLabel = subgroupScore === null ? "—" : subgroupScore.toFixed(1).replace(".", ",");
      summary.drawText(subgroupScoreLabel, { x: right - bold.widthOfTextAtSize(subgroupScoreLabel, 7), y: summaryY, size: 7, font: bold, color: navy });
      summaryY -= Math.max(21, subgroupLines.length * 9 + 7);
      drawSummaryItems(subgroupItems);
      summaryY -= 3;
    }
    summaryY -= 5;
  }

  if (security && safetyClosure) {
    const sectionHeading = (continued = false) => {
      const title = continued ? "Composição da nota e acidentes · continuação" : "Composição da nota e acidentes";
      drawRoundedCode(summary, "!", left, summaryY - 8, 24, 21, 9.5, navy, rgb(1, 1, 1));
      summary.drawText(title, { x: left + 34, y: summaryY, size: 10.5, font: bold, color: navy });
      summary.drawLine({ start: { x: left + 34, y: summaryY - 7 }, end: { x: left + 34 + Math.min(right - left - 34, bold.widthOfTextAtSize(title, 10.5)), y: summaryY - 7 }, thickness: 1.6, color: red });
      summaryY -= 27;
    };
    const ensureSpace = (height: number) => {
      if (summaryY - height < 52) { startSummaryPage(); sectionHeading(true); }
    };
    if (summaryY < 150) startSummaryPage();
    else summaryY -= 10;
    sectionHeading();
    const scoreRows = [
      ["Nota bruta", scores.raw?.toFixed(2).replace(".", ",") ?? "Sem itens aplicáveis"],
      ["Penalidades", scores.penalty.toFixed(2).replace(".", ",")],
      ["Nota final", finalScore?.toFixed(2).replace(".", ",") ?? "Sem nota"],
    ];
    for (const [label, value] of scoreRows) {
      ensureSpace(20);
      summary.drawText(label, { x: left + 34, y: summaryY, size: 6.8, font: bold, color: navy });
      summary.drawText(value, { x: right - bold.widthOfTextAtSize(value, 7), y: summaryY, size: 7, font: bold, color: navy });
      summaryY -= 20;
      summary.drawLine({ start: { x: left + 34, y: summaryY + 10 }, end: { x: right, y: summaryY + 10 }, thickness: .35, color: lineColor });
    }
    const description = (text: string) => {
      for (const value of wrapPdfText(text, regular, 6.8, right - left - 49)) {
        ensureSpace(10);
        summary.drawText(value, { x: left + 49, y: summaryY, size: 6.8, font: regular, color: navy });
        summaryY -= 10;
      }
      summaryY -= 5;
    };
    summaryY -= 8;
    if (!safetyClosure.hadAccidents) description("Nenhum acidente declarado no mês da auditoria.");
    safetyClosure.accidents.forEach((accident, index) => {
      ensureSpace(55);
      drawRoundedCode(summary, String(index + 1).padStart(2, "0"), left + 8, summaryY - 6, 32, 17, 6.8, red, rgb(1, 1, 1));
      const title = `Acidente ${index + 1} · ${displayAuditDate(accident.date)} · ${accident.type === "leave" ? "Com afastamento" : "Comum"}`;
      const lines = wrapPdfText(title, bold, 7.4, right - left - 102);
      lines.forEach((value, lineIndex) => summary.drawText(value, { x: left + 49, y: summaryY - lineIndex * 9, size: 7.4, font: bold, color: navy }));
      const deduction = accident.type === "leave" ? "−2,00" : "−1,00";
      // Use a standard hyphen supported by the embedded report font.
      const value = deduction.replace("−", "-");
      summary.drawText(value, { x: right - bold.widthOfTextAtSize(value, 7), y: summaryY, size: 7, font: bold, color: red });
      summaryY -= Math.max(23, lines.length * 9 + 8);
      description(`Acontecimento: ${accident.event}`);
      description(`Justificativa: ${accident.justification}`);
      ensureSpace(10);
      summary.drawLine({ start: { x: left + 49, y: summaryY + 2 }, end: { x: right, y: summaryY + 2 }, thickness: .35, color: lineColor });
      summaryY -= 12;
    });
  }

  const detailTop = 558, detailBottom = 52, detailWidth = right - left;
  const detailLayout = (item: Criterion, response: ItemResponse, showGroup: boolean, showSubgroup: boolean) => {
    const quantitative = item.verificationRule === "Dividido pela quantidade verificada";
    const analysis = security
      ? item.analysisCriterion ?? (item.orientations.map((orientation) => orientation.text).join(" ") || "Não informado.")
      : item.verificationRule || "Não informado.";
    const title = wrapPdfText(getCriterionDisplayTitle(item), bold, 8, detailWidth - 66);
    const description = wrapPdfText(item.text || "—", regular, 6.2, detailWidth);
    const analysisLines = wrapPdfText(analysis, regular, 6.2, detailWidth);
    const observations = quantitative ? [] : wrapPdfText(response.note || "Sem observações registradas.", regular, 6.2, detailWidth);
    const verifiedChecks = quantitative ? response.checks ?? [] : [];
    const checkRows = verifiedChecks.map((check) => ({
      check,
      lines: wrapPdfText(`${check.label || "Item verificado"}${getDraftCheckWeight(check) !== null ? ` · Peso: ${getDraftCheckWeight(check)!.toFixed(2).replace(".", ",")}` : ""}${check.note?.trim() ? ` · Observação: ${check.note.trim()}` : ""}`, regular, 6.2, detailWidth - 32),
    }));
    const checksHeight = checkRows.length ? 12 + checkRows.reduce((total, row) => total + Math.max(9, row.lines.length * 7.2) + 2, 0) : 0;
    const photos = [...(response.photos ?? []), ...verifiedChecks.flatMap((check) => check.photos ?? [])];
    const photoCellHeight = 62;
    const photoHeight = photos.length ? Math.ceil(photos.length / 3) * (photoCellHeight + 8) - 8 : 13;
    const itemHeadingHeight = Math.max(17, 17 + (title.length - 1) * 9) + 7;
    const height = (showGroup ? 30 : 0) + (showSubgroup && item.subgroup ? 24 : 0) + itemHeadingHeight
      + description.length * 7.8 + 11 + analysisLines.length * 7.8 + 11
      + checksHeight + (quantitative ? 0 : observations.length * 7.8 + 13) + photoHeight + 18;
    return { analysis, title, description, analysisLines, observations, checkRows, photos, photoHeight, height, showGroup, showSubgroup, quantitative };
  };
  const drawDetailItem = (page: PDFPage, group: string, groupItems: Criterion[], item: Criterion, response: ItemResponse,
    layout: ReturnType<typeof detailLayout>, top: number) => {
    let cursor = top;
    if (layout.showGroup) {
      const heading = getGroupHeading(group);
      const groupScore = calculateGroupScore(groupItems);
      drawRoundedCode(page, heading.number, left, cursor - 21, 24, 21, 9.5, navy, rgb(1, 1, 1));
      page.drawText(heading.title, { x: left + 34, y: cursor - 14, size: 10.5, font: bold, color: navy });
      const titleWidth = Math.min(detailWidth - 80, bold.widthOfTextAtSize(heading.title, 10.5));
      page.drawLine({ start: { x: left + 34, y: cursor - 21 }, end: { x: left + 34 + titleWidth, y: cursor - 21 }, thickness: 1.6, color: red });
      const groupScoreLabel = groupScore === null ? "—" : groupScore.toFixed(1).replace(".", ",");
      page.drawText(groupScoreLabel, { x: right - bold.widthOfTextAtSize(groupScoreLabel, 8), y: cursor - 14, size: 8, font: bold, color: navy });
      cursor -= 30;
    }
    if (layout.showSubgroup && item.subgroup) {
      const subgroup = getSubgroupHeading(item);
      drawRoundedCode(page, subgroup.code, left, cursor - 17, 32, 17, 6.8, red, rgb(1, 1, 1));
      page.drawText(subgroup.title, { x: left + 41, y: cursor - 12, size: 8.5, font: bold, color: navy });
      cursor -= 24;
    }
    drawRoundedCode(page, item.code, left, cursor - 17, 43, 17, 6.8, rgb(.93, .95, .98), navy);
    layout.title.forEach((value, index) => page.drawText(value, { x: left + 52, y: cursor - 12 - index * 9, size: 8, font: bold, color: navy }));
    if (security) drawStatus(page, response, right - 11, cursor - 12, .85);
    else drawItemScore(page, item, response, right, cursor - 12.5);
    cursor -= Math.max(17, 17 + (layout.title.length - 1) * 9) + 7;
    const section = (label: string, lines: string[]) => {
      drawLabel(page, label, left, cursor);
      cursor -= 9;
      lines.forEach((value) => { page.drawText(value, { x: left, y: cursor, size: 6.2, font: regular, color: muted }); cursor -= 7.8; });
      cursor -= 3;
    };
    section("DESCRIÇÃO", layout.description);
    section(security ? "CRITÉRIO DE ANÁLISE" : "CRITÉRIO DE VERIFICAÇÃO", layout.analysisLines);
    if (layout.checkRows.length) {
      drawLabel(page, "ITENS VERIFICADOS", left, cursor);
      cursor -= 9;
      layout.checkRows.forEach(({ check, lines }, index) => {
        const rowTop = cursor;
        page.drawText(`${String(index + 1).padStart(2, "0")}.`, { x: left, y: rowTop, size: 6.2, font: bold, color: navy });
        lines.forEach((value, lineIndex) => page.drawText(value, { x: left + 17, y: rowTop - lineIndex * 7.2, size: 6.2, font: regular, color: muted }));
        drawStatus(page, { answer: check.compliant === true ? "Conforme" : check.compliant === false ? "Não conforme" : undefined, note: "" }, right - 8, rowTop + 1, .55);
        cursor -= Math.max(9, lines.length * 7.2) + 2;
      });
      cursor -= 3;
    }
    if (!layout.quantitative) section("OBSERVAÇÕES", layout.observations);
    drawLabel(page, "EVIDÊNCIAS FOTOGRÁFICAS", left, cursor);
    cursor -= 9;
    if (layout.photos.length) {
      const gap = 8;
      const photoWidth = (detailWidth - gap * 2) / 3;
      const photoCellHeight = 62;
      layout.photos.forEach((name, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const photoX = left + column * (photoWidth + gap);
        const photoTop = cursor - row * (photoCellHeight + gap);
        const image = embeddedPhotos.get(name);
        if (image) {
          const dimensions = image.scaleToFit(photoWidth, photoCellHeight);
          const photoY = photoTop - dimensions.height;
          page.drawImage(image, { x: photoX, y: photoY, width: dimensions.width, height: dimensions.height });
          const url = photoUrls.get(name);
          if (url) photoLinks.push({ source: page, url, rect: [photoX, photoY, photoX + dimensions.width, photoTop] });
        } else {
          const nameLines = wrapPdfText(name, regular, 4.6, photoWidth).slice(0, 5);
          nameLines.forEach((value, lineIndex) => page.drawText(value, { x: photoX, y: photoTop - 6 - lineIndex * 5.7, size: 4.6, font: regular, color: muted }));
        }
      });
      cursor -= layout.photoHeight;
    } else {
      page.drawText("Nenhuma fotografia anexada a este item.", { x: left, y: cursor, size: 6.2, font: regular, color: muted });
      cursor -= layout.photoHeight;
    }
    page.drawLine({ start: { x: left, y: cursor - 4 }, end: { x: right, y: cursor - 4 }, thickness: .35, color: lineColor });
    return cursor - 12;
  };

  let detailPage: PDFPage | null = null;
  let detailY = detailTop;
  let itemsOnDetailPage = 0;
  let previousDetailGroup = "";
  let previousDetailSubgroup = "";
  for (const [group, items] of Object.entries(groups)) {
    for (const item of items) {
      const response = getItemResponse(drafts, modelId, item);
      let showGroup = !detailPage || previousDetailGroup !== group;
      let showSubgroup = security && (showGroup || previousDetailSubgroup !== item.subgroup);
      let layout = detailLayout(item, response, showGroup, showSubgroup);
      if (!detailPage || itemsOnDetailPage >= 3 || detailY - layout.height < detailBottom) {
        detailPage = addPage();
        detailY = detailTop;
        itemsOnDetailPage = 0;
        previousDetailGroup = "";
        previousDetailSubgroup = "";
        showGroup = true;
        showSubgroup = security;
        layout = detailLayout(item, response, showGroup, showSubgroup);
      }
      detailPages.set(item.id, { page: detailPage, y: detailY });
      detailY = drawDetailItem(detailPage, group, items, item, response, layout, detailY);
      itemsOnDetailPage += 1;
      previousDetailGroup = group;
      previousDetailSubgroup = item.subgroup;
    }
  }

  const annotations = new Map<PDFPage, ReturnType<typeof document.context.register>[]>();
  summaryLinks.forEach(({ source, itemId, rect }) => {
    const target = detailPages.get(itemId);
    if (!target) return;
    const annotation = document.context.register(document.context.obj({
      Type: "Annot", Subtype: "Link", Rect: rect, Border: [0, 0, 0],
      Dest: [target.page.ref, "XYZ", null, target.y + 20, null],
    }));
    const pageAnnotations = annotations.get(source) ?? [];
    pageAnnotations.push(annotation);
    annotations.set(source, pageAnnotations);
  });
  photoLinks.forEach(({ source, url, rect }) => {
    const annotation = document.context.register(document.context.obj({
      Type: "Annot", Subtype: "Link", Rect: rect, Border: [0, 0, 0],
      Contents: PDFString.of("Abrir fotografia em tamanho original"),
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    }));
    const pageAnnotations = annotations.get(source) ?? [];
    pageAnnotations.push(annotation);
    annotations.set(source, pageAnnotations);
  });
  annotations.forEach((references, source) => source.node.set(PDFName.of("Annots"), document.context.obj(references)));

  pages.forEach((page, index) => {
    if (index > 0) drawPageHeader(page);
    page.drawLine({ start: { x: left, y: 34 }, end: { x: right, y: 34 }, thickness: .45, color: lineColor });
    page.drawText("Diálogo Auditorias", { x: left, y: 20, size: 5, font: regular, color: muted });
    const center = index === 0 ? "Abrir sumário" : index === 1 ? "Sumário" : "Voltar ao sumário";
    page.drawText(center, { x: width / 2 - regular.widthOfTextAtSize(center, 5) / 2, y: 20, size: 5, font: regular, color: muted });
    const pageNumber = `${String(index + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`;
    page.drawText(pageNumber, { x: right - regular.widthOfTextAtSize(pageNumber, 5), y: 20, size: 5, font: regular, color: index === 0 ? red : muted });
  });
  return document.save();
}

