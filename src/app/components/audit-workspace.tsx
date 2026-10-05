"use client";

import { AuditPhotoThumbnail } from "./audit-photo-thumbnail";
import { SafetyClosureDialog } from "./safety-closure-dialog";
import { safetyScore, toggleGroupNA, type SafetyClosure } from "@/domain/safety-audit";
import { generatePdf } from "@/lib/pdf/client";
import { awardedItemScore, scoreLabel, getGroupHeading, getSubgroupHeading, displayAuditDate } from "@/lib/pdf/audit-format";
import type { AuditPdfInput, PdfPhotoSource } from "@/lib/pdf/types";
import { memo, useCallback, useId, useMemo, useReducer, useRef, useState } from "react";
import { useEffect } from "react";
import { getCriterionDisplayTitle, getCriterionWeight, qualityModels, type Criterion } from "@/domain/catalogs";
import { fvsServices as bundledFvsServices, type FvsService } from "@/domain/fvs-services";
import type { AuditModelId } from "@/domain/operational-records";
import { referenceDocuments } from "@/domain/reference-documents";
import { CatalogEditorPanel } from "./catalog-editor-panel";
import { useAuditPhotoStore } from "./audit-photo-context";
import type { AuditPhotoStore } from "@/lib/audits/photo-store";
import type { AuditComparison } from "@/lib/audits/comparison-contracts";
import previewStyles from "./catalog-preview-control.module.css";
import { catalogVersion, type CatalogSnapshot } from "@/lib/catalogs/contracts";
import {
  calculateAuditFinalScore,
  calculateSecurityFinalScore,
  calculateSecurityGroupScore,
  getDraftCheckWeight,
  getAdjacentIndex,
  getItemResponse,
  getResponseLabel,
  type AuditDrafts,
  type DraftAnswer,
  type ItemResponse,
} from "@/domain/audit-draft";

const securityModel = "Segurança — IT.07 rev. 02";
const models = [securityModel, ...qualityModels.map((item) => item.name)];
type PreviousAudit = Pick<AuditComparison, "id" | "date" | "answers">;
const noPreviousAudits: readonly PreviousAudit[] = [];

function localTestEvidenceUrl(reference: string): string | null {
  if (/^\/api\/publications\/[a-f0-9-]{36}\/photo\?file=[a-f0-9]{64}\.jpg$/.test(reference)) return reference;
  if (/^https:\/\//.test(reference)) return reference;
  return /^p\d{2}-\d{2}\.png$/.test(reference)
    ? `/local-test-evidence/boulevard/${encodeURIComponent(reference)}`
    : null;
}

async function loadLocalTestEvidence(reference: string, signal: AbortSignal): Promise<File | null> {
  const url = localTestEvidenceUrl(reference);
  if (!url) return null;
  const result = await fetch(url, { cache: "no-store", signal });
  if (!result.ok) return null;
  const blob = await result.blob();
  return new File([blob], reference, { type: blob.type || "image/png" });
}

async function createTestEvidenceImage(label: string): Promise<ArrayBuffer> {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 640;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível criar a evidência de teste.");
  const gradient = context.createLinearGradient(0, 0, 960, 640);
  gradient.addColorStop(0, "#dce8f5");
  gradient.addColorStop(1, "#829bb7");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 960, 640);
  context.fillStyle = "#b8c8d8";
  context.fillRect(0, 390, 960, 250);
  context.fillStyle = "#f2f4f7";
  context.fillRect(105, 155, 520, 310);
  context.fillStyle = "#173f75";
  context.fillRect(105, 155, 520, 34);
  context.fillStyle = "#cf3540";
  context.fillRect(670, 215, 115, 250);
  context.strokeStyle = "#637a94";
  context.lineWidth = 12;
  context.strokeRect(145, 225, 175, 175);
  context.strokeRect(385, 225, 175, 175);
  context.fillStyle = "rgba(7, 28, 55, .82)";
  context.fillRect(0, 515, 960, 125);
  context.fillStyle = "white";
  context.font = "700 32px Arial";
  context.fillText("EVIDÊNCIA FOTOGRÁFICA DE TESTE", 38, 560);
  context.font = "22px Arial";
  const shortened = label.length > 72 ? `${label.slice(0, 69)}...` : label;
  context.fillText(shortened, 38, 603);
  return fetch(canvas.toDataURL("image/jpeg", .82)).then((response) => response.arrayBuffer());
}

