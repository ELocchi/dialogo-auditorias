"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { DemoUser, Visit } from "@/domain/prototype-access";
import { canReadVisit } from "@/domain/prototype-access";
import { formatAuditDate, type WorkRecord } from "@/domain/operational-records";
import { getSaoPauloToday } from "@/domain/visit-calendar";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { FollowUpFinding, FollowUpReport, FollowUpSnapshot, SaveFollowUpInput } from "@/lib/follow-up/service";
import { readFollowUpReportsAction, saveFollowUpReportAction } from "@/app/follow-up/actions";
import styles from "./follow-up-workspace.module.css";

type Props = { user: DemoUser; visits: readonly Visit[]; works: readonly WorkRecord[]; actor: AgendaActorContext; agendaAvailable: boolean };
const monthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const emptyFinding = (): FollowUpFinding => ({ id: crypto.randomUUID(), location: "", description: "", correction: "" });

export function FollowUpWorkspace({ user, visits, works, actor, agendaAvailable }: Props) {
  const authorizedWorks = new Map(works.map((work) => [work.id, work]));
  const scheduled = visits.filter((visit) => visit.kind === "follow_up" && visit.auditorId === user.id
    && authorizedWorks.has(visit.workId) && canReadVisit(user, visit))
    .slice().sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<FollowUpSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const selected = scheduled.find((visit) => visit.id === selectedId);
  const report = snapshot?.reports.find((entry) => entry.visitId === selected?.id);
  const canWrite = !!selected && agendaAvailable && snapshot?.available === true
    && selected.confirmationStatus === "confirmed" && (report ? selected.date <= getSaoPauloToday() : selected.date === getSaoPauloToday());

  useEffect(() => {
    let cancelled = false;
    void readFollowUpReportsAction(actor).then((result) => {
      if (!cancelled) setSnapshot(result);
    }).catch(() => {
      if (!cancelled) setSnapshot({ available: false, reports: [], message: "Não foi possível consultar os relatórios. Tente novamente." });
    });
    return () => { cancelled = true; };
  }, [actor]);

  const save = async (input: SaveFollowUpInput) => {
    setMessage("");
    const result = await saveFollowUpReportAction(input, actor);
    if (result.status === "success" && result.report) {
      setSnapshot((previous) => ({ available: true,
        reports: [...(previous?.reports ?? []).filter((entry) => entry.visitId !== result.report!.visitId), result.report!] }));
      setMessage(result.message);
    }
    return result;
  };

  return <>
    <div className="page-intro"><h2>Acompanhamento</h2></div>
    {(!agendaAvailable || snapshot?.message) && <p className={styles.availability} role="status">{snapshot?.message ?? "A agenda está indisponível no momento. Atualize a página para consultar as visitas."}</p>}
    <div className={styles.layout}>
      <section className={`panel ${styles.listPanel}`} aria-label="Visitas de acompanhamento">
        <div className="panel-heading"><h3>Visitas de acompanhamento</h3></div>
        {scheduled.length ? <div className={styles.visitList}>{scheduled.map((visit) => {
          const [year, month, day] = visit.date.split("-");
          const saved = snapshot?.reports.some((entry) => entry.visitId === visit.id);
          const expanded = expandedId === visit.id;
          const availableToOpen = agendaAvailable && snapshot?.available === true
            && visit.confirmationStatus === "confirmed" && (saved ? visit.date <= getSaoPauloToday() : visit.date === getSaoPauloToday());
          return <article key={visit.id} className={`${styles.visitCard}${expanded ? ` ${styles.expanded}` : ""}`}>
            <button type="button" className={styles.visitSummary} aria-expanded={expanded} aria-controls={`follow-up-details-${visit.id}`}
              onClick={() => setExpandedId(expanded ? null : visit.id)}>
              <time dateTime={visit.date} className={`${styles.dateTile} ${visit.confirmationStatus === "confirmed" ? styles.dateTileConfirmed : styles.dateTilePending}`}><strong>{day}</strong><span>{monthNames[Number(month) - 1]} {year}</span></time>
              <span className={styles.visitInfo}>
                <strong>{authorizedWorks.get(visit.workId)?.name}</strong>
                <span className={styles.professional}><small>Profissional responsável</small>{user.name}</span>
                <span className={styles.visitType}>Acompanhamento da obra · {visit.module === "safety" ? "Segurança" : "Qualidade"}</span>
                {saved && <span className={styles.saved}>Relatório salvo</span>}
              </span>
              <span className={styles.expandIndicator} aria-hidden="true" />
            </button>
            {expanded && <div id={`follow-up-details-${visit.id}`} className={styles.visitDetails}>
              <span className={styles.visitStatus}>{visit.confirmationStatus === "confirmed" ? "Data confirmada" : "Aguardando confirmação da data"}</span>
              <button type="button" className="primary" disabled={!availableToOpen}
                title={!agendaAvailable || snapshot?.available !== true ? "Relatórios indisponíveis" : visit.confirmationStatus !== "confirmed" ? "Confirme a data na Agenda" : !saved && visit.date !== getSaoPauloToday() ? "Disponível somente na data agendada" : undefined}
                onClick={() => { setSelectedId(visit.id); setMessage(""); }}>
                {saved ? "Abrir relatório" : "Criar relatório"}
              </button>
            </div>}
          </article>;
        })}</div> : <p className="muted">Nenhuma visita de acompanhamento atribuída a este perfil.</p>}
      </section>
      <section className={`panel ${styles.editorPanel}`} aria-label="Relatório orientativo">
        {selected ? <>
          <div className="panel-heading"><div><h3>Relatório orientativo</h3><p className={styles.context}>{authorizedWorks.get(selected.workId)?.name} · {formatAuditDate(selected.date)}</p></div></div>
          {!canWrite && <p className={styles.availability} role="status">{selected.confirmationStatus !== "confirmed" ? "Confirme a data na Agenda antes de registrar o acompanhamento." : !report && selected.date !== getSaoPauloToday() ? "A criação do relatório está disponível somente na data da visita." : "O salvamento está indisponível no momento."}</p>}
          {message && <p className={styles.success} role="status">{message}</p>}
          <ReportEditor key={`${selected.id}:${report?.revision ?? 0}`} visitId={selected.id} report={report} disabled={!canWrite} onSave={save} />
        </> : <p className="muted">Expanda uma visita de acompanhamento e escolha “Criar relatório” para começar.</p>}
      </section>
    </div>
  </>;
}

