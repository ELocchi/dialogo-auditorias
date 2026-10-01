"use client";

import { useState } from "react";
import type { AuditRecord, WorkRecord } from "@/domain/operational-records";
import { getSaoPauloToday, shiftCalendarMonth } from "@/domain/visit-calendar";
import type { AuditHistoryQuery } from "@/lib/audits/history-contracts";
import { useAuditHistory } from "./audit-history-context";
import { useHistoryPage } from "./history-pagination";
import { Icon } from "./ui-icon";
import calendarStyles from "./admin-visit-calendar.module.css";
import styles from "./history-pagination.module.css";

const monthLabelFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

function MonthNavigation({ month, onMonthChange, label }: { month: string; onMonthChange: (value: string) => void; label: string }) {
  const monthLabel = monthLabelFormatter.format(new Date(`${month}-01T12:00:00Z`));
  return <div className={calendarStyles.monthNavigation} role="group" aria-label={label}>
    <button type="button" className={calendarStyles.monthButton} aria-label="Mês anterior" disabled={month === "0001-01"} onClick={() => onMonthChange(shiftCalendarMonth(month, -1))}><Icon name="arrow" className={calendarStyles.previous} /></button>
    <span className={calendarStyles.monthLabel} aria-live="polite">{monthLabel}</span>
    <button type="button" className={calendarStyles.monthButton} aria-label="Próximo mês" disabled={month === "9999-12"} onClick={() => onMonthChange(shiftCalendarMonth(month, 1))}><Icon name="arrow" /></button>
  </div>;
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function usePublishedHistoryPage(audits: readonly AuditRecord[], filters: AuditHistoryQuery, contextKey: string) {
  const key = JSON.stringify([contextKey, filters]);
  const [stored, setPage] = useState({ key, page: 1 });
  const page = stored.key === key ? stored.page : 1;
  if (stored.key !== key) setPage({ key, page: 1 });
  const local = useHistoryPage(audits, key);
  const remote = useAuditHistory({ ...filters, page, pageSize: 10 });
  if (!remote.enabled) return { ...local, remote: false, status: "ready" as const, message: undefined, retry: remote.retry, findings: [] };
  const snapshot = remote.snapshot;
  const total = snapshot?.total ?? 0;
  const currentPage = snapshot?.page ?? page;
  const pageSize = snapshot?.pageSize ?? 10;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (remote.status === "ready" && snapshot && page > pageCount) setPage({ key, page: pageCount });
  return {
    remote: true, status: remote.status, message: remote.message, retry: remote.retry,
    items: snapshot?.audits ?? [], findings: snapshot?.findings ?? [],
    page: currentPage, total, pageCount,
    first: total ? (currentPage - 1) * pageSize + 1 : 0,
    last: Math.min(currentPage * pageSize, total),
    onPageChange: (next: number) => setPage({ key, page: next }),
  };
}

export function HistoryLoadStatus({ history }: { history: { status: string; message?: string; retry: () => void } }) {
  if (history.status === "error") return <div role="alert"><p className="muted">{history.message || "Não foi possível carregar o histórico."}</p><button type="button" className="secondary" onClick={history.retry}>Tentar novamente</button></div>;
  if (history.status === "loading" || history.status === "idle") return <p className="muted" role="status">Carregando histórico…</p>;
  return null;
}

export function HistoryFilters({ works, workId, onWorkChange, dateFrom, dateTo, onFromChange, onToChange, label, className }: {
  works?: readonly WorkRecord[]; workId?: string; onWorkChange?: (value: string) => void;
  dateFrom: string; dateTo: string; onFromChange: (value: string) => void; onToChange: (value: string) => void; label: string; className?: string;
}) {
  const month = (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : getSaoPauloToday()).slice(0, 7);
  const selectMonth = (nextMonth: string) => {
    const range = monthRange(nextMonth);
    onFromChange(range.from);
    onToChange(range.to);
  };
  return <div className={`${styles.filters}${className ? ` ${className}` : ""}`} role="group" aria-label={label}>
    {works && onWorkChange && <label><select className="filter-select" aria-label={`${label}: obra`} value={workId ?? ""} onChange={(event) => onWorkChange(event.target.value)}><option value="">Todas as obras</option>{works.map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}</select></label>}
    <MonthNavigation month={month} onMonthChange={selectMonth} label={`${label}: navegar por mês`} />
  </div>;
}

export function HistoryMonthFilter({ works, workId, onWorkChange, month, onMonthChange, label, className }: {
  works?: readonly WorkRecord[]; workId?: string; onWorkChange?: (value: string) => void;
  month: string; onMonthChange: (value: string) => void; label: string; className?: string;
}) {
  return <div className={`${styles.filters}${className ? ` ${className}` : ""}`} role="group" aria-label={label}>
    {works && onWorkChange && <label><select className="filter-select" aria-label={`${label}: obra`} value={workId ?? ""} onChange={(event) => onWorkChange(event.target.value)}><option value="">Todas as obras</option>{works.map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}</select></label>}
    <MonthNavigation month={month} onMonthChange={onMonthChange} label={`${label}: navegar por mês`} />
  </div>;
}
