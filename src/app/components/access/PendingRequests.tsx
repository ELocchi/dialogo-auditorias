"use client";
import { recoverAction } from "../recover-action";

import { BackButton, BackHeading } from "@/app/components/back-control";

import { containDialogFocus } from "../dialog-keyboard";

import { startTransition, useActionState, useId, useRef, useState } from "react";
import { approveAccessAction } from "@/app/administracao/usuarios/actions";
import { accessProfiles, administrativeLabels, engineeringLabels, initialAccessState, profileLabels, type AccessGrant, type AccessModule, type AccessProfile, type AccessWork, type PendingRequest, type TechnicalProfile } from "@/lib/access/contracts";
import styles from "@/app/administracao/usuarios/access.module.css";

const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
type GrantRow = { key: number; perfil: TechnicalProfile; obra_id: string; modulo: AccessModule | "" };
const modulesFor = (profile: TechnicalProfile): AccessModule[] => profile === "AUDITOR_SEGURANCA" ? ["SEGURANCA"] : profile === "AUDITOR_QUALIDADE" ? ["QUALIDADE"] : ["SEGURANCA", "QUALIDADE"];
const firstModule = (profile: TechnicalProfile) => profile === "ENGENHARIA" ? "" : modulesFor(profile)[0];

export function PendingRequests({ requests, works, actorId, previewIds = [] }: { requests: PendingRequest[]; works: AccessWork[]; actorId: string; previewIds?: readonly string[] }) {
  const [state, action, pending] = useActionState(recoverAction(approveAccessAction), initialAccessState);
  return <div>
    {state.message && <p className={state.status === "error" ? styles.error : styles.success} role={state.status === "error" ? "alert" : "status"} aria-live="polite">{state.message}</p>}
    {requests.length === 0 && <p className={styles.empty}>Não há solicitações com e-mail confirmado nesta página. Cadastros que ainda aguardam confirmação não podem ser aprovados.</p>}
    <div className={styles.requestList}>
      {requests.map((request) => <RequestCard key={request.auth_user_id} request={request} works={works} action={action} pending={pending} isSelf={request.auth_user_id === actorId} preview={previewIds.includes(request.auth_user_id)} />)}
    </div>
  </div>;
}

