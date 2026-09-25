"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateAccessAction } from "@/app/administracao/usuarios/actions";
import {
  accessProfiles, administrativeLabels, engineeringLabels, initialAccessState, profileLabels,
  type AccessGrant, type AccessModule, type AccessProfile, type AccessWork,
  type EditableAccessAccount, type EngineeringScope, type TechnicalProfile,
} from "@/lib/access/contracts";
import styles from "@/app/administracao/usuarios/access.module.css";

type CurrentGrant = AccessGrant & { auth_user_id: string };
type GrantRow = { key: number; perfil: TechnicalProfile; obra_id: string; modulo: AccessModule | "" };
const modulesFor = (profile: TechnicalProfile): AccessModule[] => profile === "AUDITOR_SEGURANCA" ? ["SEGURANCA"] : profile === "AUDITOR_QUALIDADE" ? ["QUALIDADE"] : ["SEGURANCA", "QUALIDADE"];
const firstModule = (profile: TechnicalProfile) => profile === "ENGENHARIA" ? "" : modulesFor(profile)[0];

function rowsFromGrants(grants: CurrentGrant[]): GrantRow[] {
  const unique = new Map<string, CurrentGrant>();
  for (const grant of grants) unique.set(`${grant.perfil}/${grant.obra_id}`, grant);
  return [...unique.values()].map((grant, key) => ({ key, perfil: grant.perfil, obra_id: grant.obra_id, modulo: grant.perfil === "ENGENHARIA" ? "" : grant.modulo }));
}

