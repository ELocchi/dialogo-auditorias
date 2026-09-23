"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { PDFDocument, PDFName, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatAuditDate } from "@/domain/operational-records";
import { moduleLabels, type AppModule } from "@/domain/prototype-access";
import { Icon } from "./ui-icon";
import styles from "./action-plan-editor.module.css";

export type ActionPlanFinding = {
  id: string;
  item: string;
  description: string;
  itemDescription?: string;
  verificationCriterion?: string;
  status?: string;
  nonconformity: string;
  evidencePhotos?: readonly { name: string; url?: string }[];
};

export type ActionPlanRow = ActionPlanFinding & {
  correctiveAction: string;
  responsible: string;
  startDate: string;
  dueDate: string;
};

export function ActionPlanEditor({ workName, auditDate, auditScore, module, authorName, findings, draft, example, prefillTest = false, onSave, onPublish, onBack }: {
  workName: string;
  auditDate: string;
  auditScore: number | null;
  module: AppModule;
  authorName: string;
  findings: readonly ActionPlanFinding[];
  draft?: readonly ActionPlanRow[];
  example: boolean;
  prefillTest?: boolean;
  onSave: (rows: readonly ActionPlanRow[]) => void;
  onPublish: (publication: { bytes: Uint8Array; fileName: string }) => void;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<ActionPlanRow[]>(() => draft ? [...draft] : prefillTest ? createLocalTestRows(findings) : findings.map((finding) => ({
    ...finding, correctiveAction: "", responsible: "", startDate: "", dueDate: "",
  })));
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set(rows[0] ? [rows[0].id] : []));
  const [reviewing, setReviewing] = useState(false);
  const [pendingPublication, setPendingPublication] = useState<{ bytes: Uint8Array; fileName: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfYear, pdfMonth] = auditDate.split("-");
  const pdfMonthName = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][Number(pdfMonth) - 1] ?? pdfMonth;
  const pdfWorkName = workName.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-") || "Obra";
  const pdfName = `${pdfWorkName}-${pdfMonthName}-${pdfYear}.pdf`;
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  const update = (id: string, field: keyof ActionPlanRow, value: string) => {
    setSubmitted(false);
    setError("");
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
  };
  const returnToForm = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl("");
    setPendingPublication(null);
    setReviewing(false);
    setSubmitted(false);
    setError("");
  };
  if (reviewing && pdfUrl && pendingPublication) return <section className="audit-review" aria-labelledby="action-plan-review-title">
    <header className="audit-review-heading">
      <div><p className="kicker">REVISÃO DO PLANO DE AÇÃO</p><h2 id="action-plan-review-title">Conferir antes de publicar</h2><p>Revise as ações corretivas e o PDF antes da publicação.</p></div>
    </header>
    <div className="audit-review-reference">
      <div><small>OBRA</small><strong>{workName}</strong></div>
      <div><small>DISCIPLINA</small><strong>{moduleLabels[module]}</strong></div>
      <div><small>DATA DA AUDITORIA</small><strong>{formatAuditDate(auditDate)}</strong></div>
      <div><small>RESPONSÁVEL PELO PLANO</small><strong>{authorName}</strong></div>
    </div>
    <div className="audit-review-actions">
      <button type="button" className="secondary" disabled={submitted} onClick={returnToForm}>Voltar ao preenchimento</button>
      <button type="button" className="primary" disabled={submitted} onClick={() => { onPublish(pendingPublication); setSubmitted(true); }}>{submitted ? "Plano de ação publicado" : "Publicar plano de ação"}</button>
    </div>
    <section className="audit-review-pdf">
      <div><h3>Prévia do plano de ação em PDF</h3><span><a className="secondary" href={pdfUrl} target="_blank" rel="noreferrer">Abrir PDF</a><a className="primary" href={pdfUrl} download={pdfName}>Baixar PDF</a></span></div>
      <iframe src={pdfUrl} title="Prévia do plano de ação em PDF" />
    </section>
  </section>;
  return <>
    <div className="page-intro">
      <div><h2>Plano de ação</h2><p className="muted">{workName} · {moduleLabels[module]} · auditoria de {formatAuditDate(auditDate)}</p><p className={styles.extractionSummary}>{findings.length} não conformidade{findings.length === 1 ? "" : "s"} extraída{findings.length === 1 ? "" : "s"} do relatório publicado.</p></div>
      <button type="button" className="secondary" onClick={onBack}><Icon name="arrow" className={styles.backIcon} />Voltar</button>
    </div>
    <section className="panel">
      <div className="panel-heading"><div><span className="section-label">APONTAMENTOS DA AUDITORIA</span><h3>Ações corretivas</h3></div>{example && <span className="badge badge-amber">Prévia de teste</span>}</div>
      {rows.length ? <form className={styles.form} onSubmit={async (event) => {
        event.preventDefault();
        if (rows.some((row) => !row.correctiveAction.trim() || !row.responsible.trim() || !row.startDate || !row.dueDate)) {
          setError("Preencha a ação corretiva, o responsável e as datas previstas de cada apontamento antes de publicar.");
          return;
        }
        setGeneratingPdf(true);
        try {
          const bytes = await generateActionPlanPdf({ workName, auditDate, auditScore, module, authorName, rows });
          if (pdfUrl) URL.revokeObjectURL(pdfUrl);
          const nextUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" }));
          setPdfUrl(nextUrl);
          onSave(rows);
          setPendingPublication({ bytes, fileName: pdfName });
          setReviewing(true);
          setSubmitted(false);
          setError("");
        } catch {
          setError("Não foi possível gerar o PDF do plano de ação. Tente novamente.");
        } finally { setGeneratingPdf(false); }
      }}>
        <div className={styles.rows}>{rows.map((row) => {
          const expanded = expandedRows.has(row.id);
          return <article className={styles.row} key={row.id}>
            <button type="button" className={styles.rowSummary} aria-expanded={expanded} onClick={() => setExpandedRows((current) => {
              const next = new Set(current);
              if (expanded) next.delete(row.id); else next.add(row.id);
              return next;
            })}>
              <span>Item {row.item} · {row.description}</span><i className={`${styles.rowChevron}${expanded ? ` ${styles.rowChevronExpanded}` : ""}`} aria-hidden="true" />
            </button>
            {expanded && <div className={styles.rowBody}>
              <div className={styles.source}>
                <div className={styles.sourceColumn}><div><span>Descrição</span><p>{row.itemDescription || row.description}</p></div><div><span>Critério</span><p>{row.verificationCriterion || "Não informado"}</p></div></div>
                <div className={styles.sourceColumn}><div><span>Não conformidade</span><p>{row.nonconformity}</p></div><div><span>Status</span><strong className={row.status === "Não conforme" ? styles.statusNonconforming : styles.status}>{row.status || "Com apontamento"}</strong></div></div>
                <div className={`${styles.sourceColumn} ${styles.photoColumn}`}><span>Foto</span>{row.evidencePhotos?.length ? <div className={styles.evidencePhotos}>{row.evidencePhotos.map((photo, photoIndex) => photo.url
                  ? <a href={photo.url} target="_blank" rel="noopener noreferrer" key={`${photo.name}:${photoIndex}`} title="Abrir foto em nova guia"><Image src={photo.url} alt={`Evidência do item ${row.item}`} width={150} height={96} unoptimized /><small>{photo.name}</small></a>
                  : <span className={styles.evidenceName} key={`${photo.name}:${photoIndex}`}>{photo.name}</span>)}</div>
                  : <p className={styles.noEvidence}>Nenhuma foto anexada.</p>}</div>
              </div>
              <label className={styles.full}>Ações corretivas<textarea required value={row.correctiveAction} onChange={(event) => update(row.id, "correctiveAction", event.target.value)} placeholder="Informe as medidas tomadas para sanar a pendência" /></label>
              <div className={styles.fields}>
                <label>Responsável(is)<input required value={row.responsible} onChange={(event) => update(row.id, "responsible", event.target.value)} /></label>
                <label>Data de início prevista<input required type="date" value={row.startDate} onChange={(event) => update(row.id, "startDate", event.target.value)} /></label>
                <label>Data final prevista<input required type="date" value={row.dueDate} onChange={(event) => update(row.id, "dueDate", event.target.value)} /></label>
              </div>
            </div>}
          </article>;
        })}</div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}><span role="status">{prefillTest ? "Dados de teste preenchidos. Revise antes de continuar." : ""}</span><button type="submit" className="primary" disabled={generatingPdf}>{generatingPdf ? "Gerando prévia..." : "Revisar plano de ação"}</button></div>
      </form> : <div className={styles.empty}>
        <strong>Nenhum apontamento publicado disponível</strong>
        <p>Quando o relatório publicado trouxer apontamentos, eles serão incluídos automaticamente aqui para o preenchimento das ações corretivas.</p>
      </div>}
    </section>
  </>;
}

