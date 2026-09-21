"use client";

import { useId, useRef, useState } from "react";
import { getCriterionWeight, qualityModels, securityCriteria, type Criterion } from "@/domain/catalogs";
import type { AuditModelId } from "@/domain/operational-records";
import { referenceDocuments } from "@/domain/reference-documents";
import { ReferenceDocumentViewer } from "./reference-document-viewer";
import { CatalogEditorPanel } from "./catalog-editor-panel";
import previewStyles from "./catalog-preview-control.module.css";
import { catalogVersion, type CatalogSnapshot } from "@/lib/catalogs/contracts";
import {
  getAdjacentIndex,
  getItemResponse,
  getResponseLabel,
  type AuditDrafts,
  type DraftAnswer,
} from "@/domain/audit-draft";

const securityModel = "Segurança — IT.07 rev. 02";
const models = [securityModel, ...qualityModels.map((item) => item.name)];

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
        const version = document && catalogs ? catalogVersion(catalogs, document.id) : undefined;
        const total = version?.criteria.length ?? (security ? securityCriteria.length : qualityModels.find((entry) => entry.name === item)?.criteria.length);
        const name = version?.version ? `${security ? "Segurança — IT.07" : item} · ${version.label}` : item;
        const editable = !!reference && !!catalogs && !!actorId && !!onCatalogsSaved;
        return <div key={item} className={`model-card ${previewStyles.card}${editable ? ` editable ${previewStyles.editable}` : ""}${reference && model === item ? ` ${previewStyles.selected}` : ""}`}><button
          type="button"
          disabled={editingId !== null}
          className={`${model === item ? "model-tab active" : "model-tab"} ${previewStyles.modelButton}`}
          aria-pressed={model === item}
          aria-label={reference ? `Selecionar roteiro: ${name}` : undefined}
          onClick={() => { setModel(item); setEditingId(null); setPreviewOpen(false); }}
        >
          <span>{name}</span>
          <small>{total} quesitos{showWeights ? ` · ${version?.version ? "pesos da revisão" : security ? "peso inicial 1 por subitem" : "pesos documentados"}` : ""}</small>
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
  updateDraft: (response: { answer?: DraftAnswer; note: string }) => void;
  details: { date: string; auditor: string };
  workName?: string;
  responseKey?: string;
  readOnly?: boolean;
  showWeights?: boolean;
};

function displayAuditDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function itemResponseScore(answer: DraftAnswer | undefined): string {
  if (answer === "0" || answer === "5" || answer === "10") return `Nota ${answer}`;
  if (answer === "N/A") return "Nota N/A";
  return "Nota pendente";
}