function ReportEditor({ visitId, report, disabled, onSave }: { visitId: string; report?: FollowUpReport; disabled: boolean; onSave: (value: SaveFollowUpInput) => Promise<{ status: "success" | "error"; message: string }> }) {
  const [guidance, setGuidance] = useState(report?.guidance ?? "");
  const [findings, setFindings] = useState<FollowUpFinding[]>(report?.findings ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const updateFinding = (id: string, field: "location" | "description" | "correction", value: string) =>
    setFindings((items) => items.map((item) => item.id === id ? { ...item, [field]: value } : item));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || pending) return;
    setPending(true); setError("");
    try {
      const result = await onSave({ visitId, expectedRevision: report?.revision ?? 0, guidance, findings });
      if (result.status !== "success") setError(result.message);
    } catch { setError("Não foi possível salvar o relatório. Tente novamente."); }
    finally { setPending(false); }
  };
  return <form onSubmit={(event) => { void submit(event); }} className={styles.form}>
    <fieldset disabled={disabled || pending}>
      <label>Orientações da visita<textarea required minLength={20} maxLength={10000} value={guidance} onChange={(event) => setGuidance(event.target.value)} placeholder="Registre as orientações passadas à equipe da obra." /></label>
      <div className={styles.findingsHeading}><h4>Apontamentos para correção</h4><button type="button" className="secondary" disabled={findings.length >= 30} onClick={() => setFindings((items) => [...items, emptyFinding()])}>+ Adicionar apontamento</button></div>
      {findings.length === 0 && <p className="muted">Nenhum apontamento incluído nesta visita.</p>}
      {findings.map((item, index) => <div key={item.id} className={styles.finding}>
        <div className={styles.findingHeading}><strong>Apontamento {index + 1}</strong><button type="button" className="secondary" onClick={() => setFindings((items) => items.filter((entry) => entry.id !== item.id))}>Remover</button></div>
        <label>Local (opcional)<input maxLength={200} value={item.location} onChange={(event) => updateFinding(item.id, "location", event.target.value)} placeholder="Ex.: pavimento, ambiente ou frente de serviço" /></label>
        <label>O que precisa de correção<textarea required minLength={5} maxLength={2000} value={item.description} onChange={(event) => updateFinding(item.id, "description", event.target.value)} /></label>
        <label>Orientação para correção<textarea required minLength={5} maxLength={2000} value={item.correction} onChange={(event) => updateFinding(item.id, "correction", event.target.value)} /></label>
      </div>)}
      <div className={styles.formFooter}><button type="submit" className="primary">{pending ? "Salvando…" : report ? "Salvar alterações" : "Salvar relatório orientativo"}</button></div>
    </fieldset>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </form>;
}
