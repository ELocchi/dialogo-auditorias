"use client";

import Image from "next/image";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
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

function isRequiredPhotoMissing(criterion: Criterion, response: ItemResponse): boolean {
  if (criterion.verificationRule === "Dividido pela quantidade verificada") {
    return response.checks?.some((check) => check.compliant === false && !check.photos?.length) === true;
  }
  return (response.answer === "0" || response.answer === "5" || response.answer === "Não conforme") && !response.photos?.length;
}

export function NewAudit({ model, criteria, activeIndex, setActiveIndex, drafts, updateDraft, onFinish, details, workName = "Residencial Horizonte · Guarulhos", responseKey = model, readOnly = false, showWeights = true }: NewAuditProps) {
  const [selectedItemOpen, setSelectedItemOpen] = useState(false);
  const [itemPhotos, setItemPhotos] = useState<Record<string, File[]>>({});
  const [photoTarget, setPhotoTarget] = useState("item");
  const photoInput = useRef<HTMLInputElement>(null);
  const criterion = criteria[activeIndex] ?? criteria[0];
  const response = criterion ? getItemResponse(drafts, responseKey, criterion) : { note: "" };
  const security = model.startsWith("Segurança");
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
      <ItemPicker key={responseKey} id={pickerId} model={responseKey} criteria={criteria} drafts={drafts} activeId={selectedItemOpen ? criterion?.id : undefined} showWeights={showWeights} security={security} onSelect={(index) => {
        if (selectedItemOpen && index === activeIndex) setSelectedItemOpen(false);
        else { setActiveIndex(index); setSelectedItemOpen(true); }
      }} />

      {selectedItemOpen && criterion ? <div className="question-content">
        <div className="question-group-heading">
          <span className="question-group-number">{getGroupHeading(criterion.group).number}</span>
          <span className="question-group-title">{getGroupHeading(criterion.group).title}</span>
        </div>
        {criterion.subgroup && <div className="question-context"><span>{criterion.subgroup}</span></div>}
        <div className="question-title-row"><div className="question-title-content"><span className="question-code">{criterion.code}</span><h3>{getCriterionDisplayTitle(criterion)}</h3></div><div className={missingRequiredPhoto ? "question-score missing-photo" : "question-score"}><small>NOTA</small><strong>{awardedItemScore(criterion, response, security)?.toFixed(2).replace(".", ",") ?? "—"}</strong></div></div>
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

function ItemPicker({ id, model, criteria, drafts, activeId, showWeights, security, onSelect }: { id: string; model: string; criteria: Criterion[]; drafts: AuditDrafts; activeId?: string; showWeights: boolean; security: boolean; onSelect: (index: number) => void }) {
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
    const itemScore = awardedItemScore(criterion, answer, security);
    const missingRequiredPhoto = isRequiredPhotoMissing(criterion, answer);
    return <button type="button" key={criterion.id} className={criterion.id === activeId ? "item-result active" : "item-result"} aria-pressed={criterion.id === activeId} onClick={() => onSelect(index)}>
      <span><b>{criterion.code}</b> {getCriterionDisplayTitle(criterion)}</span>
      <span className="item-result-summary"><em className={answered ? "has-answer" : undefined}>{answered ? "Respondido" : "Não respondido"}</em>{showWeights && <strong className={missingRequiredPhoto ? "missing-photo-score" : undefined}>{scoreLabel(itemScore, answer.answer)}</strong>}</span>
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
            })}><span>{entries[0]?.criterion.code.slice(0, 5)} — {subgroup}</span><span className="tree-score">{scoreLabel(subgroupScore)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button></h5>
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