export function NewAudit({ model, criteria, activeIndex, setActiveIndex, drafts, updateDraft, details, workName = "Residencial Horizonte · Guarulhos", responseKey = model, readOnly = false, showWeights = true }: NewAuditProps) {
  const [selectedItemOpen, setSelectedItemOpen] = useState(false);
  const criterion = criteria[activeIndex] ?? criteria[0];
  const response = criterion ? getItemResponse(drafts, responseKey, criterion) : { note: "" };
  const security = model.startsWith("Segurança");
  const answered = criteria.filter((item) => getItemResponse(drafts, responseKey, item).answer !== undefined).length;
  const progress = criteria.length ? Math.floor(answered / criteria.length * 1000) / 10 : 0;
  const awardedScores = criteria.flatMap((item) => {
    const answer = getItemResponse(drafts, responseKey, item).answer;
    return answer === "0" || answer === "5" || answer === "10" ? [Number(answer)] : [];
  });
  const partialScore = awardedScores.length ? awardedScores.reduce((total, score) => total + score, 0) / awardedScores.length : null;
  const pickerId = useId();
  const answerHelpId = useId();
  const noteHelpId = useId();
  const measurementHelpId = useId();
  const move = (direction: -1 | 1) => { setActiveIndex(getAdjacentIndex(activeIndex, criteria.length, direction)); setSelectedItemOpen(true); };
  const options: DraftAnswer[] = security ? ["0", "5", "10", "N/A"] : ["Não verificado", "Constatação qualitativa"];

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
      <div className="partial-score"><small>NOTA PARCIAL</small><strong>{partialScore === null ? "—" : partialScore.toFixed(2).replace(".", ",")}</strong></div>
    </section>

    <section className="question-card" aria-label="Quesito da auditoria">
      <ItemPicker id={pickerId} model={responseKey} criteria={criteria} drafts={drafts} activeId={selectedItemOpen ? criterion?.id : undefined} showWeights={showWeights} onSelect={(index) => {
        if (selectedItemOpen && index === activeIndex) setSelectedItemOpen(false);
        else { setActiveIndex(index); setSelectedItemOpen(true); }
      }} />

      {selectedItemOpen && criterion ? <div className="question-content">
        <div className="question-context">
          <span className="question-code">ITEM {criterion.code}</span>
          <span>{criterion.group}{criterion.subgroup && ` · ${criterion.subgroup}`}</span>
        </div>
        <h3>{criterion.text}</h3>
        <p className="criterion-source">Fonte: {criterion.source} · {criterion.locator}</p>
        {criterion.verificationRule && <p className="criterion-detail"><strong>Critério de verificação:</strong> {criterion.verificationRule}</p>}
        {criterion.sourceNote && <p className="source-note"><strong>Observação documental:</strong> {criterion.sourceNote}</p>}
        {criterion.interpretation && <p className="criterion-detail">{criterion.interpretation}</p>}
        <CriterionOrientations key={criterion.id} item={criterion} />

        <fieldset className="answer-fieldset" aria-describedby={answerHelpId} disabled={readOnly}>
          <legend>Resultado da verificação</legend>
          <p id={answerHelpId}>{security ? "Seleção manual. Nota 0, Não respondido, Não verificado e N/A são estados distintos." : "Constatação qualitativa de teste, sem nota. Não verificado é estado de coleta; conversão em pontos pendente (P02)."}</p>
          <div className={`answer-options${security ? "" : " answer-options-quality"}`}>
            {options.map((value) => <button
              type="button"
              key={value}
              className={response.answer === value ? "answer active" : "answer"}
              aria-pressed={response.answer === value}
              onClick={() => updateDraft({ ...response, answer: value })}
            >
              <span>{value}</span>
              <small>{value === "N/A" ? "justificativa obrigatória" : value === "Constatação qualitativa" ? "sem pontuação automática" : "seleção manual"}</small>
            </button>)}
          </div>
        </fieldset>

        <label className="question-note">{response.answer === "N/A" ? "Observação e justificativa *" : "Observação"}
          <textarea value={response.note} readOnly={readOnly} onChange={(event) => updateDraft({ ...response, note: event.target.value })} placeholder="Registre uma observação, justificativa ou evidência de teste…" required={response.answer === "N/A"} aria-describedby={response.answer === "N/A" ? noteHelpId : undefined} />
        </label>
        {response.answer === "N/A" && <p className="note-help" id={noteHelpId}>Informe a justificativa para a seleção de N/A.</p>}

        <div className="measurement">
          <div><strong>Medição opcional</strong><p id={measurementHelpId}>O registro de valor e unidade ainda não está disponível nesta sessão.</p></div>
          <button type="button" className="secondary" disabled aria-describedby={measurementHelpId}>Adicionar medição</button>
        </div>

        <div className="question-footer">
          <div><span>Resposta: <strong>{getResponseLabel(response)}</strong></span>{showWeights && <span>Peso: <strong>{getCriterionWeight(criterion)?.toFixed(2).replace(".", ",") ?? "A definir"}</strong></span>}</div>
          <p className="draft-status"><span aria-hidden="true">✓</span> Respostas mantidas nesta sessão</p>
        </div>
      </div> : criteria.length === 0 ? <div className="catalog-empty"><h3>Nenhum quesito disponível</h3><p>Selecione outro modelo de auditoria.</p></div> : null}
    </section>

    {selectedItemOpen && criterion && <div className="item-navigation-bottom">
      <button type="button" className="secondary" disabled={activeIndex === 0 || !criterion} onClick={() => move(-1)}><span aria-hidden="true">←</span> Anterior</button>
      <span>Item <strong>{criterion ? activeIndex + 1 : 0}</strong> de {criteria.length}</span>
      <button type="button" className="primary" disabled={activeIndex >= criteria.length - 1} onClick={() => move(1)}>Próximo item <span aria-hidden="true">→</span></button>
    </div>}
    </section>
  </>;
}

function ItemPicker({ id, model, criteria, drafts, activeId, showWeights, onSelect }: { id: string; model: string; criteria: Criterion[]; drafts: AuditDrafts; activeId?: string; showWeights: boolean; onSelect: (index: number) => void }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const grouped = criteria.reduce<Record<string, { criterion: Criterion; index: number }[]>>((groups, criterion, index) => {
    (groups[criterion.group] ??= []).push({ criterion, index });
    return groups;
  }, {});

  return <div className="item-picker" id={id}>
    <div className="item-picker-results">
      {Object.entries(grouped).map(([group, entries]) => {
        const collapsed = collapsedGroups.has(group);
        return <div className="item-picker-group" key={group}>
        <h4><button type="button" aria-expanded={!collapsed} onClick={() => setCollapsedGroups((current) => {
          const next = new Set(current);
          if (next.has(group)) next.delete(group); else next.add(group);
          return next;
        })}><span>{group}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button></h4>
        {!collapsed && entries.map(({ criterion, index }) => {
          const answer = getItemResponse(drafts, model, criterion);
          return <button type="button" key={criterion.id} className={criterion.id === activeId ? "item-result active" : "item-result"} aria-pressed={criterion.id === activeId} onClick={() => onSelect(index)}>
            <span><b>{criterion.code}</b> {criterion.text}<small>{criterion.subgroup}</small></span>
            <span className="item-result-summary"><em className={answer.answer !== undefined ? "has-answer" : undefined}>{getResponseLabel(answer)}</em>{showWeights && <strong>{itemResponseScore(answer.answer)}</strong>}</span>
          </button>;
        })}
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