export function EditUserDialog({ account, grants, works, name, email, actorId }: {
  account: EditableAccessAccount;
  grants: CurrentGrant[];
  works: AccessWork[];
  name: string;
  email: string;
  actorId: string;
}) {
  const id = useId();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [state, action, pending] = useActionState(updateAccessAction, initialAccessState);
  const [perfis, setPerfis] = useState<AccessProfile[]>(account.perfis);
  const [administrativeScope, setAdministrativeScope] = useState(account.atuacao_administrativa ?? "");
  const [engineeringScopes, setEngineeringScopes] = useState<EngineeringScope[]>(account.atuacoes_engenharia);
  const [status, setStatus] = useState(account.ativo ? "ATIVO" : "INATIVO");
  const [rows, setRows] = useState<GrantRow[]>(() => rowsFromGrants(grants));

  const openEditor = () => {
    setPerfis(account.perfis);
    setAdministrativeScope(account.atuacao_administrativa ?? "");
    setEngineeringScopes(account.atuacoes_engenharia);
    setStatus(account.ativo ? "ATIVO" : "INATIVO");
    setRows(rowsFromGrants(grants));
    dialogRef.current?.showModal();
  };

  useEffect(() => {
    if (state.status !== "success") return;
    dialogRef.current?.close();
    router.refresh();
  }, [router, state.recordId, state.status]);

  const technicalProfiles = perfis.filter((profile): profile is TechnicalProfile => profile !== "ADMINISTRATIVO");
  const expandedGrants: AccessGrant[] = rows.flatMap(({ perfil, obra_id, modulo }): AccessGrant[] => perfil === "ENGENHARIA"
    ? modulesFor(perfil).map((engineeringModule) => ({ perfil, obra_id, modulo: engineeringModule }))
    : [{ perfil, obra_id, modulo: modulo as AccessModule }]);
  const rowKeys = rows.filter((row) => row.obra_id).map((row) => `${row.perfil}/${row.obra_id}`);
  const incomplete = perfis.length === 0 || (perfis.includes("ADMINISTRATIVO") && !administrativeScope)
    || (perfis.includes("ENGENHARIA") && engineeringScopes.length === 0)
    || technicalProfiles.some((profile) => !rows.some((row) => row.perfil === profile))
    || rows.some((row) => !row.obra_id || (row.perfil !== "ENGENHARIA" && !row.modulo))
    || new Set(rowKeys).size !== rowKeys.length || expandedGrants.length > 400;

  const toggleProfile = (profile: AccessProfile, selected: boolean) => {
    setPerfis((current) => accessProfiles.filter((item) => item === profile ? selected : current.includes(item)));
    if (!selected) {
      setRows((current) => current.filter((row) => row.perfil !== profile));
      if (profile === "ADMINISTRATIVO") setAdministrativeScope("");
      if (profile === "ENGENHARIA") setEngineeringScopes([]);
    } else if (profile === "ADMINISTRATIVO") {
      setAdministrativeScope("GERAL");
    } else {
      setRows((current) => [...current, { key: Math.max(-1, ...current.map((row) => row.key)) + 1, perfil: profile, obra_id: "", modulo: firstModule(profile) }]);
      if (profile === "ENGENHARIA") setEngineeringScopes(["EQUIPE_OBRA"]);
    }
  };
  const toggleEngineeringScope = (scope: EngineeringScope, selected: boolean) => setEngineeringScopes((current) =>
    (["EQUIPE_OBRA", "COORDENACAO"] as EngineeringScope[]).filter((item) => item === scope ? selected : current.includes(item)));
  const changeRow = (key: number, obra_id: string) => setRows((current) => current.map((row) => row.key === key ? { ...row, obra_id } : row));
  const addRow = (profile: TechnicalProfile) => setRows((current) => [...current, {
    key: Math.max(-1, ...current.map((row) => row.key)) + 1, perfil: profile, obra_id: "", modulo: firstModule(profile),
  }]);

  return <>
    <button ref={triggerRef} type="button" className={`${styles.editUserButton} secondary`} aria-label={`Editar usuário ${name}`} title="Editar usuário" onClick={openEditor}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
    </button>
    <dialog ref={dialogRef} className={`${styles.approvalDialog} ${styles.editUserDialog}`} aria-labelledby={`${id}-title`} onCancel={(event) => { if (pending) event.preventDefault(); }} onClose={() => triggerRef.current?.focus()}>
      <form action={action} aria-busy={pending}>
        <input type="hidden" name="authUserId" value={account.auth_user_id} />
        <input type="hidden" name="grants" value={JSON.stringify(expandedGrants)} />
        <input type="hidden" name="reason" value="Edição administrativa dos acessos do usuário." />
        <input type="hidden" name="confirmation" value="SIM" />
        <div className={styles.approvalDialogHeader}>
          <span>EDIÇÃO DE USUÁRIO</span>
          <h3 id={`${id}-title`}>{name}</h3>
          <p>{email}</p>
        </div>
        <fieldset disabled={pending} className={styles.editUserFields}>
          {state.message && <p className={state.status === "error" ? styles.error : styles.success} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
          <label className={styles.editStatusField} htmlFor={`${id}-status`}><span>Status do perfil</span>
            <select className="filter-select" id={`${id}-status`} name="status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option>
            </select>
          </label>
          <fieldset className={styles.grantFields}>
            <legend>Perfis</legend>
            <div className={styles.profileChoices}>{accessProfiles.map((profile) => <label key={profile} className={styles.profileChoice} htmlFor={`${id}-${profile}`}>
              <input id={`${id}-${profile}`} type="checkbox" name="perfis" value={profile} checked={perfis.includes(profile)} onChange={(event) => toggleProfile(profile, event.target.checked)} />
              <span>{profileLabels[profile]}</span>
            </label>)}</div>
          </fieldset>
          {perfis.includes("ADMINISTRATIVO") && <fieldset className={styles.grantFields}>
            <legend>Administrativo</legend>
            <select className="filter-select" name="atuacaoAdministrativa" aria-label="Tipo de Administrativo" value={administrativeScope} onChange={(event) => setAdministrativeScope(event.target.value)}>
              {Object.entries(administrativeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </fieldset>}
          {perfis.includes("ENGENHARIA") && <fieldset className={styles.grantFields}>
            <legend>Atuação de Engenharia</legend>
            <div className={styles.profileChoices}>{Object.entries(engineeringLabels).map(([value, label]) => <label className={styles.profileChoice} key={value} htmlFor={`${id}-engineering-${value}`}>
              <input id={`${id}-engineering-${value}`} name="atuacoesEngenharia" type="checkbox" value={value} checked={engineeringScopes.includes(value as EngineeringScope)} onChange={(event) => toggleEngineeringScope(value as EngineeringScope, event.target.checked)} />
              <span>{label}</span>
            </label>)}</div>
          </fieldset>}
          {technicalProfiles.map((profile) => <fieldset className={styles.grantFields} key={profile}>
            <legend>{profileLabels[profile]} · obras</legend>
            {rows.filter((row) => row.perfil === profile).map((row, index) => <div className={`${styles.grantRow} ${styles.workOnlyGrantRow}`} key={row.key}>
              <label htmlFor={`${id}-work-${row.key}`}><span className={styles.visuallyHidden}>{`Obra ${index + 1}`}</span>
                <select className="filter-select" id={`${id}-work-${row.key}`} aria-label={`Obra ${index + 1} para ${profileLabels[profile]}`} value={row.obra_id} onChange={(event) => changeRow(row.key, event.target.value)}>
                  <option value="">Selecione a obra</option>
                  {works.map((work) => <option value={work.id} key={work.id}>{work.nome}</option>)}
                </select>
              </label>
              <button type="button" className="secondary" aria-label={`Remover obra ${index + 1} de ${profileLabels[profile]}`} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>Remover</button>
            </div>)}
            <button type="button" className={`primary ${styles.addGrantButton}`} aria-label={`Adicionar obra para ${profileLabels[profile]}`} title="Adicionar obra" onClick={() => addRow(profile)}>+</button>
          </fieldset>)}
          {account.auth_user_id === actorId && <p className={styles.editSelfNotice}>Ao alterar seu próprio perfil, a nova autorização será aplicada na próxima navegação.</p>}
        </fieldset>
        <div className={styles.approvalDialogActions}>
          <button type="button" className="secondary" disabled={pending} onClick={() => dialogRef.current?.close()}>Cancelar</button>
          <button type="submit" className="primary" disabled={pending || incomplete}>{pending ? "Salvando…" : "Salvar alterações"}</button>
        </div>
      </form>
    </dialog>
  </>;
}
