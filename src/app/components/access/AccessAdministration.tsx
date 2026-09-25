import Link from "next/link";
import { cache } from "react";
import { requireAdministrator } from "@/lib/auth/session";
import { platformDisplayName } from "@/lib/auth/display-name";
import { createClient } from "@/lib/supabase/server";
import { administrativeLabels, profileLabels, type AccessDecision, type AccessGrant, type AccessProfile, type AccessWork, type EditableAccessAccount, type PendingRequest } from "@/lib/access/contracts";
import { PendingRequests } from "@/app/components/access/PendingRequests";
import { EditUserDialog } from "@/app/components/access/EditUserDialog";
import styles from "@/app/administracao/usuarios/access.module.css";

const pageSize = 20;
const decisionColumns = "id,auth_user_id,decision_type,perfil,perfis,atuacao_engenharia,atuacoes_engenharia,request_snapshot,grants_snapshot,before_access_snapshot,actor_snapshot,reason,actor_auth_user_id,actor_database_role,decided_at";
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));

const loadAdministration = cache(async (pendingPage: number) => {
  try {
    const client = await createClient();
    const [requests, works, decisions, accounts, activeAccounts, grants, scopeHistory] = await Promise.all([
      client.from("access_requests")
        .select("auth_user_id,nome,email,cargo_area_informado,obra_referencia_informada,email_confirmado_em,created_at", { count: "exact" })
        .eq("status_acesso", "PENDENTE_APROVACAO").not("email_confirmado_em", "is", null)
        .order("created_at", { ascending: true }).order("auth_user_id", { ascending: true })
        .range((pendingPage - 1) * pageSize, pendingPage * pageSize - 1),
      client.from("access_works").select("id,nome,ativo").eq("ativo", true).order("nome", { ascending: true }).limit(1000),
      client.from("access_decisions")
        .select(decisionColumns, { count: "exact" })
        .order("decided_at", { ascending: false }).order("id", { ascending: false })
        .range(0, 999),
      client.from("access_accounts").select("auth_user_id,perfis,atuacao_engenharia,atuacoes_engenharia,atuacao_administrativa,ativo").order("approved_at", { ascending: false }).limit(1000),
      client.from("access_accounts").select("auth_user_id", { count: "exact", head: true }).eq("ativo", true),
      client.from("access_grants").select("auth_user_id,perfil,obra_id,modulo").limit(10000),
      client.rpc("read_administrative_scope_history"),
    ]);
    if (requests.error || works.error || decisions.error || accounts.error || activeAccounts.error || grants.error || !requests.data || !works.data || !decisions.data || !accounts.data || !grants.data
      || requests.count === null || decisions.count === null || activeAccounts.count === null) return null;
    if (scopeHistory.error && !["42883", "PGRST202"].includes(scopeHistory.error.code ?? "")) return null;
    let decisionRows = decisions.data;
    while (decisionRows.length < decisions.count) {
      const next = await client.from("access_decisions").select(decisionColumns)
        .order("decided_at", { ascending: false }).order("id", { ascending: false })
        .range(decisionRows.length, Math.min(decisionRows.length + 999, decisions.count - 1));
      if (next.error || !next.data?.length) return null;
      decisionRows = [...decisionRows, ...next.data];
    }
    const scopes = scopeHistory.data && typeof scopeHistory.data === "object" && !Array.isArray(scopeHistory.data)
      ? scopeHistory.data as Record<string, unknown> : {};
    return {
      requests: requests.data as PendingRequest[], works: works.data as AccessWork[],
      decisions: (decisionRows as AccessDecision[]).map((decision) => ({ ...decision,
        atuacao_administrativa: ["SEGURANCA", "QUALIDADE", "GERAL"].includes(String(scopes[decision.id]))
          ? scopes[decision.id] as AccessDecision["atuacao_administrativa"] : null })), pendingCount: requests.count,
      accounts: accounts.data as EditableAccessAccount[],
      currentGrants: grants.data as (AccessGrant & { auth_user_id: string })[],
      activeCount: activeAccounts.count,
    };
  } catch { return null; }
});

