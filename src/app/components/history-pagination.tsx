"use client";

import { useListState } from "./list-state";
import { Icon } from "./ui-icon";
import styles from "./history-pagination.module.css";

export function useHistoryPage<T>(items: readonly T[], contextKey: string) {
  const [state, setState] = useListState(`local:${contextKey}`, initialPage, isPageState);
  const pageCount = Math.max(1, Math.ceil(items.length / state.size));
  const page = Math.min(state.page, pageCount);
  return { items: items.slice((page - 1) * state.size, page * state.size), page, pageCount, total: items.length,
    first: items.length ? (page - 1) * state.size + 1 : 0, last: Math.min(page * state.size, items.length), pageSize: state.size,
    onPageChange: (next: number) => setState({ ...state, page: Math.max(1, Math.min(next, pageCount)) }),
    onSizeChange: (size: number) => setState({ size, page: 1 }) };
}

export const initialPage = { page: 1, size: 10 };
export function isPageState(v: unknown): v is typeof initialPage {
  const s = v as typeof initialPage;
  return !!s && Number.isInteger(s.page) && s.page > 0 && s.page <= 999999 && [10, 20, 50].includes(s.size);
}

export function HistoryPagination({ page, pageCount, total, first, last, onPageChange, label, pageSize, onSizeChange, status, unit = "auditorias" }: {
  page: number;
  pageCount: number;
  total: number;
  first: number;
  last: number;
  onPageChange: (page: number) => void;
  label: string;
  pageSize?: number;
  onSizeChange?: (size: number) => void;
  status?: string;
  unit?: string;
}) {
  const loading = status === "loading" || status === "idle";
  if (pageCount <= 1) return null;
  return <nav className={styles.pagination} aria-label={label} aria-busy={loading}>
    <div className={styles.navigation}>
      <button data-tooltip="Página anterior" type="button" className={styles.arrow} aria-label={`Página anterior: ${label}`} disabled={loading || page === 1} onClick={() => onPageChange(page - 1)}><Icon name="arrow" className={styles.previous} /></button>
      <button data-tooltip="Próxima página" type="button" className={styles.arrow} aria-label={`Próxima página: ${label}`} disabled={loading || page >= pageCount} onClick={() => onPageChange(page + 1)}><Icon name="arrow" /></button>
    </div>
    <p className={styles.summary} role="status">{loading ? "Carregando…" : `${first}–${last} de ${total} ${unit}`}<span>Página {page} de {pageCount}</span></p>
    {onSizeChange && <label className={styles.pageSize}>Por página <select disabled={loading} className="filter-select" aria-label={`Itens por página: ${label}`} value={pageSize} onChange={e => onSizeChange(Number(e.target.value))}>{[10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}</select></label>}
  </nav>;
}
