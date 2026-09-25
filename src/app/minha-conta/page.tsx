import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, effectiveAccount, ownAccessRequest } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "../components/auth/AuthShell";
import { LogoutButton } from "../components/auth/LogoutButton";
import { administrativeLabels, engineeringLabels, profileLabels, type HistoricalGrant } from "@/lib/access/contracts";
import accessStyles from "../administracao/usuarios/access.module.css";
import styles from "../components/auth/auth.module.css";
import { platformDisplayName } from "@/lib/auth/display-name";

export default async function MyAccountPage() {
  const user = await requireUser();
  const account = await effectiveAccount(user);
  if (!account) redirect("/aguardando-liberacao");
  const request = await ownAccessRequest(user.id);
  const client = await createClient();
  const grants = await client.from("access_grants").select("perfil,obra_id,modulo,access_works(nome)").eq("auth_user_id", user.id).order("perfil").order("obra_id").order("modulo");
  const scopedGrants: HistoricalGrant[] = (grants.data || []).map((grant) => {
    const work = grant.access_works as unknown as { nome: string } | null;
    return { perfil: grant.perfil, obra_id: grant.obra_id, modulo: grant.modulo, obra_nome: work?.nome ?? "Obra indisponível" };
  }).sort((a, b) => a.obra_nome!.localeCompare(b.obra_nome!, "pt-BR"));
  const authorizedWorks = [...new Map(scopedGrants.map((grant) => [grant.obra_id, grant.obra_nome ?? grant.obra_id])).entries()];
  return (
    <AuthShell title="Meu Perfil">
      <dl className={styles.accountDetails}>
        <dt>Nome</dt><dd>{platformDisplayName(user.email, request?.nome ?? "—")}</dd>
        <dt>E-mail</dt><dd>{user.email}</dd>
        <dt>Perfis</dt><dd>{account.perfis.map((profile) => profileLabels[profile]).join("; ")}</dd>
        {account.atuacao_administrativa && <><dt>Atuação administrativa</dt><dd>{administrativeLabels[account.atuacao_administrativa]}</dd></>}
        {account.atuacoes_engenharia.length > 0 && <><dt>Engenharia</dt><dd>{account.atuacoes_engenharia.map((scope) => engineeringLabels[scope]).join("; ")}</dd></>}
      </dl>
      {grants.error ? <p role="status" className={styles.error}>Não foi possível consultar as permissões. Tente novamente mais tarde.</p> :
        <div className={accessStyles.history}><details className={accessStyles.historyCard}>
          <summary><strong>Obras</strong></summary>
          <div className={accessStyles.historyBody}>{authorizedWorks.length > 0
            ? <ul className={accessStyles.profileWorkList}>{authorizedWorks.map(([id, name]) => <li key={id}>{name}</li>)}</ul>
            : <p className={styles.notice}>Nenhuma obra autorizada.</p>}</div>
      </details></div>}
      <div className={styles.accountActions}>
        <Link className={styles.accountBackButton} href="/escolher-perfil" aria-label="Voltar à seleção de perfis" title="Voltar à seleção de perfis">
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12H4m7-7-7 7 7 7" /></svg>
        </Link>
        <LogoutButton />
      </div>
    </AuthShell>
  );
}
