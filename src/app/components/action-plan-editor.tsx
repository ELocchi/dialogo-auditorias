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
        const response = await fetch(photo.url, { cache: "no-store" });
        if (!response.ok) continue;
        const bytes = await response.arrayBuffer();
        const contentType = response.headers.get("content-type")?.toLocaleLowerCase("pt-BR") ?? "";
        const png = contentType.includes("image/png") || photo.name.toLocaleLowerCase("pt-BR").endsWith(".png")
          || new URL(photo.url).pathname.toLocaleLowerCase("pt-BR").endsWith(".png");
        evidenceImages.push(png ? await document.embedPng(bytes) : await document.embedJpg(bytes));
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
