"use client";

import { useState } from "react";
import type { AuditRecord, WorkRecord } from "@/domain/operational-records";
import type { AuditHistoryQuery } from "@/lib/audits/history-contracts";
import { useAuditHistory } from "./audit-history-context";
import { useHistoryPage } from "./history-pagination";
import styles from "./history-pagination.module.css";

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

export function HistoryFilters({ works, workId, onWorkChange, dateFrom, dateTo, onFromChange, onToChange, label }: {
  works?: readonly WorkRecord[]; workId?: string; onWorkChange?: (value: string) => void;
  dateFrom: string; dateTo: string; onFromChange: (value: string) => void; onToChange: (value: string) => void; label: string;
}) {
  return <div className={styles.filters} role="group" aria-label={label}>
    {works && onWorkChange && <label>Obra<select className="filter-select" aria-label={`${label}: obra`} value={workId ?? ""} onChange={(event) => onWorkChange(event.target.value)}><option value="">Todas as obras</option>{works.map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}</select></label>}
    <label>De<input className="filter-select" aria-label={`${label}: data inicial`} type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => onFromChange(event.target.value)} /></label>
    <label>Até<input className="filter-select" aria-label={`${label}: data final`} type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => onToChange(event.target.value)} /></label>
  </div>;
}

export function HistoryMonthFilter({ works, workId, onWorkChange, month, onMonthChange, label }: {
  works?: readonly WorkRecord[]; workId?: string; onWorkChange?: (value: string) => void;
  month: string; onMonthChange: (value: string) => void; label: string;
}) {
  const selectedYear = Number(month.slice(0, 4));
  const currentYear = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date()));
  const years = [...new Set([...Array.from({ length: currentYear - 1999 }, (_, index) => currentYear - index), selectedYear])]
    .filter((year) => Number.isInteger(year) && year >= 2000).sort((left, right) => right - left);
  const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const options = years.flatMap((year) => monthNames.map((name, index) => ({
    value: `${year}-${String(index + 1).padStart(2, "0")}`,
    label: `${name} de ${year}`,
  })));
  return <div className={styles.filters} role="group" aria-label={label}>
    {works && onWorkChange && <label>Obra<select className="filter-select" aria-label={`${label}: obra`} value={workId ?? ""} onChange={(event) => onWorkChange(event.target.value)}><option value="">Todas as obras</option>{works.map((work) => <option key={work.id} value={work.id}>{work.name}</option>)}</select></label>}
    <label>Mês<select className="filter-select" aria-label={`${label}: mês`} value={month} onChange={(event) => onMonthChange(event.target.value)}>
      {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
    </select></label>
  </div>;
}
