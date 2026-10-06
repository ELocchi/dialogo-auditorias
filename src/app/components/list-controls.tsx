"use client";
import { useId } from "react";
import type { WorkRecord } from "@/domain/operational-records";
import type { CursorList } from "./use-cursor-list";
import { AsyncSkeleton } from "./async-feedback";
import styles from "./history-pagination.module.css";

export function ListFilters({ list, works, label, disabled = false }: { disabled?: boolean; list: CursorList; works?: readonly WorkRecord[]; label: string }) {
  const id = useId();
  return <div className={styles.filters} role="group" aria-disabled={disabled} aria-label={`Filtros: ${label}`}>
    {works && <select disabled={disabled} className="filter-select" aria-label={`Obra: ${label}`} value={list.state.workId} onChange={e => list.setWorkId(e.target.value)}>
      <option value="">Todas as obras</option>{works.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
    </select>}
    <label htmlFor={id}>Buscar<input id={id} type="search" disabled={disabled} maxLength={120} value={list.search} aria-label={`Buscar: ${label}`} onChange={e => list.setSearch(e.target.value)} /></label>
  </div>;
}
export function ListStatus({ list, empty = "Nenhum registro encontrado." }: { list: CursorList; empty?: string }) {
  if (list.loading) return <AsyncSkeleton label="Carregando lista…" rows={3} />;
  if (list.error) return <div role="alert"><p>Não foi possível carregar a lista.</p><button type="button" className="secondary" onClick={list.retry}>Tentar novamente</button></div>;
  if (!list.data?.items.length) return <p role="status" className="muted">{empty}{list.state.page > 0 && <> <button type="button" className="secondary" onClick={list.first}>Primeira página</button></>}</p>;
  return null;
}
export function ListPagination({ list, label, disabled = false }: { list: CursorList; label: string; disabled?: boolean }) {
  const id = useId();
  const pending = list.loading || disabled;
  return <nav className={styles.pagination} aria-label={`Páginas: ${label}`} aria-busy={list.loading}>
    <p role="status">Página {list.state.page + 1}{!list.loading && list.data && <span>{list.data.items.length} registros{list.data.hasMore ? " · há mais" : " · fim da lista"}</span>}</p>
    <label htmlFor={id}>Por página <select id={id} className="filter-select" aria-label={`Itens por página: ${label}`} value={list.state.size} disabled={disabled} onChange={e => list.setSize(Number(e.target.value))}>
      {[10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
    </select></label>
    <div><button type="button" className="secondary" disabled={pending || list.state.page === 0} aria-label={`Anterior: ${label}`} onClick={list.previous}>Anterior</button>
      <button type="button" className="secondary" disabled={pending || !list.data?.hasMore} aria-label={`Próxima: ${label}`} onClick={list.next}>Próxima</button></div>
  </nav>;
}
