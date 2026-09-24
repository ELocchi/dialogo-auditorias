import Link from "next/link";
import { cache } from "react";
import { requireAdministrator } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { administrativeLabels, engineeringLabels, profileLabels, type AccessDecision, type AccessWork, type PendingRequest } from "@/lib/access/contracts";
import { PendingRequests } from "@/app/components/access/PendingRequests";
import { AccessGrants } from "@/app/components/access/AccessGrants";
import styles from "@/app/administracao/usuarios/access.module.css";

const pageSize = 20;
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));

const loadAdministration = cache(async (pendingPage: number, historyPage: number) => {
  try {
    const client = await createClient();
    const [requests, works, decisions, accounts, scopeHistory] = await Promise.all([
      client.from("access_requests")
        .select("auth_user_id,nome,email,cargo_area_informado,obra_referencia_informada,email_confirmado_em,created_at", { count: "exact" })
        .eq("status_acesso", "PENDENTE_APROVACAO").not("email_confirmado_em", "is", null)
        .order("created_at", { ascending: true }).order("auth_user_id", { ascending: true })
        .range((pendingPage - 1) * pageSize, pendingPage * pageSize - 1),
      client.from("access_works").select("id,nome,ativo").eq("ativo", true).order("nome", { ascending: true }).limit(1000),
      client.from("access_decisions")
        .select("id,auth_user_id,decision_type,perfil,perfis,atuacao_engenharia,atuacoes_engenharia,request_snapshot,grants_snapshot,before_access_snapshot,actor_snapshot,reason,actor_auth_user_id,actor_database_role,decided_at", { count: "exact" })
        .order("decided_at", { ascending: false }).order("id", { ascending: false })
        .range((historyPage - 1) * pageSize, historyPage * pageSize - 1),
      client.from("access_accounts").select("auth_user_id", { count: "exact", head: true }).eq("ativo", true),
      client.rpc("read_administrative_scope_history"),
    ]);
    if (requests.error || works.error || decisions.error || accounts.error || !requests.data || !works.data || !decisions.data
      || requests.count === null || decisions.count === null || accounts.count === null) return null;
    if (scopeHistory.error && !["42883", "PGRST202"].includes(scopeHistory.error.code ?? "")) return null;
    const scopes = scopeHistory.data && typeof scopeHistory.data === "object" && !Array.isArray(scopeHistory.data)
      ? scopeHistory.data as Record<string, unknown> : {};
    return {
      requests: requests.data as PendingRequest[], works: works.data as AccessWork[],
      decisions: (decisions.data as AccessDecision[]).map((decision) => ({ ...decision,
        atuacao_administrativa: ["SEGURANCA", "QUALIDADE", "GERAL"].includes(String(scopes[decision.id]))
          ? scopes[decision.id] as AccessDecision["atuacao_administrativa"] : null })), pendingCount: requests.count,
      historyCount: decisions.count, activeCount: accounts.count,
    };
  } catch { return null; }
});