function RequestCard({ request, works, action, pending, isSelf, preview }: { request: PendingRequest; works: AccessWork[]; action: (form: FormData) => void; pending: boolean; isSelf: boolean; preview: boolean }) {
  const [hasOpened, setHasOpened] = useState(false);
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const approvalButtonRef = useRef<HTMLButtonElement>(null);
  const [perfis, setPerfis] = useState<AccessProfile[]>([]);
  const [scope, setScope] = useState("");
  const [administrativeScope, setAdministrativeScope] = useState("");
  const [rows, setRows] = useState<GrantRow[]>([]);
  const technicalProfiles = perfis.filter((profile): profile is TechnicalProfile => profile !== "ADMINISTRATIVO");
  const expandedGrants: AccessGrant[] = rows.flatMap(({ perfil, obra_id, modulo }): AccessGrant[] => perfil === "ENGENHARIA"
    ? modulesFor(perfil).map((engineeringModule) => ({ perfil, obra_id, modulo: engineeringModule }))
    : [{ perfil, obra_id, modulo: modulo as AccessModule }]);
  const incomplete = perfis.length === 0 || (perfis.includes("ADMINISTRATIVO") && !administrativeScope)
    || technicalProfiles.some((profile) => !rows.some((row) => row.perfil === profile))
    || rows.some((row) => !row.obra_id || (row.perfil !== "ENGENHARIA" && !row.modulo))
    || expandedGrants.length > 400 || (technicalProfiles.length > 0 && works.length === 0);
  const selectedRows = rows.filter((row) => row.obra_id && (row.perfil === "ENGENHARIA" || row.modulo));
  const workName = (workId: string) => works.find((work) => work.id === workId)?.nome ?? "Obra não informada";
  const selectedWorkNames = [...new Set(selectedRows.map((row) => workName(row.obra_id)))];
  const toggleProfile = (profile: AccessProfile, selected: boolean) => {
    setPerfis((current) => accessProfiles.filter((item) => item === profile ? selected : current.includes(item)));
    if (!selected) {
      setRows((current) => current.filter((row) => row.perfil !== profile));
      if (profile === "ENGENHARIA") setScope("");
      if (profile === "ADMINISTRATIVO") setAdministrativeScope("");
    } else if (profile !== "ADMINISTRATIVO") {
      setRows((current) => [...current, { key: Math.max(-1, ...current.map((row) => row.key)) + 1, perfil: profile, obra_id: "", modulo: firstModule(profile) }]);
    }
  };
  const changeRow = (key: number, changes: Partial<GrantRow>) => {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...changes } : row));
  };
  return <details className={styles.requestCard} onToggle={(event) => {
    if (event.currentTarget.open) setHasOpened(true);
  }}>
    <summary className={styles.requestSummary}>
      <span><strong>{request.nome}</strong><span className={styles.email}>{request.email}</span></span>
      <span className={styles.pendingBadge}>Pendente de aprovação</span>
      <span className={styles.summaryHint}>Analisar solicitação</span>
    </summary>
    {hasOpened && <div className={styles.requestBody}>
      <dl className={styles.details}>
        <div><dt>Solicitado em</dt><dd>{formatDate(request.created_at)}</dd></div>
        <div><dt>E-mail confirmado em</dt><dd>{formatDate(request.email_confirmado_em)}</dd></div>
        <div><dt>Cargo ou área declarada</dt><dd>{request.cargo_area_informado || "Não informado"}</dd></div>
        <div><dt>Obra de referência declarada</dt><dd>{request.obra_referencia_informada || "Não informada"}</dd></div>
      </dl>
      {isSelf ? <p className={styles.error}>A aprovação da própria conta não está disponível.</p> : <form ref={formRef} action={action} aria-busy={pending} className={styles.approvalForm} onSubmit={(event) => {
        event.preventDefault();
        if (pending || incomplete) return;
        dialogRef.current?.showModal();
      }}>
        <input type="hidden" name="authUserId" value={request.auth_user_id} />
        <input type="hidden" name="grants" value={JSON.stringify(expandedGrants)} />
        <input type="hidden" name="reason" value="Aprovação administrativa de acesso." />
        <fieldset disabled={pending} className={styles.formFields}>
          <legend>Definir acesso</legend>
          <div className={styles.accessDefinitionLayout}>
            <fieldset className={`${styles.grantFields} ${styles.profilePanel}`}>
              <legend>Perfis a conceder</legend>
              <div className={styles.profileChoices}>
                {accessProfiles.map((profile) => <label key={profile} className={styles.profileChoice} htmlFor={`${id}-profile-${profile}`}>
                  <input id={`${id}-profile-${profile}`} type="checkbox" name="perfis" value={profile} checked={perfis.includes(profile)} onChange={(event) => toggleProfile(profile, event.target.checked)} />
                  <span>{profileLabels[profile]}</span>
                </label>)}
              </div>
            </fieldset>
            <div className={styles.accessConfiguration}>
          {perfis.includes("ADMINISTRATIVO") && <fieldset className={styles.grantFields}>
            <legend>Administrativo</legend>
            <div className={styles.formGrid}><label htmlFor={`${id}-administrative-scope`}>
              <select className="filter-select" id={`${id}-administrative-scope`} name="atuacaoAdministrativa" aria-label="Atuação administrativa" required value={administrativeScope} onChange={(event) => setAdministrativeScope(event.target.value)}>
                <option value="">Selecione a atuação</option>
                {Object.entries(administrativeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label></div>
          </fieldset>}
          {technicalProfiles.map((profile) => <fieldset key={profile} className={styles.grantFields}>
            <legend>{profileLabels[profile]}</legend>
            {profile === "ENGENHARIA" && <div className={`${styles.formGrid} ${styles.embeddedScope}`}><label htmlFor={`${id}-scope`}>
              <select className="filter-select" id={`${id}-scope`} name="atuacaoEngenharia" aria-label="Atuação de Engenharia" required value={scope} onChange={(event) => setScope(event.target.value)}>
                <option value="">Selecione a atuação</option>
                {Object.entries(engineeringLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label></div>}
            {works.length === 0 && <p className={styles.error}>Cadastre uma obra real na aba Obras antes de aprovar este perfil.</p>}
            {rows.filter((row) => row.perfil === profile).map((row, index) => <div key={row.key} className={`${styles.grantRow} ${styles.workOnlyGrantRow}`}>
              <label htmlFor={`${id}-work-${row.key}`}>{profile !== "ENGENHARIA" && `Obra ${index + 1}`}
                <select className="filter-select" id={`${id}-work-${row.key}`} aria-label={profile === "ENGENHARIA" ? `Obra ${index + 1} para Engenharia` : undefined} required value={row.obra_id} onChange={(event) => changeRow(row.key, { obra_id: event.target.value })}>
                  <option value="">Selecione a obra</option>
                  {works.map((work) => <option key={work.id} value={work.id}>{work.nome}</option>)}
                </select>
              </label>
              <button data-tooltip="Remover acesso" type="button" className="secondary" aria-label={`Remover acesso ${index + 1} de ${profileLabels[profile]}`} onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>Remover</button>
            </div>)}
            {profile === "ENGENHARIA" && <button className={`primary ${styles.addGrantButton}`} type="button" aria-label="Adicionar obra: Engenharia" data-tooltip="Adicionar obra" disabled={expandedGrants.length + 2 > 400 || works.length === 0} onClick={() => setRows((current) => [...current, { key: Math.max(-1, ...current.map((row) => row.key)) + 1, perfil: profile, obra_id: "", modulo: "" }])}>+</button>}
            {profile !== "ENGENHARIA" && <button className={`primary ${styles.addGrantButton}`} type="button" aria-label={`Adicionar obra: ${profileLabels[profile]}`} data-tooltip="Adicionar obra" disabled={expandedGrants.length + 1 > 400 || works.length === 0} onClick={() => setRows((current) => [...current, { key: Math.max(-1, ...current.map((row) => row.key)) + 1, perfil: profile, obra_id: "", modulo: firstModule(profile) }])}>+</button>}
          </fieldset>)}
            </div>
          </div>
          <button ref={approvalButtonRef} className="primary" type="submit" disabled={pending || incomplete}>{pending ? "Registrando aprovação…" : "Aprovar e registrar acessos"}</button>
        </fieldset>
        <dialog onKeyDown={containDialogFocus} ref={dialogRef} className={styles.approvalDialog} aria-labelledby={`${id}-approval-title`} onCancel={(event) => { if (pending) event.preventDefault(); }} onClose={() => approvalButtonRef.current?.focus()}>
          <div className={styles.approvalDialogHeader}>
            <span>CONFIRMAÇÃO</span>
            <BackHeading><BackButton label="Voltar e editar" disabled={pending} onClick={() => dialogRef.current?.close()} /><h3 id={`${id}-approval-title`}>Confirmar aprovação do cadastro</h3></BackHeading>
            <p>Confira as informações antes de liberar o acesso.</p>
          </div>
          <dl className={styles.approvalSummary}>
            <div><dt>Usuário</dt><dd>{request.nome}</dd></div>
            <div><dt>E-mail</dt><dd>{request.email}</dd></div>
            <div><dt>Perfis</dt><dd>{perfis.map((profile) => profileLabels[profile]).join(" · ")}</dd></div>
            {administrativeScope && <div><dt>Atuação administrativa</dt><dd>{administrativeLabels[administrativeScope as keyof typeof administrativeLabels]}</dd></div>}
            {scope && <div><dt>Atuação de Engenharia</dt><dd>{engineeringLabels[scope as keyof typeof engineeringLabels]}</dd></div>}
          </dl>
          {selectedWorkNames.length > 0 && <div className={styles.approvalAccesses}>
            <h4>Obras liberadas</h4>
            <ul>{selectedWorkNames.map((name) => <li key={name}>{name}</li>)}</ul>
          </div>}
          <div className={styles.approvalDialogActions}>
            <button type="button" className="primary" disabled={pending || preview} onClick={() => {
              const form = formRef.current;
              if (!form || incomplete || preview) return;
              const formData = new FormData(form);
              formData.set("confirmation", "SIM");
              dialogRef.current?.close();
              startTransition(() => action(formData));
            }}>{preview ? "Prévia LAN — sem gravação" : pending ? "Registrando aprovação…" : "Confirmar e aprovar"}</button>
          </div>
        </dialog>
      </form>}
    </div>}
  </details>;
}
