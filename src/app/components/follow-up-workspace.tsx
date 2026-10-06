"use client";
import { SlowOperation } from "./slow-operation";
import { DownloadButton } from "./download-button";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { DemoUser, Visit } from "@/domain/prototype-access";
import type { WorkRecord } from "@/domain/operational-records";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { FollowUpFinding } from "@/lib/follow-up/service";
import { maxPhotoBytes, maxPhotosPerFinding } from "@/lib/follow-up/photos";
import { completeFindingAction, completeWorkFindingAction, createWorkFindingAction, uploadFindingPhotosAction } from "@/app/follow-up/actions";
import { useCursorList } from "./use-cursor-list";
import { ListFilters, ListPagination, ListStatus } from "./list-controls";
import { listWorkFinding, listSavedFinding, listReportHref } from "@/lib/lists/presentation";
import { useFollowUpPhotoStore } from "./use-follow-up-photos";
import { FollowUpPhotoPicker, FollowUpWorkFindingRow, FollowUpSavedFindingRow } from "./follow-up-workspace-rows";
import styles from "./follow-up-workspace.module.css";

type Props = { user: DemoUser; visits: readonly Visit[]; works: readonly WorkRecord[]; actor: AgendaActorContext; agendaAvailable: boolean };
const emptyFinding = (): FollowUpFinding => ({ id: "", location: "", description: "", correction: "", serious: false });

export function FollowUpWorkspace(props: Props) {
  const { userId, profile, engineeringScope, administrativeScope } = props.actor;
  return <FollowUpWorkspaceSession key={JSON.stringify([userId, profile, engineeringScope, administrativeScope])} {...props} />;
}

