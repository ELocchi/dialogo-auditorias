import type { Metadata } from "next";
import Link from "next/link";
import { emailConfirmationError, emailConfirmationToken } from "@/lib/auth/email-confirmation";
import { AuthShell } from "../components/auth/AuthShell";
import { ConfirmEmailForm } from "../components/auth/ConfirmEmailForm";
import styles from "../components/auth/auth.module.css";

export const metadata: Metadata = {
  title: "Confirmar e-mail · Diálogo Auditorias",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function ConfirmEmailPage({ searchParams }: {
  searchParams: Promise<{ token_hash?: string | string[] }>;
}) {
  const token = emailConfirmationToken((await searchParams).token_hash);
  // Loading/prefetching this page does not verify the token or alter Auth state.
  return (
    <AuthShell
      title="Confirmar e-mail"
      description="Confirme seu e-mail para encaminhar a solicitação à análise do Administrativo."
    >
      {token ? <ConfirmEmailForm tokenHash={token} /> : (
        <p className={styles.error} role="alert">{emailConfirmationError}</p>
      )}
      <div className={styles.alternative}>
        <span>Já confirmou seu e-mail?</span>
        <Link href="/entrar" prefetch={false}>Entrar</Link>
      </div>
    </AuthShell>
  );
}
