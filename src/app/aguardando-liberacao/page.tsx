import { redirect } from "next/navigation";
import { requireUser, ownAccessRequest, effectiveAccount } from "@/lib/auth/session";
import { effectiveDestination } from "@/lib/auth/effective-access";
import { readActiveProfile } from "@/lib/auth/active-profile-session";
import { AuthShell } from "../components/auth/AuthShell";
import { LogoutButton } from "../components/auth/LogoutButton";
import styles from "../components/auth/auth.module.css";

export const dynamic = "force-dynamic";

export default async function PendingAccessPage() {
  const user = await requireUser();
  const account = await effectiveAccount(user);
  if (account) redirect(await readActiveProfile(user.id, account) ? "/app" : effectiveDestination(account));
  const request = await ownAccessRequest(user.id);
  if (request && ["PENDENTE_APROVACAO", "APROVADO"].includes(request.status_acesso) && user.email_confirmed_at && !request.email_confirmado_em) {
    redirect("/confirmar-email");
  }
  return (
    <AuthShell title="Aguardando liberação" description="Seu acesso está aguardando liberação do Administrativo.">
      <p className={styles.notice}>{request?.status_acesso === "APROVADO"
        ? "Seu acesso está restrito. Solicite ao Administrativo a conferência das permissões atuais."
        : user.email_confirmed_at
          ? "E-mail confirmado. Aguardando liberação do Administrativo."
          : "E-mail/cadastro realizado. Confirme o e-mail para aguardar liberação do Administrativo."}</p>
      <dl className={styles.accountDetails}>
        {request && <><dt>Nome</dt><dd>{request.nome}</dd></>}
        <dt>E-mail da conta</dt><dd>{user.email}</dd>
        <dt>Confirmação do e-mail</dt><dd>{user.email_confirmed_at ? "Confirmado" : "Pendente"}</dd>
      </dl>
      {!request && <p className={styles.error} role="status">
        Não foi possível consultar sua solicitação. Seu acesso permanece restrito; o cadastro precisa ser conferido antes da liberação.
      </p>}
      <LogoutButton />
    </AuthShell>
  );
}
