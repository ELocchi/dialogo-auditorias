import Link from "next/link";
import { AccessDecisionHistory } from "./AccessDecisionHistory";
import { cache } from "react";
import { requireAdministrator } from "@/lib/auth/session";
import { platformDisplayName } from "@/lib/auth/display-name";
import { createClient } from "@/lib/supabase/server";
import { readAdministration, type AdministrationHistoryPage, type AdministrationView } from "@/lib/access/administration-service";
import { administrativeLabels, profileLabels, type AccessDecision, type AccessGrant, type AccessWork, type EditableAccessAccount, type PendingRequest } from "@/lib/access/contracts";
import { PendingRequests } from "@/app/components/access/PendingRequests";
import { EditUserDialog } from "@/app/components/access/EditUserDialog";
import styles from "@/app/administracao/usuarios/access.module.css";

const pageSize = 20;

// React cache is scoped to this server render; each request rechecks database access.
const loadAdministration = cache(async (view: AdministrationView, page: number) => {
  try {
    return await readAdministration(await createClient(), view, page);
  } catch { return null; }
});

export async function AccessAdministration({ embedded = false, pendingPage = 1, historyPage = 1, pendingOnly = false, historyOnly = false }: { embedded?: boolean; pendingPage?: number; historyPage?: number; pendingOnly?: boolean; historyOnly?: boolean }) {
  const user = await requireAdministrator();
  const view = pendingOnly ? "pending" : historyOnly ? "history" : "summary";
  const data = await loadAdministration(view, view === "history" ? historyPage : pendingPage);
  const retryHref = view === "pending" ? `/administracao/usuarios/pendentes?pendentes=${pendingPage}`
    : view === "history" ? `/administracao/usuarios/historico?historico=${historyPage}`
    : embedded ? "/app?secao=administracao" : "/administracao/usuarios";
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
      {!data ? <div className={styles.error} role="alert"><p>Não foi possível carregar a administração com segurança. Nenhuma aprovação pode ser enviada nesta tela até a consulta ser restabelecida.</p><Link href={retryHref}>Tentar carregar novamente</Link></div> : <>
        {data.view === "pending" ? <section id="pending-heading" className={styles.section} aria-label="Solicitações prontas para análise">
          <PendingRequests requests={previewRequest ? [...data.requests, previewRequest] : data.requests} works={data.works} actorId={user.id} previewIds={previewRequest ? [previewRequest.auth_user_id] : []} />
          <Pagination current={pendingPage} total={data.total + (previewRequest ? 1 : 0)} kind="pendentes" other={historyPage} embedded={false} base="/administracao/usuarios/pendentes?" />
        </section> : data.view === "history" ? <HistorySection data={data} historyPage={historyPage} actorId={user.id} /> : <>
        <div className={styles.stats}>
          <Link data-tooltip="Ver aprovações" className={`${styles.stat} ${styles.statLink}`} href="/administracao/usuarios/pendentes" aria-label={`Aprovações: ${data.pendingCount + (previewRequest ? 1 : 0)} pendentes`}><strong>{data.pendingCount + (previewRequest ? 1 : 0)}</strong><span>Aprovações</span></Link>
          <Link data-tooltip="Ver contas" className={`${styles.stat} ${styles.statLink}`} href="/administracao/usuarios/historico" aria-label={`Contas ativas: ${data.activeCount}`}><strong>{data.activeCount}</strong><span>Contas Ativas</span></Link>
        </div>
        </>}
      </>}
      {!embedded && !pendingOnly && !historyOnly && <p className={styles.footer}>Esta área registra autorizações. A prévia das telas operacionais está disponível no painel do perfil escolhido.</p>}
  </div>;
}

function HistorySection({ data, historyPage, actorId }: { data: AdministrationHistoryPage; historyPage: number; actorId: string }) {
  const workNames = new Map(data.works.map((work) => [work.id, work.nome]));
  return <section id="history-heading" className={`${styles.section} ${styles.standaloneSection}`} aria-label="Aprovações e histórico">
    {data.users.length === 0 && <p className={styles.empty}>Nenhum perfil aprovado nesta página.</p>}
    <div className={styles.history}>{data.users.map(({ account, decisions, grants }) =>
      <UserProfileCard key={account.auth_user_id} account={account} decisions={decisions}
        grants={grants} works={data.works} workNames={workNames} actorId={actorId} />
    )}</div>
    <Pagination current={historyPage} total={data.total} kind="historico" other={1} embedded={false} base="/administracao/usuarios/historico?" />
  </section>;
}

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
      <AccessDecisionHistory userId={account.auth_user_id} actorId={actorId} userName={platformDisplayName(snapshot.email, snapshot.nome || account.auth_user_id)} />
    </div>
  </details>;
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
