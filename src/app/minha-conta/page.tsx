import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, effectiveAccount, ownAccessRequest } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { readActiveProfile } from "@/lib/auth/active-profile-session";
import { AuthShell } from "../components/auth/AuthShell";
import { LogoutButton } from "../components/auth/LogoutButton";
import { AccessGrants } from "../components/access/AccessGrants";
import { engineeringLabels, profileLabels, type HistoricalGrant } from "@/lib/access/contracts";
import accessStyles from "../administracao/usuarios/access.module.css";
import styles from "../components/auth/auth.module.css";

export default async function MyAccountPage() {
  const user = await requireUser();
  const account = await effectiveAccount(user);
  if (!account) redirect("/aguardando-liberacao");
  const activeProfile = await readActiveProfile(user.id, account);
  const request = await ownAccessRequest(user.id);
  const client = await createClient();
  const grants = await client.from("access_grants").select("perfil,obra_id,modulo,access_works(nome)").eq("auth_user_id", user.id).order("perfil").order("obra_id").order("modulo");
  const scopedGrants: HistoricalGrant[] = (grants.data || []).map((grant) => {
    const work = grant.access_works as unknown as { nome: string } | null;
    return { perfil: grant.perfil, obra_id: grant.obra_id, modulo: grant.modulo, obra_nome: work?.nome ?? "Obra indisponível" };
  }).sort((a, b) => a.obra_nome!.localeCompare(b.obra_nome!, "pt-BR"));
  return (
    <AuthShell title="Meus acessos" description="Confira os perfis da sua conta e as obras e os módulos autorizados para cada um.">
      <dl className={styles.accountDetails}>
        <dt>Nome</dt><dd>{request?.nome ?? "—"}</dd>
        <dt>E-mail</dt><dd>{user.email}</dd>
        <dt>Perfis</dt><dd>{account.perfis.map((profile) => profileLabels[profile]).join("; ")}</dd>
        {account.atuacoes_engenharia.length > 0 && <><dt>Engenharia</dt><dd>{account.atuacoes_engenharia.map((scope) => engineeringLabels[scope]).join("; ")}</dd></>}
      </dl>
      <p><Link href="/app">Abrir painel</Link> · <Link href="/escolher-perfil">Trocar perfil</Link></p>
      {activeProfile === "ADMINISTRATIVO" && <p><Link href="/administracao/usuarios">Administração → Usuários e acessos</Link></p>}
      {grants.error ? <p role="status" className={styles.error}>Não foi possível consultar as permissões. Tente novamente mais tarde.</p> :
        <div className={accessStyles.history}>{account.perfis.filter((profile) => profile !== "ADMINISTRATIVO").map((profile) => {
          const profileGrants = scopedGrants.filter((grant) => grant.perfil === profile);
          const workCount = new Set(profileGrants.map((grant) => grant.obra_id)).size;
          return <details key={profile} className={accessStyles.historyCard}>
            <summary><strong>{profileLabels[profile]}{profile === "ENGENHARIA" ? ` · ${account.atuacoes_engenharia.map((scope) => engineeringLabels[scope]).join("; ")}` : ""}</strong><span>{workCount} {workCount === 1 ? "obra autorizada" : "obras autorizadas"} · Ver obras e módulos</span></summary>
            <div className={accessStyles.historyBody}>{profileGrants.length > 0 ? <AccessGrants grants={profileGrants} /> : <p className={styles.notice}>Nenhum acesso a módulos de obras foi concedido para este perfil.</p>}</div>
          </details>;
        })}</div>}
      <p className={styles.description}>Escolha um perfil para abrir suas telas. Os preenchimentos de teste do painel ainda são temporários.</p>
      <LogoutButton />
    </AuthShell>
  );
}

