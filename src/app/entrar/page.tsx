import { redirect } from "next/navigation";
import { verifiedUser } from "@/lib/auth/session";
import { AuthShell } from "../components/auth/AuthShell";
import { AuthForm } from "../components/auth/AuthForm";
import styles from "../components/auth/auth.module.css";

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<{ confirmacao?: string }>;
}) {
  if (await verifiedUser()) redirect("/aguardando-liberacao");
  const params = await searchParams;
  return (
    <AuthShell title="Entrar" description="Acesse com seu e-mail corporativo e a senha do Diálogo Auditorias.">
      {params.confirmacao === "indisponivel" && <p className={styles.error} role="alert">
        Não foi possível concluir a confirmação. Abra o link no navegador em que solicitou acesso. Se já confirmou o e-mail, tente entrar.
      </p>}
      <AuthForm mode="login" />
    </AuthShell>
  );
}
