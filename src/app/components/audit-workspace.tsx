"use client";

import Image from "next/image";
import { PDFDocument, PDFName, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { useId, useRef, useState } from "react";
import { useEffect } from "react";
import { getCriterionDisplayTitle, getCriterionWeight, qualityModels, type Criterion } from "@/domain/catalogs";
import type { AuditModelId } from "@/domain/operational-records";
import { referenceDocuments } from "@/domain/reference-documents";
import { ReferenceDocumentViewer } from "./reference-document-viewer";
import { CatalogEditorPanel } from "./catalog-editor-panel";
import previewStyles from "./catalog-preview-control.module.css";
import { catalogVersion, type CatalogSnapshot } from "@/lib/catalogs/contracts";
import {
  calculateAuditFinalScore,
  calculateSecurityFinalScore,
  calculateSecurityGroupScore,
  getAdjacentIndex,
  getItemResponse,
  getResponseLabel,
  type AuditDrafts,
  type DraftAnswer,
  type ItemResponse,
} from "@/domain/audit-draft";

const securityModel = "Segurança — IT.07 rev. 02";
const models = [securityModel, ...qualityModels.map((item) => item.name)];

function getGroupHeading(group: string) {
  const match = group.match(/^([^\s.—–-]+)\s*(?:\.|—|–|-)\s*(.+)$/);
  return {
    number: match?.[1] ?? group,
    title: (match?.[2] ?? group).toLocaleUpperCase("pt-BR"),
  };
}

function getSubgroupHeading(item: Criterion) {
  const match = item.subgroup.match(/^([\d.]+)\s*(?:—|–|-)\s*(.+)$/);
  return { code: match?.[1] ?? item.code.split(".").slice(0, -1).join("."), title: match?.[2] ?? item.subgroup };
}

type CatalogProps = {
  model: string;
  setModel: (model: string) => void;
  query: string;
  setQuery: (query: string) => void;
  criteria: Criterion[];
  showItemList?: boolean;
  allowedModels?: readonly string[];
  showWeights?: boolean;
  showReferenceDocuments?: boolean;
  embedded?: boolean;
  catalogs?: CatalogSnapshot;
  actorId?: string;
  onCatalogsSaved?: (snapshot: CatalogSnapshot) => void;
};

export function Catalog({ model, setModel, query, setQuery, criteria, showItemList = true, allowedModels = models, showWeights = true, showReferenceDocuments = false, embedded = false, catalogs, actorId, onCatalogsSaved }: CatalogProps) {
  const [visible, setVisible] = useState({ key: "", count: 20 });
  const resultKey = JSON.stringify([model, query]);
  const visibleCount = visible.key === resultKey ? visible.count : 20;
  const shown = Math.min(visibleCount, criteria.length);
  const searchId = useId();
  const editorTrigger = useRef<HTMLButtonElement>(null);
  const [editingId, setEditingId] = useState<AuditModelId | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const selectedDocument = Object.values(referenceDocuments).find((entry) => entry.catalogName === model);
  const selectedVersion = selectedDocument && catalogs ? catalogVersion(catalogs, selectedDocument.id) : undefined;

  return <>
    <div className={embedded ? "panel-heading" : "page-intro"}>
      <div>
        {embedded ? <h3>Roteiros</h3> : <h2>Roteiro de auditoria</h2>}
      </div>
      {showItemList && <span className="catalog-total"><strong>{criteria.length}</strong> quesitos{query ? " encontrados" : " no roteiro"}</span>}
    </div>

    <div className="model-tabs" role="group" aria-label="Modelo do roteiro">
      {allowedModels.map((item) => {
        const security = item.startsWith("Segurança");
        const document = Object.values(referenceDocuments).find((entry) => entry.catalogName === item);
        const reference = showReferenceDocuments ? document : undefined;
        const name = security ? "Segurança do Trabalho" : item;
        const editable = !!reference && !!catalogs && !!actorId && !!onCatalogsSaved;
        return <div key={item} className={`model-card ${previewStyles.card}${editable ? ` editable ${previewStyles.editable}` : ""}${reference && model === item ? ` ${previewStyles.selected}` : ""}`}><button
          type="button"
          className={`${model === item ? "model-tab active" : "model-tab"} ${previewStyles.modelButton}`}
          aria-pressed={model === item}
          aria-label={reference ? `Selecionar roteiro: ${name}` : undefined}
          onClick={() => { setModel(item); setEditingId(null); setPreviewOpen(false); }}
        >
          <span>{name}</span>
        </button>{reference && model === item && !editingId && <button type="button" className={previewStyles.button} aria-expanded={previewOpen} aria-controls="catalog-reference" onClick={() => setPreviewOpen(!previewOpen)}>{previewOpen ? "Ocultar prévia" : "Mostrar prévia"}</button>}{editable && <button type="button" className="model-edit" disabled={editingId !== null} aria-label={`Editar roteiro: ${name}`} title="Editar itens ou enviar nova revisão" aria-controls="catalog-editor" onClick={(event) => { editorTrigger.current = event.currentTarget; setModel(item); setPreviewOpen(false); setEditingId(reference.id); }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 3 5 5M4 15 16 3a2 2 0 0 1 5 5L9 20l-6 1 1-6ZM4 15l5 5" /></svg>
        </button>}</div>;
      })}
    </div>

    {showReferenceDocuments && selectedDocument && previewOpen && !editingId && <ReferenceDocumentViewer key={`${selectedDocument.id}:${selectedVersion?.id ?? "bundled"}`} modelId={selectedDocument.id} revisionId={selectedVersion?.id} revisionLabel={selectedVersion?.label} />}

    {editingId && catalogs && actorId && onCatalogsSaved && <CatalogEditorPanel key={editingId} version={catalogVersion(catalogs, editingId)} available={catalogs.available} setupPending={catalogs.setupPending} actorId={actorId} onSaved={onCatalogsSaved} onClose={() => { setEditingId(null); requestAnimationFrame(() => editorTrigger.current?.focus()); }} />}

    {catalogs && !catalogs.available && !catalogs.setupPending && !editingId && <p className="source-note" role="status">Não foi possível consultar as revisões atuais. Atualize a página para tentar novamente.</p>}

    {showItemList && <>
    <div className="catalog-toolbar">
      <label htmlFor={searchId} className="catalog-search">
        <span>BUSCAR QUESITO</span>
        <span className="search-field">
          <SearchIcon />
          <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código, grupo ou texto do quesito" />
        </span>
      </label>
      <p className="catalog-count" role="status">Exibindo <strong>{shown}</strong> de <strong>{criteria.length}</strong> quesitos</p>
    </div>

    {criteria.length > 0 ? <>
      <div className="criterion-list">
        {criteria.slice(0, visibleCount).map((item) => <CriterionRow key={item.id} item={item} showWeights={showWeights} />)}
      </div>
      {shown < criteria.length && <div className="catalog-more">
        <button type="button" className="secondary" onClick={() => setVisible({ key: resultKey, count: visibleCount + 20 })}>
          Mostrar mais {Math.min(20, criteria.length - shown)} quesitos
        </button>
        <span>{criteria.length - shown} quesitos restantes</span>
      </div>}
    </> : <div className="catalog-empty">
      <SearchIcon />
      <h3>Nenhum quesito encontrado</h3>
      <p>Experimente outro código, grupo ou trecho do texto.</p>
      {query && <button type="button" className="secondary" onClick={() => setQuery("")}>Limpar busca</button>}
    </div>}
    </>}
  </>;
}

function CriterionRow({ item, showWeights }: { item: Criterion; showWeights: boolean }) {
  const weight = getCriterionWeight(item);
  return <article className="criterion-row">
    <div className="criterion-code">{item.code}</div>
    <div className="criterion-body">
      <p className="criterion-group">{item.group}{item.subgroup && ` · ${item.subgroup}`}</p>
      <h3>{item.text}</h3>
      <p className="criterion-source">Fonte: {item.source} · {item.locator}</p>
      {item.verificationRule && <p className="criterion-detail"><strong>Critério de verificação:</strong> {item.verificationRule}</p>}
      {item.sourceNote && <p className="criterion-detail"><strong>Observação documental:</strong> {item.sourceNote}</p>}
      {item.interpretation && <p className="criterion-detail">{item.interpretation}</p>}
      <CriterionOrientations item={item} />
    </div>
    {showWeights && <div className="criterion-weight">
      <small>PESO {item.configuredWeight !== undefined ? "CONFIGURADO" : weight === null ? "PENDENTE" : "DOCUMENTADO"}</small>
      <strong>{weight === null ? "A definir" : weight.toFixed(2).replace(".", ",")}</strong>
    </div>}
  </article>;
}

type NewAuditProps = {
  model: string;
  criteria: Criterion[];
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  drafts: AuditDrafts;
  updateDraft: (response: ItemResponse) => void;
  onFinish?: () => void;
  details: { date: string; auditor: string };
  workName?: string;
  responseKey?: string;
  readOnly?: boolean;
  showWeights?: boolean;
  previousAudits?: readonly { id: string; date: string; drafts: AuditDrafts }[];
};

type AuditReviewProps = {
  model: string;
  modelId: string;
  workName: string;
  details: { date: string; auditor: string };
  criteria: Criterion[];
  drafts: AuditDrafts;
  onBack: () => void;
  onPublish: () => boolean;
};

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

async function createAuditReviewPdf({ model, modelId, workName, details, criteria, drafts }: Omit<AuditReviewProps, "onBack" | "onPublish">): Promise<Uint8Array> {
  if (modelId === "security-it07-r02") return createSecurityAuditReportPdf({ model, modelId, workName, details, criteria, drafts });
  const document = await PDFDocument.create();
  document.setTitle(`Relatório de auditoria - ${workName}`);
  document.setAuthor("Diálogo Engenharia");
  document.setSubject(model);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = await fetch("/logo-relatorio-orientativo.png").then(async (response) => response.ok ? document.embedPng(await response.arrayBuffer()) : null).catch(() => null);
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

async function createSecurityAuditReportPdf({ modelId, workName, details, criteria, drafts }: Omit<AuditReviewProps, "onBack" | "onPublish" | "model"> & { model?: string }): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`Relatório de Auditoria de Segurança - ${workName}`);
  document.setAuthor("Diálogo Engenharia");
  document.setSubject("Segurança do Trabalho");
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = await fetch("/logo-relatorio-orientativo.png").then(async (response) => response.ok ? document.embedPng(await response.arrayBuffer()) : null).catch(() => null);
  const width = 445.5, height = 631.5, left = 34, right = width - 33;
  const navy = rgb(.07, .24, .47), red = rgb(.86, .12, .18), muted = rgb(.39, .47, .57), lineColor = rgb(.87, .90, .94);
  const green = rgb(.10, .55, .34), orange = rgb(.85, .48, .07), gray = rgb(.40, .46, .54);
  const pages: PDFPage[] = [];
  const summaryLinks: { source: PDFPage; itemId: string; rect: [number, number, number, number] }[] = [];
  const detailPages = new Map<string, { page: PDFPage; y: number }>();
  const addPage = () => { const page = document.addPage([width, height]); pages.push(page); return page; };
  const writeWrapped = (page: PDFPage, text: string, x: number, y: number, maxWidth: number, size = 8, font = regular, color = navy, leading = size + 3) => {
    const lines = wrapPdfText(text || "—", font, size, maxWidth);
    lines.forEach((value, index) => page.drawText(value, { x, y: y - index * leading, size, font, color }));
    return y - lines.length * leading;
  };
  const drawLabel = (page: PDFPage, value: string, x: number, y: number) => page.drawText(value, { x, y, size: 5.5, font: bold, color: muted });
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
  const cover = addPage();
  if (logo) cover.drawImage(logo, { x: left, y: 554, width: 93, height: 36 });
  cover.drawText("DIÁLOGO AUDITORIAS", { x: right - 75, y: 578, size: 5.5, font: bold, color: navy });
  cover.drawText("RELATÓRIO TÉCNICO", { x: right - 62, y: 570, size: 4.5, font: regular, color: muted });
  cover.drawLine({ start: { x: left, y: 548 }, end: { x: right, y: 548 }, thickness: .6, color: navy });
  cover.drawLine({ start: { x: left, y: 543 }, end: { x: right, y: 543 }, thickness: 1.3, color: red });
  cover.drawText("RELATÓRIO DE AUDITORIA", { x: left, y: 422, size: 6, font: bold, color: muted });
  cover.drawText("Segurança do", { x: left, y: 385, size: 18, font: bold, color: navy });
  cover.drawText("Trabalho", { x: left, y: 361, size: 18, font: bold, color: navy });
  cover.drawLine({ start: { x: left, y: 335 }, end: { x: left + 31, y: 335 }, thickness: 2, color: red });
  drawLabel(cover, "OBRA AUDITADA", left, 292);
  writeWrapped(cover, workName, left, 270, right - left, 14, bold, navy, 17);
  drawLabel(cover, "IDENTIFICAÇÃO", left, 247);
  cover.drawText("Auditoria de Segurança do Trabalho", { x: left, y: 235, size: 6.5, font: regular, color: muted });
  cover.drawLine({ start: { x: left, y: 205 }, end: { x: right, y: 205 }, thickness: .5, color: lineColor });
  const finalScore = calculateAuditFinalScore(criteria, drafts, modelId);
  const coverFields = [["DATA DA AUDITORIA", displayAuditDate(details.date)], ["AUDITOR RESPONSÁVEL", details.auditor], ["NOTA FINAL", finalScore?.toFixed(2).replace(".", ",") ?? "—"]] as const;
  coverFields.forEach(([label, value], index) => { const x = left + index * 126; drawLabel(cover, label, x, 184); writeWrapped(cover, value, x, 166, 112, 8, index === 2 ? bold : regular, navy, 10); });
  cover.drawLine({ start: { x: left, y: 143 }, end: { x: right, y: 143 }, thickness: .5, color: lineColor });

  const groups = criteria.reduce<Record<string, Criterion[]>>((result, criterion) => { (result[criterion.group] ??= []).push(criterion); return result; }, {});
  const drawSummaryTitle = (page: PDFPage) => page.drawText("SUMÁRIO", { x: left, y: 514, size: 13, font: bold, color: navy });
  let summary = addPage(), summaryY = 486;
  drawSummaryTitle(summary);
  const startSummaryPage = () => { summary = addPage(); summaryY = 510; };
  for (const [group, items] of Object.entries(groups)) {
    if (summaryY < 82) startSummaryPage();
    const heading = getGroupHeading(group);
    summary.drawText(heading.number, { x: left, y: summaryY, size: 13, font: bold, color: navy });
    summary.drawText(heading.title, { x: left + 31, y: summaryY + 1, size: 8.5, font: bold, color: navy });
    const groupResult = calculateSecurityGroupScore(items, drafts, modelId);
    summary.drawText(groupResult === null ? "—" : groupResult.toFixed(1).replace(".", ","), { x: right - 19, y: summaryY, size: 8, font: bold, color: navy });
    summaryY -= 18;
    const summarySubgroups = items.reduce<Record<string, Criterion[]>>((result, item) => {
      (result[item.subgroup || "Itens do grupo"] ??= []).push(item);
      return result;
    }, {});
    for (const subgroupItems of Object.values(summarySubgroups)) {
      if (summaryY < 68) startSummaryPage();
      const subgroupScore = calculateSecurityGroupScore(subgroupItems, drafts, modelId);
      summary.drawRectangle({ x: left + 8, y: summaryY - 5, width: right - left - 8, height: 17, color: rgb(.94, .96, .98) });
      const subgroupHeading = getSubgroupHeading(subgroupItems[0]);
      summaryY = writeWrapped(summary, `${subgroupHeading.code}  ${subgroupHeading.title}`, left + 14, summaryY, right - left - 72, 7.2, bold, navy, 9);
      const subgroupScoreLabel = subgroupScore === null ? "—" : subgroupScore.toFixed(1).replace(".", ",");
      summary.drawText(subgroupScoreLabel, { x: right - bold.widthOfTextAtSize(subgroupScoreLabel, 7), y: summaryY + 9, size: 7, font: bold, color: navy });
      summaryY -= 5;
      for (const item of subgroupItems) {
        if (summaryY < 52) startSummaryPage();
        const response = getItemResponse(drafts, modelId, item);
        const itemTop = summaryY + 8;
        summaryY = writeWrapped(summary, `${item.code}  ${getCriterionDisplayTitle(item)}`, left + 20, summaryY, right - left - 60, 6.8, regular, navy, 9);
        summaryLinks.push({ source: summary, itemId: item.id, rect: [left + 16, summaryY, right, itemTop] });
        drawStatus(summary, response, right - 15, summaryY + 8, .75);
        summary.drawLine({ start: { x: left + 20, y: summaryY + 2 }, end: { x: right, y: summaryY + 2 }, thickness: .35, color: lineColor });
        summaryY -= 7;
      }
      summaryY -= 3;
    }
    summaryY -= 8;
  }

  const detailTop = 510, detailBottom = 52, detailWidth = right - left;
  const sentenceCase = (value: string) => {
    const normalized = value.trim().toLocaleLowerCase("pt-BR");
    return normalized ? normalized[0].toLocaleUpperCase("pt-BR") + normalized.slice(1) : normalized;
  };
  const detailLayout = (item: Criterion, response: ItemResponse, showGroup: boolean, showSubgroup: boolean) => {
    const analysis = item.analysisCriterion ?? (item.orientations.map((orientation) => orientation.text).join(" ") || "Não informado.");
    const title = wrapPdfText(sentenceCase(getCriterionDisplayTitle(item)), bold, 8, detailWidth - 66);
    const description = wrapPdfText(item.text || "—", regular, 6.2, detailWidth);
    const analysisLines = wrapPdfText(analysis, regular, 6.2, detailWidth);
    const observations = wrapPdfText(response.note || "Sem observações registradas.", regular, 6.2, detailWidth);
    const photos = (response.photos ?? []).slice(0, 3);
    const photoHeight = photos.length ? 49 : 13;
    const height = (showGroup ? 30 : 0) + (showSubgroup && item.subgroup ? 24 : 0) + Math.max(11, title.length * 9) + 12
      + description.length * 7.8 + 11 + analysisLines.length * 7.8 + 11
      + observations.length * 7.8 + 13 + photoHeight + 18;
    return { analysis, title, description, analysisLines, observations, photos, photoHeight, height, showGroup, showSubgroup };
  };
  const drawDetailItem = (page: PDFPage, group: string, groupItems: Criterion[], item: Criterion, response: ItemResponse,
    layout: ReturnType<typeof detailLayout>, top: number) => {
    let cursor = top;
    if (layout.showGroup) {
      const heading = getGroupHeading(group);
      const groupScore = calculateSecurityGroupScore(groupItems, drafts, modelId);
      drawRoundedCode(page, heading.number, left, cursor - 8, 24, 21, 9.5, navy, rgb(1, 1, 1));
      page.drawText(heading.title, { x: left + 34, y: cursor, size: 10.5, font: bold, color: navy });
      const titleWidth = Math.min(detailWidth - 80, bold.widthOfTextAtSize(heading.title, 10.5));
      page.drawLine({ start: { x: left + 34, y: cursor - 7 }, end: { x: left + 34 + titleWidth, y: cursor - 7 }, thickness: 1.6, color: red });
      const groupScoreLabel = groupScore === null ? "—" : groupScore.toFixed(1).replace(".", ",");
      page.drawText(groupScoreLabel, { x: right - bold.widthOfTextAtSize(groupScoreLabel, 8), y: cursor, size: 8, font: bold, color: navy });
      cursor -= 30;
    }
    if (layout.showSubgroup && item.subgroup) {
      const subgroup = getSubgroupHeading(item);
      drawRoundedCode(page, subgroup.code, left, cursor - 6, 32, 17, 6.8, red, rgb(1, 1, 1));
      page.drawText(sentenceCase(subgroup.title), { x: left + 41, y: cursor, size: 8.5, font: bold, color: navy });
      cursor -= 24;
    }
    drawRoundedCode(page, item.code, left, cursor - 6, 43, 17, 6.8, rgb(.93, .95, .98), navy);
    layout.title.forEach((value, index) => page.drawText(value, { x: left + 52, y: cursor - index * 9, size: 8, font: bold, color: navy }));
    drawStatus(page, response, right - 11, cursor - 1, .85);
    cursor -= Math.max(11, layout.title.length * 9) + 7;
    const section = (label: string, lines: string[]) => {
      drawLabel(page, label, left, cursor);
      cursor -= 9;
      lines.forEach((value) => { page.drawText(value, { x: left, y: cursor, size: 6.2, font: regular, color: muted }); cursor -= 7.8; });
      cursor -= 3;
    };
    section("DESCRIÇÃO", layout.description);
    section("CRITÉRIO DE ANÁLISE", layout.analysisLines);
    section("OBSERVAÇÕES", layout.observations);
    drawLabel(page, "EVIDÊNCIAS FOTOGRÁFICAS", left, cursor);
    cursor -= 9;
    if (layout.photos.length) {
      const gap = 8;
      const boxWidth = (detailWidth - gap * (layout.photos.length - 1)) / layout.photos.length;
      const boxHeight = layout.photoHeight - 4;
      layout.photos.forEach((name, index) => {
        const boxX = left + index * (boxWidth + gap);
        page.drawRectangle({ x: boxX, y: cursor - boxHeight, width: boxWidth, height: boxHeight, borderWidth: .5, borderColor: lineColor, color: rgb(.97, .98, .99) });
        page.drawText(`FOTO ${String(index + 1).padStart(2, "0")}`, { x: boxX + 5, y: cursor - 11, size: 5.2, font: bold, color: muted });
        const nameLines = wrapPdfText(name, regular, 4.6, boxWidth - 10).slice(0, 3);
        nameLines.forEach((value, lineIndex) => page.drawText(value, { x: boxX + 5, y: cursor - 21 - lineIndex * 5.7, size: 4.6, font: regular, color: muted }));
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
      let showSubgroup = showGroup || previousDetailSubgroup !== item.subgroup;
      let layout = detailLayout(item, response, showGroup, showSubgroup);
      if (!detailPage || itemsOnDetailPage >= 3 || detailY - layout.height < detailBottom) {
        detailPage = addPage();
        detailY = detailTop;
        itemsOnDetailPage = 0;
        previousDetailGroup = "";
        previousDetailSubgroup = "";
        showGroup = true;
        showSubgroup = true;
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
  annotations.forEach((references, source) => source.node.set(PDFName.of("Annots"), document.context.obj(references)));

  const date = displayAuditDate(details.date);
  pages.forEach((page, index) => {
    if (index > 0) {
      if (logo) page.drawImage(logo, { x: left, y: 558, width: 73, height: 28 });
      page.drawText("Segurança do Trabalho", { x: 119, y: 568, size: 8.2, font: bold, color: navy });
      drawLabel(page, "PROCESSO", 245, 581);
      page.drawText("RELATÓRIO DE AUDITORIA", { x: 245, y: 561, size: 7.8, font: bold, color: navy });
      drawLabel(page, "DATA", 370, 581);
      page.drawText(date, { x: 370, y: 561, size: 7, font: bold, color: navy });
      page.drawLine({ start: { x: left, y: 545 }, end: { x: right, y: 545 }, thickness: .6, color: navy });
      page.drawLine({ start: { x: left, y: 540 }, end: { x: right, y: 540 }, thickness: 1.3, color: red });
    }
    page.drawLine({ start: { x: left, y: 34 }, end: { x: right, y: 34 }, thickness: .45, color: lineColor });
    page.drawText("Diálogo Auditorias", { x: left, y: 20, size: 5, font: regular, color: muted });
    const center = index === 0 ? "Abrir sumário" : index === 1 ? "Sumário" : "Voltar ao sumário";
    page.drawText(center, { x: width / 2 - regular.widthOfTextAtSize(center, 5) / 2, y: 20, size: 5, font: regular, color: muted });
    const pageNumber = `${String(index + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`;
    page.drawText(pageNumber, { x: right - regular.widthOfTextAtSize(pageNumber, 5), y: 20, size: 5, font: regular, color: index === 0 ? red : muted });
  });
  return document.save();
}

function displayAuditDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function AuditReview({ model, modelId, workName, details, criteria, drafts, onBack, onPublish }: AuditReviewProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(criteria.map((criterion) => criterion.group)));
  const [published, setPublished] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState("");
  const finalScore = calculateAuditFinalScore(criteria, drafts, modelId);
  const security = modelId === "security-it07-r02";
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    void createAuditReviewPdf({ model, modelId, workName, details, criteria, drafts }).then((bytes) => {
      if (cancelled) return;
      url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" }));
      setPdfUrl(url);
    }).catch(() => { if (!cancelled) setPdfError("Não foi possível gerar a prévia do PDF."); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [model, modelId, workName, details, criteria, drafts]);
  const grouped = criteria.reduce<Record<string, Criterion[]>>((groups, criterion) => {
    (groups[criterion.group] ??= []).push(criterion);
    return groups;
  }, {});
  return <section className="audit-review" aria-labelledby="audit-review-title">
    <header className="audit-review-heading">
      <div><p className="kicker">REVISÃO DO RELATÓRIO</p><h2 id="audit-review-title">Conferir antes de publicar</h2><p>Revise os resultados preenchidos antes da publicação.</p></div>
      <div className="audit-review-final-score"><small>NOTA FINAL</small><strong>{finalScore?.toFixed(2).replace(".", ",") ?? "—"}</strong></div>
    </header>
    <div className="audit-review-reference">
      <div><small>OBRA</small><strong>{workName}</strong></div>
      <div><small>DATA DA AUDITORIA</small><strong>{displayAuditDate(details.date)}</strong></div>
      <div><small>MODELO</small><strong>{model}</strong></div>
      <div><small>AUDITOR RESPONSÁVEL</small><strong>{details.auditor}</strong></div>
    </div>
    <div className="audit-review-actions">
      <button type="button" className="secondary" disabled={published} onClick={onBack}>Voltar ao preenchimento</button>
      <button type="button" className="primary" disabled={!pdfUrl || published} onClick={() => { if (onPublish()) setPublished(true); }}>{published ? "Auditoria publicada" : pdfUrl ? "Publicar auditoria" : "Gerando prévia…"}</button>
    </div>
    <div className="audit-review-groups">
      {Object.entries(grouped).map(([group, items]) => {
        const collapsed = collapsedGroups.has(group);
        const securityPerformance = security ? calculateSecurityGroupScore(items, drafts, modelId) : null;
        const groupScore = security
          ? securityPerformance === null ? null : securityPerformance * (items[0]?.groupWeight ?? 0)
          : items.reduce((total, item) => total + (awardedItemScore(item, getItemResponse(drafts, modelId, item), false) ?? 0), 0);
        return <section key={group}>
        <h3><button type="button" aria-expanded={!collapsed} onClick={() => setCollapsedGroups((current) => { const next = new Set(current); if (next.has(group)) next.delete(group); else next.add(group); return next; })}><span>{group}</span><strong>{scoreLabel(groupScore)}</strong><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button></h3>
        {!collapsed && <div>{items.map((item) => {
          const response = getItemResponse(drafts, modelId, item);
          const label = item.verificationRule === "Dividido pela quantidade verificada"
            ? `${response.checks?.filter((check) => check.compliant === true).length ?? 0} de ${response.checks?.length ?? 0} conformes`
            : getResponseLabel(response);
          const itemScore = awardedItemScore(item, response, security);
          return <article key={item.id}><span><b>{item.code}</b>{getCriterionDisplayTitle(item)}</span><span className="audit-review-item-result"><em>{label}</em><strong>{scoreLabel(itemScore, response.answer)}</strong></span></article>;
        })}</div>}
      </section>})}
    </div>
    {pdfError && <p className="audit-review-pdf-error" role="alert">{pdfError}</p>}
    {pdfUrl && <section className="audit-review-pdf"><div><h3>Prévia do relatório em PDF</h3><span><a className="secondary" href={pdfUrl} target="_blank" rel="noreferrer">Abrir PDF</a><a className="primary" href={pdfUrl} download={`Relatório de Auditoria - ${workName}.pdf`}>Baixar PDF</a></span></div><iframe src={pdfUrl} title="Prévia do relatório da auditoria em PDF" /></section>}
  </section>;
}

function awardedItemScore(criterion: Criterion, response: ItemResponse, security: boolean): number | null {
  if (security) return response.answer === "0" || response.answer === "5" || response.answer === "10" ? Number(response.answer) : null;
  const weight = getCriterionWeight(criterion);
  if (weight === null) return null;
  if (criterion.verificationRule === "Dividido pela quantidade verificada") {
    const verified = (response.checks ?? []).filter((check) => check.compliant !== null);
    return verified.length ? weight * verified.filter((check) => check.compliant).length / verified.length : null;
  }
  return response.answer === "Conforme" ? weight : response.answer === "Não conforme" ? 0 : null;
}

function scoreLabel(score: number | null, answer?: DraftAnswer): string {
  if (answer === "N/A") return "N/A";
  return score === null ? "--" : score.toFixed(2).replace(".", ",");
}

function verificationVisual(response: ItemResponse): { icon: string; label: string; tone: string } | null {
  if (response.answer === "0" || response.answer === "Não conforme") return { icon: "×", label: "Totalmente não conforme", tone: "noncompliant" };
  if (response.answer === "5") return { icon: "!", label: "Parcialmente não conforme", tone: "partial" };
  if (response.answer === "10" || response.answer === "Conforme") return { icon: "✓", label: "Conforme", tone: "compliant" };
  if (response.answer === "N/A") return { icon: "—", label: "Não aplicável", tone: "not-applicable" };
  return null;
}

function VerificationMark({ response, missingPhoto = false }: { response: ItemResponse; missingPhoto?: boolean }) {
  const visual = verificationVisual(response);
  return visual ? <span className={`verification-mark ${visual.tone}${missingPhoto ? " missing-photo" : ""}`} aria-label={visual.label} title={visual.label}>{visual.icon}</span>
    : <span className="verification-mark unanswered" aria-label="Não respondido" title="Não respondido">·</span>;
}

function previewAuditHistory(date: string, model: string, criteria: readonly Criterion[]): readonly { id: string; date: string; drafts: AuditDrafts }[] {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : new Date();
  const answers: DraftAnswer[] = model === "security-it07-r02"
    ? ["10", "10", "10", "5", "0", "N/A"]
    : ["Conforme", "Conforme", "Conforme", "Não conforme", "N/A"];
  return [1, 2, 3].map((monthsAgo) => {
    const previous = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - monthsAgo, Math.min(base.getUTCDate(), 28), 12));
    const previousDate = previous.toISOString().slice(0, 10);
    const responses = Object.fromEntries(criteria.map((criterion, index) => {
      const seed = [...criterion.id].reduce((total, character) => total + character.charCodeAt(0), monthsAgo * 17 + index);
      return [criterion.id, { answer: answers[seed % answers.length], note: "" } satisfies ItemResponse];
    }));
    return { id: `preview-${previousDate}`, date: previousDate, drafts: { [model]: responses } };
  });
}

function isRequiredPhotoMissing(criterion: Criterion, response: ItemResponse): boolean {
  if (criterion.verificationRule === "Dividido pela quantidade verificada") {
    return response.checks?.some((check) => check.compliant === false && !check.photos?.length) === true;
  }
  return (response.answer === "0" || response.answer === "5" || response.answer === "Não conforme") && !response.photos?.length;
}

export function NewAudit({ model, criteria, activeIndex, setActiveIndex, drafts, updateDraft, onFinish, details, workName = "Residencial Horizonte · Guarulhos", responseKey = model, readOnly = false, previousAudits = [] }: NewAuditProps) {
  const [selectedItemOpen, setSelectedItemOpen] = useState(false);
  const [itemPhotos, setItemPhotos] = useState<Record<string, File[]>>({});
  const [photoTarget, setPhotoTarget] = useState("item");
  const photoInput = useRef<HTMLInputElement>(null);
  const criterion = criteria[activeIndex] ?? criteria[0];
  const response = criterion ? getItemResponse(drafts, responseKey, criterion) : { note: "" };
  const security = model.startsWith("Segurança");
  const displayedPreviousAudits = previousAudits.length
    ? [...previousAudits].sort((left, right) => right.date.localeCompare(left.date))
    : previewAuditHistory(details.date, responseKey, criteria);
  const securityAnalysisCriterion = security && criterion ? criterion.analysisCriterion ?? criterion.orientations.map((orientation) => orientation.text).join("\n\n") : undefined;
  const requiresEvidence = response.answer === "0" || response.answer === "5" || response.answer === "Não conforme" || response.checks?.some((check) => check.compliant === false);
  const missingRequiredPhoto = criterion ? isRequiredPhotoMissing(criterion, response) : false;
  const answered = criteria.filter((item) => {
    const itemResponse = getItemResponse(drafts, responseKey, item);
    return item.verificationRule === "Dividido pela quantidade verificada"
      ? !!itemResponse.checks?.length && itemResponse.checks.every((check) => check.compliant !== null)
      : itemResponse.answer !== undefined;
  }).length;
  const allItemsAnswered = criteria.length > 0 && answered === criteria.length;
  const progress = criteria.length ? Math.floor(answered / criteria.length * 1000) / 10 : 0;
  const awardedScores = criteria.map((item) => awardedItemScore(item, getItemResponse(drafts, responseKey, item), security)).filter((score): score is number => score !== null);
  const awardedTotal = awardedScores.reduce((total, score) => total + score, 0);
  const totalQualityWeight = criteria.reduce((total, item) => total + (getCriterionWeight(item) ?? 0), 0);
  const nonApplicableWeight = security ? 0 : criteria.reduce((total, item) => getItemResponse(drafts, responseKey, item).answer === "N/A" ? total + (getCriterionWeight(item) ?? 0) : total, 0);
  const applicableQualityWeight = totalQualityWeight - nonApplicableWeight;
  const partialScore = security
    ? calculateSecurityFinalScore(criteria, drafts, responseKey)
    : awardedScores.length && applicableQualityWeight > 0
      ? awardedTotal * totalQualityWeight / applicableQualityWeight
      : null;
  const pickerId = useId();
  const move = (direction: -1 | 1) => { setActiveIndex(getAdjacentIndex(activeIndex, criteria.length, direction)); setSelectedItemOpen(true); };
  const supportsNotApplicable = criterion?.verificationRule === "Conforme/Não Conforme/Não Aplicável" || criterion?.sourceNote?.toLocaleLowerCase("pt-BR").includes("não aplic") === true;
  const options: DraftAnswer[] = security ? ["0", "5", "10", "N/A"] : supportsNotApplicable ? ["Não conforme", "Conforme", "N/A"] : ["Não conforme", "Conforme"];
  const quantityChecks = criterion ? response.checks ?? [{ id: `${criterion.id}-1`, label: "Item verificado 1", compliant: null }] : [];

  return <>
    <div className="page-intro">
      <div>
        <p className="kicker">NOVA AUDITORIA · COLETA DE TESTE</p>
        <h2>{readOnly ? "Consultar auditoria" : "Preencher auditoria"}</h2>
        <p className="muted">{readOnly ? "Consulta autorizada, sem edição das respostas do auditor." : "Registre as verificações. Obra, responsável e versão pertencem a esta auditoria."}</p>
      </div>
      <span className="badge badge-amber">Rascunho nesta sessão</span>
    </div>

    <section className="audit-fill-panel" aria-label="Preenchimento da auditoria">
    <div className="form-panel audit-reference-panel" aria-label="Dados de referência da auditoria">
      <div className="audit-reference"><small>OBRA</small><p>{workName}</p></div>
      <div className="audit-reference"><small>DATA DA AUDITORIA</small><p>{displayAuditDate(details.date)}</p></div>
      <div className="audit-reference"><small>MODELO</small><p>{model}</p></div>
      <div className="audit-reference"><small>AUDITOR RESPONSÁVEL</small><p>{details.auditor}</p></div>
    </div>

    <section className="audit-progress" aria-label="Andamento do preenchimento">
      <div className="progress-description">
        <strong>Preenchimento da auditoria</strong>
        <span><b>{answered}</b> de {criteria.length} itens</span>
        <div className="progress-meter">
          <progress value={answered} max={criteria.length || 1} aria-label={`${progress.toLocaleString("pt-BR")}% dos itens preenchidos`} />
          <small className="progress-percentage">{progress.toLocaleString("pt-BR")}%</small>
        </div>
      </div>
      <div className="audit-score-actions">
        <div className="partial-score"><small>NOTA PARCIAL</small><strong>{partialScore === null ? "—" : partialScore.toFixed(2).replace(".", ",")}</strong></div>
        {allItemsAnswered && !readOnly && onFinish && <button type="button" className="primary" onClick={onFinish}>Fechar relatório</button>}
      </div>
    </section>

    <section className="question-card" aria-label="Quesito da auditoria">
      <ItemPicker key={responseKey} id={pickerId} model={responseKey} criteria={criteria} drafts={drafts} previousAudits={displayedPreviousAudits} activeId={selectedItemOpen ? criterion?.id : undefined} security={security} onSelect={(index) => {
        if (selectedItemOpen && index === activeIndex) setSelectedItemOpen(false);
        else { setActiveIndex(index); setSelectedItemOpen(true); }
      }} />

      {selectedItemOpen && criterion ? <div className="question-content">
        <div className="question-group-heading">
          <span className="question-group-number">{getGroupHeading(criterion.group).number}</span>
          <span className="question-group-title">{getGroupHeading(criterion.group).title}</span>
          <div className={`question-verification ${verificationVisual(response)?.tone ?? "unanswered"}${missingRequiredPhoto ? " missing-photo" : ""}`}><small>VERIFICAÇÃO</small><VerificationMark response={response} /></div>
        </div>
        {criterion.subgroup && <div className="question-context"><span className="question-code">{getSubgroupHeading(criterion).code}</span><span className="question-subgroup-title">{getSubgroupHeading(criterion).title}</span></div>}
        <div className="question-title-row"><div className="question-title-content"><span className="question-code">{criterion.code}</span><h3>{getCriterionDisplayTitle(criterion)}</h3></div></div>
        <p className="criterion-description"><strong>Descrição:</strong> {criterion.text}</p>
        {(security ? securityAnalysisCriterion : criterion.verificationRule) && <p className="criterion-detail"><strong>{security ? "Critério de análise" : "Critério de verificação"}:</strong> {security ? securityAnalysisCriterion : criterion.verificationRule}</p>}
        {criterion.interpretation && criterion.verificationRule !== "Dividido pela quantidade verificada" && <p className="criterion-detail">{criterion.interpretation}</p>}
        {!security && <CriterionOrientations key={criterion.id} item={criterion} />}

        <fieldset className="answer-fieldset" aria-label="Resultado da verificação" disabled={readOnly}>
          {criterion.verificationRule === "Dividido pela quantidade verificada" && !security ? <div className="quantity-checks">
            {quantityChecks.map((check, checkIndex) => <div className={check.compliant === false ? "quantity-check has-photo-action" : "quantity-check"} key={check.id}>
              <button type="button" className="remove-verified-item" aria-label={`Remover item verificado ${checkIndex + 1}`} onClick={() => {
                const checks = quantityChecks;
                updateDraft({ ...response, checks: checks.filter((entry) => entry.id !== check.id) });
              }}>×</button>
              <input aria-label={`Identificação do item verificado ${checkIndex + 1}`} value={check.label} onChange={(event) => {
                const checks = quantityChecks;
                updateDraft({ ...response, checks: checks.map((entry) => entry.id === check.id ? { ...entry, label: event.target.value } : entry) });
              }} />
              <button type="button" className={check.compliant === false ? "check-option noncompliant active" : "check-option noncompliant"} aria-label="Não conforme" aria-pressed={check.compliant === false} onClick={() => {
                const checks = quantityChecks;
                updateDraft({ ...response, checks: checks.map((entry) => entry.id === check.id ? { ...entry, compliant: false } : entry) });
              }}>×</button>
              <button type="button" className={check.compliant === true ? "check-option compliant active" : "check-option compliant"} aria-label="Conforme" aria-pressed={check.compliant === true} onClick={() => {
                const checks = quantityChecks;
                updateDraft({ ...response, checks: checks.map((entry) => entry.id === check.id ? { ...entry, compliant: true } : entry) });
              }}>✓</button>
              <span className="inline-photo-cell">{!(itemPhotos[`${criterion.id}:${check.id}`] ?? []).length && <button type="button" className="inline-photo" aria-label={`Adicionar foto ao item verificado ${checkIndex + 1}`} title="Adicionar foto" onClick={() => { setPhotoTarget(check.id); photoInput.current?.click(); }}>+</button>}<AuditPhotoThumbnail file={itemPhotos[`${criterion.id}:${check.id}`]?.at(-1)} onAdd={() => { setPhotoTarget(check.id); photoInput.current?.click(); }} onDelete={() => {
                const key = `${criterion.id}:${check.id}`;
                setItemPhotos((current) => ({ ...current, [key]: (current[key] ?? []).slice(0, -1) }));
                updateDraft({ ...response, checks: quantityChecks.map((entry) => entry.id === check.id ? { ...entry, photos: (entry.photos ?? []).slice(0, -1) } : entry) });
              }} /></span>
            </div>)}
            <button type="button" className="add-verified-item" aria-label="Adicionar item verificado" title="Adicionar item verificado" onClick={() => {
              const checks = quantityChecks;
              const number = checks.length + 1;
              updateDraft({ ...response, checks: [...checks, { id: `${criterion.id}-${number}`, label: `Item verificado ${number}`, compliant: null }] });
            }}>+</button>
          </div> : <div className={`answer-options${security ? " answer-options-security" : ` answer-options-quality${supportsNotApplicable ? " has-not-applicable" : ""}`}`}>
            {options.map((value) => {
              const label = value === "0" ? "Totalmente não conforme" : value === "5" ? "Parcialmente não conforme" : value === "10" ? "Conforme" : value === "N/A" ? "Não aplicável" : value;
              return <button type="button" key={value} className={response.answer === value ? `answer answer-${value.replace(/\W/g, "")} active` : `answer answer-${value.replace(/\W/g, "")}`} aria-pressed={response.answer === value} onClick={() => updateDraft({ ...response, answer: value })}>
                <span>{value === "0" || value === "Não conforme" ? "×" : value === "5" ? "!" : value === "10" || value === "Conforme" ? "✓" : "—"}</span><small>{label}</small>
              </button>;
            })}
            <span className="inline-photo-cell">{!(itemPhotos[`${criterion.id}:item`] ?? []).length && <button type="button" className="inline-photo" aria-label="Adicionar foto ao item" title="Adicionar foto" onClick={() => { setPhotoTarget("item"); photoInput.current?.click(); }}>+</button>}<AuditPhotoThumbnail file={itemPhotos[`${criterion.id}:item`]?.at(-1)} onAdd={() => { setPhotoTarget("item"); photoInput.current?.click(); }} onDelete={() => {
              const key = `${criterion.id}:item`;
              setItemPhotos((current) => ({ ...current, [key]: (current[key] ?? []).slice(0, -1) }));
              updateDraft({ ...response, photos: (response.photos ?? []).slice(0, -1) });
            }} /></span>
          </div>}
        </fieldset>

        {response.answer !== "N/A" && <label className="question-note">Observações{requiresEvidence ? " *" : ""}
          <textarea value={response.note} readOnly={readOnly} onChange={(event) => updateDraft({ ...response, note: event.target.value })} placeholder="Registre a observação da verificação…" required={requiresEvidence} />
        </label>}
        <input ref={photoInput} className="audit-photo-input" type="file" accept="image/jpeg,image/png" multiple hidden disabled={readOnly} onChange={(event) => {
            if (!criterion) return;
            const selected = Array.from(event.target.files ?? []);
            const key = `${criterion.id}:${photoTarget}`;
            setItemPhotos((current) => ({ ...current, [key]: [...(current[key] ?? []), ...selected] }));
            if (photoTarget === "item") updateDraft({ ...response, photos: [...(response.photos ?? []), ...selected.map((file) => file.name)] });
            else updateDraft({ ...response, checks: quantityChecks.map((entry) => entry.id === photoTarget ? { ...entry, photos: [...(entry.photos ?? []), ...selected.map((file) => file.name)] } : entry) });
            event.target.value = "";
          }} />

      </div> : criteria.length === 0 ? <div className="catalog-empty"><h3>Nenhum quesito disponível</h3><p>Selecione outro modelo de auditoria.</p></div> : null}
    </section>

    {selectedItemOpen && criterion && <div className="item-navigation-bottom">
      <button type="button" className="secondary" disabled={activeIndex === 0 || !criterion} onClick={() => move(-1)}><span aria-hidden="true">←</span> Anterior</button>
      <span>Item <strong>{criterion ? activeIndex + 1 : 0}</strong> de {criteria.length}</span>
      {activeIndex < criteria.length - 1 ? <button type="button" className="primary" onClick={() => move(1)}>Próximo item <span aria-hidden="true">→</span></button> : <button type="button" className="secondary" onClick={() => setSelectedItemOpen(false)}>Voltar ao resumo</button>}
    </div>}
    </section>
  </>;
}

function AuditPhotoThumbnail({ file, onAdd, onDelete }: { file?: File; onAdd: () => void; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const reader = new FileReader();
    reader.addEventListener("load", () => { if (!cancelled && typeof reader.result === "string") setUrl(reader.result); });
    reader.readAsDataURL(file);
    return () => { cancelled = true; if (reader.readyState === FileReader.LOADING) reader.abort(); };
  }, [file]);
  return file && url ? <span className="audit-photo-menu-wrap">
    <button type="button" className="audit-photo-thumbnail-button" onClick={() => setOpen(true)} onContextMenu={(event) => { event.preventDefault(); setMenuOpen(true); }} aria-label="Ampliar foto adicionada" aria-haspopup="menu" aria-expanded={menuOpen}>
      <Image className="audit-photo-thumbnail" src={url} alt="Pré-visualização da foto adicionada" width={44} height={44} unoptimized />
    </button>
    {menuOpen && <span className="audit-photo-context-menu" role="menu">
      <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setOpen(true); }}>Visualizar imagem</button>
      <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onAdd(); }}>Adicionar outra imagem</button>
      <button type="button" role="menuitem" className="delete" onClick={() => { setMenuOpen(false); onDelete(); }}>Excluir imagem</button>
    </span>}
    {open && <div className="audit-photo-modal" role="dialog" aria-modal="true" aria-label="Visualização da foto" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div><button type="button" onClick={() => setOpen(false)} aria-label="Fechar visualização">×</button><Image src={url} alt="Foto adicionada ampliada" width={1400} height={1050} unoptimized /></div></div>}
  </span> : null;
}

