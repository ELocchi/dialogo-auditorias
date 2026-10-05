"use client";
import { SlowOperation } from "@/app/components/slow-operation";
import { useHydrated } from "../use-hydrated";
import { recoverAction } from "../recover-action";

import { BackLink } from "@/app/components/back-control";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { updateWorkAction } from "@/app/administracao/obras/[id]/actions";
import { initialWorkEditState, workFieldLimits, workStages, type WorkDetails, type WorkEditState, type ActiveTeamProfile, type WorkTeamLink } from "@/lib/works/contracts";
import { ActiveTeamProfiles } from "./ActiveTeamProfiles";
import styles from "./work-edit.module.css";

export function WorkEditForm({ work, activeProfiles, linkedProfiles }: { work: WorkDetails; activeProfiles: ActiveTeamProfile[] | null; linkedProfiles: WorkTeamLink[] | null }) {
  const [revision, setRevision] = useState(work.revisao);
  const hydrated = useHydrated();
  const [state, dispatch, pending] = useActionState(async (previous: WorkEditState, form: FormData) => {
    const result = await recoverAction(updateWorkAction)(previous, form);
    if (result.status === "success") {
      if (typeof result.revision === "number") setRevision(result.revision);
    }
    return result;
  }, initialWorkEditState);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Snapshot before pending disables the controls. Do not use form action:
    // React's successful action reset would erase optional fields and edits.
    const form = new FormData(event.currentTarget);
    startTransition(() => dispatch(form));
  }

  const error = (name: string) => state.fieldErrors?.[name];
  const input = (name: keyof typeof workFieldLimits, label: string, options: { required?: boolean; className?: string; inputMode?: "numeric" | "text"; autoComplete?: string } = {}) => {
    const fieldName = String(name);
    return <div className={options.className ?? styles.field}>
      <label htmlFor={`work-${fieldName}`}>{label}{options.required && <span aria-hidden="true"> *</span>}</label>
      <input id={`work-${fieldName}`} name={fieldName} defaultValue={typeof work[name] === "string" ? work[name] as string : ""} required={options.required} maxLength={workFieldLimits[name]} minLength={name === "nome" ? 2 : undefined} inputMode={options.inputMode} autoComplete={options.autoComplete ?? "off"} aria-invalid={Boolean(error(fieldName))} aria-describedby={error(fieldName) ? `error-${fieldName}` : undefined} />
      {error(fieldName) && <p className={styles.fieldError} id={`error-${fieldName}`}>{error(fieldName)}</p>}
    </div>;
  };

  return <form method="post" onSubmit={submit} className={styles.form} aria-busy={pending || !hydrated}>
    <input type="hidden" name="work_id" value={work.id} />
    <input type="hidden" name="expected_revision" value={revision} />
    <input type="hidden" name="equipe_obra" value={JSON.stringify(work.equipe_obra)} />
    <input type="hidden" name="complemento" value={work.complemento ?? ""} />
    <input type="hidden" name="cidade" value={work.cidade ?? ""} />
    <input type="hidden" name="uf" value={work.uf ?? ""} />
    <input type="hidden" name="registro_tecnico" value={work.registro_tecnico ?? ""} />
    <fieldset disabled={pending || !hydrated} className={styles.group}>
      <legend>Identificação</legend>
      <div className={styles.identification}>
        {input("empreendimento", "Nome do empreendimento")}
        {input("nome", "Nome do projeto", { required: true, })}
        <div className={styles.field}><label htmlFor="work-stage">Etapa da obra</label><select className="filter-select" id="work-stage" name="etapa_obra" defaultValue={work.etapa_obra ?? ""} aria-invalid={Boolean(error("etapa_obra"))} aria-describedby={error("etapa_obra") ? "error-etapa_obra" : undefined}><option value="">Não informada</option>{workStages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select>{error("etapa_obra") && <p id="error-etapa_obra" className={styles.fieldError}>{error("etapa_obra")}</p>}</div>
      </div>
    </fieldset>
    <fieldset disabled={pending || !hydrated} className={styles.group}>
      <legend>Endereço</legend>
      <div className={styles.address}>
        {input("logradouro", "Logradouro", { autoComplete: "street-address" })}
        {input("numero", "Número", { })}
        {input("bairro", "Bairro", { })}
        {input("cep", "CEP", { inputMode: "numeric", autoComplete: "postal-code" })}
      </div>
    </fieldset>
    <fieldset disabled={pending || !hydrated} className={styles.group}>
      <legend>Responsáveis</legend>
      <div className={styles.twoColumns}>
        {input("responsavel_tecnico", "Responsável técnico", { })}
        {input("coordenacao", "Coordenador", { })}
      </div>
    </fieldset>
    <fieldset disabled={pending || !hydrated} className={styles.group}>
      <legend>Equipe da obra</legend>
      <ActiveTeamProfiles profiles={activeProfiles} initialLinks={linkedProfiles ?? []} available={linkedProfiles !== null} />
    </fieldset>
    <fieldset disabled={pending || !hydrated} className={styles.group}>
      <legend>Observações</legend>
      <div className={styles.field}><label htmlFor="work-observacoes">Informações adicionais da obra</label><textarea id="work-observacoes" name="observacoes" rows={5} defaultValue={work.observacoes ?? ""} maxLength={workFieldLimits.observacoes} aria-invalid={Boolean(error("observacoes"))} aria-describedby={error("observacoes") ? "error-observacoes" : undefined} />{error("observacoes") && <p id="error-observacoes" className={styles.fieldError}>{error("observacoes")}</p>}</div>
    </fieldset>
    {state.message && <div className={state.status === "success" ? styles.success : styles.error} role={state.status === "error" ? "alert" : "status"}><p>{state.message}</p>{state.conflict && <p>Suas alterações continuam nos campos. Confira os dados mais recentes antes de tentar salvar novamente. <a href={`/administracao/obras/${work.id}`}>Recarregar o cadastro</a> substitui os campos desta tela pelos dados salvos.</p>}</div>}
    <div className={styles.formActions}><button className="primary" type="submit" disabled={pending || !hydrated}>{pending ? "Salvando…" : "Salvar alterações"}</button><BackLink href="/app?secao=obras" label="Voltar às obras" tooltip="Cancelar e voltar" /></div>
  <SlowOperation pending={pending} /></form>;
}
