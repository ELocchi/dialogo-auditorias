import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { FollowUpReport } from "./service.ts";

type ReportPhoto = { findingId: string; mimeType: "image/jpeg" | "image/png"; bytes: Uint8Array };
type ReportDetails = { report: FollowUpReport; workName: string; visitDate: string; auditorName: string; photos?: ReportPhoto[] };
const pageWidth = 612;
const pageHeight = 792;
const left = 57;
const right = 555;
const navy = rgb(0.10, 0.25, 0.48);
const red = rgb(0.75, 0.09, 0.09);
const muted = rgb(0.39, 0.47, 0.57);
const line = rgb(0.77, 0.82, 0.88);

function printable(value: string, font: PDFFont): string {
  return Array.from(value.replace(/\r\n?/g, "\n").replace(/\t/g, " "), (character) => {
    if (character === "\n") return character;
    try { font.encodeText(character); return character; }
    catch { return "?"; }
  }).join("");
}

function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const result: string[] = [];
  for (const paragraph of printable(value, font).split("\n")) {
    if (!paragraph.trim()) { result.push(""); continue; }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) { current = candidate; continue; }
      if (current) { result.push(current); current = ""; }
      for (const character of word) {
        if (font.widthOfTextAtSize(current + character, size) > width && current) {
          result.push(current); current = "";
        }
        current += character;
      }
    }
    result.push(current);
  }
  return result;
}

