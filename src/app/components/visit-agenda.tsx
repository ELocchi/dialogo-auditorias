"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import {
  canAccessWorkModule,
  canManageAgenda,
  canConsultAgenda,
  canReadVisit,
  canBeginScheduledAudit,
  modelModule,
  moduleLabels,
  type AppModule,
  type DemoUser,
  type Visit,
  type VisitInput,
} from "@/domain/prototype-access";
import {
  auditModelLabels,
  formatAuditDate,
  type AuditModelId,
  type WorkRecord,
} from "@/domain/operational-records";
import { getSaoPauloToday, isCalendarDate } from "@/domain/visit-calendar";
import type { AgendaActionResult } from "@/lib/agenda/contracts";
import { AdminVisitCalendar } from "./admin-visit-calendar";
import { Icon } from "./ui-icon";
import styles from "./visit-agenda.module.css";

type VisitAgendaProps = {
  user: DemoUser;
  works: readonly WorkRecord[];
  users: readonly DemoUser[];
  visits: readonly Visit[];
  module: AppModule;
  workId: string;
  available: boolean;
  mutationPending?: boolean;
  syncError?: string;
  onCreate: (input: VisitInput) => Promise<AgendaActionResult>;
  onDelete: (visitId: string, expectedRevision: number) => Promise<AgendaActionResult>;
  onConfirm: (visitId: string, expectedRevision: number) => Promise<AgendaActionResult>;
};

const modelIds = Object.keys(auditModelLabels) as AuditModelId[];
const visitTypeLabels: Record<AuditModelId, string> = {
  "security-it07-r02": "Auditoria de Segurança",
  "quality-f175": "Farol da Qualidade Simplificado",
  "quality-f176": "Farol da Qualidade Completo",
};
const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export function VisitAgenda(props: VisitAgendaProps) {
  if (canManageAgenda(props.user)) return <AdministrativeAgenda {...props} />;
  if (props.user.role === "safety-auditor") return <SafetyAuditorAgenda {...props} />;
  return <AgendaContext key={`${props.user.id}:${props.module}:${props.workId}`} {...props} />;
}

function AdministrativeAgenda({ user, works, users, visits, module, workId, available, mutationPending = false, syncError, onCreate, onDelete, onConfirm }: VisitAgendaProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const dialogTitleId = useId();
  const authorizedWorks = works.filter((work) => user.modules.some((discipline) => canConsultAgenda(user, work.id, discipline)));
  const workIds = new Set(authorizedWorks.map((work) => work.id));
  const visibleVisits = visits.filter((visit) => workIds.has(visit.workId) && canReadVisit(user, visit) && isCalendarDate(visit.date))
    .sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));

  return <>
    <div className="page-intro">
      <div><h2>Agenda de visitas</h2></div>
      <span className="badge">Agendamento administrativo</span>
    </div>
    {(!available || syncError) && <p role="status" className={styles.availability}>{syncError || "A agenda está indisponível no momento. Não é possível agendar ou confirmar visitas agora."}</p>}
    <div className={styles.administrativeLayout}>
      <section className={`panel ${styles.scheduledPanel}`} aria-labelledby={listId}>
        <div className={styles.scheduledHeading}>
          <h3 id={listId}>Visitas agendadas</h3>
          <button ref={addButtonRef} type="button" className={styles.addVisit} aria-label="Agendar visita" title="Agendar visita" aria-haspopup="dialog" disabled={mutationPending} onClick={() => dialogRef.current?.showModal()}><Icon name="plus" /></button>
        </div>
        {visibleVisits.length ? <div className={styles.visitList}>
          {visibleVisits.map((visit) => <VisitCard key={visit.id} visit={visit} user={user} users={users}
            work={authorizedWorks.find((work) => work.id === visit.workId)} available={available} mutationPending={mutationPending}
            onDelete={onDelete} onConfirm={onConfirm} />)}
        </div> : <div className={styles.scheduledEmpty}>
          <CalendarIcon />
          <p>{!available ? "Aguardando acesso à agenda." : authorizedWorks.length ? "Nenhuma visita agendada." : "Nenhuma obra disponível para agendamento."}</p>
        </div>}
      </section>
      <AdminVisitCalendar visits={visibleVisits} works={authorizedWorks} auditors={users} viewerId={user.id} calendarOnly />
    </div>
    <dialog ref={dialogRef} className={styles.scheduleDialog} aria-labelledby={dialogTitleId} onCancel={(event) => { if (mutationPending) event.preventDefault(); }} onClose={() => addButtonRef.current?.focus()}>
      <button type="button" className={`secondary ${styles.closeDialog}`} disabled={mutationPending} onClick={() => dialogRef.current?.close()}>Fechar</button>
      <CreateVisitForm user={user} works={authorizedWorks} users={users} module={module} workId={workId}
        available={available} mutationPending={mutationPending} onCreate={onCreate} headingId={dialogTitleId} />
    </dialog>
  </>;
}

