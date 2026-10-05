"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { DemoUser, Visit } from "@/domain/prototype-access";
import { canReadVisit } from "@/domain/prototype-access";
import type { WorkRecord } from "@/domain/operational-records";
import { isStandaloneReportIndex, standalonePdfHref } from "@/lib/follow-up/standalone-contracts";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { FollowUpFinding } from "@/lib/follow-up/service";
import { indexFollowUpReports, mergeFollowUpFindings } from "@/lib/follow-up/display";
import { maxPhotoBytes, maxPhotosPerFinding } from "@/lib/follow-up/photos";
import { completeFindingAction, completeWorkFindingAction, createWorkFindingAction, uploadFindingPhotosAction } from "@/app/follow-up/actions";
import { useFollowUpSnapshot, isFollowUpWorkspaceSnapshot } from "./use-follow-up-snapshot";
import { useFollowUpPhotoStore } from "./use-follow-up-photos";
import { FollowUpPhotoPicker, FollowUpWorkFindingRow, FollowUpSavedFindingRow } from "./follow-up-workspace-rows";
import styles from "./follow-up-workspace.module.css";

type Props = { user: DemoUser; visits: readonly Visit[]; works: readonly WorkRecord[]; actor: AgendaActorContext; agendaAvailable: boolean };
const emptyFinding = (): FollowUpFinding => ({ id: "", location: "", description: "", correction: "", serious: false });
const noCompleted: readonly string[] = [];

export function FollowUpWorkspace(props: Props) {
  const { userId, profile, engineeringScope, administrativeScope } = props.actor;
  return <FollowUpWorkspaceSession key={JSON.stringify([userId, profile, engineeringScope, administrativeScope])} {...props} />;
}