async function prepareAuditPdfPhotos(input: AuditPdfInput, signal: AbortSignal, objectUrls: string[], photoStore: AuditPhotoStore): Promise<PdfPhotoSource[]> {
  const references = [...new Set(input.criteria.flatMap((criterion) => {
    const response = getItemResponse(input.drafts, input.modelId, criterion);
    return [...(response.photos ?? []), ...(response.checks ?? []).flatMap((check) => check.photos ?? [])];
  }))];
  const photos: PdfPhotoSource[] = [];
  for (const reference of references) {
    signal.throwIfAborted();
    let file: Blob | undefined = photoStore.get(reference);
    let url = localTestEvidenceUrl(reference) ?? undefined;
    if (!file && !url && /fictícia/i.test(reference)) {
      file = new Blob([await createTestEvidenceImage(reference)], { type: "image/jpeg" });
      signal.throwIfAborted();
    }
    if (file) {
      url = URL.createObjectURL(file);
      objectUrls.push(url);
    } else if (url) url = new URL(url, window.location.href).href;
    photos.push({ reference, name: reference, file, url });
  }
  return photos;
}

function usesPerCheckWeights(item: Criterion): boolean {
  return /\bfvs\b/i.test(`${item.title} ${item.text}`);
}

function isQuantitativeResponseComplete(item: Criterion, response: ItemResponse): boolean {
  const checks = response.checks ?? [];
  if (!checks.length) return false;
  return checks.every((check) => check.compliant !== null
    && check.label.trim().length > 0
    && (!usesPerCheckWeights(item) || getDraftCheckWeight(check) !== null));
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
        const downloadHref = reference ? `/api/reference-documents/${reference.id}?download=pdf` : "";
        return <div key={item} className={`model-card ${previewStyles.card}${editable ? ` editable ${previewStyles.editable}` : ""}${reference && model === item ? ` ${previewStyles.selected}` : ""}`}><button data-tooltip={reference ? `Selecionar roteiro: ${name}` : undefined}
          type="button"
          className={`${model === item ? "model-tab active" : "model-tab"} ${previewStyles.modelButton}`}
          aria-pressed={model === item}
          aria-label={reference ? `Selecionar roteiro: ${name}` : undefined}
          onClick={() => { setModel(item); setEditingId(null); }}
        >
          <span>{name}</span>
        </button>{reference && model === item && !editingId && <a className={previewStyles.button} href={downloadHref} download aria-label={`Baixar PDF: ${name}`} data-tooltip="Baixar PDF">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
        </a>}{editable && <button type="button" className="model-edit" disabled={editingId !== null} aria-label={`Editar roteiro: ${name}`} data-tooltip="Editar itens ou enviar nova revisão" aria-controls="catalog-editor" onClick={(event) => { editorTrigger.current = event.currentTarget; setModel(item); setEditingId(reference.id); }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 3 5 5M4 15 16 3a2 2 0 0 1 5 5L9 20l-6 1 1-6ZM4 15l5 5" /></svg>
        </button>}</div>;
      })}
    </div>

    {editingId && catalogs && actorId && onCatalogsSaved && <CatalogEditorPanel key={editingId} version={catalogVersion(catalogs, editingId)} fvsWeights={catalogs.fvsWeights} available={catalogs.available} setupPending={catalogs.setupPending} actorId={actorId} onSaved={onCatalogsSaved} onClose={() => { setEditingId(null); requestAnimationFrame(() => editorTrigger.current?.focus()); }} />}

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
  updateDraft: (response: ItemResponse) => boolean | void;
  onFinish?: (closure?: SafetyClosure) => void;
  safetyClosure?: SafetyClosure;
  onDraftsChange?: (drafts: AuditDrafts) => void;
  details: { date: string; auditor: string };
  workName?: string;
  responseKey?: string;
  readOnly?: boolean;
  showWeights?: boolean;
  previousAudits?: readonly PreviousAudit[];
  fvsServices?: readonly FvsService[];
};

type AuditReviewProps = {
  model: string;
  modelId: string;
  workName: string;
  details: { date: string; auditor: string };
  criteria: Criterion[];
  drafts: AuditDrafts;
  onBack: () => void;
  onPublish: () => boolean | Promise<boolean>;
  publishedReportUrl?: string;
  safetyClosure?: SafetyClosure;
};