export async function AccessAdministration({ embedded = false, pendingPage = 1, historyPage = 1, pendingOnly = false, historyOnly = false }: { embedded?: boolean; pendingPage?: number; historyPage?: number; pendingOnly?: boolean; historyOnly?: boolean }) {
  const user = await requireAdministrator();
  const data = await loadAdministration(pendingPage);
  const previewRequest: PendingRequest | null = process.env.NODE_ENV !== "production" && pendingPage === 1 ? {
    auth_user_id: "00000000-0000-4000-8000-000000000903",
    nome: "Mariana Souza · Exemplo LAN",
    email: "mariana.souza.exemplo@dialogo.com.br",
    cargo_area_informado: "Engenheira de Qualidade",
    obra_referencia_informada: "Alameda Tatuapé",
    email_confirmado_em: "2026-09-24T15:48:00-03:00",
    created_at: "2026-09-24T15:35:00-03:00",
  } : null;
  return <div className={embedded ? styles.embedded : undefined}>
      {!pendingOnly && !historyOnly && <div className={styles.intro}>
        {!embedded && <p className={styles.eyebrow}>Administração</p>}
        <h2>Usuários e acessos</h2>
      </div>}
      {!data ? <div className={styles.error} role="alert"><p>Não foi possível carregar a administração com segurança. Nenhuma aprovação pode ser enviada nesta tela até a consulta ser restabelecida.</p><Link href={embedded ? "/app?secao=administracao" : "/administracao/usuarios"}>Tentar carregar novamente</Link></div> : <>
        {pendingOnly ? <section id="pending-heading" className={styles.section} aria-label="Solicitações prontas para análise">
          <PendingRequests requests={previewRequest ? [...data.requests, previewRequest] : data.requests} works={data.works} actorId={user.id} previewIds={previewRequest ? [previewRequest.auth_user_id] : []} />
          <Pagination current={pendingPage} total={data.pendingCount + (previewRequest ? 1 : 0)} kind="pendentes" other={historyPage} embedded={false} base="/administracao/usuarios/pendentes?" />
        </section> : historyOnly ? <HistorySection data={data} historyPage={historyPage} actorId={user.id} /> : <>
        <div className={styles.stats}>
          <Link className={`${styles.stat} ${styles.statLink}`} href="/administracao/usuarios/pendentes" target="_blank" rel="noopener noreferrer" aria-label={`${data.pendingCount + (previewRequest ? 1 : 0)} aprovações pendentes. Abrir em uma nova janela.`}><strong>{data.pendingCount + (previewRequest ? 1 : 0)}</strong><span>Aprovações</span></Link>
          <Link className={`${styles.stat} ${styles.statLink}`} href="/administracao/usuarios/historico" aria-label={`${data.activeCount} contas ativas. Abrir Aprovações e Histórico.`}><strong>{data.activeCount}</strong><span>Contas Ativas</span></Link>
        </div>
        </>}
      </>}
      {!embedded && !pendingOnly && !historyOnly && <p className={styles.footer}>Esta área registra autorizações. A prévia das telas operacionais está disponível no painel do perfil escolhido.</p>}
  </div>;
}

function HistorySection({ data, historyPage, actorId }: { data: NonNullable<Awaited<ReturnType<typeof loadAdministration>>>; historyPage: number; actorId: string }) {
  const allUserHistories = groupUserHistories(data.decisions, data.accounts);
  const userHistories = allUserHistories.slice((historyPage - 1) * pageSize, historyPage * pageSize);
  const workNames = new Map(data.works.map((work) => [work.id, work.nome]));
  return <section id="history-heading" className={`${styles.section} ${styles.standaloneSection}`} aria-label="Aprovações e histórico">
    {userHistories.length === 0 && <p className={styles.empty}>Nenhum perfil aprovado nesta página.</p>}
    <div className={styles.history}>{userHistories.map(({ account, decisions }) =>
      <UserProfileCard key={account.auth_user_id} account={account} decisions={decisions}
        grants={data.currentGrants.filter((grant) => grant.auth_user_id === account.auth_user_id)} works={data.works} workNames={workNames} actorId={actorId} />
    )}</div>
    <Pagination current={historyPage} total={allUserHistories.length} kind="historico" other={1} embedded={false} base="/administracao/usuarios/historico?" />
  </section>;
}

