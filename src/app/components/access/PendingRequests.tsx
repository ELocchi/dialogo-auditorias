"use client";

import { startTransition, useActionState, useId, useState } from "react";
import { approveAccessAction } from "@/app/administracao/usuarios/actions";
import { accessProfiles, engineeringLabels, initialAccessState, moduleLabels, profileLabels, type AccessModule, type AccessProfile, type AccessWork, type PendingRequest, type TechnicalProfile } from "@/lib/access/contracts";
import styles from "@/app/administracao/usuarios/access.module.css";

const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
type GrantRow = { key: number; perfil: TechnicalProfile; obra_id: string; modulo: string };
const modulesFor = (profile: TechnicalProfile): AccessModule[] => profile === "AUDITOR_SEGURANCA" ? ["SEGURANCA"] : profile === "AUDITOR_QUALIDADE" ? ["QUALIDADE"] : ["SEGURANCA", "QUALIDADE"];
const firstModule = (profile: TechnicalProfile) => profile === "ENGENHARIA" ? "" : modulesFor(profile)[0];

export function PendingRequests({ requests, works, actorId }: { requests: PendingRequest[]; works: AccessWork[]; actorId: string }) {
  const [state, action, pending] = useActionState(approveAccessAction, initialAccessState);
  return <div>
    {state.message && <p className={state.status === "error" ? styles.error : styles.success} role={state.status === "error" ? "alert" : "status"} aria-live="polite">{state.message}</p>}
    {requests.length === 0 && <p className={styles.empty}>Não há solicitações com e-mail confirmado nesta página. Cadastros que ainda aguardam confirmação não podem ser aprovados.</p>}
    <div className={styles.requestList}>
      {requests.map((request) => <RequestCard key={request.auth_user_id} request={request} works={works} action={action} pending={pending} isSelf={request.auth_user_id === actorId} />)}
    </div>
  </div>;
}

