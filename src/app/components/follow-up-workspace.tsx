"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import type { DemoUser, Visit } from "@/domain/prototype-access";
import { canReadVisit } from "@/domain/prototype-access";
import { formatAuditDate, type WorkRecord } from "@/domain/operational-records";
import { getSaoPauloToday } from "@/domain/visit-calendar";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { FollowUpFinding, FollowUpSnapshot } from "@/lib/follow-up/service";
import type { FindingDraftSnapshot } from "@/lib/follow-up/findings";
import { maxPhotoBytes, maxPhotosPerFinding, type FindingPhoto } from "@/lib/follow-up/photos";
import { completeFindingAction, completeWorkFindingAction, createWorkFindingAction, readCompletedFindingsAction,
  readFindingDraftsAction, readFindingPhotosAction, readFollowUpReportsAction, readWorkFindingsAction,
  uploadFindingPhotosAction, type WorkFinding } from "@/app/follow-up/actions";
import styles from "./follow-up-workspace.module.css";

type Props = { user: DemoUser; visits: readonly Visit[]; works: readonly WorkRecord[]; actor: AgendaActorContext; agendaAvailable: boolean };
const monthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const emptyFinding = (): FollowUpFinding => ({ id: "", location: "", description: "", correction: "" });

function PhotoPicker({ onSelect, disabled, previewUrl }: { onSelect: (file: File) => void; disabled: boolean; previewUrl?: string | null }) {
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const select = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onSelect(file);
    event.target.value = "";
  };
  return <div className={styles.photoPicker}>
    {!previewUrl && <div className={styles.photoControls}>
      <button type="button" className="secondary" disabled={disabled} onClick={() => galleryInput.current?.click()}>Escolher foto</button>
      <button type="button" className="secondary" disabled={disabled} onClick={() => cameraInput.current?.click()}>Tirar foto</button>
    </div>}
    <input ref={galleryInput} type="file" accept="image/jpeg,image/png" disabled={disabled} onChange={select} aria-label="Escolher foto do dispositivo" tabIndex={-1} style={{ display: "none" }} />
    <input ref={cameraInput} type="file" accept="image/jpeg,image/png" capture="environment" disabled={disabled} onChange={select} aria-label="Tirar foto com a câmera" tabIndex={-1} style={{ display: "none" }} />
    {previewUrl && <Image className={styles.photoPreview} src={previewUrl} alt="Foto selecionada para o apontamento" width={640} height={480} unoptimized />}
  </div>;
}

