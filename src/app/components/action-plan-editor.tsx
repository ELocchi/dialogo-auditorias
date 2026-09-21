"use client";

import { useEffect, useState } from "react";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import { formatAuditDate } from "@/domain/operational-records";
import { moduleLabels, type AppModule } from "@/domain/prototype-access";
import { Icon } from "./ui-icon";
import styles from "./action-plan-editor.module.css";

export type ActionPlanFinding = {
  id: string;
  item: string;
  description: string;
  nonconformity: string;
};

export type ActionPlanRow = ActionPlanFinding & {
  correctiveAction: string;
  responsible: string;
  startDate: string;
  dueDate: string;
  completionDate: string;
  followUp: string;
  photos: readonly File[];
};

export function ActionPlanEditor({ workName, auditDate, module, authorName, findings, draft, example, onSave, onPublish, onBack }: {
  workName: string;
  auditDate: string;
  module: AppModule;
  authorName: string;
  findings: readonly ActionPlanFinding[];
  draft?: readonly ActionPlanRow[];
  example: boolean;
  onSave: (rows: readonly ActionPlanRow[]) => void;
  onPublish: (publication: { bytes: Uint8Array; fileName: string }) => void;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<ActionPlanRow[]>(() => draft ? [...draft] : findings.map((finding) => ({
    ...finding, correctiveAction: "", responsible: "", startDate: "", dueDate: "", completionDate: "", followUp: "", photos: [],
  })));
  const [saved, setSaved] = useState(false);
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
    setSaved(false);
    setSubmitted(false);
    setError("");
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
  };
  const updatePhotos = (id: string, photos: readonly File[]) => {
    setSaved(false);
    setSubmitted(false);
    setError("");
    setRows((current) => current.map((row) => row.id === id ? { ...row, photos } : row));
  };

  return <>
    <div className="page-intro">
      <div><h2>Plano de ação</h2><p className="muted">{workName} · {moduleLabels[module]} · auditoria de {formatAuditDate(auditDate)}</p></div>
      <button type="button" className="secondary" onClick={onBack}><Icon name="arrow" className={styles.backIcon} />Voltar</button>
    </div>
    <section className="panel">
      <div className="panel-heading"><div><span className="section-label">APONTAMENTOS DA AUDITORIA</span><h3>Ações corretivas</h3></div>{example && <span className="badge badge-amber">Prévia de teste</span>}</div>
      {rows.length ? <form className={styles.form} onSubmit={async (event) => {
        event.preventDefault();
        if (rows.some((row) => !row.correctiveAction.trim() || !row.responsible.trim() || !row.startDate || !row.dueDate || !row.completionDate || !row.followUp.trim() || row.photos.length === 0)) {
          setError("Preencha todos os campos e adicione pelo menos uma foto em cada apontamento antes de enviar.");
          return;
        }
        setGeneratingPdf(true);
        try {
          const bytes = await generateActionPlanPdf({ workName, auditDate, module, authorName, rows });
          if (pdfUrl) URL.revokeObjectURL(pdfUrl);
          const nextUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" }));
          setPdfUrl(nextUrl); onSave(rows); onPublish({ bytes, fileName: pdfName }); setSaved(false); setSubmitted(true); setError("");
        } catch {
          setError("Não foi possível gerar o PDF. Confira as fotos anexadas e tente novamente.");
        } finally { setGeneratingPdf(false); }
      }}>
        <div className={styles.rows}>{rows.map((row) => <fieldset className={styles.row} key={row.id}>
          <legend>Item {row.item}</legend>
          <div className={styles.source}>
            <div><span>Descrição do item</span><strong>{row.description}</strong></div>
            <div><span>Não conformidade</span><p>{row.nonconformity}</p></div>
          </div>
          <label className={styles.full}>Ações corretivas<textarea required value={row.correctiveAction} onChange={(event) => update(row.id, "correctiveAction", event.target.value)} placeholder="Informe as medidas tomadas para sanar a pendência" /></label>
          <div className={styles.fields}>
            <label>Responsável(is)<input required value={row.responsible} onChange={(event) => update(row.id, "responsible", event.target.value)} /></label>
            <label>Data de início<input required type="date" value={row.startDate} onChange={(event) => update(row.id, "startDate", event.target.value)} /></label>
            <label>Data final prevista<input required type="date" value={row.dueDate} onChange={(event) => update(row.id, "dueDate", event.target.value)} /></label>
            <label>Data de conclusão real<input required type="date" value={row.completionDate} onChange={(event) => update(row.id, "completionDate", event.target.value)} /></label>
            <div className={`${styles.full} ${styles.followUp}`}>
              <label>Comentários<textarea required value={row.followUp} onChange={(event) => update(row.id, "followUp", event.target.value)} placeholder="Registre o acompanhamento e as medidas executadas" /></label>
              <label>Fotos<input className={styles.fileInput} required={row.photos.length === 0} type="file" accept="image/jpeg,image/png" multiple onChange={(event) => updatePhotos(row.id, [...row.photos, ...Array.from(event.target.files ?? [])])} /><span className={styles.fileHelp}>Adicione pelo menos uma foto JPG ou PNG da ação executada.</span></label>
              {row.photos.length > 0 && <div className={styles.photos} aria-label="Fotos do acompanhamento">{row.photos.map((photo, index) => <PhotoPreview key={`${photo.name}:${photo.lastModified}:${index}`} file={photo} onRemove={() => updatePhotos(row.id, row.photos.filter((_, photoIndex) => photoIndex !== index))} />)}</div>}
            </div>
          </div>
        </fieldset>)}</div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}><span role="status">{saved ? "Rascunho atualizado nesta sessão." : submitted ? "Plano completo. PDF gerado para conferência." : ""}</span><button type="button" className="secondary" disabled={generatingPdf} onClick={() => { onSave(rows); setSaved(true); setSubmitted(false); setError(""); }}>Salvar rascunho</button><button type="submit" className="primary" disabled={generatingPdf}>{generatingPdf ? "Gerando PDF..." : "Enviar plano de ação"}</button></div>
        {pdfUrl && <section className={styles.pdfPreview} aria-label="Pré-visualização do plano de ação em PDF">
          <div><div><span className="section-label">DOCUMENTO GERADO</span><h3>Pré-visualização do plano de ação</h3></div><a className="secondary" href={pdfUrl} download={pdfName}>Baixar PDF</a></div>
          <iframe title="Pré-visualização do plano de ação" src={pdfUrl} />
        </section>}
      </form> : <div className={styles.empty}>
        <strong>Nenhum apontamento publicado disponível</strong>
        <p>Quando o relatório publicado trouxer apontamentos, eles serão incluídos automaticamente aqui para o preenchimento das ações corretivas.</p>
      </div>}
    </section>
  </>;
}

