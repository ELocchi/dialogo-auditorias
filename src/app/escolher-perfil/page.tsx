import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, effectiveAccount } from "@/lib/auth/session";
import { profileLabels, engineeringLabels, type AccessProfile } from "@/lib/access/contracts";
import { readActiveProfileContext } from "@/lib/auth/active-profile-session";
import { getProfileContexts } from "@/lib/auth/active-profile";
import { LogoutButton } from "../components/auth/LogoutButton";
import { DialogoLogo } from "@/app/components/dialogo-logo";
import { selectProfileAction } from "./actions";
import styles from "./profile-selection.module.css";

const descriptions: Record<AccessProfile, string> = {
  ADMINISTRATIVO: "Administração, usuários e acessos, obras e acompanhamento geral.",
  AUDITOR_SEGURANCA: "Agenda, auditorias e acompanhamento de segurança nas obras autorizadas.",
  AUDITOR_QUALIDADE: "Agenda, auditorias e acompanhamento de qualidade nas obras autorizadas.",
  ENGENHARIA: "Acompanhamento das auditorias e das pendências das obras autorizadas.",
};

export default async function SelectProfilePage({ searchParams }: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await requireUser();
  const account = await effectiveAccount(user);
  if (!account) redirect("/aguardando-liberacao");
  const contexts = getProfileContexts(account);
  if (contexts.length === 1) redirect("/app");
  const current = await readActiveProfileContext(user.id, account);
  const params = await searchParams;

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#profile-content">Ir para o conteúdo</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}><DialogoLogo /></div>
          <div className={styles.session}><span>{user.email}</span><LogoutButton /></div>
        </div>
      </header>
      <main className={styles.main} id="profile-content" tabIndex={-1}>
        <p className={styles.eyebrow}>SEUS PERFIS DE ACESSO</p>
        <h1>Como deseja entrar?</h1>
        <p className={styles.description}>Escolha o perfil que deseja usar agora. Você poderá trocar de perfil durante a navegação.</p>
        {params.erro === "perfil" && <p className={styles.error} role="alert">Não foi possível selecionar esse perfil. Escolha uma das opções disponíveis abaixo.</p>}
        <div className={styles.grid}>
          {contexts.map(({ profile, engineeringScope }) => {
            const label = profile === "ENGENHARIA" && engineeringScope
              ? `${profileLabels[profile]} — ${engineeringLabels[engineeringScope]}`
              : profileLabels[profile];
            return <form action={selectProfileAction} key={`${profile}:${engineeringScope}`}>
              {engineeringScope && <input type="hidden" name="atuacao_engenharia" value={engineeringScope} />}
              <button className={styles.profile} name="perfil" value={profile} type="submit" aria-label={`Entrar como ${label}`}>
                <span className={styles.profileTop}><span className={styles.profileTag}>{profile === current?.profile && engineeringScope === current.engineeringScope ? "PERFIL ATUAL" : "DISPONÍVEL"}</span><span aria-hidden="true">↗</span></span>
                <strong>{label}</strong>
                <span className={styles.profileDescription}>{descriptions[profile]}</span>
                <span className={styles.enter}>Entrar com este perfil <span aria-hidden="true">→</span></span>
              </button>
            </form>;
          })}
        </div>
        <div className={styles.footerLinks}>
          <Link href="/minha-conta">Ver meus acessos</Link>
          {current && <Link href="/app">Voltar ao perfil atual</Link>}
        </div>
      </main>
    </div>
  );
}
