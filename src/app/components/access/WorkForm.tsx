"use client";
import { SlowOperation } from "@/app/components/slow-operation";
import { useHydrated } from "../use-hydrated";
import { recoverAction } from "../recover-action";

import { BackLink } from "@/app/components/back-control";

import Link from "next/link";
import { startTransition, useActionState, type FormEvent } from "react";
import { createWorkAction } from "@/app/administracao/usuarios/actions";
import { initialWorkEditState, workFieldLimits, workStages } from "@/lib/works/contracts";
import type { ActiveTeamProfile } from "@/lib/works/contracts";
import { ActiveTeamProfiles } from "@/app/components/works/ActiveTeamProfiles";
import styles from "@/app/components/works/work-edit.module.css";

export function WorkForm({ activeProfiles }: { activeProfiles: ActiveTeamProfile[] | null }) {
  const hydrated = useHydrated();
  const [state, dispatch, pending] = useActionState(recoverAction(createWorkAction), initialWorkEditState);
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

  return <form method="post" onSubmit={submit} aria-busy={pending || !hydrated} className={styles.form}>
    <input type="hidden" name="equipe_obra" value="[]" />
    <input type="hidden" name="complemento" value="" />
    <input type="hidden" name="cidade" value="" />
    <input type="hidden" name="uf" value="" />
    <input type="hidden" name="registro_tecnico" value="" />
    <fieldset disabled={pending || !hydrated} className={styles.group}>
      <legend>Identificação</legend>
      <div className={styles.identification}>
        {input("empreendimento", "Nome do empreendimento")}
        {input("nome", "Nome do projeto", { required: true })}
        <div className={styles.field}><label htmlFor="new-work-stage">Etapa da obra</label><select className="filter-select" id="new-work-stage" name="etapa_obra" defaultValue="" aria-invalid={Boolean(error("etapa_obra"))} aria-describedby={error("etapa_obra") ? "new-work-error-etapa_obra" : undefined}><option value="">Não informada</option>{workStages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select>{error("etapa_obra") && <p id="new-work-error-etapa_obra" className={styles.fieldError}>{error("etapa_obra")}</p>}</div>
      </div>
    </fieldset>
    <fieldset disabled={pending || !hydrated} className={styles.group}>
      <legend>Endereço</legend>
      <div className={styles.address}>
        {input("logradouro", "Logradouro", { autoComplete: "street-address" })}
        {input("numero", "Número")}
        {input("bairro", "Bairro")}
        {input("cep", "CEP", { inputMode: "numeric", autoComplete: "postal-code" })}
      </div>
    </fieldset>
    <fieldset disabled={pending || !hydrated} className={styles.group}>
      <legend>Responsáveis</legend>
      <div className={styles.twoColumns}>
        {input("responsavel_tecnico", "Responsável técnico")}
        {input("coordenacao", "Coordenador")}
      </div>
    </fieldset>
    <fieldset disabled={pending || !hydrated} className={styles.group}>
      <legend>Equipe da obra</legend>
      <ActiveTeamProfiles profiles={activeProfiles} />
    </fieldset>
    <fieldset disabled={pending || !hydrated} className={styles.group}>
      <legend>Observações</legend>
      <div className={styles.field}><label htmlFor="new-work-observacoes">Informações adicionais da obra</label><textarea id="new-work-observacoes" name="observacoes" rows={5} maxLength={workFieldLimits.observacoes} aria-invalid={Boolean(error("observacoes"))} aria-describedby={error("observacoes") ? "new-work-error-observacoes" : undefined} />{error("observacoes") && <p id="new-work-error-observacoes" className={styles.fieldError}>{error("observacoes")}</p>}</div>
    </fieldset>
    {state.message && <div className={state.status === "error" ? styles.error : styles.success} role={state.status === "error" ? "alert" : "status"} aria-live="polite"><p>{state.message}</p>{state.workId && <p><Link href={`/administracao/obras/${state.workId}`}>Abrir cadastro da obra</Link></p>}</div>}
    <div className={styles.formActions}><button className="primary" type="submit" disabled={pending || !hydrated}>{pending ? "Cadastrando…" : "Cadastrar obra"}</button><BackLink href="/app?secao=obras" label="Voltar às obras" tooltip="Cancelar e voltar" /></div>
  <SlowOperation pending={pending} /></form>;
}
