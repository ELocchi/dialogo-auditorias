"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import { updateWorkAction } from "@/app/administracao/obras/[id]/actions";
import { initialWorkEditState, workFieldLimits, brazilianStates, type WorkDetails, type WorkEditState, type ActiveTeamProfile } from "@/lib/works/contracts";
import { ActiveTeamProfiles } from "./ActiveTeamProfiles";
import styles from "./work-edit.module.css";

type Member = { key: number; nome: string; funcao: string };
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));

export function WorkEditForm({ work, activeProfiles, linkedProfiles }: { work: WorkDetails; activeProfiles: ActiveTeamProfile[] | null; linkedProfiles: string[] | null }) {
  const [revision, setRevision] = useState(work.revisao);
  const [updatedAt, setUpdatedAt] = useState(work.updated_at);
  const [team, setTeam] = useState<Member[]>(() => work.equipe_obra.map((member, index) => ({ key: index, nome: member.nome, funcao: member.funcao ?? "" })));
  const memberSequence = useRef(work.equipe_obra.length);
  const [state, dispatch, pending] = useActionState(async (previous: WorkEditState, form: FormData) => {
    const result = await updateWorkAction(previous, form);
    if (result.status === "success") {
      if (typeof result.revision === "number") setRevision(result.revision);
      if (result.updatedAt !== undefined) setUpdatedAt(result.updatedAt);
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

  return <form method="post" onSubmit={submit} className={styles.form} aria-busy={pending}>
    <input type="hidden" name="work_id" value={work.id} />
    <input type="hidden" name="expected_revision" value={revision} />
    <input type="hidden" name="equipe_obra" value={JSON.stringify(team.map(({ nome, funcao }) => ({ nome, funcao })))} />
    <div className={styles.savedNotice}><strong>Cadastro da obra</strong><p>Ao salvar, as informações serão atualizadas no cadastro e a alteração ficará registrada no histórico.</p>{updatedAt && <span>Última atualização: {date(updatedAt)} · horário de Brasília</span>}</div>
    <p className={styles.help}>Preencha os dados disponíveis. Apenas o nome da obra e o nome de cada integrante adicionado são obrigatórios.</p>
    <fieldset disabled={pending} className={styles.group}>
      <legend>Identificação</legend>
      <div className={styles.identification}>
        {input("nome", "Nome da obra", { required: true, })}
        <div className={styles.field}><label htmlFor="work-status">Situação</label><output id="work-status">{work.ativo ? "Ativa" : "Indisponível"}</output></div>
      </div>
    </fieldset>
    <fieldset disabled={pending} className={styles.group}>
      <legend>Endereço</legend>
      <div className={styles.address}>
        {input("logradouro", "Logradouro", { className: styles.wideField, autoComplete: "street-address" })}
        {input("numero", "Número", { })}
        {input("complemento", "Complemento", { })}
        {input("bairro", "Bairro", { })}
        {input("cidade", "Cidade", { autoComplete: "address-level2" })}
        <div className={styles.field}><label htmlFor="work-uf">UF</label><select id="work-uf" name="uf" defaultValue={work.uf ?? ""} autoComplete="address-level1" aria-invalid={Boolean(error("uf"))} aria-describedby={error("uf") ? "error-uf" : undefined}><option value="">Não informada</option>{brazilianStates.map((uf) => <option key={uf} value={uf}>{uf}</option>)}</select>{error("uf") && <p id="error-uf" className={styles.fieldError}>{error("uf")}</p>}</div>
        {input("cep", "CEP", { inputMode: "numeric", autoComplete: "postal-code" })}
      </div>
    </fieldset>
    <fieldset disabled={pending} className={styles.group}>
      <legend>Responsáveis</legend>
      <div className={styles.twoColumns}>
        {input("responsavel_tecnico", "Responsável técnico", { })}
        {input("registro_tecnico", "Registro profissional", { })}
        {input("coordenacao", "Coordenação", { className: styles.wideField })}
      </div>
    </fieldset>
    <fieldset disabled={pending} className={styles.group}>
      <legend>Equipe da obra</legend>
      <ActiveTeamProfiles profiles={activeProfiles} initialIds={linkedProfiles ?? []} available={linkedProfiles !== null} />
      <p className={styles.help}>Os nomes informados manualmente abaixo não concedem acessos. Para direcionar uma conta à obra, selecione seu perfil ativo acima.</p>
      <div className={styles.team}>
        {team.length === 0 && <p className={styles.empty}>Nenhum integrante informado.</p>}
        {team.map((member, index) => <div className={styles.member} key={member.key}>
          <div className={styles.field}><label htmlFor={`member-name-${member.key}`}>Nome do integrante {index + 1} <span aria-hidden="true">*</span></label><input id={`member-name-${member.key}`} value={member.nome} required minLength={2} maxLength={160} onChange={(event) => setTeam((members) => members.map((entry) => entry.key === member.key ? { ...entry, nome: event.target.value } : entry))} aria-invalid={Boolean(error(`equipe_obra.${index}.nome`))} aria-describedby={error(`equipe_obra.${index}.nome`) ? `member-name-error-${member.key}` : undefined} />{error(`equipe_obra.${index}.nome`) && <p id={`member-name-error-${member.key}`} className={styles.fieldError}>{error(`equipe_obra.${index}.nome`)}</p>}</div>
          <div className={styles.field}><label htmlFor={`member-role-${member.key}`}>Função do integrante {index + 1}</label><input id={`member-role-${member.key}`} value={member.funcao} maxLength={100} onChange={(event) => setTeam((members) => members.map((entry) => entry.key === member.key ? { ...entry, funcao: event.target.value } : entry))} /></div>
          <button className={styles.remove} type="button" onClick={() => setTeam((members) => members.filter((entry) => entry.key !== member.key))} aria-label={`Remover integrante ${index + 1}`}>Remover</button>
        </div>)}
      </div>
      {error("equipe_obra") && <p className={styles.fieldError} role="alert">{error("equipe_obra")}</p>}
      <div className={styles.teamActions}><button className="secondary" type="button" disabled={team.length >= 30} onClick={() => { const key = memberSequence.current++; setTeam((members) => [...members, { key, nome: "", funcao: "" }]); }}>Adicionar integrante</button><span>{team.length} de 30 integrantes</span></div>
    </fieldset>
    <fieldset disabled={pending} className={styles.group}>
      <legend>Observações</legend>
      <div className={styles.field}><label htmlFor="work-observacoes">Informações adicionais da obra</label><textarea id="work-observacoes" name="observacoes" rows={5} defaultValue={work.observacoes ?? ""} maxLength={workFieldLimits.observacoes} aria-invalid={Boolean(error("observacoes"))} aria-describedby={error("observacoes") ? "error-observacoes" : undefined} />{error("observacoes") && <p id="error-observacoes" className={styles.fieldError}>{error("observacoes")}</p>}</div>
    </fieldset>
    {state.message && <div className={state.status === "success" ? styles.success : styles.error} role={state.status === "error" ? "alert" : "status"}><p>{state.message}</p>{state.conflict && <p>Suas alterações continuam nos campos. Confira os dados mais recentes antes de tentar salvar novamente. <a href={`/administracao/obras/${work.id}`}>Recarregar o cadastro</a> substitui os campos desta tela pelos dados salvos.</p>}</div>}
    <div className={styles.formActions}><button className="primary" type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar alterações"}</button><Link href="/app?secao=obras" className="secondary">Cancelar e voltar às obras</Link></div>
  </form>;
}
