import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, ownAccessRequest } from "@/lib/auth/session";
import { AuthShell } from "../components/auth/AuthShell";
import { ConfirmEmailForm } from "../components/auth/ConfirmEmailForm";
import styles from "../components/auth/auth.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmar e-mail · Diálogo Auditorias",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function ConfirmEmailPage() {
  const user = await requireUser();
  const request = await ownAccessRequest(user.id);
  if (request?.email_confirmado_em) redirect("/aguardando-liberacao");
  // The email callback only opens a session. GET/prefetch must never submit
  // the registration for review, including when a mail scanner opens a link.
  return (
    <AuthShell
      title="Confirmar e-mail"
      description="Confirme seu e-mail para encaminhar a solicitação à análise do Administrativo."
    >
      {!request ? <p className={styles.error} role="alert">Não foi possível consultar sua solicitação. Atualize a página e tente novamente.</p>
        : !user.email_confirmed_at ? <p className={styles.notice}>Abra o link enviado ao seu e-mail para continuar a confirmação.</p>
          : ["PENDENTE_APROVACAO", "APROVADO"].includes(request.status_acesso) ? <ConfirmEmailForm />
            : <p className={styles.notice}>Consulte o Administrativo sobre a situação do seu cadastro.</p>}
      <div className={styles.alternative}>
        <span>Já confirmou seu e-mail?</span>
        <Link href="/entrar" prefetch={false}>Entrar</Link>
      </div>
    </AuthShell>
  );
}