function ItemPicker({ id, model, criteria, drafts, previousAudits, activeId, security, onSelect }: { id: string; model: string; criteria: Criterion[]; drafts: AuditDrafts; previousAudits: readonly { id: string; date: string; drafts: AuditDrafts }[]; activeId?: string; security: boolean; onSelect: (index: number) => void }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(criteria.map((criterion) => criterion.group)));
  const [collapsedSubgroups, setCollapsedSubgroups] = useState<Set<string>>(() => new Set(criteria.filter((criterion) => criterion.subgroup).map((criterion) => `${criterion.group}:${criterion.subgroup}`)));
  const grouped = criteria.reduce<Record<string, Record<string, { criterion: Criterion; index: number }[]>>>((groups, criterion, index) => {
    const subgroup = criterion.subgroup || "Itens do grupo";
    ((groups[criterion.group] ??= {})[subgroup] ??= []).push({ criterion, index });
    return groups;
  }, {});
  const entriesScore = (entries: { criterion: Criterion; index: number }[]) => {
    if (security) return calculateSecurityGroupScore(entries.map(({ criterion }) => criterion), drafts, model);
    const scores = entries.map(({ criterion }) => awardedItemScore(criterion, getItemResponse(drafts, model, criterion), security)).filter((score): score is number => score !== null);
    return scores.length ? scores.reduce((total, score) => total + score, 0) : null;
  };
  const renderItem = ({ criterion, index }: { criterion: Criterion; index: number }) => {
    const answer = getItemResponse(drafts, model, criterion);
    const answered = answer.answer !== undefined || answer.checks?.some((check) => check.compliant !== null);
    const missingRequiredPhoto = isRequiredPhotoMissing(criterion, answer);
    return <button type="button" key={criterion.id} className={criterion.id === activeId ? "item-result active" : "item-result"} aria-pressed={criterion.id === activeId} onClick={() => onSelect(index)}>
      <span><b>{criterion.code}</b> {getCriterionDisplayTitle(criterion)}</span>
      <span className="item-result-summary">{!answered && <em>Não respondido</em>}<span className="audit-result-columns">{[...previousAudits].reverse().map((audit) => <span key={audit.id}><small>{displayAuditDate(audit.date)}</small><VerificationMark response={getItemResponse(audit.drafts, model, criterion)} /></span>)}<span><small>ATUAL</small><VerificationMark response={answer} missingPhoto={missingRequiredPhoto} /></span></span></span>
    </button>;
  };

  return <div className="item-picker" id={id}>
    <div className="item-picker-results">
      {Object.entries(grouped).map(([group, subgroups]) => {
        const collapsed = collapsedGroups.has(group);
        const groupEntries = Object.values(subgroups).flat();
        const groupScore = entriesScore(groupEntries);
        return <div className="item-picker-group" key={group}>
        <h4><button type="button" aria-expanded={!collapsed} onClick={() => setCollapsedGroups((current) => {
          const next = new Set(current);
          if (next.has(group)) next.delete(group); else next.add(group);
          return next;
        })}><span>{group}</span><span className="tree-score">{scoreLabel(groupScore)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button></h4>
        {!collapsed && (security ? Object.entries(subgroups).map(([subgroup, entries]) => {
          const subgroupKey = `${group}:${subgroup}`;
          const subgroupCollapsed = collapsedSubgroups.has(subgroupKey);
          const subgroupScore = entriesScore(entries);
          return <section className="item-picker-subgroup" key={subgroupKey}>
            <h5><button type="button" aria-expanded={!subgroupCollapsed} onClick={() => setCollapsedSubgroups((current) => {
              const next = new Set(current);
              if (next.has(subgroupKey)) next.delete(subgroupKey); else next.add(subgroupKey);
              return next;
            })}><span>{entries[0] ? `${getSubgroupHeading(entries[0].criterion).code} — ${getSubgroupHeading(entries[0].criterion).title}` : subgroup}</span><span className="tree-score">{scoreLabel(subgroupScore)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button></h5>
            {!subgroupCollapsed && entries.map(renderItem)}
          </section>;
        }) : groupEntries.map(renderItem))}
      </div>})}
      {Object.keys(grouped).length === 0 && <p className="picker-empty" role="status">Nenhum item disponível nesta auditoria.</p>}
    </div>
  </div>;
}

function CriterionOrientations({ item }: { item: Criterion }) {
  return item.orientations.length > 0 ? <details className="orientation-details">
    <summary>Orientações da fonte <span>({item.orientations.length})</span></summary>
    {item.orientations.map((orientation) => <div className="orientation" key={orientation.id}>
      <strong>{orientation.scope} · {orientation.id}</strong>
      <p>{orientation.text}</p>
      <small>Página{orientation.pages.length === 1 ? "" : "s"} {orientation.pages.join(", ")}</small>
    </div>)}
  </details> : null;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;
}
