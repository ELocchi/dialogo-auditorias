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
  };
  const changeItem = (patch: Partial<Pick<Criterion, "text" | "verificationRule" | "sourceNote">>) => {
    if (!selected) return;
    changed();
    setCriteria((items) => items.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
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
    if (!revisionLabel.trim() || !changeNote.trim()) {
      setFeedback({ status: "error", message: "Informe o nome da nova revisão e o motivo da alteração." }); return;
    }
    if (mode === "upload" && !pdf) {
      setFeedback({ status: "error", message: "Selecione o PDF da nova revisão." }); return;
    }
    if (original && !pdf) { setFeedback({ status: "error", message: "Envie o PDF junto com o Word original." }); return; }
    const fileError = validateFile(pdf, "pdf", pdfLimit) ?? validateFile(original, "docx", originalLimit);
    if (fileError) { setFeedback({ status: "error", message: fileError }); return; }

    const submittedCriteria: Criterion[] = [];
    for (const item of criteria) {
      const rawWeight = weights[item.id];
      const normalizedWeight = rawWeight?.trim().replace(",", ".");
      if (!item.text.trim() || item.orientations.some((orientation) => !orientation.text.trim()) || (normalizedWeight && (!/^\d+(?:\.\d+)?$/.test(normalizedWeight)
        || !Number.isFinite(Number(normalizedWeight)) || Number(normalizedWeight) < 0 || Number(normalizedWeight) > 1000))) {
        setMode("items"); setQuery(""); setSelectedId(item.id);
        setFeedback({ status: "error", message: `Confira o texto, as orientações e o peso do item ${item.code}. Use um peso entre 0 e 1000.` });
        return;
      }
      const updated = { ...item };
      if (rawWeight !== undefined) {
        if (normalizedWeight) updated.configuredWeight = Number(normalizedWeight);
        else delete updated.configuredWeight;
      }
      submittedCriteria.push(updated);
    }
    if (!submittedCriteria.length) { setFeedback({ status: "error", message: "Nenhum item disponível para esta revisão." }); return; }

    let formData: FormData;
    try {
      requestIdRef.current ??= newRequestId();
      formData = new FormData();
      formData.set("requestId", requestIdRef.current);
      formData.set("modelId", base.modelId);
      formData.set("expectedVersion", String(base.version));
      formData.set("revisionLabel", revisionLabel.trim());
      formData.set("changeNote", changeNote.trim());
      formData.set("criteria", JSON.stringify(submittedCriteria));
      formData.set("actorId", actorId);
      if (pdf) formData.set("pdf", pdf);
      if (original) formData.set("original", original);
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
        <fieldset className={styles.fields} disabled={blocked}>
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
              <p className={styles.hint} role="status">{filtered.length} de {criteria.length} itens</p>
              {selected && <div className={styles.source}><strong>{selected.code}</strong><span>{selected.group}</span>{selected.subgroup && <span>{selected.subgroup}</span>}<small>{selected.source} · {selected.locator}</small></div>}
            </aside>
            {selected ? <div className={styles.itemFields}>
              <label>Texto do item<textarea rows={5} maxLength={30000} required value={selected.text} onChange={(event) => changeItem({ text: event.target.value })} /></label>
              <label>Peso<input type="text" inputMode="decimal" value={weights[selected.id] ?? String(getCriterionWeight(selected) ?? "")}
                onChange={(event) => { changed(); setWeights((current) => ({ ...current, [selected.id]: event.target.value })); }} />
                <small>Peso da fonte: {selected.documentedWeight === null ? "não informado" : selected.documentedWeight.toLocaleString("pt-BR")}. Deixe em branco para usar o peso da fonte.</small>
              </label>
              <label>Critério de verificação<textarea rows={3} value={selected.verificationRule ?? ""} onChange={(event) => changeItem({ verificationRule: event.target.value })} /></label>
              <label>Observação<textarea rows={3} value={selected.sourceNote ?? ""} onChange={(event) => changeItem({ sourceNote: event.target.value })} /></label>
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

          <section className={styles.files} aria-label="Arquivos de referência">
            <p>O arquivo de referência não altera os itens automaticamente. Confira os itens antes de salvar.</p>
            <div className={styles.fileGrid}>
              <label>PDF da revisão {mode === "upload" ? "(obrigatório)" : "(opcional)"}
                <input type="file" accept=".pdf,application/pdf" required={mode === "upload"}
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
          </section>
        </fieldset>
        {feedback && <p className={feedback.status === "error" ? styles.error : styles.success} role={feedback.status === "error" ? "alert" : "status"}>{feedback.message}</p>}
      </div>
      <footer className={styles.footer}>
        <span>{pending ? "Salvando a nova revisão…" : saved ? "Revisão salva." : `${criteria.length} itens na nova revisão`}</span>
        <button type="submit" className="primary" disabled={!available || blocked || !criteria.length}>{pending ? "Salvando…" : saved ? "Revisão salva" : "Salvar nova revisão"}</button>
      </footer>
    </form>
  </section>;
}