const localTestActions = [
  { correctiveAction: "Atualizar a planilha F.39 com as datas de verificação e validade de todos os equipamentos de medição e conferir as etiquetas em campo.", responsible: "Qualidade da obra / Engenharia", startDate: "2026-09-24", dueDate: "2026-09-25" },
  { correctiveAction: "Corrigir o erro de digitação na planilha F.99 e revisar os registros de validade dos materiais armazenados.", responsible: "Almoxarifado / Qualidade", startDate: "2026-09-24", dueDate: "2026-09-24" },
  { correctiveAction: "Transferir os contramarcos para a área indicada pela TAM, mantendo as peças protegidas, organizadas e afastadas do piso.", responsible: "Almoxarifado / Produção", startDate: "2026-09-24", dueDate: "2026-09-26" },
  { correctiveAction: "Identificar o material com etiqueta contendo descrição, lote, fornecedor e data de recebimento.", responsible: "Almoxarifado", startDate: "2026-09-24", dueDate: "2026-09-24" },
  { correctiveAction: "Retirar de campo a versão desatualizada e disponibilizar o projeto vigente, com revisão identificada no documento e na F.110.", responsible: "Engenharia da obra", startDate: "2026-09-23", dueDate: "2026-09-24" },
  { correctiveAction: "Realizar treinamento dos procedimentos executivos com as equipes de hidráulica, elétrica e bancada.", responsible: "Engenharia / Qualidade", startDate: "2026-09-24", dueDate: "2026-09-30" },
  { correctiveAction: "Regularizar os registros de treinamento dos eletricistas e encanadores e atualizar a matriz de treinamentos do PQO.", responsible: "Qualidade / Administrativo da obra", startDate: "2026-09-24", dueDate: "2026-09-30" },
  { correctiveAction: "Solicitar a licença vigente da empresa responsável e atualizar a planilha F.124 com a nova validade.", responsible: "Meio Ambiente / Qualidade", startDate: "2026-09-24", dueDate: "2026-09-25" },
  { correctiveAction: "Liberar o início do forro somente após concluir as condições precedentes do hall e registrar a inspeção na FVS-24.", responsible: "Produção / Qualidade", startDate: "2026-09-24", dueDate: "2026-09-29" },
  { correctiveAction: "Revisar a FVS-6B, registrar a inspeção no momento da execução e orientar o responsável pelo preenchimento.", responsible: "Qualidade / Produção", startDate: "2026-09-24", dueDate: "2026-09-25" },
  { correctiveAction: "Regularizar a FVS-006 com os registros da inspeção e instituir conferência diária dos serviços em execução.", responsible: "Qualidade da obra", startDate: "2026-09-24", dueDate: "2026-09-25" },
  { correctiveAction: "Revisar o preenchimento da FVS-6A e garantir que as próximas inspeções sejam registradas durante a execução.", responsible: "Qualidade / Produção", startDate: "2026-09-24", dueDate: "2026-09-25" },
] as const;

