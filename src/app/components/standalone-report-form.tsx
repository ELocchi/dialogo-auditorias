"use client";
import { SlowOperation } from "@/app/components/slow-operation";
import { useHydrated } from "./use-hydrated";
import { readWithDeadline } from "@/lib/read-with-deadline";
import { AsyncSkeleton } from "./async-feedback";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { WorkRecord } from "@/domain/operational-records";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import { newRequestId } from "@/lib/agenda/sync-client";
import type { FollowUpFinding } from "@/lib/follow-up/service";
import { readStandaloneFindingsAction, saveStandaloneReportAction } from "@/app/follow-up/actions";
import { ReportHeading } from "./follow-up-report-page";
import styles from "./follow-up-report-page.module.css";

export function StandaloneReportForm({ works, actor, today, initialWorkId }: {
  works: WorkRecord[]; actor: AgendaActorContext; today: string; initialWorkId?: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [workId, setWorkId] = useState(() => works.find(work => work.id === initialWorkId)?.id ?? works[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [findingState, setFindingState] = useState<{ workId: string; attempt: number; available: boolean; findings: FollowUpFinding[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const { userId, profile, engineeringScope, administrativeScope } = actor;
  useEffect(() => {
    if (!workId) return;
    let current = true;
    void readWithDeadline(readStandaloneFindingsAction(workId, { userId, profile, engineeringScope, administrativeScope }))
      .then(result => { if (current) setFindingState({ workId, attempt, ...result }); })
      .catch(() => { if (current) setFindingState({ workId, attempt, available: false, findings: [] }); });
    return () => { current = false; };
  }, [workId, attempt, userId, profile, engineeringScope, administrativeScope]);
  const loaded = findingState?.workId === workId && findingState.attempt === attempt;
  const findings = loaded && findingState.available ? findingState.findings : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !workId) return;
    const form = new FormData(event.currentTarget);
    const payload = { workId, date: form.get("date"), title: form.get("title"), participants: form.get("participants"),
      subjects: form.get("subjects"), decisions: form.get("decisions"), findingIds: selectedIds };
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: newRequestId() };
    busy.current = true;
    setPending(true); setError("");
    try {
      const result = await saveStandaloneReportAction({ ...payload, requestId: request.current.id }, actor);
      if (result.status === "success") {
        router.replace(`/app/acompanhamento/relatorio/avulso/${result.reportId}?salvo=1${result.archivePending ? "&pdf=pendente" : ""}`);
        return;
      }
      setError(result.message);
    } catch { setError("Não foi possível confirmar o salvamento. Tente novamente sem fechar esta página."); }
    busy.current = false; setPending(false);
  }

  return <>
    <ReportHeading title="Relatório Orientativo" backHref="/app?secao=acompanhamento" backLabel="Voltar aos relatórios" />
    <div className={styles.layout}>
      <section className="panel" aria-label="Novo relatório orientativo">
        <form method="post" className={styles.form} onSubmit={submit} aria-busy={pending}>
          <label>Obra<select className="filter-select" name="workId" aria-label="Obra" value={workId} required disabled={!hydrated || pending || !works.length}
            onChange={event => { setWorkId(event.target.value); setSelectedIds([]); }}>
            {!works.length && <option value="">Nenhuma obra disponível</option>}{works.map(work => <option key={work.id} value={work.id}>{work.name}</option>)}
          </select></label>
          {!works.length && <p className={styles.notice}>Nenhuma obra disponível para este perfil.</p>}
          <label>Data do relatório<input type="date" name="date" defaultValue={today} max={today} min="0001-01-01" required disabled={!hydrated || pending} /></label>
          <label>Título<input name="title" maxLength={120} required defaultValue="Relatório Orientativo" disabled={!hydrated || pending} /></label>
          <label>Participantes<textarea name="participants" maxLength={5000} disabled={!hydrated || pending} /></label>
          <label>Assuntos abordados e orientações<textarea name="subjects" maxLength={10000} required disabled={!hydrated || pending} /></label>
          <label>Decisões e encaminhamentos<textarea name="decisions" maxLength={10000} disabled={!hydrated || pending} /></label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.actions}>
            {pending ? <button type="button" className="secondary" disabled>Cancelar</button> : <Link className="secondary" href="/app?secao=acompanhamento">Cancelar</Link>}
            <button className="primary" type="submit" disabled={!hydrated || pending || !workId}>{pending ? "Salvando…" : "Salvar relatório"}</button>
          </div>
        <SlowOperation pending={pending} /></form>
      </section>
      <section className="panel" aria-label="Apontamentos opcionais">
        <div className="panel-heading"><h3>Apontamentos da obra</h3></div>
        <p className={styles.selectionHint}>Opcional. Selecione até 30 apontamentos para incluir suas fotos e orientações no relatório.</p>
        {!workId ? <p className="muted">Nenhuma obra disponível para consultar os apontamentos.</p>
          : !loaded ? <AsyncSkeleton label="Carregando apontamentos…" />
          : !findingState.available ? <div className={styles.notice} role="alert">
            <p>Não foi possível consultar os apontamentos. Você pode salvar o relatório sem incluí-los.</p>
            <button className="secondary" type="button" disabled={!hydrated || pending} onClick={() => setAttempt(n => n + 1)}>Recarregar apontamentos</button>
          </div> : !findings.length ? <p className="muted">Nenhum apontamento pendente nesta obra.</p> :
          <ul className={styles.findings}>{findings.map(finding => <li key={finding.id}>
            <label className={styles.findingChoice}>
              <input type="checkbox" checked={selectedIds.includes(finding.id)}
                disabled={!hydrated || pending || (!selectedIds.includes(finding.id) && selectedIds.length >= 30)}
                onChange={event => setSelectedIds(ids => event.target.checked ? [...ids, finding.id] : ids.filter(id => id !== finding.id))} />
              <div className={styles.findingText}><strong>{finding.description}{finding.serious && <em className={styles.seriousBadge}>Item grave</em>}</strong>
                {finding.location && <span>{finding.location}</span>}<p>{finding.correction}</p></div>
            </label>
          </li>)}</ul>}
      </section>
    </div>
  </>;
}