function SafetyAuditorAgenda({ user, works, users, visits, available, mutationPending = false, syncError, onDelete, onConfirm }: VisitAgendaProps) {
  const listId = useId();
  const authorizedWorks = works.filter((work) => canConsultAgenda(user, work.id, "safety"));
  const workIds = new Set(authorizedWorks.map((work) => work.id));
  const visibleVisits = visits.filter((visit) => visit.module === "safety" && workIds.has(visit.workId) && canReadVisit(user, visit) && isCalendarDate(visit.date))
    .slice().sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));

  return <>
    <div className="page-intro"><h2>Agenda de visitas</h2></div>
    {(!available || syncError) && <p role="status" className={styles.availability}>{syncError || "A agenda está indisponível no momento. Tente novamente após a atualização."}</p>}
    <div className={styles.administrativeLayout}>
      <section className={`panel ${styles.scheduledPanel}`} aria-labelledby={listId}>
        <div className={styles.scheduledHeading}><h3 id={listId}>Visitas agendadas</h3></div>
        {visibleVisits.length ? <div className={styles.visitList}>
          {visibleVisits.map((visit) => <VisitCard key={visit.id} visit={visit} user={user} users={users}
            work={authorizedWorks.find((work) => work.id === visit.workId)} available={available} mutationPending={mutationPending}
            onDelete={onDelete} onConfirm={onConfirm} collapsedInitially />)}
        </div> : <div className={styles.scheduledEmpty}>
          <CalendarIcon />
          <p>{!available ? "Aguardando acesso à agenda." : "Nenhuma visita agendada para este auditor."}</p>
        </div>}
      </section>
      <AdminVisitCalendar visits={visibleVisits} works={authorizedWorks} viewerId={user.id} calendarOnly includeFollowUps colorBy="work" />
    </div>
  </>;
}