function FollowUpWorkspaceSession({ user, visits, works, actor, agendaAvailable }: Props) {
  const discipline = user.role === "quality-auditor" ? "quality" : "safety";
  const authorizedWorks = useMemo(() => new Map(works.map((work) => [work.id, work])), [works]);
  const scheduled = useMemo(() => visits.filter((visit) => visit.kind === "follow_up" && visit.auditorId === user.id
    && visit.module === discipline && authorizedWorks.has(visit.workId) && canReadVisit(user, visit))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)), [visits, user, discipline, authorizedWorks]);
  const { data: snapshot, loading, error: readError, retry, update } = useFollowUpSnapshot(actor, "/api/follow-up/workspace", isFollowUpWorkspaceSnapshot);
  const standalone = useFollowUpSnapshot(actor, "/api/follow-up/standalone-reports", isStandaloneReportIndex);
  const reportWorks = works.filter(work => !work.isDemo && user.workModuleScopes?.some(scope => scope.workId === work.id && scope.module === discipline));
  const photoStore = useFollowUpPhotoStore(actor);
  const [filterWorkId, setFilterWorkId] = useState("");
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
  const available = !!snapshot && !loading && !readError;
  const disabled = pending || !available;
  const draftByVisit = useMemo(() => new Map(snapshot?.drafts.map((entry) => [entry.visitId, entry]) ?? []), [snapshot?.drafts]);
  const reportsByVisit = useMemo(() => indexFollowUpReports(snapshot?.reports ?? []), [snapshot?.reports]);
  const savedFindings = useMemo(() => mergeFollowUpFindings(scheduled, draftByVisit, reportsByVisit, snapshot?.completed ?? noCompleted, authorizedWorks),
    [scheduled, draftByVisit, reportsByVisit, snapshot?.completed, authorizedWorks]);
  const workFindings = useMemo(() => (snapshot?.workFindings ?? []).filter((entry) => authorizedWorks.has(entry.workId) && entry.module === discipline), [snapshot?.workFindings, authorizedWorks, discipline]);
  const createReportWork = reportWorks.find(work => work.id === filterWorkId)
    ?? reportWorks.find(work => workFindings.some(finding => finding.workId === work.id)) ?? reportWorks[0];
  const visibleWorkFindings = useMemo(() => filterWorkId ? workFindings.filter((item) => item.workId === filterWorkId) : workFindings, [filterWorkId, workFindings]);
  const visibleSavedFindings = useMemo(() => filterWorkId ? savedFindings.filter((item) => item.workId === filterWorkId) : savedFindings, [filterWorkId, savedFindings]);
  const scheduledById = useMemo(() => new Map(scheduled.map((visit) => [visit.id, visit])), [scheduled]);
  const visibleReports = useMemo(() => [
    ...(snapshot?.reports ?? []).flatMap(report => {
      const visit = scheduledById.get(report.visitId);
      if (!visit) return [];
      return [{ id: report.id, title: report.title, updatedAt: report.updatedAt, displayDate: report.updatedAt,
        workName: authorizedWorks.get(visit.workId)?.name ?? "Obra",
        pdfHref: `/app/acompanhamento/relatorio/${report.visitId}/pdf?relatorio=${report.id}` }];
    }),
    ...(standalone.data?.reports ?? []).filter(report => report.module === discipline && authorizedWorks.has(report.workId))
      .map(report => ({ ...report, displayDate: `${report.date}T12:00:00-03:00`, pdfHref: standalonePdfHref(report.id) })),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)),
  [snapshot?.reports, standalone.data?.reports, scheduledById, authorizedWorks, discipline]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (previewUrl) return () => URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  const beginMutation = useCallback(() => {
    if (mutationPending.current) return false;
    mutationPending.current = true;
    setPending(true); setError(""); setMessage("");
    return true;
  }, [setPending, setError, setMessage]);
  const finishMutation = useCallback(() => {
    if (!mounted.current) return;
    mutationPending.current = false;
    setPending(false);
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
    if (!beginMutation()) return;
    try {
      const formData = new FormData();
      formData.set("workId", targetWorkId); formData.set("location", finding.location);
      formData.set("description", finding.description); formData.set("correction", finding.correction); formData.set("photo", photoFiles[0]);
      formData.set("serious", finding.serious ? "true" : "false");
      const result = await createWorkFindingAction(formData, actor);
      if (!mounted.current) return;
      if (result.status === "success" && result.finding) {
        const saved = result.finding;
        update((current) => ({ ...current, workFindings: [saved, ...current.workFindings] }));
        setMessage(result.message); setAdding(false); setFinding(emptyFinding()); setPhotoFiles([]); setPreviewUrl(null);
      } else setError(result.message);
    } catch { if (mounted.current) setError("Não foi possível salvar o apontamento. Tente novamente."); }
    finally { finishMutation(); }
  };
  const addPhotosToFinding = useCallback(async (file: File, visitId: string, findingId: string) => {
    if (!available || !beginMutation()) return;
    const formData = new FormData();
    formData.set("visitId", visitId); formData.set("findingId", findingId); formData.append("photos", file);
    try {
      const result = await uploadFindingPhotosAction(formData, actor);
      if (!mounted.current) return;
      if (result.status === "success" && result.photos) { photoStore.replace(visitId, result.photos); setMessage(result.message); }
      else setError(result.message);
    } catch { if (mounted.current) setError("Não foi possível enviar a foto. Tente novamente."); }
    finally { finishMutation(); }
  }, [available, beginMutation, actor, photoStore, finishMutation]);
  const completeFinding = useCallback(async (visitId: string, findingId: string) => {
    if (!available || !beginMutation()) return;
    try {
      const result = await completeFindingAction(visitId, findingId, actor);
      if (!mounted.current) return;
      if (result.status === "success") {
        const saved = result.draft;
        update((current) => ({ ...current, ...(saved ? { drafts: [...current.drafts.filter((entry) => entry.visitId !== saved.visitId), saved] } : {}), completed: [...current.completed, `${visitId}:${findingId}`] }));
        setMessage(result.message);
      } else setError(result.message);
    } catch { if (mounted.current) setError("Não foi possível concluir a pendência. Tente novamente."); }
    finally { finishMutation(); }
  }, [available, beginMutation, actor, update, finishMutation]);
  const completeWorkFinding = useCallback(async (id: string) => {
    if (!available || !beginMutation()) return;
    try {
      const completed = await completeWorkFindingAction(id, actor);
      if (!mounted.current) return;
      if (completed) {
        update((current) => ({ ...current, workFindings: current.workFindings.filter((item) => item.id !== id) }));
        setMessage("Pendência concluída e removida da lista ativa.");
      } else setError("Não foi possível concluir a pendência. Atualize a página e tente novamente.");
    } catch { if (mounted.current) setError("Não foi possível concluir a pendência. Tente novamente."); }
    finally { finishMutation(); }
  }, [available, beginMutation, actor, update, finishMutation]);

  return <>
    <div className="page-intro"><h2>Acompanhamento</h2></div>
    {!agendaAvailable && <p className={styles.availability} role="status">A agenda está indisponível no momento. Atualize a página para consultar as visitas.</p>}
    {readError && <p className={styles.availability} role="alert">Não foi possível consultar os relatórios e apontamentos. <button type="button" className="secondary" onClick={retry}>Tentar novamente</button></p>}
    <div className={styles.layout}>
      <section className={`panel ${styles.listPanel}`} aria-label="Relatórios orientativos">
        <div className={`panel-heading ${styles.reportHeader}`}><h3>Relatórios orientativos</h3>
          {createReportWork ? <Link className={`primary ${styles.addReportButton}`} href={`/app/acompanhamento/relatorio/novo?obra=${createReportWork.id}`}
              aria-label="Criar novo relatório" title="Criar novo relatório">+</Link>
            : <button type="button" className={`primary ${styles.addReportButton}`} disabled aria-label="Criar novo relatório"
                title="Nenhuma obra disponível para este perfil">+</button>}
        </div>
        {visibleReports.length ? <ul className={styles.reportList}>{visibleReports.map((report) => {
          const savedAt = new Date(report.displayDate);
          const day = savedAt.toLocaleDateString("pt-BR", { day: "2-digit", timeZone: "America/Sao_Paulo" });
          const month = savedAt.toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "").toUpperCase();
          const year = savedAt.toLocaleDateString("pt-BR", { year: "numeric", timeZone: "America/Sao_Paulo" });
          return <li key={report.id}>
            <span className={styles.reportDate}><strong>{day}</strong><small>{month} {year}</small></span>
            <span className={styles.reportInfo}><strong>{report.title}</strong><small>{report.workName}</small></span>
            <a className={styles.reportDownload} href={report.pdfHref} download
              aria-label={`Baixar PDF: ${report.title}`} title="Baixar PDF">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
            </a>
          </li>;
        })}</ul> : snapshot && standalone.data && !loading && !readError && !standalone.loading && !standalone.error ? <p className="muted">Nenhum relatório orientativo salvo para este perfil.</p> : null}
        {standalone.loading && <p className="muted" role="status">Carregando relatórios…</p>}
      </section>
      <section className={`panel ${styles.findingsPanel}`} aria-label="Apontamentos de acompanhamento">
        <div className={`panel-heading ${styles.findingHeader}`}><h3>Apontamentos</h3>
          <select className="filter-select" aria-label="Filtrar apontamentos por obra" value={filterWorkId} onChange={(event) => setFilterWorkId(event.target.value)}>
            <option value="">Todas as obras</option>{works.map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}
          </select>
          <button type="button" className={`primary ${styles.addFindingButton}`} aria-label="Adicionar apontamento" title="Adicionar apontamento" disabled={disabled || works.length === 0} onClick={beginFinding}>+</button>
        </div>
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
              title={finding.serious ? "Item marcado como grave" : "Marcar como item grave"}
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
        {loading && <p className="muted" role="status">Carregando apontamentos e relatórios...</p>}
        {message && <p className={styles.success} role="status">{message}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {visibleWorkFindings.length + visibleSavedFindings.length ? <ul className={styles.savedFindings}>
          {visibleWorkFindings.map((item) => <FollowUpWorkFindingRow key={`work:${item.id}`} item={item} workName={authorizedWorks.get(item.workId)?.name ?? "Obra"} actor={actor} disabled={disabled} onComplete={completeWorkFinding} />)}
          {visibleSavedFindings.map((item) => <FollowUpSavedFindingRow key={`${item.visitId}:${item.id}`} item={item} actor={actor} photoStore={photoStore} disabled={disabled} onComplete={completeFinding} onUpload={addPhotosToFinding} />)}
        </ul> : snapshot && !loading && !readError ? <p className="muted">{filterWorkId ? "Nenhum apontamento registrado para esta obra." : "Nenhum apontamento registrado para este perfil."}</p> : null}
      </section>
    </div>
  </>;
}
