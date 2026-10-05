"use client";

import { useState } from "react";
import type { ActiveTeamProfile, WorkTeamLink } from "@/lib/works/contracts";
import styles from "./work-edit.module.css";

export function ActiveTeamProfiles({ profiles, initialLinks = [], available = true }: { profiles: ActiveTeamProfile[] | null; initialLinks?: WorkTeamLink[]; available?: boolean }) {
  const [selected, setSelected] = useState<WorkTeamLink[]>(initialLinks);
  const [candidate, setCandidate] = useState("");
  const [cargo, setCargo] = useState("");
  if (!profiles) return <p className={styles.fieldError} role="status">Não foi possível consultar os usuários ativos. O cadastro pode ser salvo sem alterar vínculos de equipe.</p>;
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const selectable = profiles.filter((profile) => !selected.some((link) => link.id === profile.id));
  const unavailableLinks = selected.filter((link) => !profiles.some((profile) => profile.id === link.id));
  const add = () => {
    if (!candidate || selected.some((link) => link.id === candidate) || selected.length >= 30) return;
    setSelected((previous) => [...previous, { id: candidate, cargo: cargo.trim() }]);
    setCandidate("");
    setCargo("");
  };
  return <div className={styles.activeProfiles}>
    {!available && <p className={styles.fieldError} role="status">Os vínculos atuais não puderam ser consultados. Salve os demais dados sem alterar a equipe e tente novamente depois.</p>}
    {available && <input type="hidden" name="team_accounts" value={JSON.stringify(selected)} />}
    {profiles.length === 0 && <p className={styles.empty}>Nenhum usuário ativo disponível.</p>}
    {profiles.length > 0 && <div className={styles.profileSelectorRow}>
      <label className={styles.profileSelectorField} htmlFor="work-team-user"><span>Usuário disponível</span><select className="filter-select" id="work-team-user" value={candidate} disabled={!available || selectable.length === 0 || selected.length >= 30} onChange={(event) => setCandidate(event.target.value)}><option value="">Selecione um usuário</option>{selectable.map((profile) => <option value={profile.id} key={profile.id}>{profile.nome}</option>)}</select></label>
      <label className={styles.profileSelectorField} htmlFor="work-team-role"><span>Cargo</span><input id="work-team-role" value={cargo} maxLength={100} placeholder="Informe o cargo" disabled={!available || selected.length >= 30} onChange={(event) => setCargo(event.target.value)} /></label>
      <button className="secondary" type="button" disabled={!available || !candidate || selected.length >= 30} onClick={add}>Adicionar usuário</button>
    </div>}
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
