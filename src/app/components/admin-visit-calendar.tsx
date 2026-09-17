"use client";

import { useEffect, useId, useState } from "react";
import { auditModelLabels, formatAuditDate, type WorkRecord } from "@/domain/operational-records";
import { moduleLabels, type DemoUser, type AppModule, type Visit } from "@/domain/prototype-access";
import { assignAuditorColors, auditorColorOptions, validAuditorColor } from "@/domain/auditor-calendar-colors";
import { getCalendarDays, getSaoPauloToday, isCalendarDate, shiftCalendarMonth } from "@/domain/visit-calendar";
import { Icon } from "./ui-icon";
import styles from "./admin-visit-calendar.module.css";

const weekdays = [["Dom", "Domingo"], ["Seg", "Segunda-feira"], ["Ter", "Terça-feira"], ["Qua", "Quarta-feira"], ["Qui", "Quinta-feira"], ["Sex", "Sexta-feira"], ["Sáb", "Sábado"]];
const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function AdminVisitCalendar({ visits, works, auditors = [], viewerId, onViewAgenda, calendarOnly = false, includeFollowUps = false, showLegend = true, colorBy = "auditor" }: {
  visits: readonly Visit[];
  works: readonly WorkRecord[];
  auditors?: readonly DemoUser[];
  viewerId: string;
  onViewAgenda?: () => void;
  calendarOnly?: boolean;
  includeFollowUps?: boolean;
  showLegend?: boolean;
  colorBy?: "auditor" | "work";
}) {
  const [today] = useState(() => getSaoPauloToday());
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [colorPreferences, setColorPreferences] = useState<Record<string, string>>({});
  const [colorError, setColorError] = useState("");
  const [openColorPicker, setOpenColorPicker] = useState<string | null>(null);
  const headingId = useId();
  const monthId = useId();
  const appointmentsId = useId();
  const paletteId = useId();
  const days = getCalendarDays(month);
  const monthLabel = monthFormat.format(new Date(`${month}-01T12:00:00Z`));
  const workNames = new Map(works.map((work) => [work.id, work.name]));
  const storageKey = colorBy === "work" ? `dialogo-work-calendar-colors:${viewerId}` : `dialogo-auditor-calendar-colors:${viewerId}`;
  useEffect(() => {
    const loadColors = () => {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
        if (stored && typeof stored === "object" && !Array.isArray(stored)) {
          setColorPreferences(Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, string] => validAuditorColor(entry[1]))));
        }
      } catch { setColorPreferences({}); }
    };
    const initialLoad = window.setTimeout(loadColors, 0);
    window.addEventListener("storage", loadColors);
    return () => { window.clearTimeout(initialLoad); window.removeEventListener("storage", loadColors); };
  }, [storageKey]);
  const monthVisits = visits.filter((visit) => (includeFollowUps || visit.kind === "audit") && workNames.has(visit.workId) && isCalendarDate(visit.date) && visit.date.startsWith(`${month}-`))
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
  const legendProfiles = (colorBy === "work"
    ? works.filter((work) => visits.some((visit) => visit.workId === work.id)).map((work) => ({ id: work.id, name: work.name, modules: new Set<AppModule>(), active: true }))
    : [...profiles.values()]).sort((left, right) => left.name.localeCompare(right.name, "pt-BR") || left.id.localeCompare(right.id));
  const colors = assignAuditorColors(legendProfiles.map((profile) => profile.id), colorPreferences);
  const colorKey = (visit: Visit) => colorBy === "work" ? visit.workId : visit.auditorId;
  const changeColor = (entityId: string, value: string) => {
    const color = value.toLowerCase();
    if (!validAuditorColor(color)) return;
    if (Object.entries(colors).some(([id, assigned]) => id !== entityId && assigned === color)) {
      setColorError(colorBy === "work" ? "Essa cor já está em uso por outra obra." : "Essa cor já está em uso por outro auditor.");
      return;
    }
    setColorError("");
    const next = { ...colorPreferences, [entityId]: color };
    setColorPreferences(next);
    setOpenColorPicker(null);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Colors still work for this session. */ }
  };
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
          const label = `${dayFormat.format(new Date(`${date}T12:00:00Z`))}${date === today ? ", hoje" : ""}, ${scheduled.length} ${scheduled.length === 1 ? "visita agendada" : "visitas agendadas"}${scheduledEntities.length ? `: ${scheduledEntities.map((id) => colorBy === "work" ? workNames.get(id) ?? "Obra" : profiles.get(id)?.name ?? "Auditor").join(", ")}` : ""}`;
          const content = <>
            <span>{Number(date.slice(8))}</span>
            <span className={styles.markers} aria-hidden="true">{scheduledEntities.map((id) => <span key={id} className={styles.auditorDot} style={{ backgroundColor: colors[id] }} />)}</span>
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
    {showLegend && <div className={styles.legend} aria-label={colorBy === "work" ? "Cores das obras" : "Cores dos auditores"}>
      {legendProfiles.length ? legendProfiles.map((profile) => <div className={styles.legendProfile} key={profile.id}>
        <span className={styles.legendIdentity}><strong>{profile.name}</strong>{colorBy === "auditor" && <small>{[...profile.modules].map((module) => moduleLabels[module]).join(" e ")}{!profile.active ? " · sem acesso ativo" : ""}</small>}</span>
        <button type="button" className={styles.colorTrigger} style={{ backgroundColor: colors[profile.id] }} aria-label={`Escolher cor de ${profile.name}`} aria-expanded={openColorPicker === profile.id} aria-controls={`${paletteId}-${profile.id}`} title={`Escolher cor de ${profile.name}`} onClick={() => { setColorError(""); setOpenColorPicker((current) => current === profile.id ? null : profile.id); }} />
        {openColorPicker === profile.id && <div id={`${paletteId}-${profile.id}`} className={styles.palette} role="group" aria-label={`20 cores para ${profile.name}`}>
          {auditorColorOptions.map(({ name, value }) => <button type="button" key={value} className={styles.paletteOption} style={{ backgroundColor: value }} aria-label={`${name} para ${profile.name}`} aria-pressed={colors[profile.id] === value} title={name} disabled={Object.entries(colors).some(([id, assigned]) => id !== profile.id && assigned === value)} onClick={() => changeColor(profile.id, value)} />)}
        </div>}
      </div>) : <span className={styles.legendEmpty}>{colorBy === "work" ? "Nenhuma obra com visitas agendadas." : "Nenhum auditor autorizado nesta disciplina."}</span>}
    </div>}
    {colorError && <p className={styles.colorError} role="status">{colorError}</p>}
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