export async function AccessAdministration({ embedded = false, pendingPage = 1, historyPage = 1, pendingOnly = false }: { embedded?: boolean; pendingPage?: number; historyPage?: number; pendingOnly?: boolean }) {
  const user = await requireAdministrator();
  const data = await loadAdministration(pendingPage, historyPage);
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
      {!pendingOnly && <div className={styles.intro}>
        {!embedded && <p className={styles.eyebrow}>Administração</p>}
        <h2>Usuários e acessos</h2>
      </div>}
      {!data ? <div className={styles.error} role="alert"><p>Não foi possível carregar a administração com segurança. Nenhuma aprovação pode ser enviada nesta tela até a consulta ser restabelecida.</p><Link href={embedded ? "/app?secao=administracao" : "/administracao/usuarios"}>Tentar carregar novamente</Link></div> : <>
        {pendingOnly ? <section id="pending-heading" className={styles.section} aria-label="Solicitações prontas para análise">
          <PendingRequests requests={previewRequest ? [...data.requests, previewRequest] : data.requests} works={data.works} actorId={user.id} previewIds={previewRequest ? [previewRequest.auth_user_id] : []} />
          <Pagination current={pendingPage} total={data.pendingCount + (previewRequest ? 1 : 0)} kind="pendentes" other={historyPage} embedded={false} base="/administracao/usuarios/pendentes?" />
        </section> : <>
        <div className={styles.stats}>
          <Link className={`${styles.stat} ${styles.statLink}`} href="/administracao/usuarios/pendentes" target="_blank" rel="noopener noreferrer" aria-label={`${data.pendingCount + (previewRequest ? 1 : 0)} solicitações prontas para análise. Abrir aprovações pendentes em uma nova janela.`}><strong>{data.pendingCount + (previewRequest ? 1 : 0)}</strong><span>Solicitações prontas para análise</span></Link>
          <div className={styles.stat}><strong>{data.activeCount}</strong><span>Contas com aprovação ativa</span></div>
        </div>
        <section className={styles.section} aria-labelledby="history-heading">
          <div className={styles.sectionHeading}><h2 id="history-heading">Aprovações e histórico</h2><p>Horários de Brasília</p></div>
          <p className={styles.help}>Cada registro preserva o cadastro analisado, o responsável, o motivo e os acessos concedidos no momento da decisão.</p>
          {data.decisions.length === 0 && <p className={styles.empty}>Nenhuma decisão registrada nesta página.</p>}
          <div className={styles.history}>{data.decisions.map((decision) => <DecisionCard key={decision.id} decision={decision} />)}</div>
          <Pagination current={historyPage} total={data.historyCount} kind="historico" other={pendingPage} embedded={embedded} />
        </section>
        </>}
      </>}
      {!embedded && !pendingOnly && <p className={styles.footer}>Esta área registra autorizações. A prévia das telas operacionais está disponível no painel do perfil escolhido.</p>}
  </div>;
}

