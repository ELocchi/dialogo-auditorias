"use client";

import Link from "next/link";
import { useListFilter } from "./list-state";
import { useHistoryPage, HistoryPagination } from "./history-pagination";
import { useId, useState } from "react";
import type { WorkRecord } from "@/domain/operational-records";
import { Icon } from "./ui-icon";

export type OccurrencePreviewRecord = { id: string; work: string; item: string; status: string; place: string; title: string; description: string };

function searchable(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function BuildingIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18M6 21V5l8-3v19M14 8h4v13M9 7h2M9 11h2M9 15h2M9 19h2M17 11h1M17 15h1" /></svg>;
}

function ChevronIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg>;
}

export function Works({ works, canManage = false }: { works: readonly WorkRecord[]; canManage?: boolean }) {
  const [query, setQuery] = useListFilter(`works-search:${works.map(w => w.id).join(",")}`);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchId = useId();
  const filteredWorks = works.filter((work) => searchable(`${work.name} ${work.city}`).includes(searchable(query.trim())));
  const page = useHistoryPage(filteredWorks, `works:${works.map(w => w.id).join(",")}:${query}`);
  const resetFilters = () => setQuery("");

  return <div className="operational-view">
    <div className="page-intro">
      <div><h2>Obras</h2></div>
      <div className="work-create-action">
        {(searchOpen || query) && <div id={searchId} className="work-inline-search" role="search" aria-label="Filtrar obras">
          <div className="work-search-field">
            <input type="search" aria-label="Buscar obra" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome da obra ou cidade" />
            {query && <button type="button" className="work-search-clear" onClick={(event) => { event.currentTarget.parentElement?.querySelector<HTMLInputElement>("input")?.focus(); resetFilters(); }} aria-label="Limpar busca" data-tooltip="Limpar busca">×</button>}
          </div>
        </div>}
        <button type="button" className="secondary work-search-button" aria-label={searchOpen ? "Fechar busca de obras" : "Buscar obras"} data-tooltip={searchOpen ? "Fechar busca de obras" : "Buscar obras"} aria-expanded={searchOpen} aria-controls={searchId}
          onClick={() => { if (searchOpen) setQuery(""); setSearchOpen((open) => !open); }}><Icon name="search" /></button>
        {canManage && <Link className="primary work-create-plus" href="/administracao/obras/nova" aria-label="Cadastrar obra" data-tooltip="Cadastrar obra">+</Link>}
      </div>
    </div>
    <div className="work-grid">
      {page.items.map((work) => <article className="work-project-card" key={work.id}>
        <div className="work-project-heading">
          <span className="work-building-icon"><BuildingIcon /></span>
          {canManage && !work.isDemo && <a className="secondary work-edit-icon" href={`/administracao/obras/${work.id}`} aria-label={`Editar obra ${work.name}`} data-tooltip="Editar obra"><Icon name="edit" /></a>}
        </div>
        <h3>{work.name}</h3><p className="work-location">{work.address && <>{work.address}<br /></>}{work.city}</p>
        <dl className="work-project-data"><div><dt>Responsável técnico</dt><dd>{work.engineer}</dd></div><div><dt>Coordenação</dt><dd>{work.coordinator}</dd></div></dl>
        {work.isDemo && <div className="work-project-footer"><span className="work-session-dot" />Cadastro demonstrativo</div>}
      </article>)}
    </div>
    <HistoryPagination {...page} label="Páginas de obras" unit="obras" />
    {filteredWorks.length === 0 && <div className="operational-empty"><h3>Nenhuma obra encontrada</h3><p>Altere o nome para consultar as obras disponíveis.</p><button type="button" className="secondary" onClick={resetFilters}>Limpar filtros</button></div>}
  </div>;
}

export function Occurrences({ works, records = [] }: { works: readonly WorkRecord[]; records?: readonly OccurrencePreviewRecord[] }) {
  const [query, setQuery] = useState("");
  const [work, setWork] = useState("all");
  const filteredOccurrences = records.filter((occurrence) => works.some((entry) => entry.name === occurrence.work) && searchable(`${occurrence.id} ${occurrence.item} ${occurrence.place} ${occurrence.title}`).includes(searchable(query.trim())) && (work === "all" || occurrence.work === work));
  const resetFilters = () => { setQuery(""); setWork("all"); };

  return <div className="operational-view">
    <div className="page-intro"><div><p className="kicker">CONSULTA DOS ACHADOS</p><h2>Apontamentos da inspeção</h2><p className="muted">Consulta por obra, código e local. A integração dos apontamentos publicados está em preparação.</p></div></div>
    <div className="operational-filters occurrence-filters" role="search" aria-label="Filtrar ocorrências">
      <label>Buscar ocorrência<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código, item ou local" /></label>
      <label>Obra<select className="filter-select" value={work} onChange={(event) => setWork(event.target.value)}><option value="all">Todas as obras</option>{works.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label>
      <button type="button" className="secondary operational-clear" onClick={resetFilters} disabled={!query && work === "all"}>Limpar filtros</button>
    </div>
    <p className="operational-result-count" role="status">{filteredOccurrences.length} {filteredOccurrences.length === 1 ? "ocorrência encontrada" : "ocorrências encontradas"}</p>

    <div className="occurrence-grid">
      {filteredOccurrences.map((occurrence) => <article className="occurrence-card" key={occurrence.id}>
        <div className="occurrence-card-top"><span className="occurrence-id">{occurrence.id}</span><span className="badge">Registro demonstrativo</span></div>
        <p className="occurrence-location">{occurrence.work} · {occurrence.place}</p><p className="occurrence-category">Segurança · Item {occurrence.item}</p>
        <h3>{occurrence.title}</h3><p className="occurrence-description">{occurrence.description}</p>
        <details className="occurrence-details"><summary>Ver detalhes do apontamento<ChevronIcon /></summary><div className="occurrence-detail-body"><dl><div><dt>Local</dt><dd>{occurrence.place}</dd></div><div><dt>Item do roteiro</dt><dd>{occurrence.item}</dd></div></dl><p>Plano e parecer serão registros separados; este exemplo não comprova correção.</p></div></details>
      </article>)}
    </div>
    {filteredOccurrences.length === 0 && <div className="operational-empty"><h3>Nenhuma ocorrência encontrada</h3><p>Altere os filtros para consultar os achados disponíveis.</p><button type="button" className="secondary" onClick={resetFilters}>Limpar filtros</button></div>}
  </div>;
}
