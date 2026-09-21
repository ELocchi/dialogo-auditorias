"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { referenceDocuments } from "@/domain/reference-documents";
import { getCriterionWeight, type Criterion } from "@/domain/catalogs";
import { saveCatalogRevisionAction } from "@/app/catalogs/actions";
import type { CatalogSnapshot, CatalogVersion } from "@/lib/catalogs/contracts";
import styles from "./catalog-editor-panel.module.css";

type CatalogEditorPanelProps = {
  version: CatalogVersion;
  available: boolean;
  setupPending?: boolean;
  actorId: string;
  onSaved: (snapshot: CatalogSnapshot) => void;
  onClose: () => void;
};

const pdfLimit = 5 * 1024 * 1024;
const originalLimit = 2 * 1024 * 1024;
const verificationRules = [
  { value: "Conforme/Não Conforme", label: "Correto / Não conforme" },
  { value: "Dividido pela quantidade verificada", label: "Dividido pela quantidade de itens verificados" },
] as const;

function newRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validateFile(file: File | null, extension: "pdf" | "docx", limit: number): string | null {
  if (!file) return null;
  if (!file.name.toLowerCase().endsWith(`.${extension}`)) return `Selecione um arquivo ${extension.toUpperCase()}.`;
  if (file.size === 0) return `O arquivo ${extension.toUpperCase()} está vazio.`;
  if (file.size > limit) return `O arquivo ${extension.toUpperCase()} deve ter até ${limit / 1024 / 1024} MB.`;
  return null;
}