function DecisionCard({ decision }: { decision: AccessDecision }) {
  const snapshot = decision.request_snapshot;
  const actor = decision.actor_snapshot;
  const bootstrap = decision.decision_type === "BOOTSTRAP";
  const initialAdjustment = decision.decision_type === "AJUSTE_PERFIS_INICIAL";
  const engineeringAdjustment = decision.decision_type === "AJUSTE_ATUACAO_INICIAL";
  const generalAccessAdjustment = decision.decision_type === "AJUSTE_ACESSOS_GERAIS";
  const operatorDecision = bootstrap || initialAdjustment || engineeringAdjustment || generalAccessAdjustment;
  const engineeringScopes = decision.atuacoes_engenharia ?? (decision.atuacao_engenharia ? [decision.atuacao_engenharia] : []);
  const profiles = decision.perfis || [decision.perfil];
  const before = decision.before_access_snapshot;
  return <details className={styles.historyCard}>
    <summary><strong>{snapshot.nome || snapshot.email || decision.auth_user_id}</strong> · {profiles.map((profile) => profile === "ADMINISTRATIVO" && decision.atuacao_administrativa ? administrativeLabels[decision.atuacao_administrativa] : profileLabels[profile]).join(" · ")}
      <span>{bootstrap ? "Ativação inicial controlada" : initialAdjustment ? "Ampliação controlada dos perfis da conta inicial" : engineeringAdjustment ? "Inclusão de Engenharia — Equipe da obra" : generalAccessAdjustment ? "Ampliação dos acessos gerais" : decision.decision_type === "VINCULO_OBRA" ? "Vínculo à equipe da obra" : decision.decision_type === "DESVINCULO_OBRA" ? "Desvínculo da equipe da obra" : "Solicitação aprovada"} em {date(decision.decided_at)}</span>
    </summary>
    <div className={styles.historyBody}>
      <dl className={styles.details}>
        <div><dt>E-mail no momento da decisão</dt><dd>{snapshot.email || "Não registrado"}</dd></div>
        <div><dt>Responsável pela decisão</dt><dd>{operatorDecision ? `Operador do banco: ${actor.database_session_user || decision.actor_database_role || "Operador autorizado"}` : actor.nome || actor.email || decision.actor_auth_user_id}{!operatorDecision && actor.nome && actor.email && <span className={styles.email}>{actor.email}</span>}</dd></div>
        <div><dt>Perfis concedidos</dt><dd>{profiles.map((profile) => `${profile === "ADMINISTRATIVO" && decision.atuacao_administrativa ? administrativeLabels[decision.atuacao_administrativa] : profileLabels[profile]}${profile === "ENGENHARIA" ? ` · ${engineeringScopes.map((scope) => engineeringLabels[scope]).join("; ")}` : ""}`).join("; ")}</dd></div>
        <div><dt>Data da decisão</dt><dd>{date(decision.decided_at)}</dd></div>
        <div><dt>Cargo ou área declarada</dt><dd>{snapshot.cargo_area_informado || "Não informado"}</dd></div>
        <div><dt>Obra de referência declarada</dt><dd>{snapshot.obra_referencia_informada || "Não informada"}</dd></div>
        {snapshot.created_at && <div><dt>Data original da solicitação</dt><dd>{date(snapshot.created_at)}</dd></div>}
        <div><dt>Status anterior à decisão</dt><dd>{snapshot.status_acesso === "PENDENTE_APROVACAO" ? "Pendente de aprovação" : snapshot.status_acesso || "Não registrado"}</dd></div>
      </dl>
      {before && <div className={styles.note}>
        <h3>Acessos anteriores à ampliação</h3>
        <p>{before.account.perfis.map((profile) => `${profileLabels[profile]}${profile === "ENGENHARIA" && before.account.atuacao_engenharia ? ` · ${engineeringLabels[before.account.atuacao_engenharia]}` : ""}`).join("; ")}</p>
        {before.grants.length > 0 ? <AccessGrants grants={before.grants} legacyProfile={before.account.perfil} /> : <p>Sem concessões a módulos de obras.</p>}
      </div>}
      <h3>{decision.decision_type === "DESVINCULO_OBRA" ? "Acessos revogados com o vínculo" : "Obras e módulos concedidos"}</h3>
      {decision.grants_snapshot.length > 0 ? <AccessGrants grants={decision.grants_snapshot} legacyProfile={decision.perfil} /> : <p className={styles.help}>{decision.decision_type === "VINCULO_OBRA" || decision.decision_type === "DESVINCULO_OBRA" ? "Nenhuma permissão adicional foi alterada neste vínculo." : "Gestão de usuários e acessos, sem concessões operacionais a obras."}</p>}
      <h3>Motivo registrado</h3><p className={styles.reason}>{decision.reason}</p>
      <p className={styles.trace}>Registro: {decision.id} · Conta: {decision.auth_user_id}{decision.actor_auth_user_id && ` · Responsável: ${decision.actor_auth_user_id}`}</p>
    </div>
  </details>;
}

function Pagination({ current, total, kind, other, embedded, base: explicitBase }: { current: number; total: number; kind: "pendentes" | "historico"; other: number; embedded: boolean; base?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1 && current === 1) return null;
  const base = explicitBase ?? (embedded ? "/app?secao=administracao&" : "/administracao/usuarios?");
  const href = (page: number) => kind === "pendentes" ? `${base}pendentes=${page}&historico=${other}#pending-heading` : `${base}pendentes=${other}&historico=${page}#history-heading`;
  return <nav className={styles.pagination} aria-label={kind === "pendentes" ? "Páginas de solicitações" : "Páginas do histórico"}>
    {current > 1 && <Link href={href(Math.min(current - 1, pages))}>Anterior</Link>}
    <span>Página {current} de {pages} · {total} registros</span>
    {current < pages && <Link href={href(current + 1)}>Próxima</Link>}
  </nav>;
}
