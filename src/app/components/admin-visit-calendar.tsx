"use client";

import { useId, useState } from "react";
import { auditModelLabels, formatAuditDate, type WorkRecord } from "@/domain/operational-records";
import type { Visit } from "@/domain/prototype-access";
import { getCalendarDays, getSaoPauloToday, isCalendarDate, shiftCalendarMonth } from "@/domain/visit-calendar";
import { Icon } from "./ui-icon";
import styles from "./admin-visit-calendar.module.css";

const weekdays = [["Dom", "Domingo"], ["Seg", "Segunda-feira"], ["Ter", "Terça-feira"], ["Qua", "Quarta-feira"], ["Qui", "Quinta-feira"], ["Sex", "Sexta-feira"], ["Sáb", "Sábado"]];
const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function AdminVisitCalendar({ visits, works, onViewAgenda, calendarOnly = false }: {
  visits: readonly Visit[];
  works: readonly WorkRecord[];
  onViewAgenda?: () => void;
  calendarOnly?: boolean;
}) {
  const [today] = useState(() => getSaoPauloToday());
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const headingId = useId();
  const monthId = useId();
  const appointmentsId = useId();
  const days = getCalendarDays(month);
  const monthLabel = monthFormat.format(new Date(`${month}-01T12:00:00Z`));
  const workNames = new Map(works.map((work) => [work.id, work.name]));
  const monthVisits = visits.filter((visit) => workNames.has(visit.workId) && isCalendarDate(visit.date) && visit.date.startsWith(`${month}-`))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  const visitsByDate = new Map<string, Visit[]>();
  for (const visit of monthVisits) {
    const entries = visitsByDate.get(visit.date) ?? [];
    entries.push(visit);
    visitsByDate.set(visit.date, entries);
  }
  const visibleVisits = selectedDate ? visitsByDate.get(selectedDate) ?? [] : monthVisits;
  const changeMonth = (direction: -1 | 1) => {
    setMonth((previous) => shiftCalendarMonth(previous, direction));
    setSelectedDate(null);
  };

  return <section className={`panel ${styles.panel}${calendarOnly ? ` ${styles.calendarOnly}` : ""}`} aria-labelledby={headingId}>
    <div className="panel-heading">
      <div>{!calendarOnly && <span className="section-label">AGENDA DO PERFIL</span>}<h3 id={headingId}>{calendarOnly ? "Calendário" : "Agenda de visitas"}</h3></div>
      <span className="icon-tile"><Icon name="calendar" /></span>
    </div>
    <div className={styles.toolbar}>
      <div className={styles.monthNavigation} role="group" aria-label="Navegar pelo calendário">
        <button type="button" className={styles.monthButton} aria-label="Mês anterior" disabled={month === "0001-01"} onClick={() => changeMonth(-1)}><Icon name="arrow" className={styles.previous} /></button>
        <span id={monthId} className={styles.monthLabel} aria-live="polite">{monthLabel}</span>
        <button type="button" className={styles.monthButton} aria-label="Próximo mês" disabled={month === "9999-12"} onClick={() => changeMonth(1)}><Icon name="arrow" /></button>
      </div>
      <button type="button" className={styles.todayButton} onClick={() => { setMonth(today.slice(0, 7)); setSelectedDate(calendarOnly ? null : today); }}>Hoje</button>
    </div>
    <table className={styles.calendar} aria-labelledby={monthId}>
      <thead><tr>{weekdays.map(([short, full]) => <th scope="col" key={short}><abbr title={full}>{short}</abbr></th>)}</tr></thead>
      <tbody>{Array.from({ length: days.length / 7 }, (_, week) => <tr key={week}>
        {days.slice(week * 7, week * 7 + 7).map((date, index) => {
          if (!date) return <td key={`empty-${index}`} />;
          const scheduled = visitsByDate.get(date) ?? [];
          const safety = scheduled.some((visit) => visit.module === "safety");
          const quality = scheduled.some((visit) => visit.module === "quality");
          const label = `${dayFormat.format(new Date(`${date}T12:00:00Z`))}${date === today ? ", hoje" : ""}, ${scheduled.length} ${scheduled.length === 1 ? "visita agendada" : "visitas agendadas"}`;
          const content = <>
            <span>{Number(date.slice(8))}</span>
            <span className={styles.markers} aria-hidden="true">{safety && <span className={styles.safetyDot} />}{quality && <span className={styles.qualityDot} />}</span>
          </>;
          return <td key={date} aria-label={calendarOnly ? label : undefined}>
            {calendarOnly ? <span className={styles.day} title={label} aria-current={date === today ? "date" : undefined}>
              {content}
            </span> : <button type="button" className={styles.day} aria-label={label}
              aria-current={date === today ? "date" : undefined} aria-pressed={selectedDate === date} aria-controls={appointmentsId}
              onClick={() => setSelectedDate((previous) => previous === date ? null : date)}>
              {content}
            </button>}
          </td>;
        })}
      </tr>)}</tbody>
    </table>
    <div className={styles.legend}><span><i className={styles.safetyDot} aria-hidden="true" />Segurança</span><span><i className={styles.qualityDot} aria-hidden="true" />Qualidade</span></div>
    {!calendarOnly && <div id={appointmentsId} className={styles.appointments}>
      <div className={styles.appointmentsHeading}>
        <h4 aria-live="polite">{selectedDate ? `Agendamentos de ${formatAuditDate(selectedDate)}` : "Agendamentos do mês"}</h4>
        {selectedDate && <button type="button" className="text-button" onClick={() => setSelectedDate(null)}>Ver mês todo</button>}
      </div>
      {visibleVisits.length ? <div className={styles.listScroll} role="region" aria-label="Agendamentos" tabIndex={0}>
        <ul className={styles.list}>{visibleVisits.map((visit) => <li key={visit.id} className={styles.visit}>
          <time dateTime={visit.date} className={styles.visitDate}>{formatAuditDate(visit.date).slice(0, 5)}</time>
          <div className={styles.visitInfo}><strong>{workNames.get(visit.workId)}</strong><span>{visit.kind === "follow_up" ? "Acompanhamento da obra" : visit.modelId ? auditModelLabels[visit.modelId].name : "Auditoria"}</span></div>
          <span className={visit.module === "safety" ? styles.safetyDot : styles.qualityDot} aria-hidden="true" />
        </li>)}</ul>
      </div> : <p className={styles.empty}>{selectedDate ? "Nenhuma visita agendada para este dia." : "Nenhuma visita agendada neste mês."}</p>}
    </div>}
    {!calendarOnly && onViewAgenda && <button className={`text-button panel-link ${styles.agendaLink}`} type="button" onClick={onViewAgenda}>Consultar agenda<Icon name="arrow" /></button>}
  </section>;
}