function AgendaContext({ user, works, users, visits, module, workId, available, mutationPending = false, syncError, onCreate, onDelete, onConfirm }: VisitAgendaProps) {
  const canManage = canManageAgenda(user);
  const authorizedWorks = works.filter((work) => user.modules.some((discipline) => canConsultAgenda(user, work.id, discipline)));
  const authorizedWorkIds = new Set(authorizedWorks.map((work) => work.id));
  const canConsult = authorizedWorks.length > 0;
  const visibleVisits = visits
    .filter((visit) => authorizedWorkIds.has(visit.workId) && canReadVisit(user, visit))
    .slice()
    .sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));

  return <>
    <div className="page-intro">
      <div>
        <h2>Agenda de visitas</h2>
        <p className="muted">O Administrativo agenda e pode excluir agendamentos. Auditores confirmam as visitas sob sua responsabilidade.</p>
      </div>
      <span className="badge">{canManage ? "Agendamento administrativo" : "Consulta à agenda"}</span>
    </div>
    {(!available || syncError) && <p role="status" className={styles.availability}>{syncError || "A agenda está indisponível no momento. Tente novamente após a atualização."}</p>}

    {canConsult && <div className={styles.context}>
      <span><strong>{authorizedWorks.length}</strong> {authorizedWorks.length === 1 ? "obra relacionada" : "obras relacionadas"}</span>
      <span><strong>{visibleVisits.length}</strong> {visibleVisits.length === 1 ? "visita agendada" : "visitas agendadas"}</span>
    </div>}

    {!canConsult ? <section className={`panel ${styles.restriction}`}>
      <h3>Nenhuma obra disponível na agenda</h3>
      <p>A consulta depende dos vínculos de obra, disciplina e das autorizações do perfil selecionado.</p>
    </section> : <>
      {canManage && <CreateVisitForm user={user} works={authorizedWorks} users={users} module={module} workId={workId} available={available} mutationPending={mutationPending} onCreate={onCreate} />}
      <div className={styles.listHeading}>
        <h3>Visitas agendadas</h3>
        <span>Ordenadas pela data prevista</span>
      </div>
      {visibleVisits.length > 0 ? <div className={styles.visitList}>
        {visibleVisits.map((visit) => <VisitCard
          key={visit.id}
          visit={visit}
          user={user}
          users={users}
          work={authorizedWorks.find((work) => work.id === visit.workId)}
          available={available}
          mutationPending={mutationPending}
          onDelete={onDelete}
          onConfirm={onConfirm}
        />)}
      </div> : <section className={`panel ${styles.empty}`}>
        <CalendarIcon />
        <h3>Nenhuma visita disponível</h3>
        <p>{!available ? "Aguardando acesso à agenda." : canManage ? "Agende uma visita no formulário acima." : "Não há visitas para consulta nas obras autorizadas deste perfil."}</p>
      </section>}
    </>}
  </>;
}

