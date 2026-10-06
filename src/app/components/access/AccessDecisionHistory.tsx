"use client";
import { useId, useState } from "react";
import { platformDisplayName } from "@/lib/auth/display-name";
import { administrativeLabels, profileLabels, type AccessDecision, type AccessProfile } from "@/lib/access/contracts";
import { validDecision } from "@/lib/access/administration-service";
import { usePageResource } from "../use-page-resource";
import { useListState } from "../list-state";
import { HistoryPagination, initialPage, isPageState } from "../history-pagination";
import { AsyncSkeleton } from "../async-feedback";
import styles from "@/app/administracao/usuarios/access.module.css";
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const date = (value: string) => dateFormatter.format(new Date(value));
type DecisionPage = { available: true; decisions: AccessDecision[]; total: number; page: number };
const validate = (value: unknown): value is DecisionPage => {
 const p = value as DecisionPage;
 return !!p && p.available === true && Number.isSafeInteger(p.total) && p.total >= 0 && Array.isArray(p.decisions)
   && p.decisions.length <= 20 && p.decisions.every(d => validDecision(d, d.auth_user_id));
};
export function AccessDecisionHistory({ userId, actorId, userName }: { userId: string; actorId: string; userName?: string }) {
 const [open, setOpen] = useState(false);
 const [state, setState] = useListState(`decisions:${actorId}:${userId}`, initialPage, isPageState);
 const resource = usePageResource(`/api/access/list?${new URLSearchParams({ userId, page: String(state.page) })}`, validate, open);
 const id = useId(), data = resource.data;
 const rows = data?.decisions ?? [], total = data?.total ?? 0;
 return <><button type="button" className="secondary" aria-label={`${open ? "Fechar" : "Ver"} histórico: ${userName ?? "usuário"}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? "Fechar histórico" : "Ver histórico"}</button>
  <div id={id} hidden={!open}>{open && <>
   {resource.loading && <AsyncSkeleton label="Carregando histórico…" />}
   {resource.error && <p role="alert">Não foi possível carregar o histórico. <button type="button" className="secondary" onClick={resource.retry}>Tentar novamente</button></p>}
   {!resource.loading && !resource.error && <div className={styles.userChanges}>{rows.map(d => <DecisionChange key={d.id} decision={d} />)}{!rows.length && <p>Nenhuma alteração nesta página.</p>}</div>}
   <HistoryPagination page={state.page} pageCount={Math.max(1,Math.ceil(total/20))} total={total} first={rows.length ? (state.page-1)*20+1 : 0} last={Math.min(state.page*20,total)}
    status={resource.loading ? "loading" : "ready"} onPageChange={page => setState({ ...state, page })} label="Páginas de alterações do usuário" unit="alterações" />
  </>}</div></>;
}
const decisionProfiles = (decision: AccessDecision) => [...new Set(decision.perfis?.length ? decision.perfis : [decision.perfil])];

const profileLabelFor = (decision: AccessDecision, profile: AccessProfile) => profile === "ADMINISTRATIVO" && decision.atuacao_administrativa
  ? administrativeLabels[decision.atuacao_administrativa]
  : profileLabels[profile];

function DecisionChange({ decision }: { decision: AccessDecision }) {
  const actor = decision.actor_snapshot;
  const bootstrap = decision.decision_type === "BOOTSTRAP";
  const initialAdjustment = decision.decision_type === "AJUSTE_PERFIS_INICIAL";
  const engineeringAdjustment = decision.decision_type === "AJUSTE_ATUACAO_INICIAL";
  const generalAccessAdjustment = decision.decision_type === "AJUSTE_ACESSOS_GERAIS";
  const operatorDecision = bootstrap || initialAdjustment || engineeringAdjustment || generalAccessAdjustment;
  const profiles = decisionProfiles(decision);
  const profileNames = profiles.map((profile) => profileLabelFor(decision, profile)).join(" / ");
  const works = [...new Set(decision.grants_snapshot.map((grant) => grant.obra_nome).filter((name): name is string => Boolean(name)))];
  const worksSuffix = works.length > 0 ? `: ${works.join(", ")}` : "";
  const editSummary = () => {
    const before = decision.before_access_snapshot;
    const after = decision.request_snapshot.access_edit;
    if (!before || !after) return "Perfil e acessos atualizados";
    const changes: string[] = [];
    if (before.account.ativo !== after.ativo) changes.push(`Status alterado para ${after.ativo ? "Ativo" : "Inativo"}`);
    if (before.account.perfis.join("/") !== after.perfis.join("/")) changes.push("Perfis alterados");
    if ((before.account.atuacao_administrativa ?? null) !== after.atuacao_administrativa) changes.push("Tipo de Administrativo alterado");
    if ((before.account.atuacoes_engenharia ?? []).join("/") !== after.atuacoes_engenharia.join("/")) changes.push("Atuação de Engenharia alterada");
    const grantKey = (grant: { perfil?: AccessProfile; obra_id: string; modulo: string }) => `${grant.perfil ?? decision.perfil}/${grant.obra_id}/${grant.modulo}`;
    const beforeGrants = before.grants.map(grantKey).sort().join("|");
    const afterGrants = decision.grants_snapshot.map(grantKey).sort().join("|");
    if (beforeGrants !== afterGrants) changes.push("Obras e acessos atualizados");
    return changes.join(" · ") || "Informações do usuário revisadas";
  };
  const changeLabel = bootstrap ? "Conta administrativa ativada"
    : initialAdjustment ? `Perfis alterados: ${profileNames}`
    : engineeringAdjustment ? "Atuação de Engenharia alterada"
    : generalAccessAdjustment ? "Ampliação dos acessos gerais"
    : decision.decision_type === "VINCULO_OBRA" ? `Obra adicionada${worksSuffix}`
    : decision.decision_type === "DESVINCULO_OBRA" ? `Obra removida${worksSuffix}`
    : decision.decision_type === "EDICAO_USUARIO" ? editSummary()
    : `Solicitação aprovada: ${profileNames}`;
  const actorName = operatorDecision
    ? actor.database_session_user || decision.actor_database_role || "Operador autorizado"
    : platformDisplayName(actor.email, actor.nome || decision.actor_auth_user_id || "Responsável não registrado");
  return <article className={styles.userChange}>
    <strong>{changeLabel}</strong>
    <span>Por {actorName}</span>
    <time dateTime={decision.decided_at}>{date(decision.decided_at)}</time>
  </article>;
}

