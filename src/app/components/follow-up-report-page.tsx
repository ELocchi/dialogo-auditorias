"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import type { Visit } from "@/domain/prototype-access";
import { formatAuditDate, type WorkRecord } from "@/domain/operational-records";
import { getSaoPauloToday } from "@/domain/visit-calendar";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { FollowUpFinding, FollowUpReport } from "@/lib/follow-up/service";
import type { FindingDraft } from "@/lib/follow-up/findings";
import type { FindingPhoto } from "@/lib/follow-up/photos";
import { saveFollowUpReportAction, type WorkFinding } from "@/app/follow-up/actions";
import styles from "./follow-up-report-page.module.css";

export function FollowUpReportPage({ visit, work, actor, agendaAvailable, initialReport, initialReportedFindings, initialDraft, initialPhotos, initialWorkFindings, reportsAvailable, draftsAvailable }: {
  visit: Visit; work: WorkRecord; actor: AgendaActorContext; agendaAvailable: boolean;
  initialReport?: FollowUpReport; initialReportedFindings: FollowUpFinding[]; initialDraft?: FindingDraft;
  initialPhotos: FindingPhoto[]; initialWorkFindings: WorkFinding[];
  reportsAvailable: boolean; draftsAvailable: boolean;
}) {
  const [report, setReport] = useState(initialReport);
  const [participants, setParticipants] = useState(initialReport?.participants ?? "");
  const [subjects, setSubjects] = useState(initialReport?.subjects ?? "");
  const [decisions, setDecisions] = useState(initialReport?.decisions ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(initialReport?.findings.map((finding) => finding.id)
    ?? [...(initialDraft?.findings.map((finding) => finding.id) ?? []), ...initialWorkFindings.map((finding) => finding.id)]);
  const [pending, setPending] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pdfHref = `/app/acompanhamento/relatorio/${visit.id}/pdf${report ? `?relatorio=${report.id}` : ""}`;
  const findings = [...(report?.findings ?? [])];
  for (const finding of initialReportedFindings) {
    if (!findings.some((entry) => entry.id === finding.id)) findings.push(finding);
  }
  for (const finding of initialDraft?.findings ?? []) {
    const index = findings.findIndex((entry) => entry.id === finding.id);
    if (index === -1) findings.push(finding);
    else findings[index] = finding;
  }
  for (const finding of initialWorkFindings) {
    if (!findings.some((entry) => entry.id === finding.id)) findings.push({ id: finding.id,
      location: finding.location, description: finding.description, correction: finding.correction });
  }
  const selectedFindings = findings.filter((finding) => selectedIds.includes(finding.id));
  const canWrite = !report && agendaAvailable && reportsAvailable && draftsAvailable
    && visit.confirmationStatus === "confirmed"
    && visit.date <= getSaoPauloToday();
  const requestSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite || pending || selectedFindings.length === 0 || selectedFindings.length > 30) return;
    setError(""); setNameOpen(true);
  };
  const saveNamedReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite || pending || !title.trim() || title.length > 120) return;
    setPending(true); setMessage(""); setError("");
    try {
      const result = await saveFollowUpReportAction({ visitId: visit.id, expectedRevision: 0,
        title: title.trim(), participants, subjects, decisions, findings: selectedFindings }, actor);
      if (result.status === "success" && result.report) {
        setNameOpen(false);
        setReport(result.report);
        setSelectedIds(result.report.findings.map((finding) => finding.id));
        setMessage("Relatório salvo. O download do PDF foi iniciado.");
        const download = document.createElement("a");
        download.href = `/app/acompanhamento/relatorio/${visit.id}/pdf?relatorio=${result.report.id}`;
        download.download = "";
        document.body.append(download);
        download.click();
        download.remove();
        window.history.replaceState(null, "", `/app/acompanhamento/relatorio/${visit.id}?relatorio=${result.report.id}`);
      } else setError(result.message);
    } catch { setError("Não foi possível salvar o relatório. Tente novamente."); }
    finally { setPending(false); }
  };

  if (report) return <div className={styles.closedLayout}>
    <div className="page-intro"><div><h2>{report.title}</h2><p className="muted">{work.name} · {formatAuditDate(visit.date)}</p></div></div>
    <section className={`panel ${styles.closedPanel}`} aria-label="Relatório orientativo fechado">
      <div className={styles.closedToolbar}>
        <div><h3>Relatório fechado</h3><p>Disponível para visualização e download.</p></div>
        <div className={styles.closedActions}>
          <a className="secondary" href={`${pdfHref}&visualizar=1`} target="_blank" rel="noreferrer">Abrir PDF</a>
          <a className="primary" href={pdfHref} download>Baixar PDF</a>
        </div>
      </div>
      {message && <p className={styles.success} role="status">{message}</p>}
      <iframe className={styles.pdfPreview} style={{ display: "block", width: "100%", height: "72vh", minHeight: 580 }} src={`${pdfHref}&visualizar=1`} title="Visualização do relatório orientativo" />
    </section>
  </div>;

  return <>
    <div className="page-intro"><div><h2>Criar relatório orientativo</h2>
      <p className="muted">{work.name} · {formatAuditDate(visit.date)}</p></div></div>
    <div className={styles.layout}>
      <section className="panel" aria-label="Criação do relatório orientativo">
        <div className="panel-heading"><h3>Relatório da visita</h3></div>
        {!canWrite && <p className={styles.notice} role="status">{!agendaAvailable || !reportsAvailable || !draftsAvailable
          ? "Os dados do acompanhamento estão indisponíveis no momento. Atualize a página."
          : visit.confirmationStatus !== "confirmed" ? "Confirme a data na Agenda antes de criar o relatório."
            : "A criação do relatório está disponível a partir da data agendada."}</p>}
        {findings.length === 0 && <p className={styles.notice}>Registre pelo menos um apontamento na aba Acompanhamento antes de criar o relatório.</p>}
        {selectedFindings.length > 30 && <p className={styles.notice}>Selecione até 30 apontamentos para este relatório.</p>}
        {message && <p className={styles.success} role="status">{message}</p>}
        <form onSubmit={requestSave} className={styles.form}>
          <label>Participantes<textarea required maxLength={5000} disabled={!canWrite || pending}
            value={participants} onChange={(event) => setParticipants(event.target.value)} placeholder="Informe os participantes da visita." /></label>
          <label>Assuntos Tratados<textarea required maxLength={10000} disabled={!canWrite || pending}
            value={subjects} onChange={(event) => setSubjects(event.target.value)} placeholder="Descreva os assuntos tratados na visita." /></label>
          <label>Decisões/Deliberações<textarea required maxLength={10000} disabled={!canWrite || pending}
            value={decisions} onChange={(event) => setDecisions(event.target.value)} placeholder="Registre as decisões e deliberações da visita." /></label>
          <div className={styles.actions}><button type="submit" className="primary" disabled={!canWrite || pending || selectedFindings.length === 0 || selectedFindings.length > 30}>{pending ? "Salvando…" : "Salvar relatório"}</button></div>
        </form>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>
      <section className="panel" aria-label="Apontamentos do relatório">
        <div className="panel-heading"><h3>Apontamentos registrados</h3></div>
        {findings.length ? <><p className={styles.selectionHint}>Selecione os apontamentos que deseja incluir no relatório.</p>
          <ul className={styles.findings}>{findings.map((finding) => <li key={finding.id}>
            <label className={styles.findingChoice}><input type="checkbox" checked={selectedIds.includes(finding.id)}
              disabled={!canWrite || pending} onChange={(event) => setSelectedIds((current) => event.target.checked
                ? [...current, finding.id] : current.filter((id) => id !== finding.id))} />
              <span className={styles.findingText}><strong>{finding.description}</strong>
                {finding.location && <span>Local: {finding.location}</span>}
                <span>Orientação para correção: {finding.correction}</span></span></label>
            {initialPhotos.some((photo) => photo.findingId === finding.id) && <div className={styles.photos}>
              {initialPhotos.filter((photo) => photo.findingId === finding.id).map((photo) =>
                <a key={photo.fileName} href={`/app/acompanhamento/fotos/${visit.id}/${photo.fileName}`} target="_blank" rel="noreferrer" aria-label="Abrir foto do apontamento">
                  <Image src={`/app/acompanhamento/fotos/${visit.id}/${photo.fileName}`} alt={`Foto de ${finding.description}`} width={110} height={82} unoptimized /></a>)}</div>}
            {initialWorkFindings.some((item) => item.id === finding.id) && <div className={styles.photos}>
              {initialWorkFindings.filter((item) => item.id === finding.id).map((item) =>
                <a key={item.id} href={`/app/acompanhamento/obras/${item.workId}/fotos/${item.photoFileName}`} target="_blank" rel="noreferrer" aria-label="Abrir foto do apontamento">
                  <Image src={`/app/acompanhamento/obras/${item.workId}/fotos/${item.photoFileName}`} alt={`Foto de ${finding.description}`} width={110} height={82} unoptimized /></a>)}</div>}
          </li>)}</ul></> : <p className="muted">Nenhum apontamento registrado para esta visita.</p>}
      </section>
    </div>
    {nameOpen && <div className={styles.dialogBackdrop}>
      <div className={styles.nameDialog} role="dialog" aria-modal="true" aria-labelledby="report-name-title"
        onKeyDown={(event) => { if (event.key === "Escape" && !pending) setNameOpen(false); }}>
        <h3 id="report-name-title">Nome do relatório</h3>
        <p>Escolha um nome para identificá-lo na lista da visita.</p>
        <form onSubmit={(event) => { void saveNamedReport(event); }}>
          <label>Nome do relatório<input autoFocus required maxLength={120} value={title}
            disabled={pending} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Proteções do pavimento 5" /></label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            <button type="button" className="secondary" disabled={pending} onClick={() => setNameOpen(false)}>Cancelar</button>
            <button type="submit" className="primary" disabled={pending || !title.trim()}>{pending ? "Salvando…" : "Confirmar e salvar"}</button>
          </div>
        </form>
      </div>
    </div>}
  </>;
}
