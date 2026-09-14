"use client";

import { useId, useState, type FormEvent } from "react";
import {
  canManageAgenda,
  canConsultAgenda,
  canReadVisit,
  canStartAudit,
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
import styles from "./visit-agenda.module.css";

type VisitAgendaProps = {
  user: DemoUser;
  works: readonly WorkRecord[];
  users: readonly DemoUser[];
  visits: readonly Visit[];
  module: AppModule;
  workId: string;
  previewOnly?: boolean;
  onCreate: (input: VisitInput) => void;
  onReschedule: (visitId: string, change: { date: string; note: string }) => void;
  onStartAudit: (visit: Visit) => void;
};

const modelIds = Object.keys(auditModelLabels) as AuditModelId[];
const months = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export function VisitAgenda(props: VisitAgendaProps) {
  return <AgendaContext key={`${props.user.id}:${props.module}:${props.workId}`} {...props} />;
}

function AgendaContext({ user, works, users, visits, module, workId, previewOnly = false, onCreate, onReschedule, onStartAudit }: VisitAgendaProps) {
  const canManage = canManageAgenda(user);
  const contextWork = works.find((work) => work.id === workId);
  const canConsult = canConsultAgenda(user, workId, module);
  const visibleVisits = visits
    .filter((visit) => visit.workId === workId && visit.module === module && canReadVisit(user, visit))
    .slice()
    .sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));

  return <>
    <div className="page-intro">
      <div>
        <h2>Agenda de visitas</h2>
        <p className="muted">O Administrativo agenda e reagenda. Auditores consultam e iniciam as auditorias sob sua responsabilidade.</p>
      </div>
      <span className="badge">{canManage ? "Agendamento administrativo" : "Consulta à agenda"}</span>
    </div>

    <div className={styles.context}>
      <span>Obra: <strong>{contextWork?.name ?? "Obra não selecionada"}</strong></span>
      <span>Disciplina: <strong>{moduleLabels[module]}</strong></span>
      {canConsult && <span>{visibleVisits.length} {visibleVisits.length === 1 ? "visita neste contexto" : "visitas neste contexto"}</span>}
    </div>

    {!canConsult ? <section className={`panel ${styles.restriction}`}>
      <h3>Consulta à agenda não autorizada para esta obra</h3>
      <p>A consulta depende dos vínculos de obra, disciplina e das autorizações do perfil selecionado.</p>
    </section> : <>
      {canManage && <CreateVisitForm user={user} works={works} users={users} module={module} workId={workId} previewOnly={previewOnly} onCreate={onCreate} />}
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
          work={works.find((work) => work.id === visit.workId)}
          onReschedule={onReschedule}
          onStartAudit={onStartAudit}
        />)}
      </div> : <section className={`panel ${styles.empty}`}>
        <CalendarIcon />
        <h3>Nenhuma visita disponível</h3>
        <p>{previewOnly ? "A integração da agenda e dos auditores autorizados está em preparação." : canManage ? "Agende uma visita para esta obra e disciplina no formulário acima." : "Não há visitas para consulta nesta obra e disciplina com o perfil selecionado."}</p>
      </section>}
    </>}
  </>;
}

