"use client";

import { useId, useState } from "react";
import { auditModelLabels, formatAuditDate, type WorkRecord } from "@/domain/operational-records";
import { moduleLabels, type DemoUser, type AppModule, type Visit } from "@/domain/prototype-access";
import { assignAuditorColors, assignWorkColors } from "@/domain/auditor-calendar-colors";
import { getCalendarDays, getSaoPauloToday, isCalendarDate, shiftCalendarMonth } from "@/domain/visit-calendar";
import { Icon } from "./ui-icon";
import styles from "./admin-visit-calendar.module.css";

const weekdays = [["Dom", "Domingo"], ["Seg", "Segunda-feira"], ["Ter", "Terça-feira"], ["Qua", "Quarta-feira"], ["Qui", "Quinta-feira"], ["Sex", "Sexta-feira"], ["Sáb", "Sábado"]];
const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function AdminVisitCalendar({ visits, works, auditors = [], onViewAgenda, calendarOnly = false, includeFollowUps = false, showLegend = true, colorBy = "auditor", selectedAuditorId = null, onSelectAuditor }: {
  visits: readonly Visit[];
  works: readonly WorkRecord[];
  auditors?: readonly DemoUser[];
  viewerId: string;
  onViewAgenda?: () => void;
  calendarOnly?: boolean;
  includeFollowUps?: boolean;
  showLegend?: boolean;
  colorBy?: "auditor" | "work";
  selectedAuditorId?: string | null;
  onSelectAuditor?: (auditorId: string | null) => void;
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
  const effectiveColorBy = selectedAuditorId ? "work" : colorBy;
  const profileHasVisits = new Set(visits.filter((visit) => workNames.has(visit.workId)).map((visit) => visit.auditorId));
  const monthVisits = visits.filter((visit) => (includeFollowUps || visit.kind === "audit") && workNames.has(visit.workId) && isCalendarDate(visit.date) && visit.date.startsWith(`${month}-`)
    && (!selectedAuditorId || visit.auditorId === selectedAuditorId))
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
  const profiles = new Map<string, { id: string; name: string; modules: Set<AppModule>; active: boolean }>();
  for (const auditor of auditors) {
    if (auditor.role !== "safety-auditor" && auditor.role !== "quality-auditor") continue;
    const discipline = auditor.role === "safety-auditor" ? "safety" : "quality";
    const existing = profiles.get(auditor.id);
    if (existing) existing.modules.add(discipline);
    else profiles.set(auditor.id, { id: auditor.id, name: auditor.name, modules: new Set([discipline]), active: true });
  }
  for (const visit of monthVisits) {
    if (!profiles.has(visit.auditorId)) profiles.set(visit.auditorId, {
      id: visit.auditorId, name: visit.auditorName?.trim() || "Auditor não identificado", modules: new Set([visit.module]), active: false,
    });
  }
  const legendProfiles = (effectiveColorBy === "work"
    ? works.filter((work) => visits.some((visit) => visit.workId === work.id && (!selectedAuditorId || visit.auditorId === selectedAuditorId))).map((work) => ({ id: work.id, name: work.name, modules: new Set<AppModule>(), active: true }))
    : [...profiles.values()]).sort((left, right) => left.name.localeCompare(right.name, "pt-BR") || left.id.localeCompare(right.id));
  const colors = effectiveColorBy === "work"
    ? assignWorkColors(legendProfiles.map((profile) => profile.id))
    : assignAuditorColors(legendProfiles.map((profile) => profile.id));
  const colorKey = (visit: Visit) => effectiveColorBy === "work" ? visit.workId : visit.auditorId;
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
          const scheduledEntities = [...new Set(scheduled.map(colorKey))];
          const scheduledLabels = selectedAuditorId
            ? scheduled.map((visit) => `${workNames.get(visit.workId) ?? "Obra"} (${visit.kind === "follow_up" ? "acompanhamento" : "auditoria"})`)
            : scheduledEntities.map((id) => effectiveColorBy === "work" ? workNames.get(id) ?? "Obra" : profiles.get(id)?.name ?? "Auditor");
          const markerEntries = selectedAuditorId
            ? scheduled.map((visit) => ({ id: visit.id, colorId: colorKey(visit) }))
            : scheduledEntities.map((id) => ({ id, colorId: id }));
          const label = `${dayFormat.format(new Date(`${date}T12:00:00Z`))}${date === today ? ", hoje" : ""}, ${scheduled.length} ${scheduled.length === 1 ? "visita agendada" : "visitas agendadas"}${scheduledLabels.length ? `: ${scheduledLabels.join(", ")}` : ""}`;
          const content = <>
            <span>{Number(date.slice(8))}</span>
            <span className={styles.markers} aria-hidden="true">{markerEntries.map((marker) => <span key={marker.id} className={styles.auditorDot} style={{ backgroundColor: colors[marker.colorId] }} />)}</span>
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
    {showLegend && <div className={styles.legend} aria-label={effectiveColorBy === "work" ? "Cores das obras" : "Cores dos auditores"}>
      {legendProfiles.length ? legendProfiles.map((profile) => <div className={styles.legendProfile} key={profile.id}>
        <span className={styles.legendIdentity}>{effectiveColorBy === "auditor" && onSelectAuditor && profileHasVisits.has(profile.id)
          ? <button type="button" className={styles.profileButton} aria-pressed={selectedAuditorId === profile.id} onClick={() => onSelectAuditor(selectedAuditorId === profile.id ? null : profile.id)}>{profile.name}</button>
          : <strong>{profile.name}</strong>}{effectiveColorBy === "auditor" && <small>{[...profile.modules].map((module) => moduleLabels[module]).join(" e ")}{!profile.active ? " · sem acesso ativo" : ""}</small>}</span>
        <span className={styles.colorSwatch} style={{ backgroundColor: colors[profile.id] }} role="img" aria-label={`Cor de ${profile.name}`} />
      </div>) : <span className={styles.legendEmpty}>{effectiveColorBy === "work" ? "Nenhuma obra com visitas agendadas." : "Nenhum auditor autorizado nesta disciplina."}</span>}
    </div>}
    {!calendarOnly && <div id={appointmentsId} className={styles.appointments}>
      <div className={styles.appointmentsHeading}>
        <h4 aria-live="polite">{selectedDate ? `Visitas de ${formatAuditDate(selectedDate)}` : "Visitas do mês"}</h4>
        {selectedDate && <button type="button" className="text-button" onClick={() => setSelectedDate(null)}>Ver mês todo</button>}
      </div>
      {visibleVisits.length ? <div className={styles.listScroll} role="region" aria-label="Visitas agendadas" tabIndex={0}>
        <ul className={styles.list}>{visibleVisits.map((visit) => <li key={visit.id} className={styles.visit}>
          <time dateTime={visit.date} className={styles.visitDate}>{formatAuditDate(visit.date).slice(0, 5)}</time>
          <div className={styles.visitInfo}><strong>{workNames.get(visit.workId)}</strong><span>{visit.kind === "follow_up" ? "Acompanhamento da obra" : visit.modelId ? auditModelLabels[visit.modelId].name : "Auditoria"}</span></div>
          <span className={styles.auditorDot} style={{ backgroundColor: colors[colorKey(visit)] }} aria-hidden="true" />
        </li>)}</ul>
      </div> : <p className={styles.empty}>{selectedDate ? "Nenhuma visita agendada para este dia." : "Nenhuma visita agendada neste mês."}</p>}
    </div>}
    {!calendarOnly && onViewAgenda && <button className={`text-button panel-link ${styles.agendaLink}`} type="button" onClick={onViewAgenda}>Consultar agenda<Icon name="arrow" /></button>}
  </section>;
}
