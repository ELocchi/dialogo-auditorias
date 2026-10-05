"use client";

import { useState } from "react";
import { auditHistoryPageSize, getHistoryPage, resolveHistoryPageState } from "@/domain/audit-history";
import styles from "./history-pagination.module.css";

export function useHistoryPage<T>(items: readonly T[], contextKey: string) {
  const [storedState, setState] = useState({ contextKey, page: 1 });
  const state = resolveHistoryPageState(storedState, contextKey, Math.ceil(items.length / auditHistoryPageSize));
  // Reset on a new filter and retain the clamped page when the result set shrinks.
  if (state !== storedState) setState(state);
  const result = getHistoryPage(items, state.page);
  return { ...result, onPageChange: (page: number) => setState({ contextKey, page: getHistoryPage(items, page).page }) };
}

export function HistoryPagination({ page, pageCount, total, first, last, onPageChange, label }: {
  page: number;
  pageCount: number;
  total: number;
  first: number;
  last: number;
  onPageChange: (page: number) => void;
  label: string;
}) {
  if (pageCount <= 1) return null;
  return <nav className={styles.pagination} aria-label={label}>
    <p aria-live="polite">{first}–{last} de {total} auditorias<span>Página {page} de {pageCount}</span></p>
    <div>
      <button data-tooltip={`Página anterior: ${label}`} type="button" className="secondary" aria-label={`Página anterior: ${label}`} disabled={page === 1} onClick={() => onPageChange(page - 1)}>Anterior</button>
      <button data-tooltip={`Próxima página: ${label}`} type="button" className="secondary" aria-label={`Próxima página: ${label}`} disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>Próxima</button>
    </div>
  </nav>;
}
