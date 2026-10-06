"use client";

import { useEffect, useState } from "react";
import type { ActiveTeamProfile, WorkTeamLink } from "@/lib/works/contracts";
import { usePageResource } from "../use-page-resource";
import { AsyncSkeleton } from "../async-feedback";
import { HistoryPagination } from "../history-pagination";
import styles from "./work-edit.module.css";

type ProfilePage = { available: true; page: number; size: number; total: number; profiles: ActiveTeamProfile[] };
function isProfilePage(value: unknown): value is ProfilePage {
  const p = value as ProfilePage;
  return !!p && p.available === true && Number.isSafeInteger(p.total) && p.total >= 0 && Array.isArray(p.profiles) && p.profiles.length <= 20
    && p.profiles.every(x => typeof x.id === "string" && typeof x.nome === "string" && typeof x.email === "string" && Array.isArray(x.perfis) && Array.isArray(x.modulos));
}
export function ActiveTeamProfiles({ profiles, initialLinks = [], available = true }: { profiles: ActiveTeamProfile[] | null; initialLinks?: WorkTeamLink[]; available?: boolean }) {
  const [selected, setSelected] = useState<WorkTeamLink[]>(initialLinks);
  const [candidate, setCandidate] = useState("");
  const [cargo, setCargo] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<ActiveTeamProfile[]>(profiles ?? []);
  useEffect(() => { const timer = setTimeout(() => setQuery(search), 300); return () => clearTimeout(timer); }, [search]);
  const resource = usePageResource(`/api/access/list?${new URLSearchParams({ page: String(page), search: query })}`, isProfilePage);
  const rows = resource.data?.profiles ?? [];
  const profilesById = new Map([...(profiles ?? []), ...chosen, ...rows].map(profile => [profile.id, profile]));
  const selectable = rows.filter(profile => !selected.some(link => link.id === profile.id));
  const unavailableLinks = selected.filter(link => !profilesById.has(link.id));
  const total = resource.data?.total ?? 0;

  const add = () => {
    if (!candidate || selected.some((link) => link.id === candidate) || selected.length >= 30) return;
    const profile = profilesById.get(candidate);
    if (!profile) return;
    setChosen(current => [...current.filter(p => selected.some(link => link.id === p.id)), profile]);
    setSelected((previous) => [...previous, { id: candidate, cargo: cargo.trim() }]);
    setCandidate("");
    setCargo("");
  };
  return <div className={styles.activeProfiles}>
    {!available && <p className={styles.fieldError} role="status">Os vínculos atuais não puderam ser consultados. Salve os demais dados sem alterar a equipe e tente novamente depois.</p>}
    {available && <input type="hidden" name="team_accounts" value={JSON.stringify(selected)} />}
    <label>Buscar usuário<input type="search" value={search} maxLength={120} onChange={e => { setSearch(e.target.value); setPage(1); setCandidate(""); }} /></label>
    {resource.loading && <AsyncSkeleton label="Carregando usuários…" rows={2} />}
    {resource.error && <p role="alert">Não foi possível carregar os usuários. <button type="button" className="secondary" onClick={resource.retry}>Tentar novamente</button></p>}
    {!resource.loading && resource.data && !rows.length && <p className={styles.empty}>Nenhum usuário encontrado.</p>}
    <div className={styles.profileSelectorRow}>
      <label className={styles.profileSelectorField} htmlFor="work-team-user"><span>Usuário disponível</span><select className="filter-select" id="work-team-user" value={candidate} disabled={resource.loading || !available || selectable.length === 0 || selected.length >= 30} onChange={(event) => setCandidate(event.target.value)}><option value="">Selecione um usuário</option>{selectable.map((profile) => <option value={profile.id} key={profile.id}>{profile.nome}</option>)}</select></label>
      <label className={styles.profileSelectorField} htmlFor="work-team-role"><span>Cargo</span><input id="work-team-role" value={cargo} maxLength={100} placeholder="Informe o cargo" disabled={!available || selected.length >= 30} onChange={(event) => setCargo(event.target.value)} /></label>
      <button className="secondary" type="button" disabled={resource.loading || !available || !candidate || selected.length >= 30} onClick={add}>Adicionar usuário</button>
    </div>
    <HistoryPagination page={page} pageCount={Math.max(1,Math.ceil(total/20))} total={total} first={rows.length ? (page-1)*20+1 : 0} last={Math.min(page*20,total)}
      status={resource.loading ? "loading" : "ready"} onPageChange={n => { setPage(n); setCandidate(""); }} label="Páginas de usuários disponíveis" unit="usuários" />
    {selected.length === 0 ? <p className={styles.empty}>Nenhum usuário vinculado à equipe da obra.</p> : <div className={styles.selectedProfiles}>
      {selected.map((link) => {
        const profile = profilesById.get(link.id);
        if (!profile) return null;
        return <article className={styles.selectedProfile} key={link.id}><span><strong>{profile.nome}</strong><small>{link.cargo || "Cargo não informado"}</small></span><button type="button" className={styles.removeProfile} disabled={!available} aria-label={`Remover da equipe: ${profile.nome}`}  data-tooltip="Remover da equipe" onClick={() => { setSelected((previous) => previous.filter((value) => value.id !== link.id)); requestAnimationFrame(() => document.getElementById("work-team-user")?.focus()); }}>Remover da equipe</button></article>;
      })}
      {unavailableLinks.map((link, index) => <article className={styles.selectedProfile} key={link.id}><span><strong>Usuário fora da lista ativa</strong><small>{link.cargo || "Cargo não informado"}</small></span><button type="button" className={styles.removeProfile} disabled={!available} aria-label={`Remover da equipe: usuário indisponível ${index + 1}`} data-tooltip="Remover da equipe" onClick={() => { setSelected((previous) => previous.filter((value) => value.id !== link.id)); requestAnimationFrame(() => document.getElementById("work-team-user")?.focus()); }}>Remover da equipe</button></article>)}
    </div>}
  </div>;
}