function RequestCard({ request, works, action, pending, isSelf }: { request: PendingRequest; works: AccessWork[]; action: (form: FormData) => void; pending: boolean; isSelf: boolean }) {
  const id = useId();
  const [perfis, setPerfis] = useState<AccessProfile[]>([]);
  const [scope, setScope] = useState("");
  const [rows, setRows] = useState<GrantRow[]>([]);
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const technicalProfiles = perfis.filter((profile): profile is TechnicalProfile => profile !== "ADMINISTRATIVO");
  const incomplete = perfis.length === 0 || technicalProfiles.some((profile) => !rows.some((row) => row.perfil === profile)) || (technicalProfiles.length > 0 && works.length === 0);
  const toggleProfile = (profile: AccessProfile, selected: boolean) => {
    setPerfis((current) => accessProfiles.filter((item) => item === profile ? selected : current.includes(item)));
    if (!selected) {
      setRows((current) => current.filter((row) => row.perfil !== profile));
      if (profile === "ENGENHARIA") setScope("");
    } else if (profile !== "ADMINISTRATIVO") {
      setRows((current) => [...current, { key: Math.max(-1, ...current.map((row) => row.key)) + 1, perfil: profile, obra_id: "", modulo: firstModule(profile) }]);
    }
    setReviewed(false);
  };
  const changeRow = (key: number, changes: Partial<GrantRow>) => {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...changes } : row));
    setReviewed(false);
  };
  return <details className={styles.requestCard}>
    <summary className={styles.requestSummary}>
      <span><strong>{request.nome}</strong><span className={styles.email}>{request.email}</span></span>
      <span className={styles.pendingBadge}>Pendente de aprovação</span>
      <span className={styles.summaryHint}>Analisar solicitação</span>
    </summary>
    <div className={styles.requestBody}>
      <dl className={styles.details}>
        <div><dt>Solicitado em</dt><dd>{formatDate(request.created_at)}</dd></div>
        <div><dt>E-mail confirmado em</dt><dd>{formatDate(request.email_confirmado_em)}</dd></div>
        <div><dt>Cargo ou área declarada</dt><dd>{request.cargo_area_informado || "Não informado"}</dd></div>
        <div><dt>Obra de referência declarada</dt><dd>{request.obra_referencia_informada || "Não informada"}</dd></div>
      </dl>
      <p className={styles.note}>Cargo e obra declarados são referências para análise. Cada permissão será definida abaixo pelo Administrativo.</p>
      {isSelf ? <p className={styles.error}>A aprovação da própria conta não está disponível.</p> : <form action={action} aria-busy={pending} className={styles.approvalForm} onSubmit={(event) => {
        // Dispatch the action explicitly so React keeps the controlled fields
        // intact after a returned error. Capture the reviewed values first.
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setReviewed(false);
        startTransition(() => action(formData));
      }}>
        <input type="hidden" name="authUserId" value={request.auth_user_id} />
        <input type="hidden" name="grants" value={JSON.stringify(rows.map(({ perfil, obra_id, modulo }) => ({ perfil, obra_id, modulo })))} />
        <fieldset disabled={pending} className={styles.formFields}>
          <legend>Definir acesso</legend>
          <fieldset className={styles.grantFields}>
            <legend>Perfis a conceder</legend>
            <p className={styles.help}>Selecione um ou mais perfis para esta pessoa. Defina as obras e os módulos de cada perfil técnico abaixo.</p>
            <div className={styles.profileChoices}>
              {accessProfiles.map((profile) => <label key={profile} className={styles.profileChoice} htmlFor={`${id}-profile-${profile}`}>
                <input id={`${id}-profile-${profile}`} type="checkbox" name="perfis" value={profile} checked={perfis.includes(profile)} onChange={(event) => toggleProfile(profile, event.target.checked)} />
                <span>{profileLabels[profile]}</span>
              </label>)}
            </div>
          </fieldset>
          {perfis.includes("ENGENHARIA") && <div className={styles.formGrid}><label htmlFor={`${id}-scope`}>Atuação de Engenharia
              <select id={`${id}-scope`} name="atuacaoEngenharia" required value={scope} onChange={(event) => { setScope(event.target.value); setReviewed(false); }}>
                <option value="">Selecione a atuação</option>
                {Object.entries(engineeringLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label></div>}
          {perfis.includes("ADMINISTRATIVO") && <p className={styles.note}>Administrativo permite gerir usuários e acessos. As permissões de auditoria e Engenharia são definidas nos respectivos perfis, mesmo quando a pessoa também é Administrativo.</p>}
          {technicalProfiles.map((profile) => <fieldset key={profile} className={styles.grantFields}>
            <legend>{profileLabels[profile]} · obras e módulos</legend>
            <p className={styles.help}>Cada linha concede o módulo escolhido nesta obra para {profileLabels[profile]}. Os acessos dos outros perfis são definidos separadamente.</p>
            {works.length === 0 && <p className={styles.error}>Cadastre uma obra real na seção Obras para autorização antes de aprovar este perfil.</p>}
            {rows.filter((row) => row.perfil === profile).map((row, index) => <div key={row.key} className={styles.grantRow}>
              <label htmlFor={`${id}-work-${row.key}`}>Obra {index + 1}
                <select id={`${id}-work-${row.key}`} required value={row.obra_id} onChange={(event) => changeRow(row.key, { obra_id: event.target.value })}>
                  <option value="">Selecione a obra</option>
                  {works.map((work) => <option key={work.id} value={work.id}>{work.nome}</option>)}
                </select>
              </label>
              <label htmlFor={`${id}-module-${row.key}`}>Módulo {index + 1}
                <select id={`${id}-module-${row.key}`} required value={row.modulo} onChange={(event) => changeRow(row.key, { modulo: event.target.value })}>
                  <option value="">Selecione o módulo</option>
                  {modulesFor(profile).map((module) => <option key={module} value={module}>{moduleLabels[module]}</option>)}
                </select>
              </label>
              <button type="button" className="secondary" aria-label={`Remover acesso ${index + 1} de ${profileLabels[profile]}`} onClick={() => { setRows((current) => current.filter((item) => item.key !== row.key)); setReviewed(false); }}>Remover</button>
            </div>)}
            <button className="secondary" type="button" disabled={rows.length >= 400 || works.length === 0} onClick={() => { setRows((current) => [...current, { key: Math.max(-1, ...current.map((row) => row.key)) + 1, perfil: profile, obra_id: "", modulo: firstModule(profile) }]); setReviewed(false); }}>Adicionar obra e módulo para {profileLabels[profile]}</button>
          </fieldset>)}
          <label htmlFor={`${id}-reason`}>Motivo da aprovação
            <textarea id={`${id}-reason`} name="reason" minLength={10} maxLength={1000} required value={reason} onChange={(event) => { setReason(event.target.value); setReviewed(false); }} placeholder="Registre o motivo dos perfis e dos acessos concedidos." />
          </label>
          <label className={styles.confirmation} htmlFor={`${id}-confirmation`}>
            <input id={`${id}-confirmation`} type="checkbox" name="confirmation" value="SIM" required checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
            <span>Revisei os perfis e cada acesso. Confirmo a aprovação de {request.nome} e o registro da decisão no histórico.</span>
          </label>
          <button className="primary" type="submit" disabled={!reviewed || incomplete}>{pending ? "Registrando aprovação…" : "Aprovar e registrar acessos"}</button>
        </fieldset>
      </form>}
    </div>
  </details>;
}
