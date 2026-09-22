"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { referenceDocuments } from "@/domain/reference-documents";
import { getCriterionDisplayTitle, getCriterionWeight, securityGroups, securityWeightConfiguration, type Criterion } from "@/domain/catalogs";
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
const verificationRules = [
  { value: "Conforme/Não Conforme", label: "Correto / Não conforme" },
  { value: "Conforme/Não Conforme/Não Aplicável", label: "Correto / Não conforme / Não aplicável" },
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

function groupHeading(group: string) {
  const match = group.match(/^([^\s.—–-]+)\s*(?:\.|—|–|-)\s*(.+)$/);
  return { number: match?.[1] ?? "1", title: (match?.[2] ?? group).toLocaleUpperCase("pt-BR") };
}

function previewSubgroupHeading(item: Criterion) {
  const match = item.subgroup.match(/^([\d.]+)\s*(?:—|–|-)\s*(.+)$/);
  return { code: match?.[1] ?? item.code.split(".").slice(0, -1).join("."), title: match?.[2] ?? item.subgroup };
}

function AuditorFormPreview({ item, security }: { item: Criterion; security: boolean }) {
  const group = groupHeading(item.group);
  const subgroup = previewSubgroupHeading(item);
  const quantitative = item.verificationRule === "Dividido pela quantidade verificada";
  const notApplicable = item.verificationRule === "Conforme/Não Conforme/Não Aplicável";
  return <section className={styles.auditorPreview} aria-label="Visualização do preenchimento pelo auditor">
    <header><span className={styles.eyebrow}>VISUALIZAÇÃO DO AUDITOR</span><h3>Preenchimento do item</h3></header>
    <div className="question-content">
      <div className="question-group-heading"><span className="question-group-number">{group.number}</span><span className="question-group-title">{group.title}</span></div>
      {item.subgroup && <div className="question-context"><span className="question-code">{subgroup.code}</span><span className="question-subgroup-title">{subgroup.title}</span></div>}
      <div className="question-title-row"><div className="question-title-content"><span className="question-code">{item.code}</span><h3>{getCriterionDisplayTitle(item)}</h3></div><div className="question-score"><small>NOTA</small><strong>—</strong></div></div>
      <p className="criterion-description"><strong>Descrição:</strong> {item.text}</p>
      {(security ? item.analysisCriterion : item.verificationRule) && <p className="criterion-detail"><strong>Critério de análise:</strong> {security ? item.analysisCriterion : item.verificationRule}</p>}
      <div className="answer-fieldset">
        {security ? <div className="answer-options answer-options-security"><button type="button" className="answer" disabled><span>×</span><small>Totalmente não conforme</small></button><button type="button" className="answer" disabled><span>!</span><small>Parcialmente não conforme</small></button><button type="button" className="answer" disabled><span>✓</span><small>Conforme</small></button><button type="button" className="answer" disabled><span>—</span><small>Não aplicável</small></button><span className="inline-photo-cell"><button type="button" className="inline-photo" disabled aria-label="Adicionar foto">+</button></span></div> : quantitative ? <div className="quantity-checks"><div className="quantity-check"><button type="button" className="remove-verified-item" disabled aria-label="Remover item">×</button><input disabled value="Item verificado 1" readOnly /><button type="button" className="check-option noncompliant" disabled>×</button><button type="button" className="check-option compliant" disabled>✓</button><span className="inline-photo-cell"><button type="button" className="inline-photo" disabled aria-label="Adicionar foto">+</button></span></div><button type="button" className="add-verified-item" disabled aria-label="Adicionar item">+</button></div> : <div className={`answer-options answer-options-quality${notApplicable ? " has-not-applicable" : ""}`}>
          <button type="button" className="answer answer-Noconforme" disabled><span>×</span><small>Não conforme</small></button>
          <button type="button" className="answer answer-Conforme" disabled><span>✓</span><small>Conforme</small></button>
          {notApplicable && <button type="button" className="answer answer-NA" disabled><span>—</span><small>Não aplicável</small></button>}
          <span className="inline-photo-cell"><button type="button" className="inline-photo" disabled aria-label="Adicionar foto">+</button></span>
        </div>}
      </div>
      <label className="question-note">Observações<textarea disabled placeholder="Registre a observação da verificação…" /></label>
    </div>
  </section>;
}

export function CatalogEditorPanel({ version, available, setupPending, actorId, onSaved, onClose }: CatalogEditorPanelProps) {
  const unavailableMessage = setupPending ? "O salvamento de revisões estará disponível após a atualização da plataforma." : "Não foi possível consultar a revisão atual. Atualize a página antes de salvar.";
  // Keep the reviewed base revision while editing, including after a conflict.
  const [base] = useState(version);
  const baseLabel = base.label.split(/\s+—\s+ajuste\s+\d+/i)[0].trim();
  const defaultSecurityGroupWeights = new Map<string, number>(securityGroups.map(([code, , weight]) => [code, weight]));
  const [criteria, setCriteria] = useState<Criterion[]>(() => {
    const migrateEqualSecurityWeights = version.modelId === "security-it07-r02"
      && version.criteria.length > 0
      && version.criteria.every((item) => (getCriterionWeight(item) ?? 0) === 1);
    const equalSecurityWeight = version.criteria.length ? Number((10 / version.criteria.length).toFixed(8)) : 0;
    return version.criteria.map((item) => ({
      ...item,
      configuredWeight: migrateEqualSecurityWeights ? equalSecurityWeight : item.configuredWeight,
      analysisCriterion: version.modelId === "security-it07-r02" ? item.analysisCriterion ?? item.orientations.map((orientation) => orientation.text).join("\n\n") : item.analysisCriterion,
      groupWeight: version.modelId === "security-it07-r02" ? item.groupWeight ?? defaultSecurityGroupWeights.get(item.group.match(/^\d+/)?.[0] ?? "") ?? 1 : item.groupWeight,
      orientations: item.orientations.map((orientation) => ({ ...orientation, pages: [...orientation.pages] })),
    }));
  });
  const referenceCriteriaRef = useRef<Criterion[]>(structuredClone(criteria));
  const [mode, setMode] = useState<"items" | "weights" | "upload">("items");
  const [selectedId, setSelectedId] = useState(version.criteria[0]?.id ?? "");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(version.criteria.map((item) => item.group)));
  const [collapsedSubgroups, setCollapsedSubgroups] = useState<Set<string>>(() => new Set(version.criteria.map((item) => `${item.group}:${item.subgroup || "Itens do grupo"}`)));
  const [collapsedWeightGroups, setCollapsedWeightGroups] = useState<Set<string>>(() => new Set(version.criteria.map((item) => item.group)));
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [revisionLabel, setRevisionLabel] = useState(() => version.label.split(/\s+—\s+ajuste\s+\d+/i)[0].trim());
  const [pdf, setPdf] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ status: "success" | "error"; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const savingRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);
  const pdfPreviewUrlRef = useRef<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const formId = useId();

  useEffect(() => {
    headingRef.current?.focus();
    return () => {
      if (pdfPreviewUrlRef.current) URL.revokeObjectURL(pdfPreviewUrlRef.current);
    };
  }, []);

  const selected = criteria.find((item) => item.id === selectedId) ?? criteria[0];
  const groupedCriteria = criteria.reduce<Record<string, Criterion[]>>((groups, item) => {
    (groups[item.group] ??= []).push(item);
    return groups;
  }, {});
  const blocked = pending || saved;

  const changed = () => {
    requestIdRef.current = null;
    setFeedback(null);
  };
  const changeItem = (patch: Partial<Pick<Criterion, "code" | "title" | "text" | "verificationRule" | "analysisCriterion">>) => {
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
  const currentScoreTotal = criteriaWithWeights().reduce((total, item) => total + (getCriterionWeight(item) ?? 0), 0);

  const validateCriteria = (submittedCriteria = criteriaWithWeights(), validateDraftWeights = true): Criterion[] | null => {
    const submittedGroups = submittedCriteria.reduce<Record<string, Criterion[]>>((groups, item) => {
      (groups[item.group] ??= []).push(item);
      return groups;
    }, {});
    for (const item of submittedCriteria) {
      const rawWeight = validateDraftWeights ? weights[item.id] : undefined;
      const normalizedWeight = rawWeight?.trim().replace(",", ".");
      if (!item.id.trim() || !item.code.trim() || !item.title.trim() || !item.text.trim() || !item.group.trim() || !item.source.trim()
        || (base.modelId === "security-it07-r02" && !item.analysisCriterion?.trim())
        || item.orientations.some((orientation) => !orientation.text.trim()) || (normalizedWeight && (!/^\d+(?:\.\d+)?$/.test(normalizedWeight)
        || !Number.isFinite(Number(normalizedWeight)) || Number(normalizedWeight) < 0 || Number(normalizedWeight) > 1000))) {
        setMode("items"); setSelectedId(item.id);
        setFeedback({ status: "error", message: `Preencha os campos obrigatórios e confira a nota final do item ${item.code || "sem código"}. Use um valor entre 0 e 1000.` });
        return null;
      }
    }
    if (!submittedCriteria.length) { setFeedback({ status: "error", message: "A revisão precisa ter pelo menos um item." }); return null; }
    if (new Set(submittedCriteria.map((item) => item.id.trim())).size !== submittedCriteria.length
      || new Set(submittedCriteria.map((item) => item.code.trim())).size !== submittedCriteria.length) {
      setFeedback({ status: "error", message: "Cada item precisa ter código e identificação únicos." }); return null;
    }
    if (base.modelId === "security-it07-r02") {
      const invalidItem = submittedCriteria.find((item) => (getCriterionWeight(item) ?? 0) <= 0);
      const invalidGroup = Object.values(submittedGroups).find((items) => (items[0]?.groupWeight ?? 0) <= 0);
      if (invalidItem || invalidGroup) {
        setMode("weights");
        setFeedback({ status: "error", message: "Informe um peso maior que zero para todos os grupos e itens de Segurança." });
        return null;
      }
    }
    const scoreTotal = submittedCriteria.reduce((total, item) => total + (getCriterionWeight(item) ?? 0), 0);
    if (Math.abs(scoreTotal - 10) > 0.000001) {
      setFeedback({ status: "error", message: `A soma das notas dos itens precisa ser 10,00. Soma atual: ${scoreTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.` });
      return null;
    }
    return submittedCriteria;
  };

  const addItem = (group = selected?.group ?? criteria[0]?.group ?? "1. Novo grupo", subgroup = selected?.group === group ? selected.subgroup : "") => {
    const usedCodes = new Set(criteria.map((item) => item.code));
    let number = criteria.length + 1;
    while (usedCodes.has(`NOVO-${number}`)) number += 1;
    const id = `ITEM-${newRequestId()}`;
    const item: Criterion = {
      id, code: `NOVO-${number}`, title: "Novo item", text: "Descreva o item de auditoria",
      group, subgroup, source: referenceDocuments[base.modelId].catalogName,
      locator: "Novo item", documentedWeight: null, configuredWeight: base.modelId === "security-it07-r02" ? securityWeightConfiguration.itemWeight : 0,
      groupWeight: base.modelId === "security-it07-r02" ? criteria.find((entry) => entry.group === group)?.groupWeight ?? 1 : undefined,
      verificationRule: base.modelId === "security-it07-r02" ? undefined : verificationRules[0].value,
      analysisCriterion: base.modelId === "security-it07-r02" ? "Descreva o critério de análise" : undefined, orientations: [],
    };
    changed();
    setCriteria((items) => [...items, item]);
    setCollapsedGroups((current) => { const next = new Set(current); next.delete(group); return next; });
    if (subgroup) setCollapsedSubgroups((current) => { const next = new Set(current); next.delete(`${group}:${subgroup}`); return next; });
    setSelectedId(id);
  };
  const addSubgroup = (group: string) => {
    const groupItems = criteria.filter((item) => item.group === group);
    const existingSubgroups = new Set(groupItems.map((item) => item.subgroup).filter(Boolean));
    const groupCode = groupParts(group).code || String(Object.keys(groupedCriteria).indexOf(group) + 1).padStart(2, "0");
    let number = existingSubgroups.size + 1;
    let subgroup = `${groupCode}.${String(number).padStart(2, "0")} — Novo subgrupo`;
    while (existingSubgroups.has(subgroup)) {
      number += 1;
      subgroup = `${groupCode}.${String(number).padStart(2, "0")} — Novo subgrupo`;
    }
    addItem(group, subgroup);
  };
  const addGroup = () => {
    const groups = new Set(criteria.map((item) => item.group));
    let number = groups.size + 1;
    while ([...groups].some((group) => group.startsWith(`${number}.`) || group.startsWith(`${number} —`))) number += 1;
    addItem(`${number}. Novo grupo`);
  };
  const groupParts = (group: string) => {
    const match = group.match(/^([^\s.—–-]+)\s*(?:\.|—|–|-)\s*(.+)$/);
    return { code: match?.[1] ?? "", title: match?.[2] ?? group };
  };
  const changeGroupParts = (code: string, title: string) => {
    if (!selected) return;
    const previousGroup = selected.group;
    const previousCode = groupParts(previousGroup).code;
    const nextGroup = [code.trim(), title.trim()].filter(Boolean).join(" — ");
    changed();
    setCriteria((items) => items.map((item) => {
      if (item.group !== previousGroup) return item;
      const nextCode = previousCode && code.trim() && item.code.startsWith(`${previousCode}.`)
        ? `${code.trim()}${item.code.slice(previousCode.length)}` : item.code;
      const nextSubgroup = previousCode && code.trim() && item.subgroup.startsWith(`${previousCode}.`)
        ? `${code.trim()}${item.subgroup.slice(previousCode.length)}` : item.subgroup;
      return { ...item, code: nextCode, subgroup: nextSubgroup, group: nextGroup };
    }));
  };
  const subgroupParts = (subgroup: string, itemCode: string) => {
    const match = subgroup.match(/^([\d.]+)\s*(?:—|–|-)\s*(.+)$/);
    return { code: match?.[1] ?? itemCode.split(".").slice(0, -1).join("."), title: match?.[2] ?? subgroup };
  };
  const changeSubgroupParts = (code: string, title: string) => {
    if (!selected) return;
    const previousGroup = selected.group;
    const previousSubgroup = selected.subgroup;
    const previousCode = subgroupParts(previousSubgroup, selected.code).code;
    const nextSubgroup = [code.trim(), title.trim()].filter(Boolean).join(" — ");
    changed();
    setCriteria((items) => items.map((item) => {
      if (item.group !== previousGroup || item.subgroup !== previousSubgroup) return item;
      const nextCode = previousCode && code.trim() && item.code.startsWith(`${previousCode}.`)
        ? `${code.trim()}${item.code.slice(previousCode.length)}` : item.code;
      return { ...item, code: nextCode, subgroup: nextSubgroup };
    }));
  };
  const removeItem = () => {
    if (!selected || criteria.length <= 1) return;
    changed();
    const remaining = criteria.filter((item) => item.id !== selected.id);
    setCriteria(remaining);
    setSelectedId(remaining[0]?.id ?? "");
  };
  const removeGroup = () => {
    if (!selected || new Set(criteria.map((item) => item.group)).size <= 1) return;
    changed();
    const remaining = criteria.filter((item) => item.group !== selected.group);
    setCriteria(remaining);
    setSelectedId(remaining[0]?.id ?? "");
  };
  const changeGroupWeight = (group: string, value: string) => {
    const normalized = value.trim().replace(",", ".");
    if (normalized && !/^\d+(?:\.\d+)?$/.test(normalized)) return;
    changed();
    setCriteria((items) => items.map((item) => item.group === group ? { ...item, groupWeight: normalized ? Number(normalized) : 0 } : item));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current || saved) return;
    setFeedback(null);
    if (!available) { setFeedback({ status: "error", message: unavailableMessage }); return; }
    if (mode === "upload" && !revisionLabel.trim()) {
      setFeedback({ status: "error", message: "Informe o nome da nova revisão." }); return;
    }
    if (mode === "upload" && !pdf) {
      setFeedback({ status: "error", message: "Selecione o PDF da nova revisão." }); return;
    }
    const fileError = mode === "upload" ? validateFile(pdf, "pdf", pdfLimit) : null;
    if (fileError) { setFeedback({ status: "error", message: fileError }); return; }

    const submittedCriteria = mode === "upload"
      ? validateCriteria(referenceCriteriaRef.current, false)
      : validateCriteria();
    if (!submittedCriteria) return;

    let formData: FormData;
    try {
      requestIdRef.current ??= newRequestId();
      formData = new FormData();
      formData.set("requestId", requestIdRef.current);
      formData.set("modelId", base.modelId);
      formData.set("expectedVersion", String(base.version));
      formData.set("revisionLabel", mode === "upload" ? revisionLabel.trim() : baseLabel);
      formData.set("changeNote", mode === "upload" ? "Documento de referência atualizado." : "Itens do roteiro atualizados.");
      formData.set("criteria", JSON.stringify(submittedCriteria));
      formData.set("actorId", actorId);
      if (mode === "upload" && pdf) formData.set("pdf", pdf);
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
      <div><span className={styles.eyebrow}>ADMINISTRAÇÃO DE ROTEIROS</span><h2 id={headingId} ref={headingRef} tabIndex={-1}>Editar roteiro</h2><p>{referenceDocuments[base.modelId].catalogName.replace(" rev. 02", "")} · Revisão {baseLabel} · {criteria.length} itens</p></div>
      <button type="button" className="secondary" disabled={pending}
        onClick={() => { if (!savingRef.current) onClose(); }}>Voltar ao documento</button>
    </header>

    <form id={formId} className={styles.form} onSubmit={submit} aria-busy={pending}>
      <div className={styles.body}>
        {!available && <p className={styles.availability} role="status">{unavailableMessage}</p>}
        <fieldset className={styles.fields} disabled={blocked}>
          <div className={styles.modes} role="group" aria-label="Como revisar o roteiro">
            <button type="button" aria-pressed={mode === "items"} className={mode === "items" ? styles.activeMode : undefined}
              onClick={() => { changed(); setMode("items"); }}>Editar itens</button>
            {base.modelId === "security-it07-r02" && <button type="button" aria-pressed={mode === "weights"} className={mode === "weights" ? styles.activeMode : undefined}
              onClick={() => { changed(); setMode("weights"); }}>Editar pesos</button>}
            <button type="button" aria-pressed={mode === "upload"} className={mode === "upload" ? styles.activeMode : undefined}
              onClick={() => { changed(); setMode("upload"); }}>Enviar nova revisão</button>
          </div>

          {mode === "items" ? <section className={styles.editor} aria-label="Itens do roteiro">
            <aside className={styles.selection}>
              <h3>Itens do roteiro</h3>
              <p className={styles.hint} role="status">{new Set(criteria.map((item) => item.group)).size} grupos · {criteria.length} itens</p>
              <div className={styles.editorTree}>
                {Object.entries(groupedCriteria).map(([group, items]) => {
                  const collapsed = collapsedGroups.has(group);
                  const subgroups = items.reduce<Record<string, Criterion[]>>((result, item) => {
                    (result[item.subgroup || "Itens do grupo"] ??= []).push(item);
                    return result;
                  }, {});
                  return <section className={styles.editorGroup} key={group}>
                    <button type="button" className={styles.editorGroupToggle} aria-expanded={!collapsed} onClick={() => setCollapsedGroups((current) => {
                      const next = new Set(current);
                      if (next.has(group)) next.delete(group); else next.add(group);
                      return next;
                    })}><span><strong>{groupParts(group).code}</strong><span className={styles.treeTitle}>{groupParts(group).title}</span></span><span aria-hidden="true">⌄</span></button>
                    {!collapsed && <><div className={styles.editorSubgroups}>{Object.entries(subgroups).map(([subgroup, subgroupItems]) => {
                      const subgroupKey = `${group}:${subgroup}`;
                      const subgroupCollapsed = collapsedSubgroups.has(subgroupKey);
                      return <section className={styles.editorSubgroup} key={subgroupKey}>
                        <button type="button" className={styles.editorSubgroupToggle} aria-expanded={!subgroupCollapsed} onClick={() => setCollapsedSubgroups((current) => {
                          const next = new Set(current);
                          if (next.has(subgroupKey)) next.delete(subgroupKey); else next.add(subgroupKey);
                          return next;
                        })}><span><strong>{subgroupParts(subgroup, subgroupItems[0]?.code ?? "").code}</strong><span className={styles.treeTitle}>{subgroupParts(subgroup, subgroupItems[0]?.code ?? "").title}</span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
                        {!subgroupCollapsed && <><div className={styles.editorItems}>{subgroupItems.map((item) => <button type="button" key={item.id} className={item.id === selected?.id ? styles.selectedEditorItem : undefined} aria-pressed={item.id === selected?.id} onClick={() => setSelectedId(item.id)}><strong>{item.code}</strong><span>{item.title}</span></button>)}</div><button type="button" className={`${styles.groupAddItem} ${styles.itemAddButton}`} onClick={() => addItem(group, subgroup)}>+ Adicionar item</button></>}
                      </section>;
                    })}</div><button type="button" className={styles.groupAddItem} onClick={() => addSubgroup(group)}>+ Adicionar subgrupo</button></>}
                  </section>;
                })}
              </div>
              <button type="button" className={styles.addGroup} onClick={addGroup}>+ Adicionar grupo</button>
            </aside>
            {selected ? <div className={styles.itemFields}>
              <div className={styles.identityFields}>
                <label>Código do grupo<input required maxLength={100} value={groupParts(selected.group).code} onChange={(event) => changeGroupParts(event.target.value, groupParts(selected.group).title)} /></label>
                <label>Título do grupo<input required maxLength={2000} value={groupParts(selected.group).title} onChange={(event) => changeGroupParts(groupParts(selected.group).code, event.target.value)} /></label>
              </div>
              <div className={styles.identityFields}>
                <label>Código do subgrupo<input maxLength={100} value={subgroupParts(selected.subgroup, selected.code).code} onChange={(event) => changeSubgroupParts(event.target.value, subgroupParts(selected.subgroup, selected.code).title)} /></label>
                <label>Título do subgrupo<input maxLength={2000} value={subgroupParts(selected.subgroup, selected.code).title} onChange={(event) => changeSubgroupParts(subgroupParts(selected.subgroup, selected.code).code, event.target.value)} placeholder="Itens do grupo" /></label>
              </div>
              <div className={styles.identityFields}>
                <label>Código do item<input required maxLength={100} value={selected.code} onChange={(event) => changeItem({ code: event.target.value })} /></label>
                <label>Título do item<input required maxLength={2000} value={selected.title} onChange={(event) => changeItem({ title: event.target.value })} /></label>
              </div>
              <label>Descrição<textarea rows={4} maxLength={30000} required value={selected.text} onChange={(event) => changeItem({ text: event.target.value })} /></label>
              {base.modelId === "security-it07-r02" ? <label>Critério de análise<textarea rows={4} maxLength={30000} required value={selected.analysisCriterion ?? ""} onChange={(event) => changeItem({ analysisCriterion: event.target.value })} /></label> : <label>Critério<select className={`filter-select ${styles.platformFilter}`} value={selected.verificationRule ?? ""} onChange={(event) => changeItem({ verificationRule: event.target.value || undefined })}>
                <option value="">Não definido</option>
                {verificationRules.map((rule) => <option value={rule.value} key={rule.value}>{rule.label}</option>)}
              </select></label>}
              {base.modelId !== "security-it07-r02" && <label>Nota do item<input type="text" inputMode="decimal" value={weights[selected.id] ?? String(getCriterionWeight(selected) ?? "")}
                onChange={(event) => { changed(); setWeights((current) => ({ ...current, [selected.id]: event.target.value })); }} />
              </label>}
              <div className={styles.removeActions}>
                <button type="button" onClick={removeItem} disabled={criteria.length <= 1}>Excluir item</button>
                <button type="button" onClick={removeGroup} disabled={new Set(criteria.map((item) => item.group)).size <= 1}>Excluir grupo</button>
              </div>
            </div> : <p className={styles.empty}>Nenhum item corresponde à busca.</p>}
            {selected && <AuditorFormPreview item={criteriaWithWeights().find((item) => item.id === selected.id) ?? selected} security={base.modelId === "security-it07-r02"} />}
          </section> : mode === "weights" ? <section className={styles.weightsEditor} aria-label="Pesos do roteiro de Segurança">
            <header><h3>Pesos de Segurança</h3></header>
            <div className={styles.weightsTableWrap}><table className={styles.weightsTable}>
              <thead><tr><th scope="col">Grupo</th><th scope="col">Item</th><th scope="col">Peso do item</th></tr></thead>
              {Object.entries(groupedCriteria).map(([group, items]) => {
                const collapsed = collapsedWeightGroups.has(group);
                return <tbody key={group}>
                {(collapsed ? items.slice(0, 1) : items).map((item, index) => <tr key={item.id} className={collapsed ? styles.collapsedWeightRow : undefined}>
                  {index === 0 && <th scope="rowgroup" rowSpan={collapsed ? 1 : items.length}>
                    <span className={styles.weightGroupTitle}><strong>{group}</strong><button type="button" aria-expanded={!collapsed} aria-label={collapsed ? `Expandir grupo ${group}` : `Recolher grupo ${group}`} onClick={() => setCollapsedWeightGroups((current) => {
                      const next = new Set(current);
                      if (next.has(group)) next.delete(group); else next.add(group);
                      return next;
                    })}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={collapsed ? "m9 18 6-6-6-6" : "m6 9 6 6 6-6"} /></svg></button></span>
                    {!collapsed && <small>{items.length} {items.length === 1 ? "item" : "itens"}</small>}
                    {!collapsed && <label>Peso do grupo<input aria-label={`Peso do grupo ${group}`} type="text" inputMode="decimal" value={String(item.groupWeight ?? 0)} onChange={(event) => changeGroupWeight(group, event.target.value)} /></label>}
                  </th>}
                  {collapsed ? <><td className={styles.collapsedWeightMessage}>{items.length} {items.length === 1 ? "item" : "itens"}</td><td aria-hidden="true" /></> : <><td><strong>{item.code}</strong><span>{item.title}</span></td>
                  <td><label><span className={styles.visuallyHidden}>{`Peso do item ${item.code}`}</span><input aria-label={`Peso do item ${item.code}`} type="text" inputMode="decimal" value={weights[item.id] ?? String(getCriterionWeight(item) ?? "")} onChange={(event) => { changed(); setWeights((current) => ({ ...current, [item.id]: event.target.value })); }} /></label></td></>}
                </tr>)}
              </tbody>})}
            </table></div>
          </section> : <section className={styles.uploadIntroduction}><h3>Documento de referência do roteiro</h3></section>}

          {mode === "upload" && <><section className={styles.revision} aria-label="Identificação da nova revisão">
            <label>Nome da nova revisão<input required maxLength={80} value={revisionLabel} onChange={(event) => { changed(); setRevisionLabel(event.target.value); }} /></label>
          </section>

          <section className={styles.files} aria-label="Arquivos de referência">
            <div className={styles.fileGrid}>
              <div className={styles.fileField}>
                <span>PDF da revisão</span>
                <input ref={pdfInputRef} id={`${formId}-pdf`} className={styles.fileInput} type="file" accept=".pdf,application/pdf" required
                  onChange={(event) => {
                    changed();
                    const file = event.target.files?.[0] ?? null;
                    if (pdfPreviewUrlRef.current) URL.revokeObjectURL(pdfPreviewUrlRef.current);
                    const previewUrl = file ? URL.createObjectURL(file) : null;
                    pdfPreviewUrlRef.current = previewUrl;
                    setPdf(file);
                    setPdfPreviewUrl(previewUrl);
                  }} />
                <label className={styles.filePicker} htmlFor={`${formId}-pdf`}>
                  <strong>Escolher arquivo</strong>
                  <span>{pdf?.name ?? "Nenhum arquivo selecionado"}</span>
                </label>
              </div>
            </div>
            {pdfPreviewUrl && <div className={styles.pdfPreview}><strong>Prévia do PDF</strong><iframe src={pdfPreviewUrl} title={`Prévia do PDF ${pdf?.name ?? ""}`} /><button type="button" className={styles.removePdf} aria-label="Remover PDF" title="Remover PDF" onClick={() => {
              changed();
              if (pdfPreviewUrlRef.current) URL.revokeObjectURL(pdfPreviewUrlRef.current);
              pdfPreviewUrlRef.current = null;
              if (pdfInputRef.current) pdfInputRef.current.value = "";
              setPdf(null);
              setPdfPreviewUrl(null);
            }}>×</button></div>}
          </section>
          </>}
        </fieldset>
        {feedback && <p className={feedback.status === "error" ? styles.error : styles.success} role={feedback.status === "error" ? "alert" : "status"}>{feedback.message}</p>}
      </div>
      <footer className={styles.footer}>
        {mode !== "upload" && <span>{pending ? "Salvando alterações…" : saved ? "Alterações salvas." : `${criteria.length} itens no roteiro · Soma dos pesos: ${currentScoreTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} de 10,00`}</span>}
        <button type="submit" className="primary" disabled={!available || blocked || !criteria.length}>{pending ? "Salvando…" : saved ? "Alterações salvas" : mode === "upload" ? "Salvar documento de referência" : "Salvar alterações"}</button>
      </footer>
    </form>
  </section>;
}