function CreateVisitForm({ user, works, users, module, workId, previewOnly, onCreate }: Pick<VisitAgendaProps, "user" | "works" | "users" | "module" | "workId" | "previewOnly" | "onCreate">) {
  const [input, setInput] = useState<VisitInput>({
    workId: works.some((work) => work.id === workId) ? workId : works[0]?.id ?? "",
    module,
    modelId: module === "safety" ? "security-it07-r02" : "quality-f175",
    auditorId: "",
    date: "",
    note: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const auditorHelpId = useId();
  const models = modelIds.filter((modelId) => modelModule(modelId) === input.module);
  const auditors = users.filter((candidate) => canStartAudit(candidate, input.workId, input.modelId));

  const changeInput = (change: Partial<VisitInput>) => {
    setInput((current) => ({ ...current, ...change }));
    setError("");
    setSuccess("");
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    try {
      if (previewOnly) throw new Error("O agendamento estará disponível após a integração da agenda e dos auditores autorizados.");
      if (!canManageAgenda(user)) throw new Error("Somente o Administrativo pode agendar visitas.");
      onCreate({ ...input, note: input.note.trim() });
      const selectedWork = works.find((work) => work.id === input.workId);
      const outsideContext = input.workId !== workId || input.module !== module;
      setSuccess(`Visita registrada nesta sessão. ${selectedWork?.name ?? input.workId} · ${moduleLabels[input.module]} · ${formatAuditDate(input.date)}.${outsideContext ? " Para consultá-la na lista, selecione essa obra e disciplina no contexto da página." : ""}`);
      setInput((current) => ({ ...current, date: "", note: "" }));
    } catch (cause) {
      setError(errorMessage(cause, "Não foi possível agendar a visita. Confira os campos e tente novamente."));
    }
  };

  return <section className={`panel ${styles.createPanel}`} aria-label="Agendamento administrativo">
    <div className={styles.panelHeading}>
      <CalendarIcon />
      <div><h3>Agendar visita</h3><p>Defina a obra, a disciplina e o auditor responsável pela inspeção.</p></div>
    </div>
    <form onSubmit={submit}>
      <div className={styles.formGrid}>
        <label>Obra
          <select required value={input.workId} onChange={(event) => changeInput({ workId: event.target.value, auditorId: "" })}>
            {works.length === 0 && <option value="">Nenhuma obra disponível</option>}
            {works.map((work) => <option value={work.id} key={work.id}>{work.name}</option>)}
          </select>
        </label>
        <label>Disciplina
          <select value={input.module} onChange={(event) => {
            const nextModule = event.target.value as AppModule;
            changeInput({ module: nextModule, modelId: nextModule === "safety" ? "security-it07-r02" : "quality-f175", auditorId: "" });
          }}>
            <option value="quality">{moduleLabels.quality}</option>
            <option value="safety">{moduleLabels.safety}</option>
          </select>
        </label>
        <label>Modelo pretendido
          <select value={input.modelId} onChange={(event) => changeInput({ modelId: event.target.value as AuditModelId, auditorId: "" })}>
            {models.map((modelId) => <option key={modelId} value={modelId}>{auditModelLabels[modelId].name} · {auditModelLabels[modelId].version}</option>)}
          </select>
        </label>
        <label>Auditor responsável
          <select required value={input.auditorId} aria-label="Auditor responsável" aria-describedby={auditorHelpId} onChange={(event) => changeInput({ auditorId: event.target.value })}>
            <option value="">Selecione o auditor</option>
            {auditors.map((auditor) => <option value={auditor.id} key={auditor.id}>{auditor.name}</option>)}
          </select>
          <small id={auditorHelpId} className={styles.fieldHelp}>{previewOnly ? "A seleção de auditores autorizados estará disponível quando a agenda for integrada." : auditors.length > 0 ? "Auditores autorizados para esta obra e disciplina." : "Nenhum auditor está autorizado para esta obra e disciplina."}</small>
        </label>
        <label>Data prevista
          <input required type="date" value={input.date} onChange={(event) => changeInput({ date: event.target.value })} />
        </label>
        <label className={styles.wideField}>Observação da visita (opcional)
          <textarea maxLength={2000} value={input.note} onChange={(event) => changeInput({ note: event.target.value })} placeholder="Informações para organizar a visita…" />
        </label>
      </div>
      <div className={styles.formFooter}>
        <p>Autoria do agendamento: <strong>{user.name}</strong>, Administrativo. O preenchimento técnico permanece com o auditor responsável.</p>
        <button type="submit" className="primary" disabled={previewOnly || works.length === 0 || auditors.length === 0}>Agendar visita</button>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {success && <p role="status" className={styles.success}>{success}</p>}
    </form>
  </section>;
}

type VisitCardProps = Pick<VisitAgendaProps, "user" | "users" | "onReschedule" | "onStartAudit"> & {
  visit: Visit;
  work?: WorkRecord;
};

function VisitCard({ visit, user, users, work, onReschedule, onStartAudit }: VisitCardProps) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const rescheduleId = useId();
  const manager = canManageAgenda(user);
  const startAllowed = visit.auditorId === user.id && canStartAudit(user, visit.workId, visit.modelId);
  const auditorName = users.find((entry) => entry.id === visit.auditorId)?.name ?? visit.auditorId;
  const creatorName = users.find((entry) => entry.id === visit.createdBy)?.name ?? visit.createdBy;
  const [year, month, day] = visit.date.split("-");
  const model = auditModelLabels[visit.modelId];

  const start = () => {
    setError("");
    setSuccess("");
    try {
      if (!startAllowed || !canReadVisit(user, visit)) throw new Error("Este perfil não está autorizado a iniciar esta auditoria.");
      onStartAudit(visit);
    } catch (cause) {
      setError(errorMessage(cause, "Não foi possível iniciar a auditoria."));
    }
  };

  const reschedule = (change: { date: string; note: string }) => {
    if (!manager || !canReadVisit(user, visit)) throw new Error("Este perfil não está autorizado a reagendar a visita.");
    onReschedule(visit.id, change);
    setSuccess(`Visita reagendada nesta sessão para ${formatAuditDate(change.date)}. O histórico de datas foi preservado.`);
    setError("");
    setEditing(false);
  };

  return <article className={styles.visitCard} aria-label={`Visita de ${model.name} em ${formatAuditDate(visit.date)}`}>
    <div className={styles.visitHeader}>
      <time className={styles.dateTile} dateTime={visit.date} aria-label={formatAuditDate(visit.date)}><strong>{day}</strong><span>{months[Number(month) - 1]} {year}</span></time>
      <div className={styles.visitTitle}>
        <h4>{work?.name ?? visit.workId}</h4>
        <p>{model.name} · {model.version}</p>
        <span>{visit.id}</span>
      </div>
      {(manager || startAllowed) && <div className={styles.visitActions}>
        {manager ? <button type="button" className="secondary" aria-expanded={editing} aria-controls={rescheduleId} onClick={() => { setEditing(!editing); setError(""); setSuccess(""); }}>{editing ? "Fechar reagendamento" : "Reagendar visita"}</button> : <button type="button" className="primary" onClick={start}>Iniciar auditoria</button>}
      </div>}
    </div>
    <dl className={styles.visitDetails}>
      <div><dt>DATA PREVISTA</dt><dd><time dateTime={visit.date}>{formatAuditDate(visit.date)}</time></dd></div>
      <div><dt>AUDITOR RESPONSÁVEL</dt><dd>{auditorName}<small>Responsável pela inspeção</small></dd></div>
      <div><dt>AGENDAMENTO ADMINISTRATIVO</dt><dd>{creatorName}<small>Registrado em <time dateTime={visit.createdAt}>{formatRecordedAt(visit.createdAt)}</time></small></dd></div>
    </dl>
    {visit.note && <p className={styles.visitNote}><strong>Observação: </strong>{visit.note}</p>}

    {editing && manager && <RescheduleForm id={rescheduleId} visit={visit} onSubmit={reschedule} onClose={() => setEditing(false)} />}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {success && <p role="status" className={styles.success}>{success}</p>}

    <details className={styles.history}>
      <summary>Histórico de reagendamentos ({visit.history.length})</summary>
      {visit.history.length > 0 ? <ol>
        {visit.history.map((entry, index) => <li key={`${entry.changedAt}:${index}`}>
          <strong><time dateTime={entry.previousDate}>{formatAuditDate(entry.previousDate)}</time> → <time dateTime={entry.date}>{formatAuditDate(entry.date)}</time></strong>
          <small>Reagendado por {users.find((candidate) => candidate.id === entry.changedBy)?.name ?? entry.changedBy} · <time dateTime={entry.changedAt}>{formatRecordedAt(entry.changedAt)}</time></small>
          {entry.note && <p>{entry.note}</p>}
        </li>)}
      </ol> : <p className={styles.historyEmpty}>Esta visita ainda não foi reagendada.</p>}
    </details>
  </article>;
}

function RescheduleForm({ id, visit, onSubmit, onClose }: { id: string; visit: Visit; onSubmit: (change: { date: string; note: string }) => void; onClose: () => void }) {
  const [date, setDate] = useState(visit.date);
  const [note, setNote] = useState(visit.note);
  const [error, setError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      onSubmit({ date, note: note.trim() });
    } catch (cause) {
      setError(errorMessage(cause, "Não foi possível reagendar a visita. Confira a data e tente novamente."));
    }
  };

  return <form id={id} className={styles.rescheduleForm} onSubmit={submit}>
    <h4>Reagendar visita</h4>
    <p>Atualize a data prevista e registre uma observação. Obra, disciplina, modelo e auditor permanecem vinculados a esta visita.</p>
    <div className={styles.rescheduleFields}>
      <label>Nova data prevista<input required type="date" value={date} onChange={(event) => { setDate(event.target.value); setError(""); }} /></label>
      <label>Observação do reagendamento (opcional)<textarea maxLength={2000} value={note} onChange={(event) => { setNote(event.target.value); setError(""); }} placeholder="Informação sobre a mudança da data…" /></label>
    </div>
    <div className={styles.rescheduleActions}>
      <button type="submit" className="primary">Confirmar reagendamento</button>
      <button type="button" className="secondary" onClick={onClose}>Voltar sem alterar</button>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </form>;
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
