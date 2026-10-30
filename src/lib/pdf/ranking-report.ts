import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

export type RankingPdfRow = {
  workName: string;
  /** Monthly export: position, score and penalty of the month. Annual export: annual position and average. */
  position: number | null;
  score: number | null;
  rawScore?: number | null;
  penalty?: number | null;
  annualScore: number | null;
  annualPosition: number | null;
};

export type RankingPdfInput = {
  discipline: "safety" | "quality";
  annual: boolean;
  /** "Setembro 2026" or "2026". */
  label: string;
  /** Evaluated works in ranking order. */
  rows: readonly RankingPdfRow[];
  /** Active works without a result in the period. */
  unevaluated: readonly RankingPdfRow[];
  headerLogo?: Uint8Array | null;
  footerLogo?: Uint8Array | null;
};

const score2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const colors = {
  page: rgb(244 / 255, 244 / 255, 244 / 255),
  navy: rgb(30 / 255, 58 / 255, 110 / 255),
  blue: rgb(26 / 255, 86 / 255, 194 / 255),
  firstPlace: rgb(31 / 255, 77 / 255, 176 / 255),
  secondPlace: rgb(224 / 255, 38 / 255, 47 / 255),
  thirdPlace: rgb(255 / 255, 42 / 255, 53 / 255),
  darkRed: rgb(192 / 255, 22 / 255, 30 / 255),
  red: rgb(224 / 255, 38 / 255, 47 / 255),
  beige: rgb(222 / 255, 218 / 255, 211 / 255),
  white: rgb(1, 1, 1),
};

// Text of the "+Segurança no seu Dia" campaign poster.
const safetyAwards = {
  draw: {
    title: "5 Sorteios",
    paragraphs: [
      "A obra que tirar a maior nota do mês será contemplada com o sorteio de 5 (cinco) vouchers no valor de R$ 200 e a obra que tirar a segunda maior nota será contemplada com o sorteio de 5 (cinco) vouchers no valor de R$ 150. Esse sorteio ocorrerá durante o DSS, após a divulgação do resultado mensal para a equipe de colaboradores. Os vouchers serão entregues pelo engenheiro e a sua equipe.",
      "A obra ganhadora deverá preparar um café da manhã para toda obra.",
    ],
  },
  team: {
    title: "Premiação Equipe Diálogo",
    paragraphs: [
      "No mês de dezembro de 2026 ocorrerá a apuração das notas de todas as obras obtidas durante o período.",
      "As 3 obras que atingirem as melhores performances do ano receberão vouchers de R$ 1.200, R$ 1.000 e R$ 800, onde o engenheiro da obra deverá levar a Equipe Diálogo para um almoço de confraternização.",
    ],
  },
  start: "INÍCIO: JANEIRO/26",
  note: "Informamos que a média anual de Segurança do Trabalho nas Obras é 7, os pesos e as penalidades farão parte da composição da Meta de Segurança no Programa de Desempenho da Equipe de engenharia Diálogo.",
  observations: [
    "OBS: As inspeções de segurança avaliativas serão realizadas pela plataforma Diálogo Auditorias, com o acompanhamento de um representante Diálogo da obra em tempo integral. O Engenheiro e o Mestre deverão participar do encerramento e consenso do relatório final.",
    "A obra que tiver acidentes com afastamento menor ou igual a 15 (quinze) dias terá 1,0 (um) ponto debitado da nota da sua avaliação. Acidentes com afastamento superior a 15 dias resultarão em 2,0 (dois) pontos debitados da nota. Acidentes fatais resultarão na desclassificação da obra.",
  ],
};

type Column = { label: string; width: number; fill: RGB; text: RGB; value: (row: RankingPdfRow) => string };

const formatScore = (value: number | null | undefined) => value !== null && value !== undefined && Number.isFinite(value) ? score2.format(value) : "-";
const formatPosition = (value: number | null | undefined) => value !== null && value !== undefined && Number.isInteger(value) && value > 0 ? `${value}º` : "-";