export function FollowUpWorkspace({ user, visits, works, actor, agendaAvailable }: Props) {
  const discipline = user.role === "quality-auditor" ? "quality" : "safety";
  const authorizedWorks = new Map(works.map((work) => [work.id, work]));
  const scheduled = visits.filter((visit) => visit.kind === "follow_up" && visit.auditorId === user.id
    && visit.module === discipline && authorizedWorks.has(visit.workId) && canReadVisit(user, visit))
    .slice().sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reports, setReports] = useState<FollowUpSnapshot | null>(null);
  const [drafts, setDrafts] = useState<FindingDraftSnapshot | null>(null);
  const [workFindings, setWorkFindings] = useState<WorkFinding[]>([]);
  const [filterWorkId, setFilterWorkId] = useState("");
  const [workFindingsAvailable, setWorkFindingsAvailable] = useState(false);
  const [adding, setAdding] = useState(false);
  const [targetWorkId, setTargetWorkId] = useState("");
  const [finding, setFinding] = useState<FollowUpFinding>(emptyFinding);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photos, setPhotos] = useState<FindingPhoto[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const today = getSaoPauloToday();
  const draftByVisit = new Map(drafts?.drafts.map((entry) => [entry.visitId, entry]) ?? []);
  const reportsByVisit = new Map(scheduled.map((visit) => [visit.id,
    (reports?.reports.filter((entry) => entry.visitId === visit.id) ?? []).slice().sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))]));
  const savedFindings = scheduled.flatMap((visit) => {
    const draft = draftByVisit.get(visit.id)?.findings ?? [];
    const reportFindings = [...new Map((reportsByVisit.get(visit.id) ?? []).flatMap((report) => report.findings)
      .map((finding) => [finding.id, finding])).values()];
    const reported = reportFindings.filter((item) => !draft.some((entry) => entry.id === item.id));
    return [...draft.map((item) => ({ ...item, source: reportFindings.some((entry) => entry.id === item.id) ? "report" as const : "saved" as const })),
      ...reported.map((item) => ({ ...item, source: "report" as const }))]
      .map((item) => ({ ...item, visitId: visit.id, workId: visit.workId, workName: authorizedWorks.get(visit.workId)?.name ?? "Obra", date: visit.date }))
      .filter((item) => !completed.includes(`${item.visitId}:${item.id}`));
  });
  const visibleWorkFindings = filterWorkId ? workFindings.filter((item) => item.workId === filterWorkId) : workFindings;
  const visibleSavedFindings = filterWorkId ? savedFindings.filter((item) => item.workId === filterWorkId) : savedFindings;

  useEffect(() => {
    if (previewUrl) return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([readFollowUpReportsAction(actor), readFindingDraftsAction(actor), readCompletedFindingsAction(actor),
      readWorkFindingsAction(actor)]).then(([reportResult, draftResult, completedResult, workResult]) => {
      if (!cancelled) { setReports(reportResult); setDrafts(draftResult); }
      if (!cancelled && completedResult) setCompleted(completedResult);
      if (!cancelled) { setWorkFindings(workResult.findings); setWorkFindingsAvailable(workResult.available); }
      const ids = [...new Set([...reportResult.reports.map((entry) => entry.visitId),
        ...draftResult.drafts.map((entry) => entry.visitId)])].slice(0, 100);
      if (ids.length) void readFindingPhotosAction(ids, actor).then((result) => {
        if (!cancelled && result.available) setPhotos(result.photos);
      });
    }).catch(() => {
      if (!cancelled) {
        setReports({ available: false, reports: [], message: "Não foi possível consultar os relatórios." });
        setDrafts({ available: false, drafts: [], message: "Não foi possível consultar os apontamentos." });
      }
    });
    return () => { cancelled = true; };
  }, [actor]);

  const beginFinding = () => {
    setError(""); setMessage(""); setFinding(emptyFinding()); setPhotoFiles([]); setPreviewUrl(null);
    setTargetWorkId(works[0]?.id ?? "");
    setAdding(true);
  };
  const submitFinding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !workFindingsAvailable || !authorizedWorks.has(targetWorkId)) return;
    if (photoFiles.length !== maxPhotosPerFinding || photoFiles.some((file) => file.size === 0 || file.size > maxPhotoBytes
      || !["image/jpeg", "image/png"].includes(file.type))) {
      setError("A foto é obrigatória. Escolha ou tire uma foto JPG ou PNG de até 3 MB."); return;
    }
    setPending(true); setError(""); setMessage("");
    try {
      const formData = new FormData();
      formData.set("workId", targetWorkId); formData.set("location", finding.location);
      formData.set("description", finding.description); formData.set("correction", finding.correction);
      formData.set("photo", photoFiles[0]);
      const result = await createWorkFindingAction(formData, actor);
      if (result.status === "success" && result.finding) {
        setWorkFindings((current) => [result.finding!, ...current]);
        setMessage(result.message); setAdding(false); setFinding(emptyFinding()); setPhotoFiles([]); setPreviewUrl(null);
      } else setError(result.message);
    } catch { setError("Não foi possível salvar o apontamento. Tente novamente."); }
    finally { setPending(false); }
  };
  const addPhotosToFinding = async (file: File, visitId: string, findingId: string) => {
    if (pending) return;
    const formData = new FormData();
    formData.set("visitId", visitId); formData.set("findingId", findingId);
    formData.append("photos", file);
    setPending(true); setError(""); setMessage("");
    try {
      const result = await uploadFindingPhotosAction(formData, actor);
      if (result.status === "success" && result.photos) {
        setPhotos((current) => [...current.filter((photo) => photo.visitId !== visitId), ...result.photos!]);
        setMessage(result.message);
      } else setError(result.message);
    } catch { setError("Não foi possível enviar a foto. Tente novamente."); }
    finally { setPending(false); }
  };
  const completeFinding = async (visitId: string, findingId: string) => {
    if (pending) return;
    setPending(true); setError(""); setMessage("");
    try {
      const result = await completeFindingAction(visitId, findingId, actor);
      if (result.status === "success") {
        if (result.draft) {
          const saved = result.draft;
          setDrafts((current) => ({ available: true, drafts: [...(current?.drafts ?? []).filter((entry) => entry.visitId !== saved.visitId), saved] }));
        }
        setCompleted((current) => [...current, `${visitId}:${findingId}`]);
        setMessage(result.message);
      } else setError(result.message);
    } catch { setError("Não foi possível concluir a pendência. Tente novamente."); }
    finally { setPending(false); }
  };
  const completeWorkFinding = async (id: string) => {
    if (pending) return;
    setPending(true); setError(""); setMessage("");
    try {
      if (await completeWorkFindingAction(id, actor)) {
        setWorkFindings((current) => current.filter((item) => item.id !== id));
        setMessage("Pendência concluída e removida da lista ativa.");
      } else setError("Não foi possível concluir a pendência. Atualize a página e tente novamente.");
    } catch { setError("Não foi possível concluir a pendência. Tente novamente."); }
    finally { setPending(false); }
  };

  return <>
    <div className="page-intro"><h2>Acompanhamento</h2></div>
    {(!agendaAvailable || reports?.message || drafts?.message) && <p className={styles.availability} role="status">{drafts?.message ?? reports?.message ?? "A agenda está indisponível no momento. Atualize a página para consultar as visitas."}</p>}
    <div className={styles.layout}>
      <section className={`panel ${styles.listPanel}`} aria-label="Visitas de acompanhamento">
        <div className="panel-heading"><h3>Visitas de acompanhamento</h3></div>
        {scheduled.length ? <div className={styles.visitList}>{scheduled.map((visit) => {
          const [year, month, day] = visit.date.split("-");
          const visitReports = reportsByVisit.get(visit.id) ?? [];
          const saved = visitReports.length > 0;
          const expanded = expandedId === visit.id;
          const hasFindings = (draftByVisit.get(visit.id)?.findings.length ?? 0) > 0;
          const availableToCreate = agendaAvailable && reports?.available === true && drafts?.available === true
            && visit.confirmationStatus === "confirmed" && visit.date <= today
            && (saved || hasFindings || workFindings.some((finding) => finding.workId === visit.workId));
          return <article key={visit.id} className={`${styles.visitCard}${expanded ? ` ${styles.expanded}` : ""}`}>
            <button type="button" className={styles.visitSummary} aria-expanded={expanded} aria-controls={`follow-up-details-${visit.id}`}
              onClick={() => setExpandedId(expanded ? null : visit.id)}>
              <time dateTime={visit.date} className={`${styles.dateTile} ${visit.confirmationStatus === "confirmed" ? styles.dateTileConfirmed : styles.dateTilePending}`}><strong>{day}</strong><span>{monthNames[Number(month) - 1]} {year}</span></time>
              <span className={styles.visitInfo}>
                <strong>{authorizedWorks.get(visit.workId)?.name}</strong>
                <span className={styles.professional}><small>Profissional responsável</small>{user.name}</span>
                <span className={styles.visitType}>Acompanhamento da obra · {visit.module === "safety" ? "Segurança" : "Qualidade"}</span>
                {saved && <span className={styles.saved}>{visitReports.length} {visitReports.length === 1 ? "relatório salvo" : "relatórios salvos"}</span>}
              </span>
              <span className={styles.expandIndicator} aria-hidden="true" />
            </button>
            {expanded && <div id={`follow-up-details-${visit.id}`} className={styles.visitDetails}>
              <span className={styles.visitStatus}>{visit.confirmationStatus === "confirmed" ? "Data confirmada" : "Aguardando confirmação da data"}</span>
              {saved || availableToCreate
                ? <Link className="primary" href={`/app/acompanhamento/relatorio/${visit.id}`}>Relatórios</Link>
                : <button type="button" className="primary" disabled title={visit.confirmationStatus !== "confirmed" ? "Confirme a data na Agenda" : !hasFindings ? "Registre um apontamento antes de criar o relatório" : "Disponível a partir da data agendada"}>Relatórios</button>}
            </div>}
          </article>;
        })}</div> : <p className="muted">Nenhuma visita de acompanhamento atribuída a este perfil.</p>}
      </section>
      <section className={`panel ${styles.findingsPanel}`} aria-label="Apontamentos de acompanhamento">
        <div className={`panel-heading ${styles.findingHeader}`}><h3>Apontamentos</h3>
          <select className={styles.workFilter} aria-label="Filtrar apontamentos por obra" value={filterWorkId} onChange={(event) => setFilterWorkId(event.target.value)}>
            <option value="">Todas as obras</option>
            {works.map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}
          </select>
          <button type="button" className={`primary ${styles.addFindingButton}`} aria-label="Adicionar apontamento" title="Adicionar apontamento" disabled={!workFindingsAvailable || works.length === 0 || pending} onClick={beginFinding}>+</button>
        </div>
        {adding && <form className={styles.addFindingForm} onSubmit={(event) => { void submitFinding(event); }}>
          <div className={styles.photoField} role="group" aria-label="Foto obrigatória"><PhotoPicker disabled={pending} previewUrl={previewUrl} onSelect={(file) => {
            if (file.size === 0 || file.size > maxPhotoBytes || !["image/jpeg", "image/png"].includes(file.type)) {
              setPhotoFiles([]); setPreviewUrl(null); setError("Escolha ou tire uma foto JPG ou PNG de até 3 MB."); return;
            }
            setPhotoFiles([file]); setPreviewUrl(URL.createObjectURL(file)); setError("");
          }} /></div>
          {photoFiles.length > 0 && <>
            <label>Local (opcional)<input maxLength={200} disabled={pending} value={finding.location} onChange={(event) => setFinding((current) => ({ ...current, location: event.target.value }))} placeholder="Pavimento, ambiente ou frente de serviço" /></label>
            <label>O que precisa de correção<textarea required minLength={5} maxLength={2000} disabled={pending} value={finding.description} onChange={(event) => setFinding((current) => ({ ...current, description: event.target.value }))} /></label>
            <label>Orientação para correção<textarea required minLength={5} maxLength={2000} disabled={pending} value={finding.correction} onChange={(event) => setFinding((current) => ({ ...current, correction: event.target.value }))} /></label>
            <label>Obra<select required value={targetWorkId} disabled={pending} onChange={(event) => setTargetWorkId(event.target.value)}>
              {works.map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}
            </select></label>
            <div className={styles.findingActions}><button type="button" className="secondary" disabled={pending} onClick={() => setAdding(false)}>Cancelar</button><button type="submit" className="primary" disabled={pending}>{pending ? "Salvando…" : "Salvar apontamento"}</button></div>
          </>}
        </form>}
        {message && <p className={styles.success} role="status">{message}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {visibleWorkFindings.length + visibleSavedFindings.length ? <ul className={styles.savedFindings}>
          {visibleWorkFindings.map((item) => <li key={`work:${item.id}`}>
            <div className={styles.findingMedia}><a href={`/app/acompanhamento/obras/${item.workId}/fotos/${item.photoFileName}`} target="_blank" rel="noreferrer" aria-label="Abrir foto do apontamento">
              <Image src={`/app/acompanhamento/obras/${item.workId}/fotos/${item.photoFileName}`} alt={`Foto de ${item.description}`} width={90} height={90} unoptimized /></a></div>
            <div className={styles.findingDetails}>
              <strong>{item.description}</strong>
              <span>{authorizedWorks.get(item.workId)?.name ?? "Obra"}{item.location ? ` · ${item.location}` : ""}</span>
              <p>Orientação: {item.correction}</p>
            </div>
            <button type="button" className={`secondary ${styles.findingComplete}`} disabled={pending} onClick={() => { void completeWorkFinding(item.id); }}>Concluído</button>
          </li>)}
          {visibleSavedFindings.map((item) => {
            const itemPhotos = photos.filter((photo) => photo.visitId === item.visitId && photo.findingId === item.id);
            return <li key={`${item.visitId}:${item.id}`}>
              <div className={styles.findingMedia}>{itemPhotos.length ? itemPhotos.map((photo) =>
                <a key={photo.fileName} href={`/app/acompanhamento/fotos/${item.visitId}/${photo.fileName}`} target="_blank" rel="noreferrer" aria-label="Abrir foto do apontamento">
                  <Image src={`/app/acompanhamento/fotos/${item.visitId}/${photo.fileName}`} alt={`Foto de ${item.description}`} width={90} height={90} unoptimized /></a>)
                : <span>Sem foto</span>}</div>
              <div className={styles.findingDetails}>
                <strong>{item.description}</strong>
                <span>{item.workName} · {formatAuditDate(item.date)}{item.location ? ` · ${item.location}` : ""}</span>
                <p>Orientação: {item.correction}</p>
                {item.source === "saved" && itemPhotos.length < maxPhotosPerFinding &&
                  <div className={styles.addPhotoField}><strong>Adicionar foto</strong><PhotoPicker disabled={pending} onSelect={(file) => { void addPhotosToFinding(file, item.visitId, item.id); }} /></div>}
              </div>
              <button type="button" className={`secondary ${styles.findingComplete}`} disabled={pending} onClick={() => { void completeFinding(item.visitId, item.id); }}>Concluído</button>
            </li>;
          })}
        </ul> : <p className="muted">{filterWorkId ? "Nenhum apontamento registrado para esta obra." : "Nenhum apontamento registrado para este perfil."}</p>}
      </section>
    </div>
  </>;
}
