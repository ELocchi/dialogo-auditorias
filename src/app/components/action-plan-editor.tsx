"use client";

import { BackButton, BackHeading } from "@/app/components/back-control";

import { EvidenceThumbnail } from "./evidence-thumbnail";
import { useEffect, useRef, useState } from "react";
import { generatePdf } from "@/lib/pdf/client";
import type { ActionPlanFinding, ActionPlanRow } from "@/lib/pdf/types";
export type { ActionPlanFinding, ActionPlanRow } from "@/lib/pdf/types";
import { formatAuditDate } from "@/domain/operational-records";
import { moduleLabels, type AppModule } from "@/domain/prototype-access";
import styles from "./action-plan-editor.module.css";

export function ActionPlanEditor({ workName, auditDate, auditScore, module, authorName, findings, draft, example, prefillTest = false, autosave = false, onSave, onPublish, onBack }: {
  workName: string;
  auditDate: string;
  auditScore: number | null;
  module: AppModule;
  authorName: string;
  findings: readonly ActionPlanFinding[];
  draft?: readonly ActionPlanRow[];
  example: boolean;
  prefillTest?: boolean;
  autosave?: boolean;
  onSave: (rows: readonly ActionPlanRow[]) => void | Promise<void>;
  onPublish: (publication: { bytes: Uint8Array; fileName: string }) => void | Promise<void>;
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
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const generation = useRef<AbortController | null>(null);
  const activeSaves = useRef(0);
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfYear, pdfMonth] = auditDate.split("-");
  const pdfMonthName = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][Number(pdfMonth) - 1] ?? pdfMonth;
  const pdfWorkName = workName.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "-") || "Obra";
  const pdfName = `${pdfWorkName}-${pdfMonthName}-${pdfYear}.pdf`;
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  useEffect(() => () => generation.current?.abort(), []);
  useEffect(() => {
    if (!autosave || submitted || reviewing) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    let active = true;
    const timer = window.setTimeout(() => {
      activeSaves.current += 1;
      setSavingDraft(true);
      void Promise.resolve().then(() => onSave(rows)).then(() => {
        window.removeEventListener("beforeunload", warn);
        if (active) { setSaveStatus("Rascunho salvo"); setError(""); }
      }).catch(reason => { if (active) { setSaveStatus(""); setError(reason instanceof Error ? reason.message : "Não foi possível salvar o rascunho."); } })
        .finally(() => { activeSaves.current -= 1; setSavingDraft(activeSaves.current > 0); });
    }, 1000);
    return () => { active = false; window.clearTimeout(timer); window.removeEventListener("beforeunload", warn); };
  }, [autosave, rows, onSave, submitted, reviewing]);
  const update = (id: string, field: keyof ActionPlanRow, value: string) => {
    setSubmitted(false);
    setError("");
    setSaveStatus("");
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
      <div><p className="kicker">REVISÃO DO PLANO DE AÇÃO</p><BackHeading><BackButton label="Voltar ao preenchimento" disabled={submitted || publishing} onClick={returnToForm} /><h2 id="action-plan-review-title">Conferir antes de publicar</h2></BackHeading><p>Revise as ações corretivas e o PDF antes da publicação.</p></div>
    </header>
    <div className="audit-review-reference">
      <div><small>OBRA</small><strong>{workName}</strong></div>
      <div><small>DISCIPLINA</small><strong>{moduleLabels[module]}</strong></div>
      <div><small>DATA DA AUDITORIA</small><strong>{formatAuditDate(auditDate)}</strong></div>
      <div><small>RESPONSÁVEL PELO PLANO</small><strong>{authorName}</strong></div>
    </div>
    <div className="audit-review-actions">
      <button type="button" className="primary" disabled={submitted || publishing} onClick={async () => { if (publishing) return; setPublishing(true); setError(""); try { await onPublish(pendingPublication); setSubmitted(true); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível publicar o plano."); } finally { setPublishing(false); } }}>{submitted ? "Plano de ação publicado" : publishing ? "Publicando…" : "Publicar plano de ação"}</button>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <section className="audit-review-pdf">
      <div><h3>Prévia do plano de ação em PDF</h3><span><a className="secondary" href={pdfUrl} target="_blank" rel="noreferrer">Abrir PDF em nova guia</a><a className="primary" href={pdfUrl} download={pdfName}>Baixar PDF</a></span></div>
      <iframe src={pdfUrl} title="Prévia do plano de ação em PDF" />
    </section>
  </section>;
  return <>
    <div className="page-intro">
      <div><BackHeading><BackButton label={`Voltar à ${moduleLabels[module]}`} tooltip={autosave ? "Salvar e voltar" : "Voltar"} disabled={savingDraft || generatingPdf} onClick={async () => { if (!autosave) { onBack(); return; } setSavingDraft(true); try { await onSave(rows); onBack(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); } finally { setSavingDraft(false); } }} /><h2>Plano de ação</h2></BackHeading><p className="muted">{workName} · {moduleLabels[module]} · auditoria de {formatAuditDate(auditDate)}</p><p className={styles.extractionSummary}>{findings.length} não conformidade{findings.length === 1 ? "" : "s"} extraída{findings.length === 1 ? "" : "s"} do relatório publicado.</p></div>
    </div>
    <section className="panel">
      <div className="panel-heading"><div><span className="section-label">APONTAMENTOS DA AUDITORIA</span><h3>Ações corretivas</h3></div>{example && <span className="badge badge-amber">Prévia de teste</span>}</div>
      {rows.length ? <form className={styles.form} onSubmit={async (event) => {
        event.preventDefault();
        if (generation.current) return;
        if (rows.some((row) => !row.correctiveAction.trim() || !row.responsible.trim() || !row.startDate || !row.dueDate)) {
          setError("Preencha a ação corretiva, o responsável e as datas previstas de cada apontamento antes de publicar.");
          return;
        }
        const controller = new AbortController();
        generation.current = controller;
        setGeneratingPdf(true);
        setError("");
        try {
          const bytes = await generatePdf({
            kind: "action-plan", input: { workName, auditDate, auditScore, module, authorName, rows },
            baseUrl: window.location.href,
            photos: rows.flatMap((row) => (row.evidencePhotos ?? []).flatMap((photo) => photo.url
              ? [{ reference: photo.url, name: photo.name, url: photo.url }] : [])),
          }, controller.signal);
          if (controller.signal.aborted) return;
          if (pdfUrl) URL.revokeObjectURL(pdfUrl);
          const nextUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" }));
          setPdfUrl(nextUrl);
          await onSave(rows);
          setPendingPublication({ bytes, fileName: pdfName });
          setReviewing(true);
          setSubmitted(false);
          setError("");
        } catch (reason) {
          if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Não foi possível gerar o PDF do plano de ação. Tente novamente.");
        } finally {
          if (generation.current === controller) generation.current = null;
          if (!controller.signal.aborted) setGeneratingPdf(false);
        }
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
                  ? <EvidenceThumbnail thumbnailSrc={photo.thumbnailUrl} originalSrc={photo.url} alt={`Evidência do item ${row.item}`} width={150} height={96}  key={`${photo.name}:${photoIndex}`} caption={<small>{photo.name}</small>} />
                  : <span className={styles.evidenceName} key={`${photo.name}:${photoIndex}`}>{photo.name}</span>)}</div>
                  : <p className={styles.noEvidence}>Nenhuma foto anexada.</p>}</div>
              </div>
              <label className={styles.full}>Ações corretivas<textarea required disabled={generatingPdf} value={row.correctiveAction} onChange={(event) => update(row.id, "correctiveAction", event.target.value)} placeholder="Informe as medidas tomadas para sanar a pendência" /></label>
              <div className={styles.fields}>
                <label>Responsável(is)<input required disabled={generatingPdf} value={row.responsible} onChange={(event) => update(row.id, "responsible", event.target.value)} /></label>
                <label>Data de início prevista<input required disabled={generatingPdf} type="date" value={row.startDate} onChange={(event) => update(row.id, "startDate", event.target.value)} /></label>
                <label>Data final prevista<input required disabled={generatingPdf} type="date" value={row.dueDate} onChange={(event) => update(row.id, "dueDate", event.target.value)} /></label>
              </div>
            </div>}
          </article>;
        })}</div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}><span role="status">{autosave ? (savingDraft ? "Salvando rascunho…" : saveStatus) : prefillTest ? "Dados de teste preenchidos. Revise antes de continuar." : ""}</span><button type="button" className="secondary" disabled={savingDraft || generatingPdf} onClick={async () => { setSavingDraft(true); setError(""); try { await onSave(rows); setSaveStatus("Rascunho salvo"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao salvar."); } finally { setSavingDraft(false); } }}>{savingDraft ? "Salvando…" : error ? "Tentar salvar" : "Salvar rascunho"}</button><button type="submit" className="primary" disabled={generatingPdf || savingDraft}>{generatingPdf ? "Gerando prévia..." : "Revisar plano de ação"}</button></div>
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