/** Ranking poster in the "+Segurança no seu Dia" layout: one tall page, one discipline. */
export async function rankingPdf(input: RankingPdfInput): Promise<Uint8Array> {
  const { discipline, annual, label, rows, unevaluated } = input;
  const safety = discipline === "safety";
  const document = await PDFDocument.create();
  const disciplineName = safety ? "Segurança" : "Qualidade";
  document.setTitle(`Ranking das Obras - ${disciplineName} - ${annual ? `Anual ${label}` : label}`);
  document.setAuthor("Diálogo Engenharia");
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const headerLogo = input.headerLogo ? await document.embedPng(input.headerLogo).catch(() => null) : null;
  const footerLogo = input.footerLogo ? await document.embedPng(input.footerLogo).catch(() => null) : null;

  const width = 595.28, tableLeft = 44, tableRight = 571, gap = 2.5, rowHeight = 29, rowStep = 36;
  const columns: Column[] = annual
    ? [
      { label: "MÉDIA", width: 74, fill: colors.navy, text: colors.white, value: (row) => formatScore(row.annualScore) },
      { label: "CLASS.", width: 60, fill: colors.blue, text: colors.white, value: (row) => formatPosition(row.annualPosition) },
    ]
    : safety
      ? [
        { label: "NOTA", width: 58, fill: colors.white, text: colors.navy, value: (row) => formatScore(row.rawScore ?? row.score) },
        { label: "PENAL.", width: 53, fill: colors.darkRed, text: colors.white, value: (row) => String(row.penalty ?? 0) },
        { label: "FINAL", width: 54, fill: colors.red, text: colors.white, value: (row) => formatScore(row.score) },
        { label: "ANUAL", width: 53, fill: colors.navy, text: colors.white, value: (row) => formatScore(row.annualScore) },
        { label: "CLASS.", width: 54, fill: colors.blue, text: colors.white, value: (row) => formatPosition(row.annualPosition) },
      ]
      : [
        { label: "NOTA", width: 92, fill: colors.white, text: colors.navy, value: (row) => formatScore(row.score) },
        { label: "ANUAL", width: 60, fill: colors.navy, text: colors.white, value: (row) => formatScore(row.annualScore) },
        { label: "CLASS.", width: 60, fill: colors.blue, text: colors.white, value: (row) => formatPosition(row.annualPosition) },
      ];
  // Monthly columns before ANUAL are replaced by "NÃO AVALIADA" for works without a result.
  const periodColumns = annual ? columns.length : columns.length - 2;
  const nameWidth = tableRight - tableLeft - columns.reduce((total, column) => total + column.width + gap, 0);

  const logoSize = headerLogo ? headerLogo.scaleToFit(safety ? 300 : 180, safety ? 90 : 56) : { width: 0, height: 0 };
  const awardsHeight = safety ? 360 : 0;
  const observationsHeight = safety ? 96 : 0;
  const tableTop = 36 + logoSize.height + 92;
  const tableBottom = tableTop + 26 + (rows.length + unevaluated.length) * rowStep + (rows.length + unevaluated.length ? 0 : rowStep);
  const height = tableBottom + 30 + awardsHeight + observationsHeight + (footerLogo ? 70 : 30);

  const page = document.addPage([width, height]);
  page.drawRectangle({ x: 0, y: 0, width, height, color: colors.page });
  const Y = (top: number) => height - top;

  if (headerLogo) page.drawImage(headerLogo, { x: (width - logoSize.width) / 2, y: Y(36 + logoSize.height), width: logoSize.width, height: logoSize.height });
  const period = annual ? `Anual ${label}` : label;
  const title = safety ? `Ranking obras - ${period}` : `Ranking obras Qualidade - ${period}`;
  centered(page, title, width / 2, Y(36 + logoSize.height + 54), 17, regular, colors.navy, 0);

  const headerY = Y(tableTop + 10);
  spaced(page, "OBRAS", tableLeft + nameWidth / 2, headerY, 8, bold, colors.navy, 1.4);
  let x = tableLeft + nameWidth + gap;
  for (const column of columns) {
    spaced(page, column.label, x + column.width / 2, headerY, 8, bold, colors.navy, 1.2);
    x += column.width + gap;
  }

  const nameFill = (index: number) => [colors.firstPlace, colors.secondPlace, colors.thirdPlace][index] ?? colors.beige;
  let top = tableTop + 26;
  const drawRow = (row: RankingPdfRow, index: number, evaluated: boolean) => {
    const y = Y(top + rowHeight);
    const textY = y + rowHeight / 2 - 3;
    if (evaluated) {
      const position = formatPosition(row.position);
      page.drawText(position, { x: tableLeft - 8 - bold.widthOfTextAtSize(position, 9), y: textY, size: 9, font: bold, color: colors.navy });
    }
    const fill = evaluated ? nameFill(index) : colors.beige;
    page.drawRectangle({ x: tableLeft, y, width: nameWidth, height: rowHeight, color: fill });
    const name = row.workName.toLocaleUpperCase("pt-BR");
    const size = fitSize(name, bold, nameWidth - 16, 8.5, 1.3);
    spaced(page, name, tableLeft + nameWidth / 2, textY, size, bold, fill === colors.beige ? colors.navy : colors.white, 1.3);
    let cellX = tableLeft + nameWidth + gap;
    columns.forEach((column, columnIndex) => {
      if (!evaluated && columnIndex < periodColumns) {
        if (columnIndex === 0) {
          const merged = columns.slice(0, periodColumns).reduce((total, entry) => total + entry.width + gap, -gap);
          page.drawRectangle({ x: cellX, y, width: merged, height: rowHeight, color: colors.red });
          spaced(page, "NÃO AVALIADA", cellX + merged / 2, textY, fitSize("NÃO AVALIADA", bold, merged - 10, 8, 1.2), bold, colors.white, 1.2);
        }
      } else {
        page.drawRectangle({ x: cellX, y, width: column.width, height: rowHeight, color: column.fill });
        spaced(page, column.value(row), cellX + column.width / 2, textY, 8.5, regular, column.text, .8);
      }
      cellX += column.width + gap;
    });
    top += rowStep;
  };
  rows.forEach((row, index) => drawRow(row, index, true));
  unevaluated.forEach((row, index) => drawRow(row, index, false));
  if (!rows.length && !unevaluated.length) centered(page, `Nenhum resultado disponível neste ${annual ? "ano" : "mês"}.`, width / 2, Y(top + 18), 10, regular, colors.navy, 0);

  if (safety) drawAwards(page, Y, tableBottom + 30, width, regular, bold);
  if (safety) {
    let obsTop = tableBottom + 30 + awardsHeight + 16;
    for (const paragraph of safetyAwards.observations) {
      for (const line of wrap(paragraph, regular, 7.2, 470)) { centered(page, line, width / 2, Y(obsTop), 7.2, regular, colors.navy, 0); obsTop += 9.5; }
      obsTop += 5;
    }
  }
  if (footerLogo) {
    const size = footerLogo.scaleToFit(118, 37);
    page.drawImage(footerLogo, { x: tableRight - size.width, y: 24, width: size.width, height: size.height });
  }
  return document.save();
}

