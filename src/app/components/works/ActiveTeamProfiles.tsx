"use client";

import { useState } from "react";
import type { ActiveTeamProfile } from "@/lib/works/contracts";
import { moduleLabels, profileLabels, type AccessModule, type AccessProfile } from "@/lib/access/contracts";
import styles from "./work-edit.module.css";

export function ActiveTeamProfiles({ profiles, initialIds = [], available = true }: { profiles: ActiveTeamProfile[] | null; initialIds?: string[]; available?: boolean }) {
  const [selected, setSelected] = useState<string[]>(initialIds);
  if (!profiles) return <p className={styles.fieldError} role="status">Não foi possível consultar os perfis ativos. O cadastro pode ser salvo sem alterar vínculos de equipe.</p>;
  const unavailableIds = selected.filter((id) => !profiles.some((profile) => profile.id === id));
  return <div className={styles.activeProfiles}>
    <p className={styles.help}>Selecione contas ativas para vinculá-las à obra. O acesso seguirá os perfis e módulos já autorizados para cada conta.</p>
    {!available && <p className={styles.fieldError} role="status">Os vínculos atuais não puderam ser consultados. Salve os demais dados sem alterar a equipe e tente novamente depois.</p>}
    {available && <input type="hidden" name="team_accounts" value={JSON.stringify(selected)} />}
    {profiles.length === 0 && <p className={styles.empty}>Nenhum perfil ativo disponível.</p>}
    <div className={styles.profileList}>
      {profiles.map((profile) => <label className={styles.profileOption} key={profile.id}>
        <input type="checkbox" checked={selected.includes(profile.id)} disabled={!available || (!selected.includes(profile.id) && selected.length >= 30)} onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, profile.id] : previous.filter((id) => id !== profile.id))} />
        <span><strong>{profile.nome}</strong><small>{profile.email}</small><small>{profile.perfis.map((value) => profileLabels[value as AccessProfile] ?? value).join(" · ")} {profile.modulos.length ? `— ${profile.modulos.map((value) => { const [profileName, moduleName] = value.split(": "); return `${profileLabels[profileName as AccessProfile] ?? profileName}: ${moduleLabels[moduleName as AccessModule] ?? moduleName}`; }).join(", ")}` : "— acesso administrativo"}</small></span>
      </label>)}
      {unavailableIds.map((id) => <label className={styles.profileOption} key={id}>
        <input type="checkbox" checked disabled={!available} onChange={() => setSelected((previous) => previous.filter((value) => value !== id))} />
        <span><strong>Perfil fora da lista ativa</strong><small>Vínculo existente · {id}</small><small>Desmarque para remover os acessos criados por este vínculo.</small></span>
      </label>)}
    </div>
    <p className={styles.help}>{selected.length} de 30 perfis vinculados</p>
  </div>;
}
