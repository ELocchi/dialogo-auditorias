"use client";

import { useState } from "react";
import type { WorkRecord } from "@/domain/operational-records";

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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filteredWorks = works.filter((work) => searchable(`${work.name} ${work.city}`).includes(searchable(query.trim())) && (status === "all" || work.status === status));
  const resetFilters = () => { setQuery(""); setStatus("all"); };

  return <div className="operational-view">
    <div className="page-intro">
      <div><p className="kicker">CADASTRO DE OBRAS</p><h2>Obras</h2><p className="muted">Consulte os dados das obras e os responsáveis pelo acompanhamento.</p></div>
      {canManage && <div className="work-create-action"><a className="primary" href="/administracao/usuarios#works-heading">+ Cadastrar obra</a><small>Cadastro disponível em Usuários e acessos.</small></div>}
    </div>

    <div className="operational-filters work-filters" role="search" aria-label="Filtrar obras">
      <label>Buscar obra<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome da obra ou cidade" /></label>
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Todos os status</option><option>Ativa</option><option>Planejada</option></select></label>
      <button type="button" className="secondary operational-clear" onClick={resetFilters} disabled={!query && status === "all"}>Limpar filtros</button>
    </div>
    <p className="operational-result-count" role="status">{filteredWorks.length} {filteredWorks.length === 1 ? "obra encontrada" : "obras encontradas"}<span>{works.some((work) => work.isDemo) ? "Inclui cadastros de demonstração" : "Obras disponíveis para este perfil e módulo"}</span></p>

    <div className="work-grid">
      {filteredWorks.map((work) => <article className="work-project-card" key={work.id}>
        <div className="work-project-heading"><span className="work-building-icon"><BuildingIcon /></span><span className={`badge ${work.status === "Ativa" ? "badge-green" : "badge-slate"}`}>{work.status}</span></div>
        <h3>{work.name}</h3><p className="work-location">{work.address && <>{work.address}<br /></>}{work.city}</p>
        <dl className="work-project-data"><div><dt>Responsável técnico</dt><dd>{work.engineer}</dd></div><div><dt>Coordenação</dt><dd>{work.coordinator}</dd></div></dl>
        <div className="work-project-footer"><span className="work-session-dot" />{work.isDemo ? "Cadastro demonstrativo" : "Obra cadastrada"}{canManage && !work.isDemo && <a className="secondary work-edit-link" href={`/administracao/obras/${work.id}`} aria-label={`Editar obra ${work.name}`}>Editar obra</a>}</div>
      </article>)}
    </div>
    {filteredWorks.length === 0 && <div className="operational-empty"><h3>Nenhuma obra encontrada</h3><p>Altere o nome ou o status para consultar as obras disponíveis.</p><button type="button" className="secondary" onClick={resetFilters}>Limpar filtros</button></div>}
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
      <label>Obra<select value={work} onChange={(event) => setWork(event.target.value)}><option value="all">Todas as obras</option>{works.map((entry) => <option key={entry.id}>{entry.name}</option>)}</select></label>
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