function createLocalTestRows(findings: readonly ActionPlanFinding[]): ActionPlanRow[] {
  return findings.map((finding, index) => {
    const template = localTestActions[index % localTestActions.length];
    return { ...finding, correctiveAction: template.correctiveAction, responsible: template.responsible, startDate: template.startDate,
      dueDate: template.dueDate };
  });
}

async function generateActionPlanPdf({ workName, auditDate, auditScore, module, authorName, rows }: {
  workName: string; auditDate: string; auditScore: number | null; module: AppModule; authorName: string; rows: readonly ActionPlanRow[];
}) {
  const document = await PDFDocument.create();
  document.setTitle(`Plano de Ação - ${workName}`);
  document.setAuthor(authorName);
  document.setSubject(`Plano de ação de ${moduleLabels[module]}`);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = await fetch("/logo-relatorio-orientativo.png").then(async (response) => response.ok ? document.embedPng(await response.arrayBuffer()) : null).catch(() => null);
  const width = 445.5, height = 631.5, left = 34, right = width - 33;
  const contentWidth = right - left, contentTop = 558, contentBottom = 52;
  const navy = rgb(.07, .24, .47), red = rgb(.86, .12, .18), muted = rgb(.39, .47, .57), lineColor = rgb(.87, .90, .94);
  const green = rgb(.10, .55, .34), gray = rgb(.40, .46, .54);
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
        const response = await fetch(photo.url, { cache: "no-store" });
        if (!response.ok) continue;
        const bytes = await response.arrayBuffer();
        evidenceImages.push(photo.url.toLocaleLowerCase("pt-BR").endsWith(".png") ? await document.embedPng(bytes) : await document.embedJpg(bytes));
      } catch { /* A referência textual permanece no PDF quando a imagem não estiver disponível. */ }
    }
    preparedRows.push({ row, images: evidenceImages, photoNames: (row.evidencePhotos ?? []).map((photo) => photo.name) });
  }

  const sectionLines = (value: string) => wrapPdfText(safePdfText(value || "—", regular), regular, 6.2, contentWidth);
  const sectionHeight = (lines: string[]) => 12 + lines.length * 7.8;
  const plannedColumnWidth = contentWidth / 3;
  const layoutFor = ({ row, images, photoNames }: typeof preparedRows[number]) => {
    const title = wrapPdfText(safePdfText(row.description || "—", bold), bold, 8, contentWidth - 52);
    const description = sectionLines(row.itemDescription || row.description);
    const criterion = sectionLines(row.verificationCriterion || "Não informado");
    const status = sectionLines(row.status || "Com apontamento");
    const nonconformity = sectionLines(row.nonconformity);
    const correctiveAction = sectionLines(row.correctiveAction);
    const responsible = wrapPdfText(safePdfText(row.responsible || "—", regular), regular, 6.2, plannedColumnWidth - 10);
    const startDate = wrapPdfText(formatAuditDate(row.startDate), regular, 6.2, plannedColumnWidth - 10);
    const dueDate = wrapPdfText(formatAuditDate(row.dueDate), regular, 6.2, plannedColumnWidth - 10);
    const photoRows = images.length ? Math.ceil(images.length / 3) : 0;
    const missingPhotoLines = !images.length && photoNames.length ? wrapPdfText(safePdfText(photoNames.join(", "), regular), regular, 5.5, contentWidth) : [];
    const photoHeight = 19 + (photoRows ? photoRows * 70 - 8 : Math.max(13, missingPhotoLines.length * 7));
    const headingHeight = Math.max(24, 24 + (title.length - 1) * 9);
    const plannedHeight = 13 + Math.max(responsible.length, startDate.length, dueDate.length) * 7.8 + 5;
    const totalHeight = headingHeight + sectionHeight(description) + sectionHeight(criterion) + sectionHeight(status)
      + sectionHeight(nonconformity) + photoHeight + sectionHeight(correctiveAction) + plannedHeight + 13;
    return { title, description, criterion, status, nonconformity, correctiveAction, responsible, startDate, dueDate, missingPhotoLines, photoRows, photoHeight, totalHeight };
  };
  const drawMetadata = (page: PDFPage) => {
    const metadataColumnWidth = contentWidth / 4;
    const metadata = [
      { label: "OBRA", value: workName },
      { label: "DISCIPLINA", value: moduleLabels[module] },
      { label: "NOTA DA AUDITORIA", value: auditScore === null ? "—" : auditScore.toFixed(2).replace(".", ",") },
      { label: "AUDITORIA DE REFERÊNCIA", value: formatAuditDate(auditDate) },
    ];
    const valueLines = metadata.map((entry) => wrapPdfText(safePdfText(entry.value, bold), bold, 7.5, metadataColumnWidth - 10));
    metadata.forEach((entry, index) => {
      const x = left + index * metadataColumnWidth;
      drawLabel(page, entry.label, x, 550);
      valueLines[index].forEach((value, lineIndex) => page.drawText(value, { x, y: 536 - lineIndex * 9, size: 7.5, font: bold, color: navy }));
    });
    const bottom = 536 - Math.max(...valueLines.map((lines) => lines.length)) * 9 - 6;
    page.drawLine({ start: { x: left, y: bottom }, end: { x: right, y: bottom }, thickness: .45, color: lineColor });
    return bottom - 12;
  };
  const drawSection = (page: PDFPage, label: string, lines: string[], top: number, valueColor = muted) => {
    drawLabel(page, label, left, top);
    let cursor = top - 9;
    lines.forEach((value) => { page.drawText(value, { x: left, y: cursor, size: 6.2, font: regular, color: valueColor }); cursor -= 7.8; });
    return cursor - 3;
  };
  const drawItem = (page: PDFPage, prepared: typeof preparedRows[number], layout: ReturnType<typeof layoutFor>, top: number) => {
    const { row, images } = prepared;
    let cursor = top;
    drawRoundedCode(page, row.item, left, cursor - 17);
    layout.title.forEach((value, index) => page.drawText(value, { x: left + 52, y: cursor - 12 - index * 9, size: 8, font: bold, color: navy }));
    cursor -= Math.max(24, 24 + (layout.title.length - 1) * 9);
    cursor = drawSection(page, "DESCRIÇÃO", layout.description, cursor);
    cursor = drawSection(page, "CRITÉRIO DE VERIFICAÇÃO", layout.criterion, cursor);
    const statusColor = /não conforme/i.test(row.status ?? "") ? red : /conforme/i.test(row.status ?? "") ? green : gray;
    cursor = drawSection(page, "STATUS", layout.status, cursor, statusColor);
    cursor = drawSection(page, "NÃO CONFORMIDADE", layout.nonconformity, cursor);
    drawLabel(page, "EVIDÊNCIAS FOTOGRÁFICAS DA AUDITORIA", left, cursor);
    cursor -= 9;
    if (images.length) {
      const gap = 8, photoWidth = (contentWidth - gap * 2) / 3, photoCellHeight = 62;
      images.forEach((image, photoIndex) => {
        const column = photoIndex % 3, rowIndex = Math.floor(photoIndex / 3);
        const photoX = left + column * (photoWidth + gap), photoTop = cursor - rowIndex * (photoCellHeight + gap);
        const dimensions = image.scaleToFit(photoWidth, photoCellHeight);
        page.drawImage(image, { x: photoX, y: photoTop - dimensions.height, width: dimensions.width, height: dimensions.height });
      });
      cursor -= layout.photoRows * 70 - 8;
    } else if (layout.missingPhotoLines.length) {
      layout.missingPhotoLines.forEach((value) => { page.drawText(value, { x: left, y: cursor, size: 5.5, font: regular, color: muted }); cursor -= 7; });
    } else {
      page.drawText("Nenhuma fotografia anexada a este item.", { x: left, y: cursor, size: 6.2, font: regular, color: muted });
      cursor -= 13;
    }
    cursor -= 10;
    cursor = drawSection(page, "AÇÕES CORRETIVAS", layout.correctiveAction, cursor, navy);
    const planned = [
      { label: "RESPONSÁVEL(IS)", lines: layout.responsible, x: left },
      { label: "DATA DE INÍCIO PREVISTA", lines: layout.startDate, x: left + plannedColumnWidth },
      { label: "DATA FINAL PREVISTA", lines: layout.dueDate, x: left + plannedColumnWidth * 2 },
    ];
    planned.forEach((entry) => {
      drawLabel(page, entry.label, entry.x, cursor);
      entry.lines.forEach((value, lineIndex) => page.drawText(value, { x: entry.x, y: cursor - 10 - lineIndex * 7.8, size: 6.2, font: regular, color: navy }));
    });
    cursor -= 13 + Math.max(...planned.map((entry) => entry.lines.length)) * 7.8;
    page.drawLine({ start: { x: left, y: cursor - 4 }, end: { x: right, y: cursor - 4 }, thickness: .45, color: lineColor });
    return cursor - 13;
  };
  const summaryColumns = [
    { label: "ITEM / TÍTULO", x: left, width: 174 },
    { label: "RESPONSÁVEL", x: left + 182, width: 82 },
    { label: "DATA INICIAL", x: left + 272, width: 45 },
    { label: "DATA FINAL", x: left + 325, width: 45 },
  ];
  const drawSummaryHeading = (sheet: PDFPage, top: number, continuation = false) => {
    sheet.drawText(continuation ? "SUMÁRIO · CONTINUAÇÃO" : "SUMÁRIO", { x: left, y: top, size: 13, font: bold, color: navy });
    const headerY = top - 25;
    summaryColumns.forEach((column) => drawLabel(sheet, column.label, column.x, headerY));
    sheet.drawLine({ start: { x: left, y: headerY - 6 }, end: { x: right, y: headerY - 6 }, thickness: .6, color: navy });
    return headerY - 17;
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
    const responsibleLines = wrapPdfText(safePdfText(row.responsible || "—", regular), regular, 5.8, summaryColumns[1].width);
    const startLines = wrapPdfText(formatAuditDate(row.startDate), regular, 5.8, summaryColumns[2].width);
    const dueLines = wrapPdfText(formatAuditDate(row.dueDate), regular, 5.8, summaryColumns[3].width);
    const rowHeight = Math.max(27, Math.max(titleLines.length, responsibleLines.length, startLines.length, dueLines.length) * 7.2 + 14);
    if (y - rowHeight < contentBottom) {
      page = addPage();
      summaryPages.add(page);
      y = drawSummaryHeading(page, contentTop, true);
    }
    const rowTop = y + 8;
    drawRoundedCode(page, row.item, left, y - 17);
    titleLines.forEach((line, lineIndex) => page.drawText(line, { x: left + 52, y: y - 12 - lineIndex * 7.2, size: 6.4, font: bold, color: navy }));
    responsibleLines.forEach((line, lineIndex) => page.drawText(line, { x: summaryColumns[1].x, y: y - 12 - lineIndex * 7.2, size: 5.8, font: regular, color: muted }));
    startLines.forEach((line, lineIndex) => page.drawText(line, { x: summaryColumns[2].x, y: y - 12 - lineIndex * 7.2, size: 5.8, font: regular, color: navy }));
    dueLines.forEach((line, lineIndex) => page.drawText(line, { x: summaryColumns[3].x, y: y - 12 - lineIndex * 7.2, size: 5.8, font: regular, color: navy }));
    y -= rowHeight;
    page.drawLine({ start: { x: left + 52, y: y + 5 }, end: { x: right, y: y + 5 }, thickness: .35, color: lineColor });
    summaryLinks.push({ source: page, itemId: row.id, rect: [left, y + 3, right, rowTop] });
  }
  if (preparedRows.length) { page = addPage(); y = contentTop; }
  for (const prepared of preparedRows) {
    const layout = layoutFor(prepared);
    if (y - layout.totalHeight < contentBottom) { page = addPage(); y = contentTop; }
    detailPages.set(prepared.row.id, { page, y });
    y = drawItem(page, prepared, layout, y);
  }

  pages.forEach((sheet, index) => {
    const centered = (value: string, center: number, baseline: number, font: PDFFont, size: number, color: typeof navy) => {
      const printable = safePdfText(value, font);
      sheet.drawText(printable, { x: center - font.widthOfTextAtSize(printable, size) / 2, y: baseline, size, font, color });
    };
    if (logo) sheet.drawImage(logo, { x: left, y: 582, width: 83, height: 33 });
    else sheet.drawText("DIÁLOGO ENGENHARIA", { x: left, y: 596, size: 9, font: bold, color: navy });
    centered("Sistema de Gestão da Qualidade", width / 2, 600, regular, 12.5, muted);
    const processX = 132;
    sheet.drawText("PROCESSO", { x: processX, y: 582, size: 4.5, font: regular, color: muted });
    sheet.drawText("PLANO DE AÇÃO", { x: processX + 39, y: 580.5, size: 7.2, font: bold, color: navy });
    const reportDate = formatAuditDate(auditDate), dateCenter = right - 24;
    centered("DATA", dateCenter, 592, regular, 4.5, muted);
    sheet.drawText(reportDate, { x: right - bold.widthOfTextAtSize(reportDate, 6.6), y: 580.5, size: 6.6, font: bold, color: navy });
    sheet.drawLine({ start: { x: left, y: 576 }, end: { x: right, y: 576 }, thickness: .6, color: navy });
    sheet.drawLine({ start: { x: left, y: 573 }, end: { x: right, y: 573 }, thickness: 1.3, color: red });
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