function drawAwards(page: PDFPage, Y: (top: number) => number, top: number, width: number, regular: PDFFont, bold: PDFFont) {
  const left = 24, boxWidth = width - 48, boxHeight = 360;
  page.drawRectangle({ x: left, y: Y(top + boxHeight), width: boxWidth, height: boxHeight, color: colors.navy });
  centered(page, "Premiações", width / 2, Y(top + 36), 15, bold, colors.white, 0);
  const cardWidth = 210, cardHeight = 232, cardTop = top + 56;
  const cards = [{ x: width / 2 - cardWidth - 12, card: safetyAwards.draw }, { x: width / 2 + 12, card: safetyAwards.team }];
  for (const { x, card } of cards) {
    roundedCard(page, x, Y(cardTop), cardWidth, cardHeight);
    let lineTop = cardTop + 34;
    for (const line of wrap(card.title, bold, 15, cardWidth - 40)) { centered(page, line, x + cardWidth / 2, Y(lineTop), 15, bold, colors.white, 0); lineTop += 18; }
    if (card === safetyAwards.draw) {
      centered(page, "voucher R$ 200 e R$ 150", x + cardWidth / 2, Y(lineTop), 12, bold, colors.white, 0);
      lineTop += 18;
    }
    lineTop += 6;
    for (const paragraph of card.paragraphs) {
      for (const line of wrap(paragraph, regular, 7.3, cardWidth - 36)) { centered(page, line, x + cardWidth / 2, Y(lineTop), 7.3, regular, colors.white, 0); lineTop += 9.2; }
      lineTop += 6;
    }
  }
  centered(page, safetyAwards.start, width / 2, Y(top + boxHeight - 46), 7.5, bold, colors.white, 0);
  let noteTop = top + boxHeight - 28;
  for (const line of wrap(safetyAwards.note, regular, 7.2, boxWidth - 80)) { centered(page, line, width / 2, Y(noteTop), 7.2, regular, colors.white, 0); noteTop += 9.2; }
}

/** Card with a large radius on three corners, like the poster's award boxes. */
function roundedCard(page: PDFPage, x: number, top: number, width: number, height: number) {
  const r = 34, s = 8;
  const path = `M ${r} 0 L ${width - r} 0 Q ${width} 0 ${width} ${r} L ${width} ${height - s} Q ${width} ${height} ${width - s} ${height} L ${r} ${height} Q 0 ${height} 0 ${height - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(path, { x, y: top, color: colors.blue });
}

function spacedWidth(text: string, font: PDFFont, size: number, spacing: number) {
  return font.widthOfTextAtSize(text, size) + Math.max(0, text.length - 1) * spacing;
}

/** Centered text with letter spacing (pdf-lib has no character spacing option). */
function spaced(page: PDFPage, text: string, centerX: number, y: number, size: number, font: PDFFont, color: RGB, spacing: number) {
  let x = centerX - spacedWidth(text, font, size, spacing) / 2;
  for (const character of text) {
    page.drawText(character, { x, y, size, font, color });
    x += font.widthOfTextAtSize(character, size) + spacing;
  }
}

function centered(page: PDFPage, text: string, centerX: number, y: number, size: number, font: PDFFont, color: RGB, spacing: number) {
  if (spacing) { spaced(page, text, centerX, y, size, font, color, spacing); return; }
  page.drawText(text, { x: centerX - font.widthOfTextAtSize(text, size) / 2, y, size, font, color });
}

function fitSize(text: string, font: PDFFont, max: number, size: number, spacing: number) {
  let current = size;
  while (current > 5 && spacedWidth(text, font, current, spacing) > max) current -= .25;
  return current;
}

function wrap(text: string, font: PDFFont, size: number, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > max) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