export async function createFollowUpReportPdf({ report, workName, visitDate, auditorName, photos = [] }: ReportDetails): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${report.title} - ${workName}`);
  pdf.setAuthor("Diálogo Engenharia");
  pdf.setSubject("Visita de acompanhamento");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await readFile(path.join(process.cwd(), "public", "logo-relatorio-orientativo.png")));
  const embeddedPhotos = await Promise.all(photos.map(async (photo) => ({ findingId: photo.findingId,
    image: photo.mimeType === "image/png" ? await pdf.embedPng(photo.bytes) : await pdf.embedJpg(photo.bytes) })));
  const newPage = (): PDFPage => {
    const sheet = pdf.addPage([pageWidth, pageHeight]);
    sheet.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(1, 1, 1) });
    return sheet;
  };
  let page: PDFPage = newPage();
  const blocks = [
    { title: "PARTICIPANTES", value: report.participants },
    { title: "ASSUNTOS TRATADOS", value: report.subjects },
    { title: "DECISÕES / DELIBERAÇÕES", value: report.decisions },
  ];
  const blockTop = 667;
  const blockHeight = 197;
  const overflow: { title: string; lines: string[] }[] = [];
  blocks.forEach(({ title, value }, index) => {
    const top = blockTop - index * blockHeight;
    page.drawLine({ start: { x: left, y: top }, end: { x: right, y: top }, thickness: 0.7, color: line });
    page.drawText(title, { x: left, y: top - 23, size: 11, font: bold, color: navy });
    const lines = wrap(value, regular, 10, right - left);
    const visible = 10;
    lines.slice(0, visible).forEach((item, lineIndex) => {
      if (item) page.drawText(item, { x: left, y: top - 47 - lineIndex * 14, size: 10, font: regular, color: navy });
    });
    if (lines.length > visible) overflow.push({ title, lines: lines.slice(visible) });
  });
  page.drawLine({ start: { x: left, y: blockTop - 3 * blockHeight },
    end: { x: right, y: blockTop - 3 * blockHeight }, thickness: 0.7, color: line });

  // Preserve long field values on continuation pages before the findings begin.
  for (const section of overflow) {
    page = newPage();
    let y = 657;
    page.drawText(`${section.title} (CONTINUAÇÃO)`, { x: left, y, size: 11, font: bold, color: navy });
    y -= 13;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.7, color: line });
    y -= 24;
    for (const item of section.lines) {
      if (y < 65) { page = newPage(); y = 657; }
      if (item) page.drawText(item, { x: left, y, size: 10, font: regular, color: navy });
      y -= 14;
    }
  }

  let y = 0;
  const startFindingsPage = () => {
    page = newPage();
    y = 657;
    page.drawText("APONTAMENTOS", { x: left, y, size: 11, font: bold, color: navy });
    y -= 11;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.7, color: line });
    y -= 24;
  };
  const ensureFindingsSpace = (height: number) => { if (y - height < 58) startFindingsPage(); };
  const findingLines = (value: string, font: PDFFont, size: number, color = navy, inset = 0) => {
    for (const item of wrap(value, font, size, right - left - inset)) {
      ensureFindingsSpace(15);
      if (item) page.drawText(item, { x: left + inset, y, size, font, color });
      y -= 15;
    }
  };
  startFindingsPage();
  report.findings.forEach((finding, index) => {
    ensureFindingsSpace(55);
    findingLines(`${index + 1}. ${finding.description}`, bold, 10);
    if (finding.location) findingLines(`Local: ${finding.location}`, regular, 9, muted, 14);
    findingLines(`Orientação para correção: ${finding.correction}`, regular, 9, navy, 14);
    y -= 9;
    embeddedPhotos.filter((photo) => photo.findingId === finding.id).forEach(({ image }, photoIndex) => {
      const scaled = image.scaleToFit(right - left - 28, 270);
      ensureFindingsSpace(scaled.height + 30);
      page.drawText(`Foto ${photoIndex + 1}`, { x: left + 14, y, size: 8, font: bold, color: muted });
      y -= 10;
      page.drawImage(image, { x: left + 14, y: y - scaled.height, width: scaled.width, height: scaled.height });
      y -= scaled.height + 17;
    });
  });

  const date = /^\d{4}-\d{2}-\d{2}$/.test(visitDate)
    ? `${visitDate.slice(8, 10)}/${visitDate.slice(5, 7)}/${visitDate.slice(0, 4)}` : visitDate;
  const pages = pdf.getPages();
  pages.forEach((sheet, index) => {
    const centered = (value: string, center: number, baseline: number, font: PDFFont, size: number, color: typeof navy) => {
      sheet.drawText(value, { x: center - font.widthOfTextAtSize(value, size) / 2,
        y: baseline, size, font, color });
    };
    sheet.drawImage(logo, { x: left + 5, y: 729, width: 97.5, height: 38 });
    centered("Sistema de Gestão da Qualidade", 360, 746, regular, 10, muted);
    sheet.drawText("PROCESSO", { x: left, y: 718, size: 8, font: regular, color: muted });
    centered("RELATÓRIO ORIENTATIVO", 224, 704, bold, 12, navy);
    centered("DATA", 484, 718, regular, 7, muted);
    centered(date, 484, 704, bold, 8, navy);
    centered("FOLHA Nº", 532, 718, regular, 7, muted);
    const currentPage = String(index + 1);
    const totalPages = String(pages.length);
    const separator = " / ";
    const folioWidth = bold.widthOfTextAtSize(currentPage + totalPages, 9)
      + regular.widthOfTextAtSize(separator, 9);
    const folioX = 532 - folioWidth / 2;
    sheet.drawText(currentPage, { x: folioX, y: 704, size: 9, font: bold, color: red });
    sheet.drawText(separator, { x: folioX + bold.widthOfTextAtSize(currentPage, 9),
      y: 704, size: 9, font: regular, color: muted });
    sheet.drawText(totalPages, { x: folioX + bold.widthOfTextAtSize(currentPage, 9)
      + regular.widthOfTextAtSize(separator, 9), y: 704, size: 9, font: bold, color: red });
    sheet.drawLine({ start: { x: left, y: 697 }, end: { x: right, y: 697 }, thickness: 0.6, color: navy });
    sheet.drawLine({ start: { x: left, y: 693 }, end: { x: right, y: 693 }, thickness: 1.5, color: red });
    sheet.drawLine({ start: { x: left, y: 49 }, end: { x: right, y: 49 }, thickness: 0.5, color: line });
    const footerSize = 7;
    const footer = (value: string, maxWidth: number) => {
      let result = printable(value.replace(/\s+/g, " "), regular);
      while (regular.widthOfTextAtSize(result, footerSize) > maxWidth && result.length > 1) result = `${result.slice(0, -2)}…`;
      return result;
    };
    sheet.drawText("Roteiro Orientativo", { x: left, y: 35, size: footerSize, font: regular, color: muted });
    const footerWork = footer(workName, 180);
    sheet.drawText(footerWork, { x: (pageWidth - regular.widthOfTextAtSize(footerWork, footerSize)) / 2,
      y: 35, size: footerSize, font: regular, color: muted });
    const footerAuthor = footer(`Elaborado por: ${auditorName}`, 160);
    sheet.drawText(footerAuthor, { x: right - regular.widthOfTextAtSize(footerAuthor, footerSize),
      y: 35, size: footerSize, font: regular, color: muted });
  });
  return pdf.save();
}