export function AuditReview({ model, modelId, workName, details, criteria, drafts, onBack, onPublish, publishedReportUrl, safetyClosure }: AuditReviewProps) {
  const photoStore = useAuditPhotoStore();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(criteria.map((criterion) => criterion.group)));
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pdfResult, setPdfResult] = useState<{ key: string; url?: string; error?: string } | null>(null);
  // Agenda refreshes can recreate details, criteria and drafts with identical content.
  // Only a change to the report itself should cancel and regenerate the preview.
  const requestKey = JSON.stringify({ model, modelId, workName, details, criteria, safetyClosure, drafts: { [modelId]: drafts[modelId] ?? {} } } satisfies AuditPdfInput);
  const pdfUrl = published && publishedReportUrl ? publishedReportUrl : pdfResult?.key === requestKey ? pdfResult.url : undefined;
  const pdfError = pdfResult?.key === requestKey ? pdfResult.error : undefined;
  const scores = safetyScore(criteria, drafts, modelId, safetyClosure);
  const finalScore = modelId === "security-it07-r02" ? scores.final : calculateAuditFinalScore(criteria, drafts, modelId);
  const security = modelId === "security-it07-r02";
  useEffect(() => {
    const controller = new AbortController();
    const objectUrls: string[] = [];
    if (published && publishedReportUrl) return;
    const input = JSON.parse(requestKey) as AuditPdfInput;
    void prepareAuditPdfPhotos(input, controller.signal, objectUrls, photoStore).then((photos) => generatePdf({
      kind: "audit", input, photos, baseUrl: window.location.href,
    }, controller.signal)).then((bytes) => {
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" }));
      objectUrls.push(url);
      setPdfResult({ key: requestKey, url });
    }).catch(() => {
      if (!controller.signal.aborted) setPdfResult({ key: requestKey, error: "Não foi possível gerar a prévia do PDF." });
    });
    return () => { controller.abort(); objectUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [requestKey, photoStore, published, publishedReportUrl]);
  const grouped = criteria.reduce<Record<string, Criterion[]>>((groups, criterion) => {
    (groups[criterion.group] ??= []).push(criterion);
    return groups;
  }, {});
  return <section className="audit-review" aria-labelledby="audit-review-title">
    <header className="audit-review-heading">
      <div><p className="kicker">REVISÃO DO RELATÓRIO</p><h2 id="audit-review-title">Conferir antes de publicar</h2><p>Revise os resultados preenchidos antes da publicação.</p></div>
      <div className="audit-review-final-score"><small>NOTA FINAL</small><span className="audit-final-score-value"><strong>{finalScore?.toFixed(2).replace(".", ",") ?? "—"}</strong>{security && Boolean(safetyClosure?.accidents.length) && <svg className="audit-accident-alert" viewBox="0 0 24 24" role="img" aria-label="Acidentes registrados nesta auditoria"><title>Acidentes registrados nesta auditoria</title><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5" /><circle cx="12" cy="17.5" r=".8" /></svg>}</span></div>
    </header>
    {security && <section className="panel" aria-label="Composição da nota"><p>Nota bruta: <strong>{scores.raw?.toFixed(2).replace(".", ",") ?? "Sem itens aplicáveis"}</strong> · Penalidades: <strong>{scores.penalty.toFixed(2).replace(".", ",")}</strong></p><p>{safetyClosure?.hadAccidents ? `${safetyClosure.accidents.length} acidente(s) registrado(s)` : "Nenhum acidente declarado"}</p>{safetyClosure?.accidents.map((a, i) => <p key={i}>{displayAuditDate(a.date)} · {a.type === "leave" ? "Com afastamento" : "Comum"}<br />{a.event}<br />Justificativa: {a.justification}</p>)}</section>}
    <div className="audit-review-reference">
      <div><small>OBRA</small><strong>{workName}</strong></div>
      <div><small>DATA DA AUDITORIA</small><strong>{displayAuditDate(details.date)}</strong></div>
      <div><small>MODELO</small><strong>{model}</strong></div>
      <div><small>AUDITOR RESPONSÁVEL</small><strong>{details.auditor}</strong></div>
    </div>
    <div className="audit-review-actions">
      <button type="button" className="secondary" disabled={published || publishing} onClick={onBack}>Voltar ao preenchimento</button>
      <button type="button" className="primary" disabled={!pdfUrl || published || publishing} onClick={async () => { if (publishing) return; setPublishing(true); try { if (await onPublish()) setPublished(true); } finally { setPublishing(false); } }}>{published ? "Auditoria publicada" : publishing ? "Publicando…" : pdfUrl ? "Publicar auditoria" : "Gerando prévia…"}</button>
    </div>
    <div className="audit-review-groups">
      {Object.entries(grouped).map(([group, items]) => {
        const collapsed = collapsedGroups.has(group);
        const securityPerformance = security ? calculateSecurityGroupScore(items, drafts, modelId) : null;
        const groupScore = security
          ? securityPerformance === null ? null : securityPerformance
          : items.reduce((total, item) => total + (awardedItemScore(item, getItemResponse(drafts, modelId, item), false) ?? 0), 0);
        return <section key={group}>
        <h3><button type="button" aria-expanded={!collapsed} onClick={() => setCollapsedGroups((current) => { const next = new Set(current); if (next.has(group)) next.delete(group); else next.add(group); return next; })}><span>{group}</span><strong>{scoreLabel(groupScore)}</strong><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button></h3>
        {!collapsed && <div>{items.map((item) => {
          const response = getItemResponse(drafts, modelId, item);
          const label = item.verificationRule === "Dividido pela quantidade verificada"
            ? `${response.checks?.filter((check) => check.compliant === true).length ?? 0} de ${response.checks?.length ?? 0} conformes`
            : getResponseLabel(response);
          const itemScore = awardedItemScore(item, response, security);
          return <article key={item.id}><span><b>{item.code}</b>{getCriterionDisplayTitle(item)}{response.serious && <em className="audit-review-serious">Item grave</em>}</span><span className="audit-review-item-result"><em>{label}</em><strong>{scoreLabel(itemScore, response.answer)}</strong></span></article>;
        })}</div>}
      </section>})}
    </div>
    {pdfError && <p className="audit-review-pdf-error" role="alert">{pdfError}</p>}
    {pdfUrl && <section className="audit-review-pdf"><div><h3>Prévia do relatório em PDF</h3><span><a className="secondary" href={pdfUrl} target="_blank" rel="noreferrer">Abrir PDF em nova guia</a><a className="primary" href={pdfUrl} download={`Relatório de Auditoria - ${workName}.pdf`}>Baixar PDF</a></span></div><iframe src={pdfUrl} title="Prévia do relatório da auditoria em PDF" /></section>}
  </section>;
}

function verificationVisual(response: { answer?: string }): { icon: string; label: string; tone: string } | null {
  if (response.answer === "0" || response.answer === "Não conforme") return { icon: "×", label: "Totalmente não conforme", tone: "noncompliant" };
  if (response.answer === "5") return { icon: "!", label: "Parcialmente não conforme", tone: "partial" };
  if (response.answer === "10" || response.answer === "Conforme") return { icon: "✓", label: "Conforme", tone: "compliant" };
  if (response.answer === "N/A") return { icon: "—", label: "Não aplicável", tone: "not-applicable" };
  return null;
}

function VerificationMark({ response, missingPhoto = false }: { response: { answer?: string }; missingPhoto?: boolean }) {
  const visual = verificationVisual(response);
  return visual ? <span role="img" className={`verification-mark ${visual.tone}${missingPhoto ? " missing-photo" : ""}`} aria-label={visual.label} title={visual.label}>{visual.icon}</span>
    : <span role="img" className="verification-mark unanswered" aria-label="Não respondido" title="Não respondido">·</span>;
}

function previewAuditHistory(date: string, model: string, criteria: readonly Criterion[]): readonly PreviousAudit[] {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : new Date();
  const answers: DraftAnswer[] = model === "security-it07-r02"
    ? ["10", "10", "10", "5", "0", "N/A"]
    : ["Conforme", "Conforme", "Conforme", "Não conforme", "N/A"];
  return [1, 2, 3].map((monthsAgo) => {
    const previous = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - monthsAgo, Math.min(base.getUTCDate(), 28), 12));
    const previousDate = previous.toISOString().slice(0, 10);
    const responses = Object.fromEntries(criteria.map((criterion, index) => {
      const seed = [...criterion.id].reduce((total, character) => total + character.charCodeAt(0), monthsAgo * 17 + index);
      return [criterion.id, answers[seed % answers.length]];
    }));
    return { id: `preview-${previousDate}`, date: previousDate, answers: responses };
  });
}

