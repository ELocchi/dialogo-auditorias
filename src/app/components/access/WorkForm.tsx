"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import { createWorkAction } from "@/app/administracao/usuarios/actions";
import { initialWorkEditState, workFieldLimits, brazilianStates } from "@/lib/works/contracts";
import type { ActiveTeamProfile } from "@/lib/works/contracts";
import { ActiveTeamProfiles } from "@/app/components/works/ActiveTeamProfiles";
import styles from "@/app/components/works/work-edit.module.css";

type Member = { key: number; nome: string; funcao: string };

export function WorkForm({ activeProfiles }: { activeProfiles: ActiveTeamProfile[] | null }) {
  const [team, setTeam] = useState<Member[]>([]);
  const sequence = useRef(0);
  const [state, dispatch, pending] = useActionState(createWorkAction, initialWorkEditState);
  const error = (name: string) => state.fieldErrors?.[name];
  const input = (name: keyof typeof workFieldLimits, label: string, options: { required?: boolean; className?: string; inputMode?: "numeric" | "text"; autoComplete?: string } = {}) =>
    <div className={options.className ?? styles.field}>
      <label htmlFor={`new-work-${name}`}>{label}{options.required && <span aria-hidden="true"> *</span>}</label>
      <input id={`new-work-${name}`} name={name} required={options.required} minLength={name === "nome" ? 2 : undefined} maxLength={workFieldLimits[name]} inputMode={options.inputMode} autoComplete={options.autoComplete ?? "off"} aria-invalid={Boolean(error(name))} aria-describedby={error(name) ? `new-work-error-${name}` : undefined} />
      {error(name) && <p className={styles.fieldError} id={`new-work-error-${name}`}>{error(name)}</p>}
    </div>;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => dispatch(form));
  }

  return <form method="post" onSubmit={submit} aria-busy={pending} className={styles.form}>
    <input type="hidden" name="equipe_obra" value={JSON.stringify(team.map(({ nome, funcao }) => ({ nome, funcao })))} />
    <fieldset disabled={pending} className={styles.group}>
      <legend>Identificação</legend>
      <div className={styles.identification}>
        {input("nome", "Nome da obra", { required: true })}
        <div className={styles.field}><label htmlFor="new-work-status">Situação</label><output id="new-work-status">Ativa após o cadastro</output></div>
      </div>
    </fieldset>
    <fieldset disabled={pending} className={styles.group}>
      <legend>Endereço</legend>
      <div className={styles.address}>
        {input("logradouro", "Logradouro", { className: styles.wideField, autoComplete: "street-address" })}
        {input("numero", "Número")}
        {input("complemento", "Complemento")}
        {input("bairro", "Bairro")}
        {input("cidade", "Cidade", { autoComplete: "address-level2" })}
        <div className={styles.field}><label htmlFor="new-work-uf">UF</label><select id="new-work-uf" name="uf" defaultValue="" autoComplete="address-level1" aria-invalid={Boolean(error("uf"))} aria-describedby={error("uf") ? "new-work-error-uf" : undefined}><option value="">Não informada</option>{brazilianStates.map((uf) => <option key={uf} value={uf}>{uf}</option>)}</select>{error("uf") && <p id="new-work-error-uf" className={styles.fieldError}>{error("uf")}</p>}</div>
        {input("cep", "CEP", { inputMode: "numeric", autoComplete: "postal-code" })}
      </div>
    </fieldset>
    <fieldset disabled={pending} className={styles.group}>
      <legend>Responsáveis</legend>
      <div className={styles.twoColumns}>
        {input("responsavel_tecnico", "Responsável técnico")}
        {input("registro_tecnico", "Registro profissional")}
        {input("coordenacao", "Coordenação", { className: styles.wideField })}
      </div>
    </fieldset>
    <fieldset disabled={pending} className={styles.group}>
      <legend>Equipe da obra</legend>
      <ActiveTeamProfiles profiles={activeProfiles} />
      <p className={styles.help}>Nomes informados manualmente são opcionais e não concedem acesso.</p>
      <div className={styles.team}>
        {team.length === 0 && <p className={styles.empty}>Nenhum integrante informado.</p>}
        {team.map((member, index) => <div className={styles.member} key={member.key}>
          <div className={styles.field}><label htmlFor={`new-member-name-${member.key}`}>Nome do integrante {index + 1} <span aria-hidden="true">*</span></label><input id={`new-member-name-${member.key}`} value={member.nome} required minLength={2} maxLength={160} onChange={(event) => setTeam((members) => members.map((entry) => entry.key === member.key ? { ...entry, nome: event.target.value } : entry))} aria-invalid={Boolean(error("equipe_obra"))} /></div>
          <div className={styles.field}><label htmlFor={`new-member-role-${member.key}`}>Função do integrante {index + 1}</label><input id={`new-member-role-${member.key}`} value={member.funcao} maxLength={100} onChange={(event) => setTeam((members) => members.map((entry) => entry.key === member.key ? { ...entry, funcao: event.target.value } : entry))} /></div>
          <button className={styles.remove} type="button" onClick={() => setTeam((members) => members.filter((entry) => entry.key !== member.key))} aria-label={`Remover integrante ${index + 1}`}>Remover</button>
        </div>)}
      </div>
      {error("equipe_obra") && <p className={styles.fieldError} role="alert">{error("equipe_obra")}</p>}
      <div className={styles.teamActions}><button className="secondary" type="button" disabled={pending || team.length >= 30} onClick={() => { const key = sequence.current++; setTeam((members) => [...members, { key, nome: "", funcao: "" }]); }}>Adicionar integrante</button><span>{team.length} de 30 integrantes</span></div>
    </fieldset>
    <fieldset disabled={pending} className={styles.group}>
      <legend>Observações</legend>
      <div className={styles.field}><label htmlFor="new-work-observacoes">Informações adicionais da obra</label><textarea id="new-work-observacoes" name="observacoes" rows={5} maxLength={workFieldLimits.observacoes} aria-invalid={Boolean(error("observacoes"))} aria-describedby={error("observacoes") ? "new-work-error-observacoes" : undefined} />{error("observacoes") && <p id="new-work-error-observacoes" className={styles.fieldError}>{error("observacoes")}</p>}</div>
    </fieldset>
    {state.message && <div className={state.status === "error" ? styles.error : styles.success} role={state.status === "error" ? "alert" : "status"} aria-live="polite"><p>{state.message}</p>{state.workId && <p><Link href={`/administracao/obras/${state.workId}`}>Abrir cadastro da obra</Link></p>}</div>}
    <div className={styles.formActions}><button className="primary" type="submit" disabled={pending}>{pending ? "Cadastrando…" : "Cadastrar obra"}</button></div>
  </form>;
}