async function generateActionPlanPdf({ workName, auditDate, module, authorName, rows }: {
  workName: string; auditDate: string; module: AppModule; authorName: string; rows: readonly ActionPlanRow[];
}) {
  const document = await PDFDocument.create();
  document.setTitle(`Plano de ação - ${workName}`);
  document.setAuthor(authorName);
  document.setSubject(`Plano de ação de ${moduleLabels[module]}`);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = await fetch("/logo-relatorio-orientativo.png").then(async (response) => response.ok ? document.embedPng(await response.arrayBuffer()) : null).catch(() => null);
  const pageSize: [number, number] = [612, 792];
  const margin = 57;
  const right = 555;
  const navy = rgb(.10, .25, .48);
  const red = rgb(.75, .09, .09);
  const muted = rgb(.39, .47, .57);
  const divider = rgb(.77, .82, .88);
  let page = document.addPage(pageSize);
  let y = 657;
  const ensure = (height: number) => {
    if (y - height >= margin) return;
    page = document.addPage(pageSize);
    y = 678;
  };
  const line = (text: string, font: PDFFont, size: number, color = navy, indent = 0) => {
    const lines = wrapPdfText(safePdfText(text || "—", font), font, size, pageSize[0] - (margin * 2) - indent);
    ensure(lines.length * (size + 4));
    for (const entry of lines) { page.drawText(entry, { x: margin + indent, y, size, font, color }); y -= size + 4; }
  };
  const field = (label: string, value: string) => {
    ensure(28);
    line(label.toUpperCase(), bold, 7, muted);
    line(value || "—", regular, 9, navy, 0);
    y -= 2;
  };

  const metadata = [
    { label: "OBRA", value: workName, x: margin, width: 225 },
    { label: "DISCIPLINA", value: moduleLabels[module], x: 295, width: 105 },
    { label: "AUDITORIA DE REFERÊNCIA", value: formatAuditDate(auditDate), x: 414, width: right - 414 },
  ];
  for (const item of metadata) page.drawText(item.label, { x: item.x, y, size: 7, font: bold, color: muted });
  const metadataLines = metadata.map((item) => wrapPdfText(safePdfText(item.value, regular), regular, 9, item.width));
  const metadataValueY = y - 12;
  metadata.forEach((item, index) => metadataLines[index].forEach((value, lineIndex) => page.drawText(value, { x: item.x, y: metadataValueY - lineIndex * 11, size: 9, font: regular, color: navy })));
  y = metadataValueY - Math.max(...metadataLines.map((lines) => lines.length)) * 11;

  for (const [index, row] of rows.entries()) {
    const embeddedPhotos: PDFImage[] = [];
    const failedPhotos: string[] = [];
    for (const photo of row.photos) {
      try { embeddedPhotos.push(await document.embedJpg(await normalizePhotoForPdf(photo))); }
      catch { failedPhotos.push(photo.name); }
    }
    const valueHeight = (value: string, size = 9) => wrapPdfText(safePdfText(value || "—", regular), regular, size, right - margin).length * (size + 4);
    const compactFieldHeight = (value: string) => 11 + valueHeight(value) + 2;
    const textHeight = 29 + compactFieldHeight(row.description) + compactFieldHeight(row.nonconformity)
      + compactFieldHeight(row.correctiveAction) + compactFieldHeight(row.responsible)
      + compactFieldHeight(`Início: ${formatAuditDate(row.startDate)}  |  Final prevista: ${formatAuditDate(row.dueDate)}  |  Conclusão: ${formatAuditDate(row.completionDate)}`)
      + compactFieldHeight(row.followUp);
    const photoColumns = 4;
    const photoRows = Math.ceil(embeddedPhotos.length / photoColumns);
    const photoHeight = photoRows ? Math.max(28, Math.min(48, (270 - textHeight - photoRows * 12) / photoRows)) : 0;
    const photosHeight = photoRows ? 11 + photoRows * (photoHeight + 6) : 0;
    const failedHeight = failedPhotos.length ? 18 : 0;
    const itemHeight = textHeight + photosHeight + failedHeight + 16;
    ensure(itemHeight);
    page.drawRectangle({ x: margin, y: y - 3, width: right - margin, height: 1.5, color: red }); y -= 14;
    line(`${index + 1}. ITEM ${row.item}`, bold, 11);
    field("Descrição do item", row.description);
    field("Não conformidade", row.nonconformity);
    field("Ações corretivas", row.correctiveAction);
    field("Responsável(is)", row.responsible);
    field("Datas", `Início: ${formatAuditDate(row.startDate)}  |  Final prevista: ${formatAuditDate(row.dueDate)}  |  Conclusão: ${formatAuditDate(row.completionDate)}`);
    field("Comentários de acompanhamento", row.followUp);
    if (embeddedPhotos.length || failedPhotos.length) {
      line("FOTOS DO ACOMPANHAMENTO", bold, 8, muted);
      const gap = 8;
      const cellWidth = (right - margin - gap * (photoColumns - 1)) / photoColumns;
      embeddedPhotos.forEach((image, photoIndex) => {
        const column = photoIndex % photoColumns;
        const rowIndex = Math.floor(photoIndex / photoColumns);
        const cellX = margin + column * (cellWidth + gap);
        const cellTop = y - rowIndex * (photoHeight + 6);
        const dimensions = image.scaleToFit(cellWidth, photoHeight);
        page.drawImage(image, { x: cellX + (cellWidth - dimensions.width) / 2, y: cellTop - dimensions.height, width: dimensions.width, height: dimensions.height });
      });
      if (photoRows) y -= photoRows * (photoHeight + 6);
      if (failedPhotos.length) { line(`${failedPhotos.length} foto(s) não puderam ser incorporadas.`, regular, 8, muted); }
    }
    y -= 7;
  }
  const pages = document.getPages();
  pages.forEach((sheet, index) => {
    const centered = (value: string, center: number, baseline: number, font: PDFFont, size: number, color: typeof navy) => {
      const printable = safePdfText(value, font);
      sheet.drawText(printable, { x: center - font.widthOfTextAtSize(printable, size) / 2, y: baseline, size, font, color });
    };
    if (logo) sheet.drawImage(logo, { x: margin + 5, y: 729, width: 97.5, height: 38 });
    else sheet.drawText("DIÁLOGO ENGENHARIA", { x: margin + 5, y: 744, size: 11, font: bold, color: navy });
    centered("Sistema de Gestão da Qualidade", 360, 746, regular, 10, muted);
    sheet.drawText("PROCESSO", { x: margin, y: 718, size: 8, font: regular, color: muted });
    centered("PLANO DE AÇÃO", 224, 704, bold, 12, navy);
    centered("DATA", 484, 718, regular, 7, muted);
    centered(formatAuditDate(auditDate), 484, 704, bold, 8, navy);
    centered("FOLHA Nº", 532, 718, regular, 7, muted);
    const currentPage = String(index + 1);
    const totalPages = String(pages.length);
    const separator = " / ";
    const folioWidth = bold.widthOfTextAtSize(currentPage + totalPages, 9) + regular.widthOfTextAtSize(separator, 9);
    const folioX = 532 - folioWidth / 2;
    sheet.drawText(currentPage, { x: folioX, y: 704, size: 9, font: bold, color: red });
    sheet.drawText(separator, { x: folioX + bold.widthOfTextAtSize(currentPage, 9), y: 704, size: 9, font: regular, color: muted });
    sheet.drawText(totalPages, { x: folioX + bold.widthOfTextAtSize(currentPage, 9) + regular.widthOfTextAtSize(separator, 9), y: 704, size: 9, font: bold, color: red });
    sheet.drawLine({ start: { x: margin, y: 697 }, end: { x: right, y: 697 }, thickness: .6, color: navy });
    sheet.drawLine({ start: { x: margin, y: 693 }, end: { x: right, y: 693 }, thickness: 1.5, color: red });
    sheet.drawLine({ start: { x: margin, y: 49 }, end: { x: right, y: 49 }, thickness: .5, color: divider });
    sheet.drawText("Plano de ação", { x: margin, y: 35, size: 7, font: regular, color: muted });
    const footerWork = safePdfText(workName, regular);
    sheet.drawText(footerWork, { x: Math.max(margin, (pageSize[0] - regular.widthOfTextAtSize(footerWork, 7)) / 2), y: 35, size: 7, font: regular, color: muted });
    const footerAuthor = safePdfText(`Elaborado por: ${authorName}`, regular);
    sheet.drawText(footerAuthor, { x: right - regular.widthOfTextAtSize(footerAuthor, 7), y: 35, size: 7, font: regular, color: muted });
  });
  return document.save();
}

function safePdfText(value: string, font: PDFFont) {
  return [...value].map((character) => {
    if (character === "\n" || character === "\r") return character;
    try { font.encodeText(character); return character; } catch { return "?"; }
  }).join("");
}

async function normalizePhotoForPdf(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const maximumSide = 1600;
    const scale = Math.min(1, maximumSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas indisponível");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Conversão da foto indisponível")), "image/jpeg", .82));
    return blob.arrayBuffer();
  } finally { bitmap.close(); }
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

function PhotoPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  return <figure className={styles.photo}>
    <span className={styles.photoIcon} aria-hidden="true">FOTO</span>
    <figcaption title={file.name}>{file.name}</figcaption>
    <button type="button" onClick={onRemove} aria-label={`Remover foto ${file.name}`}>Remover</button>
  </figure>;
}