const decisionProfiles = (decision: AccessDecision) => [...new Set(decision.perfis?.length ? decision.perfis : [decision.perfil])];

function groupUserHistories(decisions: AccessDecision[], accounts: EditableAccessAccount[]) {
  const groups = new Map(accounts.map((account) => [account.auth_user_id, { account, decisions: [] as AccessDecision[] }]));
  for (const decision of decisions) {
    groups.get(decision.auth_user_id)?.decisions.push(decision);
  }
  return [...groups.values()].sort((left, right) => {
    const leftDate = left.decisions[0]?.decided_at ?? "";
    const rightDate = right.decisions[0]?.decided_at ?? "";
    return rightDate.localeCompare(leftDate);
  });
}

const profileLabelFor = (decision: AccessDecision, profile: AccessProfile) => profile === "ADMINISTRATIVO" && decision.atuacao_administrativa
  ? administrativeLabels[decision.atuacao_administrativa]
  : profileLabels[profile];

function UserProfileCard({ account, decisions, grants, works: availableWorks, workNames, actorId }: {
  account: EditableAccessAccount;
  decisions: AccessDecision[];
  grants: (AccessGrant & { auth_user_id: string })[];
  works: AccessWork[];
  workNames: Map<string, string>;
  actorId: string;
}) {
  const latest = decisions[0];
  const snapshot = latest?.request_snapshot ?? {};
  const profiles = account.perfis.map((profile) => profile === "ADMINISTRATIVO" && account.atuacao_administrativa
    ? administrativeLabels[account.atuacao_administrativa]
    : profileLabels[profile]);
  const works = [...new Set(grants.map((grant) => workNames.get(grant.obra_id)).filter((name): name is string => Boolean(name)))];
  return <details className={styles.historyCard}>
    <summary><strong>{platformDisplayName(snapshot.email, snapshot.nome || account.auth_user_id)}</strong></summary>
    <div className={styles.historyBody}>
      <EditUserDialog account={account} grants={grants} works={availableWorks} actorId={actorId}
        name={platformDisplayName(snapshot.email, snapshot.nome || account.auth_user_id)} email={snapshot.email || "Não registrado"} />
      <dl className={styles.profileDetails}>
        <div className={styles.profileEmail}><dt>E-mail</dt><dd>{snapshot.email || "Não registrado"}</dd></div>
        <div className={styles.profileStatus}><dt>Status do perfil</dt><dd className={account.ativo ? styles.activeStatus : styles.inactiveStatus}>{account.ativo ? "Ativo" : "Inativo"}</dd></div>
        <div><dt>Perfil</dt><dd>{profiles.join(" / ")}</dd></div>
        <div><dt>Cargo</dt><dd>{snapshot.cargo_area_informado || "Não informado"}</dd></div>
        <div><dt>Obras</dt><dd>{works.length > 0 ? <span className={styles.profileWorkList}>{works.map((work) => <span key={work}>{work}</span>)}</span> : "Nenhuma obra liberada"}</dd></div>
      </dl>
      <h3 className={styles.userChangesTitle}>Histórico</h3>
      <div className={styles.userChanges}>{decisions.map((decision) =>
        <DecisionChange key={decision.id} decision={decision} />
      )}</div>
    </div>
  </details>;
}

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

function Pagination({ current, total, kind, other, embedded, base: explicitBase }: { current: number; total: number; kind: "pendentes" | "historico"; other: number; embedded: boolean; base?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1 && current === 1) return null;
  const base = explicitBase ?? (embedded ? "/app?secao=administracao&" : "/administracao/usuarios?");
  const href = (page: number) => explicitBase
    ? `${base}${kind}=${page}#${kind === "pendentes" ? "pending-heading" : "history-heading"}`
    : kind === "pendentes" ? `${base}pendentes=${page}&historico=${other}#pending-heading` : `${base}pendentes=${other}&historico=${page}#history-heading`;
  return <nav className={styles.pagination} aria-label={kind === "pendentes" ? "Páginas de solicitações" : "Páginas do histórico"}>
    {current > 1 && <Link href={href(Math.min(current - 1, pages))}>Anterior</Link>}
    <span>Página {current} de {pages} · {total} registros</span>
    {current < pages && <Link href={href(current + 1)}>Próxima</Link>}
  </nav>;
}