export function CatalogEditorPanel({ version, available, setupPending, actorId, onSaved, onClose }: CatalogEditorPanelProps) {
  const unavailableMessage = setupPending ? "O salvamento de revisões estará disponível após a atualização da plataforma." : "Não foi possível consultar a revisão atual. Atualize a página antes de salvar.";
  // Keep the reviewed base revision while editing, including after a conflict.
  const [base] = useState(version);
  const [criteria, setCriteria] = useState<Criterion[]>(() => version.criteria.map((item) => ({
    ...item, orientations: item.orientations.map((orientation) => ({ ...orientation, pages: [...orientation.pages] })),
  })));
  const [mode, setMode] = useState<"items" | "upload">("items");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(version.criteria[0]?.id ?? "");
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [revisionLabel, setRevisionLabel] = useState(`${version.label.slice(0, 55)} — ajuste ${version.version + 1}`);
  const [changeNote, setChangeNote] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [original, setOriginal] = useState<File | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ status: "success" | "error"; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const savingRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const formId = useId();

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const search = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = criteria.filter((item) => `${item.code} ${item.text} ${item.group} ${item.subgroup}`.toLocaleLowerCase("pt-BR").includes(search));
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const blocked = pending || saved;

  const changed = () => {
    requestIdRef.current = null;
    setFeedback(null);
    setPreviewOpen(false);
  };
  const changeItem = (patch: Partial<Pick<Criterion, "code" | "title" | "text" | "group" | "subgroup" | "source" | "locator" | "verificationRule" | "sourceNote" | "interpretation">>) => {
    if (!selected) return;
    changed();
    setCriteria((items) => items.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
  };

  const criteriaWithWeights = (): Criterion[] => criteria.map((item) => {
    const rawWeight = weights[item.id];
    if (rawWeight === undefined) return item;
    const updated = { ...item };
    const normalizedWeight = rawWeight.trim().replace(",", ".");
    if (normalizedWeight) updated.configuredWeight = Number(normalizedWeight);
    else delete updated.configuredWeight;
    return updated;
  });

  const validateCriteria = (): Criterion[] | null => {
    const submittedCriteria = criteriaWithWeights();
    for (const item of submittedCriteria) {
      const rawWeight = weights[item.id];
      const normalizedWeight = rawWeight?.trim().replace(",", ".");
      if (!item.id.trim() || !item.code.trim() || !item.title.trim() || !item.text.trim() || !item.group.trim() || !item.source.trim()
        || item.orientations.some((orientation) => !orientation.text.trim()) || (normalizedWeight && (!/^\d+(?:\.\d+)?$/.test(normalizedWeight)
        || !Number.isFinite(Number(normalizedWeight)) || Number(normalizedWeight) < 0 || Number(normalizedWeight) > 1000))) {
        setMode("items"); setQuery(""); setSelectedId(item.id);
        setFeedback({ status: "error", message: `Preencha os campos obrigatórios e confira a nota final do item ${item.code || "sem código"}. Use um valor entre 0 e 1000.` });
        return null;
      }
    }
    if (!submittedCriteria.length) { setFeedback({ status: "error", message: "A revisão precisa ter pelo menos um item." }); return null; }
    if (new Set(submittedCriteria.map((item) => item.id.trim())).size !== submittedCriteria.length
      || new Set(submittedCriteria.map((item) => item.code.trim())).size !== submittedCriteria.length) {
      setFeedback({ status: "error", message: "Cada item precisa ter código e identificação únicos." }); return null;
    }
    return submittedCriteria;
  };

  const preparePreview = () => {
    setFeedback(null);
    if (!available) { setFeedback({ status: "error", message: unavailableMessage }); return; }
    if (mode === "upload" && (!revisionLabel.trim() || !changeNote.trim() || !pdf)) {
      setFeedback({ status: "error", message: "Selecione o PDF e informe o nome e o motivo da nova revisão." }); return;
    }
    const fileError = mode === "upload" ? validateFile(pdf, "pdf", pdfLimit) ?? validateFile(original, "docx", originalLimit) : null;
    if (fileError) { setFeedback({ status: "error", message: fileError }); return; }
    if (!validateCriteria()) return;
    setPreviewOpen(true);
    requestAnimationFrame(() => document.getElementById(`${formId}-preview`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const addItem = () => {
    const usedCodes = new Set(criteria.map((item) => item.code));
    let number = criteria.length + 1;
    while (usedCodes.has(`NOVO-${number}`)) number += 1;
    const id = `ITEM-${newRequestId()}`;
    const item: Criterion = {
      id, code: `NOVO-${number}`, title: "Novo item", text: "Descreva o item de auditoria",
      group: "Novo módulo", subgroup: "", source: referenceDocuments[base.modelId].catalogName,
      locator: "Novo item", documentedWeight: null, configuredWeight: 0,
      verificationRule: verificationRules[0].value, orientations: [],
    };
    changed();
    setCriteria((items) => [...items, item]);
    setQuery("");
    setSelectedId(id);
  };
  const changeOrientation = (index: number, text: string) => {
    if (!selected) return;
    changed();
    setCriteria((items) => items.map((item) => item.id === selected.id ? {
      ...item, orientations: item.orientations.map((orientation, position) => position === index ? { ...orientation, text } : orientation),
    } : item));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current || saved) return;
    setFeedback(null);
    if (!available) { setFeedback({ status: "error", message: unavailableMessage }); return; }
    if (mode === "upload" && (!revisionLabel.trim() || !changeNote.trim())) {
      setFeedback({ status: "error", message: "Informe o nome da nova revisão e o motivo da alteração." }); return;
    }
    if (mode === "upload" && !pdf) {
      setFeedback({ status: "error", message: "Selecione o PDF da nova revisão." }); return;
    }
    if (mode === "upload" && original && !pdf) { setFeedback({ status: "error", message: "Envie o PDF junto com o Word original." }); return; }
    const fileError = mode === "upload" ? validateFile(pdf, "pdf", pdfLimit) ?? validateFile(original, "docx", originalLimit) : null;
    if (fileError) { setFeedback({ status: "error", message: fileError }); return; }

    const submittedCriteria = validateCriteria();
    if (!submittedCriteria) return;

    let formData: FormData;
    try {
      requestIdRef.current ??= newRequestId();
      formData = new FormData();
      formData.set("requestId", requestIdRef.current);
      formData.set("modelId", base.modelId);
      formData.set("expectedVersion", String(base.version));
      formData.set("revisionLabel", mode === "upload" ? revisionLabel.trim() : `${base.label.slice(0, 55)} — ajuste ${base.version + 1}`);
      formData.set("changeNote", mode === "upload" ? changeNote.trim() : "Itens do roteiro atualizados.");
      formData.set("criteria", JSON.stringify(submittedCriteria));
      formData.set("actorId", actorId);
      if (mode === "upload" && pdf) formData.set("pdf", pdf);
      if (mode === "upload" && original) formData.set("original", original);
    } catch {
      setFeedback({ status: "error", message: "Não foi possível preparar o envio. Seus campos foram mantidos; tente novamente." }); return;
    }
    savingRef.current = true;
    startTransition(async () => {
      try {
        const result = await saveCatalogRevisionAction(formData);
        if (result.status !== "success") { setFeedback({ status: "error", message: result.message }); return; }
        setSaved(true);
        setFeedback({ status: "success", message: result.message });
        if (result.snapshot?.available) {
          onSaved(result.snapshot);
          onClose();
        }
      } catch {
        setFeedback({ status: "error", message: "Não foi possível confirmar o salvamento. Seus campos foram mantidos. Tente novamente com os mesmos dados." });
      } finally {
        savingRef.current = false;
      }
    });
  };

  return <section id="catalog-editor" className={styles.panel} aria-labelledby={headingId}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>ADMINISTRAÇÃO DE ROTEIROS</span><h2 id={headingId} ref={headingRef} tabIndex={-1}>Editar roteiro</h2><p>{referenceDocuments[base.modelId].catalogName.replace(" rev. 02", "")} · Revisão {base.label} · {criteria.length} itens</p></div>
      <button type="button" className="secondary" disabled={pending}
        onClick={() => { if (!savingRef.current) onClose(); }}>Voltar ao documento</button>
    </header>

    <form id={formId} className={styles.form} onSubmit={submit} aria-busy={pending}>
      <div className={styles.body}>
        {!available && <p className={styles.availability} role="status">{unavailableMessage}</p>}
        <p className={styles.introduction}>As alterações valerão para as próximas auditorias. As auditorias existentes manterão a revisão usada na abertura.</p>
        {!previewOpen && <fieldset className={styles.fields} disabled={blocked}>
          <div className={styles.modes} role="group" aria-label="Como revisar o roteiro">
            <button type="button" aria-pressed={mode === "items"} className={mode === "items" ? styles.activeMode : undefined}
              onClick={() => { changed(); setMode("items"); }}>Editar itens</button>
            <button type="button" aria-pressed={mode === "upload"} className={mode === "upload" ? styles.activeMode : undefined}
              onClick={() => { changed(); setMode("upload"); }}>Enviar nova revisão</button>
          </div>

          {mode === "items" ? <section className={styles.editor} aria-label="Itens do roteiro">
            <aside className={styles.selection}>
              <label>Buscar item<input type="search" value={query} placeholder="Código ou texto" onChange={(event) => { changed(); setQuery(event.target.value); }} /></label>
              <label>Selecionar item<select value={selected?.id ?? ""} onChange={(event) => { changed(); setSelectedId(event.target.value); }} disabled={!filtered.length}>
                {!filtered.length && <option value="">Nenhum item encontrado</option>}
                {filtered.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.text}</option>)}
              </select></label>
              <button type="button" className={styles.addItem} onClick={addItem}>+ Adicionar novo item</button>
              <p className={styles.hint} role="status">{filtered.length} de {criteria.length} itens</p>
              {selected && <div className={styles.source}><strong>{selected.code}</strong><span>{selected.group}</span>{selected.subgroup && <span>{selected.subgroup}</span>}<small>{selected.source} · {selected.locator}</small></div>}
            </aside>
            {selected ? <div className={styles.itemFields}>
              <div className={styles.identityFields}>
                <label>Código<input required maxLength={100} value={selected.code} onChange={(event) => changeItem({ code: event.target.value })} /></label>
                <label>Título<input required maxLength={2000} value={selected.title} onChange={(event) => changeItem({ title: event.target.value })} /></label>
                <label>Módulo / grupo<input required maxLength={2000} value={selected.group} onChange={(event) => changeItem({ group: event.target.value })} /></label>
                <label>Subgrupo<input maxLength={2000} value={selected.subgroup} onChange={(event) => changeItem({ subgroup: event.target.value })} /></label>
              </div>
              <label>Texto do item<textarea rows={5} maxLength={30000} required value={selected.text} onChange={(event) => changeItem({ text: event.target.value })} /></label>
              <label>Nota final do item<input type="text" inputMode="decimal" value={weights[selected.id] ?? String(getCriterionWeight(selected) ?? "")}
                onChange={(event) => { changed(); setWeights((current) => ({ ...current, [selected.id]: event.target.value })); }} />
                <small>Nota da fonte: {selected.documentedWeight === null ? "não informada" : selected.documentedWeight.toLocaleString("pt-BR")}. Deixe em branco para usar a nota da fonte.</small>
              </label>
              <label>Critério de verificação<select value={selected.verificationRule ?? ""} onChange={(event) => changeItem({ verificationRule: event.target.value || undefined })}>
                <option value="">Não definido</option>
                {verificationRules.map((rule) => <option value={rule.value} key={rule.value}>{rule.label}</option>)}
              </select><small>Define se o item recebe uma resposta única ou se a nota será distribuída entre os itens verificados.</small></label>
              <label>Observação<textarea rows={3} value={selected.sourceNote ?? ""} onChange={(event) => changeItem({ sourceNote: event.target.value })} /></label>
              <label>Interpretação<textarea rows={3} value={selected.interpretation ?? ""} onChange={(event) => changeItem({ interpretation: event.target.value })} /></label>
              <div className={styles.identityFields}>
                <label>Fonte<input required maxLength={1000} value={selected.source} onChange={(event) => changeItem({ source: event.target.value })} /></label>
                <label>Localizador<input maxLength={2000} value={selected.locator} onChange={(event) => changeItem({ locator: event.target.value })} /></label>
              </div>
              {selected.orientations.length > 0 && <details className={styles.orientations}>
                <summary>Orientações existentes ({selected.orientations.length})</summary>
                {selected.orientations.map((orientation, index) => <label key={`${selected.id}:${orientation.id}:${index}`}>
                  {orientation.scope || `Orientação ${index + 1}`}
                  <textarea rows={4} required maxLength={30000} value={orientation.text} onChange={(event) => changeOrientation(index, event.target.value)} />
                  <small>{orientation.id}{orientation.pages.length > 0 ? ` · Páginas ${orientation.pages.join(", ")}` : ""}</small>
                </label>)}
              </details>}
            </div> : <p className={styles.empty}>Nenhum item corresponde à busca.</p>}
          </section> : <section className={styles.uploadIntroduction}><h3>Arquivos da nova revisão</h3><p>Envie o PDF atualizado e, se disponível, o original em DOCX.</p></section>}

          {mode === "upload" && <><section className={styles.files} aria-label="Arquivos de referência">
            <p>O arquivo de referência não altera os itens automaticamente. Confira os itens antes de salvar.</p>
            <div className={styles.fileGrid}>
              <label>PDF da revisão (obrigatório)
                <input type="file" accept=".pdf,application/pdf" required
                  onChange={(event) => { changed(); setPdf(event.target.files?.[0] ?? null); }} />
                <small>Até 5 MB. {pdf ? `Selecionado: ${pdf.name}` : "Sem envio, o PDF atual será mantido."}</small>
              </label>
              <label>Original em DOCX (opcional)
                <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => { changed(); setOriginal(event.target.files?.[0] ?? null); }} />
                <small>Até 2 MB.{original ? ` Selecionado: ${original.name}` : ""}</small>
              </label>
            </div>
          </section>

          <section className={styles.revision} aria-label="Identificação da nova revisão">
            <label>Nome da nova revisão<input required maxLength={80} value={revisionLabel} onChange={(event) => { changed(); setRevisionLabel(event.target.value); }} /></label>
            <label>Motivo da alteração<textarea required rows={3} maxLength={2000} value={changeNote} placeholder="Descreva o que mudou nesta revisão."
              onChange={(event) => { changed(); setChangeNote(event.target.value); }} /></label>
          </section></>}
        </fieldset>}
        {previewOpen && <section id={`${formId}-preview`} className={styles.preview} aria-label="Pré-visualização para o auditor">
          <div className={styles.previewHeader}>
            <div><span className={styles.eyebrow}>ANTES DE CONFIRMAR</span><h3>Pré-visualização para o auditor</h3><p>Confira a ordem, os módulos, os textos e a nota final de cada item.</p></div>
            <button type="button" className="secondary" onClick={() => setPreviewOpen(false)}>Voltar à edição</button>
          </div>
          <div className={styles.previewList}>
            {criteriaWithWeights().map((item, index) => <article className={styles.previewCard} key={item.id}>
              <div className={styles.previewCardHeader}><span>Item {index + 1} de {criteria.length}</span><strong>{getCriterionWeight(item)?.toLocaleString("pt-BR") ?? "Sem nota"}</strong></div>
              <p className={styles.previewPath}>{item.group}{item.subgroup ? ` · ${item.subgroup}` : ""}</p>
              <h4>{item.code} · {item.title}</h4>
              <p className={styles.previewText}>{item.text}</p>
              {item.verificationRule && <div><b>Critério de verificação</b><p>{item.verificationRule}</p></div>}
              {item.sourceNote && <div><b>Observação</b><p>{item.sourceNote}</p></div>}
              {item.interpretation && <div><b>Interpretação</b><p>{item.interpretation}</p></div>}
              {item.orientations.length > 0 && <details><summary>Orientações ({item.orientations.length})</summary>{item.orientations.map((orientation) => <p key={orientation.id}>{orientation.text}</p>)}</details>}
            </article>)}
          </div>
        </section>}
        {feedback && <p className={feedback.status === "error" ? styles.error : styles.success} role={feedback.status === "error" ? "alert" : "status"}>{feedback.message}</p>}
      </div>
      <footer className={styles.footer}>
        <span>{pending ? "Salvando a nova revisão…" : saved ? "Revisão salva." : `${criteria.length} itens na nova revisão`}</span>
        <button type={previewOpen ? "submit" : "button"} className="primary" disabled={!available || blocked || !criteria.length} onClick={previewOpen ? undefined : preparePreview}>{pending ? "Salvando…" : saved ? "Revisão salva" : previewOpen ? "Confirmar e salvar alterações" : "Pré-visualizar alterações"}</button>
      </footer>
    </form>
  </section>;
}