function CreateVisitForm({ user, works, users, module, workId, available, mutationPending = false, onCreate, headingId }: Pick<VisitAgendaProps, "user" | "works" | "users" | "module" | "workId" | "available" | "mutationPending" | "onCreate"> & { headingId?: string }) {
  const disciplines = (["safety", "quality"] as const).filter((discipline) =>
    works.some((work) => canConsultAgenda(user, work.id, discipline)));
  const initialModule = disciplines.includes(module) ? module : disciplines[0] ?? module;
  const [input, setInput] = useState<VisitInput>({
    workId: works.some((work) => work.id === workId && canConsultAgenda(user, work.id, initialModule))
      ? workId : works.find((work) => canConsultAgenda(user, work.id, initialModule))?.id ?? "",
    module: initialModule,
    kind: "audit",
    modelId: initialModule === "safety" ? "security-it07-r02" : "quality-f175",
    auditorId: "",
    date: "",
    note: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const auditorHelpId = useId();
  const models = modelIds.filter((modelId) => modelModule(modelId) === input.module);
  const eligibleWorks = works.filter((work) => canConsultAgenda(user, work.id, input.module));
  const auditors = users.filter((candidate) =>
    candidate.role === (input.module === "safety" ? "safety-auditor" : "quality-auditor")
    && canAccessWorkModule(candidate, input.workId, input.module));

  const changeInput = (change: Partial<VisitInput>) => {
    setInput((current) => ({ ...current, ...change }));
    setError("");
    setSuccess("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || mutationPending) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      if (!available) throw new Error("A agenda está indisponível no momento. Aguarde a atualização e tente novamente.");
      if (!canManageAgenda(user)) throw new Error("Somente o Administrativo pode agendar visitas.");
      if (!eligibleWorks.some((work) => work.id === input.workId)
        || !auditors.some((auditor) => auditor.id === input.auditorId)) {
        throw new Error("Selecione uma obra e um profissional autorizados para esta visita.");
      }
      const result = await onCreate({ ...input, note: input.note.trim() });
      if (result.status !== "success") throw new Error(result.message);
      setSuccess(result.message);
      setInput((current) => ({ ...current, auditorId: "", date: "", note: "" }));
    } catch (cause) {
      setError(errorMessage(cause, "Não foi possível agendar a visita. Confira os campos e tente novamente."));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return <section className={`panel ${styles.createPanel}`} aria-label="Agendamento administrativo">
    <div className={styles.panelHeading}>
      <CalendarIcon />
      <div><h3 id={headingId}>Agendar visita</h3><p>Escolha a obra, a finalidade da visita e o dia de cada profissional.</p></div>
    </div>
    <form onSubmit={submit} aria-busy={submitting}>
      <fieldset className={styles.formFields} disabled={submitting || mutationPending}>
      <div className={styles.formGrid}>
        <label>Obra
          <select required value={input.workId} onChange={(event) => changeInput({ workId: event.target.value, auditorId: "" })}>
            {eligibleWorks.length === 0 && <option value="">Nenhuma obra disponível</option>}
            {eligibleWorks.map((work) => <option value={work.id} key={work.id}>{work.name}</option>)}
          </select>
        </label>
        <label>Disciplina
          <select value={input.module} onChange={(event) => {
            const nextModule = event.target.value as AppModule;
            const nextWorks = works.filter((work) => canConsultAgenda(user, work.id, nextModule));
            changeInput({ module: nextModule, modelId: input.kind === "follow_up" ? null
              : nextModule === "safety" ? "security-it07-r02" : "quality-f175",
              workId: nextWorks.some((work) => work.id === input.workId) ? input.workId : nextWorks[0]?.id ?? "", auditorId: "" });
          }}>
            {disciplines.map((discipline) => <option key={discipline} value={discipline}>{moduleLabels[discipline]}</option>)}
          </select>
        </label>
        <label>Finalidade da visita
          <select value={input.kind} onChange={(event) => {
            const kind = event.target.value as VisitInput["kind"];
            changeInput({ kind, modelId: kind === "audit" ? (input.module === "safety" ? "security-it07-r02" : "quality-f175") : null });
          }}>
            <option value="audit">Auditoria</option>
            <option value="follow_up">Acompanhamento da obra</option>
          </select>
        </label>
        {input.kind === "audit" && <label>Tipo de auditoria
          <select value={input.modelId ?? ""} onChange={(event) => changeInput({ modelId: event.target.value as AuditModelId })}>
            {models.map((modelId) => <option key={modelId} value={modelId}>{visitTypeLabels[modelId]}</option>)}
          </select>
        </label>}
        <label>Profissional responsável
          <select required value={input.auditorId} aria-label="Profissional responsável" aria-describedby={auditorHelpId} onChange={(event) => changeInput({ auditorId: event.target.value })}>
            <option value="">Selecione o profissional</option>
            {auditors.map((auditor) => <option value={auditor.id} key={auditor.id}>{auditor.name}</option>)}
          </select>
          <small id={auditorHelpId} className={styles.fieldHelp}>{!available ? "O agendamento está indisponível no momento." : auditors.length > 0 ? `Profissionais de ${moduleLabels[input.module]} autorizados para esta obra.` : `Nenhum profissional de ${moduleLabels[input.module]} está autorizado para esta obra.`}</small>
        </label>
        <label>Dia da visita
          <input required type="date" value={input.date} onChange={(event) => changeInput({ date: event.target.value })} />
        </label>
        <label className={styles.wideField}>Observação da visita (opcional)
          <textarea maxLength={2000} value={input.note} onChange={(event) => changeInput({ note: event.target.value })} placeholder="Informações para organizar a visita…" />
        </label>
        {input.kind === "follow_up" && <p className={`${styles.wideField} ${styles.followUpNotice}`}>O acompanhamento será registrado na agenda e enviado ao profissional para confirmação. Ele não gera auditoria nem entra na nota mensal da obra.</p>}
      </div>
      <div className={styles.formFooter}>
        <p>Agende uma visita por profissional, obra e dia. A pessoa selecionada receberá a solicitação para confirmar a data no aplicativo.</p>
        <button type="submit" className="primary" disabled={!available || eligibleWorks.length === 0 || auditors.length === 0}>{submitting ? "Agendando…" : "Agendar visita"}</button>
      </div>
      </fieldset>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {success && <p role="status" className={styles.success}>{success}</p>}
    </form>
  </section>;
}

type VisitCardProps = Pick<VisitAgendaProps, "user" | "users" | "available" | "mutationPending" | "onDelete" | "onConfirm"> & {
  visit: Visit;
  work?: WorkRecord;
  collapsedInitially?: boolean;
  showType?: boolean;
  onStartAudit?: (visit: Visit) => Promise<void>;
  auditStarted?: boolean;
};

export function VisitCard({ visit, user, users, work, available, mutationPending = false, onDelete, onConfirm, collapsedInitially = false, showType = true, onStartAudit, auditStarted = false }: VisitCardProps) {
  const manager = canManageAgenda(user);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(!manager && !collapsedInitially);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const confirmingRef = useRef(false);
  const startingRef = useRef(false);
  const deletingRef = useRef(false);
  const assignedAllowed = visit.auditorId === user.id
    && (user.role === "safety-auditor" || user.role === "quality-auditor")
    && canAccessWorkModule(user, visit.workId, visit.module);
  const hasRevision = Number.isInteger(visit.revision) && (visit.revision ?? 0) > 0;
  const confirmAllowed = assignedAllowed && canReadVisit(user, visit) && visit.confirmationStatus === "pending_confirmation" && hasRevision;
  const startVisible = !!onStartAudit && assignedAllowed && visit.kind === "audit";
  const startAllowed = startVisible && available && canBeginScheduledAudit(user, visit, getSaoPauloToday());
  const auditorName = visit.auditorName ?? users.find((entry) => entry.id === visit.auditorId)?.name ?? (visit.auditorId === user.id ? user.name : visit.auditorId);
  const creatorName = visit.createdByName ?? users.find((entry) => entry.id === visit.createdBy)?.name ?? (visit.createdBy === user.id ? user.name : visit.createdBy);
  const [year, month, day] = visit.date.split("-");
  const visitLabel = visit.kind === "follow_up" ? `Acompanhamento da obra · ${moduleLabels[visit.module]}`
    : visit.modelId ? visitTypeLabels[visit.modelId] : "Auditoria";

  const deleteVisit = async () => {
    if (deletingRef.current || mutationPending) return;
    deletingRef.current = true;
    setDeleting(true);
    setError("");
    try {
      if (!available || !manager || !canReadVisit(user, visit) || !hasRevision || visit.revision === undefined) {
        throw new Error("A exclusão não está disponível para este agendamento.");
      }
      const result = await onDelete(visit.id, visit.revision);
      if (result.status !== "success") throw new Error(result.message);
      setConfirmDelete(false);
    } catch (cause) {
      setError(errorMessage(cause, "Não foi possível excluir o agendamento. Atualize a agenda e tente novamente."));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  const confirm = async () => {
    if (confirmingRef.current || mutationPending) return;
    confirmingRef.current = true;
    setConfirming(true);
    setError("");
    setSuccess("");
    try {
      if (!available || !confirmAllowed || visit.revision === undefined) throw new Error("A confirmação não está disponível para esta visita.");
      const result = await onConfirm(visit.id, visit.revision);
      if (result.status !== "success") throw new Error(result.message);
      setSuccess(result.message);
    } catch (cause) {
      setError(errorMessage(cause, "Não foi possível confirmar a visita. Tente novamente."));
    } finally {
      confirmingRef.current = false;
      setConfirming(false);
    }
  };

  const startAudit = async () => {
    if (!onStartAudit || startingRef.current || mutationPending || !startAllowed) return;
    startingRef.current = true;
    setStarting(true);
    setError("");
    try { await onStartAudit(visit); }
    catch (cause) { setError(errorMessage(cause, "Não foi possível iniciar a auditoria. Atualize a agenda e tente novamente.")); }
    finally { startingRef.current = false; setStarting(false); }
  };

  return <article className={styles.visitCard} data-visit-kind={visit.kind} aria-label={`${visitLabel} em ${formatAuditDate(visit.date)}`}>
    <details className={styles.visitDisclosure} open={expanded} onToggle={(event) => {
      setExpanded(event.currentTarget.open);
      if (!event.currentTarget.open) setConfirmDelete(false);
    }}>
      <summary className={styles.visitSummary}>
        <time className={`${styles.dateTile} ${visit.confirmationStatus === "confirmed" ? styles.dateTileConfirmed : styles.dateTilePending}`} dateTime={visit.date} aria-label={`${formatAuditDate(visit.date)}; ${visit.confirmationStatus === "confirmed" ? "visita confirmada" : "aguardando confirmação"}`}><strong>{day}</strong><span>{months[Number(month) - 1]} {year}</span></time>
        <span className={styles.visitTitle}>
          <strong>{work?.name ?? visit.workId}</strong>
          <span><small>Profissional responsável</small>{auditorName}</span>
          {showType && <span className={styles.visitType}>{visitLabel}</span>}
        </span>
        <span className={styles.expandIndicator} aria-hidden="true" />
      </summary>
      <div className={styles.visitExpanded}>
        {confirmAllowed && <div className={styles.visitActions}>
          <button type="button" className="primary" disabled={!available || mutationPending || confirming} onClick={() => { void confirm(); }}>{confirming ? "Confirmando…" : "Confirmar data"}</button>
        </div>}
        <div className={styles.visitAdminRow}>
          <dl className={styles.visitDetails}>
            <div><dt>AGENDAMENTO ADMINISTRATIVO</dt><dd>{creatorName}<small>Registrado em <time dateTime={visit.createdAt}>{formatRecordedAt(visit.createdAt)}</time></small></dd></div>
          </dl>
          {startVisible && <button type="button" className={`primary ${styles.startAuditButton}`} disabled={!startAllowed || mutationPending || starting} title={!available ? "Agenda indisponível" : visit.confirmationStatus !== "confirmed" ? "Confirme a data da visita antes de iniciar" : visit.date !== getSaoPauloToday() ? "Disponível somente na data agendada" : undefined} onClick={() => { void startAudit(); }}>{starting ? "Abrindo…" : auditStarted ? "Retomar auditoria" : "Iniciar auditoria"}</button>}
          {manager && <button type="button" className="secondary" disabled={!available || !hasRevision || mutationPending || deleting} aria-expanded={confirmDelete} onClick={() => { setConfirmDelete(!confirmDelete); setError(""); }}>{confirmDelete ? "Voltar" : "Excluir agendamento"}</button>}
        </div>
        {confirmDelete && manager && <div className={styles.deleteConfirmation}>
          <p>Excluir este agendamento da agenda de todos os perfis? A visita deixará de aparecer no calendário e nas notificações.</p>
          <button type="button" className="secondary" disabled={!available || mutationPending || deleting} onClick={() => { void deleteVisit(); }}>{deleting ? "Excluindo…" : "Confirmar exclusão"}</button>
        </div>}
        {visit.note && <p className={styles.visitNote}><strong>Observação: </strong>{visit.note}</p>}

        {error && <p role="alert" className={styles.error}>{error}</p>}
        {success && <p role="status" className={styles.success}>{success}</p>}
      </div>
    </details>
  </article>;
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function formatRecordedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Horário não informado" : new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function CalendarIcon() {
  return <span className={styles.calendarIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 11h18M7 15h3M14 15h3" /></svg></span>;
}