function FollowUpWorkspaceSession({ user, works, actor }: Props) {
  const discipline = user.role === "quality-auditor" ? "quality" : "safety";
  const authorizedWorks = useMemo(() => new Map(works.map((work) => [work.id, work])), [works]);
  const { anchor: findingsListAnchor, ...findingsList } = useCursorList(actor, "findings", "follow-up-findings", discipline);
  const { anchor: reportsListAnchor, ...reportsList } = useCursorList(actor, "reports", "follow-up-reports", discipline);
  const retry = findingsList.retry;
  const reportWorks = works.filter(work => !work.isDemo && user.workModuleScopes?.some(scope => scope.workId === work.id && scope.module === discipline));
  const photoStore = useFollowUpPhotoStore(actor);
  const filterWorkId = findingsList.state.workId;
  const [adding, setAdding] = useState(false);
  const [targetWorkId, setTargetWorkId] = useState("");
  const [finding, setFinding] = useState<FollowUpFinding>(emptyFinding);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const mutationPending = useRef(false);
  const available = !!findingsList.data && !findingsList.loading && !findingsList.error;
  const disabled = pending || !available;
  const items = findingsList.data?.items ?? [];
  const createReportWork = reportWorks.find(work => work.id === filterWorkId) ?? reportWorks[0];
  const visibleReports = (reportsList.data?.items ?? []).map(report => ({ ...report, title: report.title!,
    displayDate: `${report.date}T12:00:00-03:00`, pdfHref: listReportHref(report) }));

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (previewUrl) return () => URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const beginMutation = useCallback((label: string) => {
    if (mutationPending.current) return false;
    mutationPending.current = true;
    setPending(true); setError(""); setMessage(label);
    return true;
  }, [setPending, setError, setMessage]);
  const finishMutation = useCallback(() => {
    if (!mounted.current) return;
    mutationPending.current = false;
    setPending(false);
    setMessage(current => current.endsWith("…") ? "" : current);
  }, []);
  const beginFinding = () => {
    setError(""); setMessage(""); setFinding(emptyFinding()); setPhotoFiles([]); setPreviewUrl(null);
    setTargetWorkId(works[0]?.id ?? ""); setAdding(true);
  };
  const submitFinding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!available || !authorizedWorks.has(targetWorkId)) return;
    if (photoFiles.length !== maxPhotosPerFinding || photoFiles.some((file) => file.size === 0 || file.size > maxPhotoBytes || !["image/jpeg", "image/png"].includes(file.type))) {
      setError("A foto é obrigatória. Escolha ou tire uma foto JPG ou PNG de até 3 MB."); return;
    }
    if (!beginMutation("Enviando foto e salvando…")) return;
    try {
      const formData = new FormData();
      formData.set("workId", targetWorkId); formData.set("location", finding.location);
      formData.set("description", finding.description); formData.set("correction", finding.correction); formData.set("photo", photoFiles[0]);
      formData.set("serious", finding.serious ? "true" : "false");
      const result = await createWorkFindingAction(formData, actor);
      if (!mounted.current) return;
      if (result.status === "success" && result.finding) {
        findingsList.first(); retry();
        setMessage(result.message); setAdding(false); setFinding(emptyFinding()); setPhotoFiles([]); setPreviewUrl(null);
      } else setError(result.message);
    } catch { if (mounted.current) setError("Não foi possível salvar o apontamento. Tente novamente."); }
    finally { finishMutation(); }
  };
  const addPhotosToFinding = useCallback(async (file: File, visitId: string, findingId: string) => {
    if (!available || !beginMutation("Enviando foto…")) return false;
    const formData = new FormData();
    formData.set("visitId", visitId); formData.set("findingId", findingId); formData.append("photos", file);
    try {
      const result = await uploadFindingPhotosAction(formData, actor);
      if (!mounted.current) return false;
      if (result.status === "success" && result.photos) { photoStore.replace(visitId, result.photos); setMessage(result.message); }
      else setError(result.message);
      return result.status === "success" && Boolean(result.photos);
    } catch { if (mounted.current) setError("Não foi possível enviar a foto. Tente novamente."); return false; }
    finally { finishMutation(); }
  }, [available, beginMutation, actor, photoStore, finishMutation]);
  const completeFinding = useCallback(async (visitId: string, findingId: string) => {
    if (!available || !beginMutation("Concluindo apontamento…")) return;
    try {
      const result = await completeFindingAction(visitId, findingId, actor);
      if (!mounted.current) return;
      if (result.status === "success") {
        retry();
        setMessage(result.message);
        requestAnimationFrame(() => document.getElementById("follow-up-findings-heading")?.focus());
      } else setError(result.message);
    } catch { if (mounted.current) setError("Não foi possível concluir a pendência. Tente novamente."); }
    finally { finishMutation(); }
  }, [available, beginMutation, actor, retry, finishMutation]);
  const completeWorkFinding = useCallback(async (id: string) => {
    if (!available || !beginMutation("Concluindo apontamento…")) return;
    try {
      const completed = await completeWorkFindingAction(id, actor);
      if (!mounted.current) return;
      if (completed) {
        retry();
        setMessage("Pendência concluída e removida da lista ativa.");
        requestAnimationFrame(() => document.getElementById("follow-up-findings-heading")?.focus());
      } else setError("Não foi possível concluir a pendência. Atualize a página e tente novamente.");
    } catch { if (mounted.current) setError("Não foi possível concluir a pendência. Tente novamente."); }
    finally { finishMutation(); }
  }, [available, beginMutation, actor, retry, finishMutation]);

  return <>
    <div className="page-intro"><h2>Acompanhamento</h2></div>

    <div className={styles.layout}>
      <section className={`panel ${styles.listPanel}`} aria-label="Relatórios orientativos">
        <div className={`panel-heading ${styles.reportHeader}`}><h3>Relatórios orientativos</h3>
          {createReportWork ? <Link className={`primary ${styles.addReportButton}`} href={`/app/acompanhamento/relatorio/novo?obra=${createReportWork.id}`}
              aria-label="Criar relatório orientativo" data-tooltip="Criar relatório orientativo">+</Link>
            : <button type="button" className={`primary ${styles.addReportButton}`} disabled aria-label="Criar relatório orientativo"
                data-tooltip="Sem obras disponíveis">+</button>}
        </div>
        {!createReportWork && <p className="muted">Para criar um relatório, é necessário ter uma obra disponível neste perfil.</p>}
        <div ref={reportsListAnchor}><ListFilters list={reportsList} works={works} label="Relatórios orientativos" /><ListStatus list={reportsList} empty="Nenhum relatório orientativo encontrado." /></div>
        {!reportsList.loading && !reportsList.error && visibleReports.length ? <ul className={styles.reportList}>{visibleReports.map((report) => {
          const savedAt = new Date(report.displayDate);
          const day = savedAt.toLocaleDateString("pt-BR", { day: "2-digit", timeZone: "America/Sao_Paulo" });
          const month = savedAt.toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "").toUpperCase();
          const year = savedAt.toLocaleDateString("pt-BR", { year: "numeric", timeZone: "America/Sao_Paulo" });
          return <li key={report.id}>
            <span className={styles.reportDate}><strong>{day}</strong><small>{month} {year}</small></span>
            <span className={styles.reportInfo}><strong>{report.title}</strong><small>{report.workName}</small></span>
            <DownloadButton className={styles.reportDownload} href={report.pdfHref}
              label={`Baixar PDF: ${report.title}`} data-tooltip="Baixar PDF">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
            </DownloadButton>
          </li>;
        })}</ul> : null}
        <ListPagination list={reportsList} label="Relatórios orientativos" />
      </section>
      <section className={`panel ${styles.findingsPanel}`} aria-label="Apontamentos de acompanhamento">
        <div className={`panel-heading ${styles.findingHeader}`}><h3 id="follow-up-findings-heading" tabIndex={-1}>Apontamentos</h3>
          <button type="button" className={`primary ${styles.addFindingButton}`} aria-label="Adicionar apontamento" data-tooltip="Adicionar apontamento" disabled={disabled || works.length === 0} onClick={beginFinding}>+</button>
        </div>
        <div ref={findingsListAnchor}><ListFilters list={findingsList} works={works} label="Apontamentos" /></div>
        {adding && <form className={styles.addFindingForm} onSubmit={(event) => { void submitFinding(event); }}>
          <div className={styles.findingTopRow}>
            <div className={styles.photoField} role="group" aria-label="Foto obrigatória"><FollowUpPhotoPicker disabled={disabled} previewUrl={previewUrl} onSelect={(file) => {
              if (file.size === 0 || file.size > maxPhotoBytes || !["image/jpeg", "image/png"].includes(file.type)) {
                setPhotoFiles([]); setPreviewUrl(null); setError("Escolha ou tire uma foto JPG ou PNG de até 3 MB."); return;
              }
              setPhotoFiles([file]); setPreviewUrl(URL.createObjectURL(file)); setError("");
            }} /></div>
            <button type="button" className={`${styles.seriousToggle}${finding.serious ? ` ${styles.seriousToggleActive}` : ""}`}
              aria-label={finding.serious ? "Desmarcar item grave" : "Marcar como item grave"}
              data-tooltip={finding.serious ? "Desmarcar grave" : "Marcar como grave"}
              aria-pressed={finding.serious === true} disabled={disabled}
              onClick={() => setFinding((current) => ({ ...current, serious: !current.serious }))}>
              <svg viewBox="0 0 32 29" aria-hidden="true"><path d="M14.1 3.2a2.2 2.2 0 0 1 3.8 0l11.2 19.4a2.2 2.2 0 0 1-1.9 3.3H4.8a2.2 2.2 0 0 1-1.9-3.3L14.1 3.2Z" /><text x="16" y="21.2">!</text></svg>
            </button>
          </div>
          {photoFiles.length > 0 && <>
            <label>Local (opcional)<input maxLength={200} disabled={disabled} value={finding.location} onChange={(event) => setFinding((current) => ({ ...current, location: event.target.value }))} placeholder="Pavimento, ambiente ou frente de serviço" /></label>
            <label>O que precisa de correção<textarea required minLength={5} maxLength={2000} disabled={disabled} value={finding.description} onChange={(event) => setFinding((current) => ({ ...current, description: event.target.value }))} /></label>
            <label>Orientação para correção<textarea required minLength={5} maxLength={2000} disabled={disabled} value={finding.correction} onChange={(event) => setFinding((current) => ({ ...current, correction: event.target.value }))} /></label>
            <label>Obra<select className={`filter-select ${styles.workSelect}`} required value={targetWorkId} disabled={disabled} onChange={(event) => setTargetWorkId(event.target.value)}>{works.map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}</select></label>
            <div className={styles.findingActions}><button type="button" className="secondary" disabled={pending} onClick={() => setAdding(false)}>Cancelar</button><button type="submit" className="primary" disabled={disabled}>{pending ? "Salvando…" : "Salvar apontamento"}</button></div>
          </>}
        </form>}
        <ListStatus list={findingsList} empty="Nenhum apontamento encontrado." />
        <SlowOperation pending={pending} />
        {message && <p className={styles.success} role="status">{message}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {!findingsList.loading && !findingsList.error && <ul className={styles.savedFindings}>
          {items.map(item => item.source === "work"
            ? <FollowUpWorkFindingRow key={item.key} item={listWorkFinding(item)} workName={item.workName} actor={actor} disabled={disabled} onComplete={completeWorkFinding} />
            : <FollowUpSavedFindingRow key={item.key} item={listSavedFinding(item)} actor={actor} photoStore={photoStore} disabled={disabled} onComplete={completeFinding} onUpload={addPhotosToFinding} />)}
        </ul>}
        <ListPagination list={findingsList} label="Apontamentos" disabled={pending} />
      </section>
    </div>
  </>;
}