function isRequiredPhotoMissing(criterion: Criterion, response: ItemResponse): boolean {
  if (criterion.verificationRule === "Dividido pela quantidade verificada") {
    return response.checks?.some((check) => check.compliant === false && !check.photos?.length) === true;
  }
  return (response.answer === "0" || response.answer === "5" || response.answer === "Não conforme") && !response.photos?.length;
}

export function NewAudit({ model, criteria, activeIndex, setActiveIndex, drafts, updateDraft, onFinish, onDraftsChange, safetyClosure, details, workName = "Residencial Horizonte · Guarulhos", responseKey = model, readOnly = false, previousAudits = noPreviousAudits, fvsServices = bundledFvsServices }: NewAuditProps) {
  const photoStore = useAuditPhotoStore();
  const [closing, setClosing] = useState(false);
  const [closureError, setClosureError] = useState("");
  const [selectedItemOpen, setSelectedItemOpen] = useState(false);
  const [, refreshPhotos] = useReducer((version: number) => version + 1, 0);
  const [photoTarget, setPhotoTarget] = useState("item");
  const photoInput = useRef<HTMLInputElement>(null);
  const criterion = criteria[activeIndex] ?? criteria[0];
  const response = criterion ? getItemResponse(drafts, responseKey, criterion) : { note: "" };
  const photoReferencesKey = JSON.stringify([...new Set([
    ...(response.photos ?? []), ...(response.checks ?? []).flatMap((check) => check.photos ?? []),
  ])]);
  useEffect(() => {
    const references = (JSON.parse(photoReferencesKey) as string[])
      .filter((reference) => !photoStore.get(reference) && localTestEvidenceUrl(reference));
    if (!references.length) return;
    const controller = new AbortController();
    void Promise.allSettled(references.map((reference) => photoStore.load(reference,
      (signal) => loadLocalTestEvidence(reference, signal), controller.signal))).then((files) => {
      if (!controller.signal.aborted && files.some((result) => result.status === "fulfilled" && result.value)) refreshPhotos();
    });
    return () => controller.abort();
  }, [photoReferencesKey, photoStore]);
  const security = model.startsWith("Segurança");
  const displayedPreviousAudits = useMemo(() => previousAudits.length
    ? [...previousAudits].sort((left, right) => right.date.localeCompare(left.date))
    : process.env.NODE_ENV === "development" ? previewAuditHistory(details.date, responseKey, criteria)
      : noPreviousAudits, [previousAudits, details.date, responseKey, criteria]);
  const selectItem = useCallback((index: number) => {
    if (selectedItemOpen && index === activeIndex) setSelectedItemOpen(false);
    else { setActiveIndex(index); setSelectedItemOpen(true); }
  }, [selectedItemOpen, activeIndex, setActiveIndex]);
  const securityAnalysisCriterion = security && criterion ? criterion.analysisCriterion ?? criterion.orientations.map((orientation) => orientation.text).join("\n\n") : undefined;
  const requiresEvidence = response.answer === "0" || response.answer === "5" || response.answer === "Não conforme" || response.checks?.some((check) => check.compliant === false);
  const missingRequiredPhoto = criterion ? isRequiredPhotoMissing(criterion, response) : false;
  const answered = criteria.filter((item) => {
    const itemResponse = getItemResponse(drafts, responseKey, item);
    return item.verificationRule === "Dividido pela quantidade verificada"
      ? isQuantitativeResponseComplete(item, itemResponse)
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
  const perCheckWeights = criterion ? usesPerCheckWeights(criterion) : false;
  const quantityChecks = criterion ? response.checks ?? [{ id: `${criterion.id}-1`, label: perCheckWeights ? "" : "Item verificado 1", compliant: null }] : [];

  return <>
    <div className="page-intro">
      <div>
        <h2>{readOnly ? "Consultar auditoria" : "Preencher auditoria"}</h2>
        {readOnly && <p className="muted">Consulta autorizada, sem edição das respostas do auditor.</p>}
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
        <span role="status"><b>{answered}</b> de {criteria.length} itens preenchidos</span>
        <div className="progress-meter">
          <progress value={answered} max={criteria.length || 1} aria-label={`${progress.toLocaleString("pt-BR")}% dos itens preenchidos`} />
          <small className="progress-percentage">{progress.toLocaleString("pt-BR")}%</small>
        </div>
      </div>
      <div className="audit-score-actions">
        <div className="partial-score"><small>NOTA PARCIAL</small><strong>{partialScore === null ? "—" : partialScore.toFixed(2).replace(".", ",")}</strong></div>
        {!readOnly && onFinish && <button type="button" className="primary" data-tooltip={security ? "Informar acidentes e conferir o relatório antes de publicar" : "Conferir o relatório antes de publicar"} disabled={!allItemsAnswered} onClick={() => { if (security) { const missing = criteria.find(c => isRequiredPhotoMissing(c, getItemResponse(drafts, responseKey, c))); if (missing) { setClosureError(`Adicione uma foto ao item ${missing.code}.`); return; } setClosureError(""); setClosing(true); } else onFinish(); }}>Revisar auditoria</button>}
      </div>
    </section>

    {closureError && <p role="alert">{closureError}</p>}
    {closing && <SafetyClosureDialog date={details.date} initial={safetyClosure} onCancel={() => setClosing(false)} onConfirm={value => { setClosing(false); onFinish?.(value); }} />}
    <section className="question-card" aria-label="Quesito da auditoria">
      <ItemPicker key={responseKey} id={pickerId} model={responseKey} criteria={criteria} drafts={drafts} previousAudits={displayedPreviousAudits} activeId={selectedItemOpen ? criterion?.id : undefined} security={security} onToggleGroup={!readOnly && onDraftsChange ? group => onDraftsChange(toggleGroupNA(drafts, responseKey, criteria, group)) : undefined} onSelect={selectItem} />

      {selectedItemOpen && criterion ? <div className="question-content">
        <div className={`question-group-heading${security ? " has-verification" : ""}`}>
          <span className="question-group-number">{getGroupHeading(criterion.group).number}</span>
          <span className="question-group-title">{getGroupHeading(criterion.group).title}</span>
          <div className="question-group-actions">
            <button type="button" className={`serious-item-button${response.serious ? " active" : ""}`} aria-label={`${response.serious ? "Desmarcar" : "Marcar"} item ${criterion.code} como grave`} data-tooltip={response.serious ? "Retirar a indicação de item grave" : "Marcar este item como grave"} aria-pressed={response.serious === true} disabled={readOnly} onClick={() => updateDraft({ ...response, serious: !response.serious })}>
              <svg viewBox="0 0 32 29" aria-hidden="true"><path d="M14.1 3.2a2.2 2.2 0 0 1 3.8 0l11.2 19.4a2.2 2.2 0 0 1-1.9 3.3H4.8a2.2 2.2 0 0 1-1.9-3.3L14.1 3.2Z" /><text x="16" y="21.2">!</text></svg>
            </button>
            {security && <div className={`question-verification ${verificationVisual(response)?.tone ?? "unanswered"}${missingRequiredPhoto ? " missing-photo" : ""}`}><small>VERIFICAÇÃO</small><VerificationMark response={response} /></div>}
          </div>
        </div>
        {criterion.subgroup && <div className="question-context"><span className="question-code">{getSubgroupHeading(criterion).code}</span><span className="question-subgroup-title">{getSubgroupHeading(criterion).title}</span></div>}
        <div className="question-title-row">
          <div className="question-title-content"><span className="question-code">{criterion.code}</span><h3>{getCriterionDisplayTitle(criterion)}</h3></div>
          {!security && <div className="question-title-actions"><strong className={`question-score-value${missingRequiredPhoto ? " missing-photo" : ""}`}>{scoreLabel(awardedItemScore(criterion, response, false), response.answer)}</strong></div>}
        </div>
        <p className="criterion-description"><strong>Descrição:</strong> {criterion.text}</p>
        {(security ? securityAnalysisCriterion : criterion.verificationRule) && <p className="criterion-detail"><strong>{security ? "Critério de análise" : "Critério de verificação"}:</strong> {security ? securityAnalysisCriterion : criterion.verificationRule}</p>}
        {criterion.interpretation && criterion.verificationRule !== "Dividido pela quantidade verificada" && <p className="criterion-detail">{criterion.interpretation}</p>}
        {!security && <CriterionOrientations key={criterion.id} item={criterion} />}

        <fieldset className="answer-fieldset" aria-label="Resultado da verificação" disabled={readOnly}>
          {criterion.verificationRule === "Dividido pela quantidade verificada" && !security ? <div className="quantity-checks">
            {quantityChecks.map((check, checkIndex) => <div className={`quantity-check${check.compliant === false ? " has-photo-action" : ""}${perCheckWeights ? " has-check-weight" : ""}`} key={check.id}>
              <button data-tooltip={`Remover a verificação ${checkIndex + 1} e suas respostas do item ${criterion.code}`} type="button" className="remove-verified-item" aria-label={`Remover verificação ${checkIndex + 1} do item ${criterion.code}`} onClick={(event) => {
                const field = event.currentTarget.closest(".quantity-checks");
                const checks = quantityChecks;
                updateDraft({ ...response, checks: checks.filter((entry) => entry.id !== check.id) });
                requestAnimationFrame(() => field?.querySelector<HTMLButtonElement>(".add-verified-item")?.focus());
              }}><span aria-hidden="true">×</span><small className="mobile-action-label">Remover</small></button>
              {perCheckWeights ? <select className="check-label filter-select" required aria-label={`Serviço verificado ${checkIndex + 1}`} value={check.label} onChange={(event) => {
                const checks = quantityChecks;
                const service = fvsServices.find((entry) => entry.label === event.target.value);
                updateDraft({ ...response, checks: checks.map((entry) => entry.id === check.id ? { ...entry, label: event.target.value, weight: service?.weight ?? null } : entry) });
              }}><option value="">Selecione o serviço verificado</option>{check.label && !fvsServices.some((service) => service.label === check.label) && <option value={check.label}>{check.label}</option>}{fvsServices.map((service) => <option value={service.label} key={`${service.document}:${service.service}`}>{service.label}</option>)}</select> : <input className="check-label" aria-label={`Identificação do item verificado ${checkIndex + 1}`} value={check.label} onChange={(event) => {
                const checks = quantityChecks;
                updateDraft({ ...response, checks: checks.map((entry) => entry.id === check.id ? { ...entry, label: event.target.value } : entry) });
              }} />}
              {perCheckWeights && <input className="check-weight" type="text" aria-label={`Peso do item verificado ${checkIndex + 1}`} placeholder="Peso" value={getDraftCheckWeight(check) ?? ""} readOnly />}
              <button data-tooltip={`Não conforme: item ${criterion.code}, verificação ${checkIndex + 1}`} type="button" className={check.compliant === false ? "check-option noncompliant active" : "check-option noncompliant"} aria-label={`Não conforme: item ${criterion.code}, verificação ${checkIndex + 1}`} aria-pressed={check.compliant === false} onClick={() => {
                const checks = quantityChecks;
                updateDraft({ ...response, checks: checks.map((entry) => entry.id === check.id ? { ...entry, compliant: false } : entry) });
              }}><span aria-hidden="true">×</span></button>
              <button data-tooltip={`Conforme: item ${criterion.code}, verificação ${checkIndex + 1}`} type="button" className={check.compliant === true ? "check-option compliant active" : "check-option compliant"} aria-label={`Conforme: item ${criterion.code}, verificação ${checkIndex + 1}`} aria-pressed={check.compliant === true} onClick={() => {
                const checks = quantityChecks;
                updateDraft({ ...response, checks: checks.map((entry) => entry.id === check.id ? { ...entry, compliant: true } : entry) });
              }}><span aria-hidden="true">✓</span></button>
              <span className="inline-photo-cell">{!photoStore.get(check.photos?.at(-1) ?? "") && <button type="button" className="inline-photo" aria-label={`Adicionar foto ao item verificado ${checkIndex + 1}`} data-tooltip="Adicionar foto" onClick={() => { setPhotoTarget(check.id); photoInput.current?.click(); }}><span aria-hidden="true">+</span><small className="mobile-action-label">Foto</small></button>}<AuditPhotoThumbnail label={`item ${criterion.code}, verificação ${checkIndex + 1}`} file={photoStore.get(check.photos?.at(-1) ?? "")} onAdd={() => { setPhotoTarget(check.id); photoInput.current?.click(); }} onDelete={() => {
                updateDraft({ ...response, checks: quantityChecks.map((entry) => entry.id === check.id ? { ...entry, photos: (entry.photos ?? []).slice(0, -1) } : entry) });
              }} /></span>
              <input className="check-note" aria-label={`Observação do item verificado ${checkIndex + 1}`} placeholder="Observações" value={check.note ?? ""} onChange={(event) => {
                const checks = quantityChecks;
                updateDraft({ ...response, checks: checks.map((entry) => entry.id === check.id ? { ...entry, note: event.target.value } : entry) });
              }} />
            </div>)}
            <button type="button" className="add-verified-item" aria-label={`Adicionar verificação ao item ${criterion.code}`} data-tooltip="Adicionar item verificado" onClick={() => {
              const checks = quantityChecks;
              const number = checks.length + 1;
              updateDraft({ ...response, checks: [...checks, { id: `${criterion.id}-${number}`, label: perCheckWeights ? "" : `Item verificado ${number}`, compliant: null, ...(perCheckWeights ? { weight: null } : {}) }] });
            }}><span aria-hidden="true">+</span><small className="mobile-action-label">Adicionar verificação</small></button>
          </div> : <div className={`answer-options${security ? " answer-options-security" : ` answer-options-quality${supportsNotApplicable ? " has-not-applicable" : ""}`}`}>
            {options.map((value) => {
              const label = value === "0" ? "Totalmente não conforme" : value === "5" ? "Parcialmente não conforme" : value === "10" ? "Conforme" : value === "N/A" ? "Não aplicável" : value;
              return <button type="button" key={value} className={response.answer === value ? `answer answer-${value.replace(/\W/g, "")} active` : `answer answer-${value.replace(/\W/g, "")}`} aria-pressed={response.answer === value} onClick={() => updateDraft({ ...response, answer: value })}>
                <span>{value === "0" || value === "Não conforme" ? "×" : value === "5" ? "!" : value === "10" || value === "Conforme" ? "✓" : "—"}</span><small>{label}</small>
              </button>;
            })}
            <span className="inline-photo-cell qualitative-photo-list">{(response.photos ?? []).map((reference, photoIndex) => <AuditPhotoThumbnail label={`item ${criterion.code}, foto ${photoIndex + 1}`} key={`${reference}:${photoIndex}`} file={photoStore.get(reference)} onAdd={() => { setPhotoTarget("item"); photoInput.current?.click(); }} onDelete={() => {
              updateDraft({ ...response, photos: (response.photos ?? []).filter((_, index) => index !== photoIndex) });
            }} />)}<button type="button" className="inline-photo" aria-label={`Adicionar foto ao item ${criterion.code}`} data-tooltip="Adicionar foto" onClick={() => { setPhotoTarget("item"); photoInput.current?.click(); }}><span aria-hidden="true">+</span><small className="mobile-action-label">Foto</small></button></span>
          </div>}
        </fieldset>

        {criterion.verificationRule !== "Dividido pela quantidade verificada" && response.answer !== "N/A" && <label className="question-note">Observações{requiresEvidence ? " *" : ""}
          <textarea value={response.note} readOnly={readOnly} onChange={(event) => updateDraft({ ...response, note: event.target.value })} placeholder="Registre a observação da verificação…" required={requiresEvidence} />
        </label>}
        <input ref={photoInput} className="audit-photo-input" type="file" accept="image/jpeg,image/png" multiple hidden disabled={readOnly} onChange={(event) => {
            if (!criterion) return;
            const selected = Array.from(event.target.files ?? []);
            if (!selected.length) return;
            const references = selected.map((file) => photoStore.add(file));
            let accepted = false;
            try {
              accepted = updateDraft(photoTarget === "item"
                ? { ...response, photos: [...(response.photos ?? []), ...references] }
                : { ...response, checks: quantityChecks.map((entry) => entry.id === photoTarget ? { ...entry, photos: [...(entry.photos ?? []), ...references] } : entry) }) !== false;
            } finally {
              if (!accepted) photoStore.discardUnreferenced(references);
              event.target.value = "";
            }
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

const ItemPickerRow = memo(function ItemPickerRow({ criterion, index, answer, answered, missingRequiredPhoto, previousAudits, active, onSelect }: {
  criterion: Criterion;
  index: number;
  answer?: DraftAnswer;
  answered: boolean;
  missingRequiredPhoto: boolean;
  previousAudits: readonly PreviousAudit[];
  active: boolean;
  onSelect: (index: number) => void;
}) {
  return <button type="button" className={active ? "item-result active" : "item-result"} aria-pressed={active} onClick={() => onSelect(index)}>
    <span><b>{criterion.code}</b> {getCriterionDisplayTitle(criterion)}</span>
    <span className="item-result-summary">{!answered && <em>Não respondido</em>}<span className="audit-result-columns">{previousAudits.map((audit) => <span key={audit.id}><small>{displayAuditDate(audit.date)}</small><VerificationMark response={{ answer: audit.answers[criterion.id] }} /></span>)}<span><small>ATUAL</small><VerificationMark response={{ answer }} missingPhoto={missingRequiredPhoto} /></span></span></span>
  </button>;
});

function ItemPicker({ id, model, criteria, drafts, previousAudits, activeId, security, onSelect, onToggleGroup }: { onToggleGroup?: (group: string) => void; id: string; model: string; criteria: Criterion[]; drafts: AuditDrafts; previousAudits: readonly PreviousAudit[]; activeId?: string; security: boolean; onSelect: (index: number) => void }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(criteria.map((criterion) => criterion.group)));
  const [collapsedSubgroups, setCollapsedSubgroups] = useState<Set<string>>(() => new Set(criteria.filter((criterion) => criterion.subgroup).map((criterion) => `${criterion.group}:${criterion.subgroup}`)));
  const grouped = useMemo(() => criteria.reduce<Record<string, Record<string, { criterion: Criterion; index: number }[]>>>((groups, criterion, index) => {
    const subgroup = criterion.subgroup || "Itens do grupo";
    ((groups[criterion.group] ??= {})[subgroup] ??= []).push({ criterion, index });
    return groups;
  }, {}), [criteria]);
  const chronologicalAudits = useMemo(() => [...previousAudits].reverse(), [previousAudits]);
  const entriesScore = (entries: { criterion: Criterion; index: number }[]) => {
    if (security) return calculateSecurityGroupScore(entries.map(({ criterion }) => criterion), drafts, model);
    const scores = entries.map(({ criterion }) => awardedItemScore(criterion, getItemResponse(drafts, model, criterion), security)).filter((score): score is number => score !== null);
    return scores.length ? scores.reduce((total, score) => total + score, 0) : null;
  };
  const renderItem = ({ criterion, index }: { criterion: Criterion; index: number }) => {
    const answer = getItemResponse(drafts, model, criterion);
    const answered = answer.answer !== undefined || answer.checks?.some((check) => check.compliant !== null) === true;
    const missingRequiredPhoto = isRequiredPhotoMissing(criterion, answer);
    return <ItemPickerRow key={criterion.id} criterion={criterion} index={index} answer={answer.answer} answered={answered} missingRequiredPhoto={missingRequiredPhoto} previousAudits={chronologicalAudits} active={criterion.id === activeId} onSelect={onSelect} />;
  };

  return <div className="item-picker" id={id}>
    <div className="item-picker-results">
      {Object.entries(grouped).map(([group, subgroups]) => {
        const collapsed = collapsedGroups.has(group);
        const groupEntries = Object.values(subgroups).flat();
        const groupScore = entriesScore(groupEntries);
        const groupNA = groupEntries.some(({ criterion }) => drafts[model]?.[criterion.id]?.autoGroupNA);
        const groupNALabel = groupNA ? "Reativar grupo e restaurar respostas" : "Preencher não respondidos como Não se aplica";
        return <div className="item-picker-group" key={group}>
        <div className="item-picker-group-heading">
        {security && onToggleGroup && <button type="button" className="group-na-button" disabled={!groupNA && !groupEntries.some(({ criterion }) => !drafts[model]?.[criterion.id]?.answer)} aria-label={`N/A — ${groupNALabel}: ${group}`} data-tooltip={groupNALabel} aria-pressed={groupNA} onClick={() => onToggleGroup(group)}>N/A</button>}
        <h4><button type="button" aria-expanded={!collapsed} onClick={() => setCollapsedGroups((current) => {
          const next = new Set(current);
          if (next.has(group)) next.delete(group); else next.add(group);
          return next;
        })}><span>{group}</span><span className="tree-score">{scoreLabel(groupScore)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button></h4>
        </div>

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
