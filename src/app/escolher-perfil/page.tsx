import { PendingSubmit } from "../components/pending-submit";
import { redirect } from "next/navigation";
import { requireUser, effectiveAccount } from "@/lib/auth/session";
import { profileLabels, administrativeLabels, engineeringLabels, type AccessProfile } from "@/lib/access/contracts";
import { readActiveProfileContext } from "@/lib/auth/active-profile-session";
import { getProfileContexts } from "@/lib/auth/active-profile";
import { platformDisplayName } from "@/lib/auth/display-name";
import { UserMenu } from "../components/auth/UserMenu";
import { AuthHeader } from "../components/auth/AuthHeader";
import { selectProfileAction } from "./actions";
import styles from "./profile-selection.module.css";

const descriptions: Record<AccessProfile, string> = {
  ADMINISTRATIVO: "Administração, usuários, acessos e obras.",
  AUDITOR_SEGURANCA: "Agenda, auditorias e acompanhamento de segurança.",
  AUDITOR_QUALIDADE: "Agenda, auditorias e acompanhamento de qualidade.",
  ENGENHARIA: "Acompanhamento das auditorias e das pendências.",
};

export default async function SelectProfilePage({ searchParams }: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await requireUser();
  const account = await effectiveAccount(user);
  if (!account) redirect("/aguardando-liberacao");
  const contexts = getProfileContexts(account);
  if (account.perfis.length === 1) redirect("/app");
  const current = await readActiveProfileContext(user.id, account);
  const params = await searchParams;
  const profileColumns = [
    { label: "Perfis administrativos", contexts: contexts.filter((context) => context.profile === "ADMINISTRATIVO") },
    { label: "Perfis de auditoria", contexts: contexts.filter((context) => context.profile === "AUDITOR_SEGURANCA" || context.profile === "AUDITOR_QUALIDADE") },
    { label: "Perfis de Engenharia", contexts: contexts.filter((context) => context.profile === "ENGENHARIA") },
  ].filter((column) => column.contexts.length > 0);

  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#profile-content">Ir para o conteúdo</a>
      <AuthHeader><UserMenu name={platformDisplayName(user.email)} /></AuthHeader>
      <main className={styles.main} id="profile-content" tabIndex={-1}>
        <h1>Perfis de Acesso</h1>
        {params.erro === "perfil" && <p className={styles.error} role="alert">Não foi possível selecionar esse perfil. Escolha uma das opções disponíveis abaixo.</p>}
        <div className={styles.grid}>
          {profileColumns.map((column) => <section className={styles.profileColumn} aria-label={column.label} key={column.label}>
            {column.contexts.map(({ profile, engineeringScope, administrativeScope }) => {
              const label = profile === "ENGENHARIA" && engineeringScope
                ? `${profileLabels[profile]} — ${engineeringLabels[engineeringScope]}`
                : profile === "ADMINISTRATIVO" && administrativeScope
                  ? administrativeLabels[administrativeScope] : profileLabels[profile];
              const isCurrent = profile === current?.profile && engineeringScope === current.engineeringScope && administrativeScope === current.administrativeScope;
              return <form action={selectProfileAction} key={`${profile}:${engineeringScope}:${administrativeScope}`}>
                {engineeringScope && <input type="hidden" name="atuacao_engenharia" value={engineeringScope} />}
                {administrativeScope && <input type="hidden" name="atuacao_administrativa" value={administrativeScope} />}
                <PendingSubmit data-tooltip={`Entrar como ${label}${isCurrent ? ", perfil atual" : ""}`} className={styles.profile} name="perfil" value={profile} type="submit" aria-label={`Entrar como ${label}${isCurrent ? ", perfil atual" : ""}`}>
                  {isCurrent && <span className={styles.currentIndicator} aria-hidden="true" />}
                  <strong>{label}</strong>
                  <span className={styles.profileDescription}>{profile === "ADMINISTRATIVO" && administrativeScope !== "GERAL"
                    ? `Agenda, roteiros e acompanhamento de ${administrativeScope === "SEGURANCA" ? "Segurança" : "Qualidade"}.`
                    : descriptions[profile]}</span>
                </PendingSubmit>
              </form>;
            })}
          </section>)}
        </div>
      </main>
    </div>
  );
}
