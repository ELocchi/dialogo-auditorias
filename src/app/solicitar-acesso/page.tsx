import { redirect } from "next/navigation";
import { verifiedUser } from "@/lib/auth/session";
import { AuthShell } from "../components/auth/AuthShell";
import { AuthForm } from "../components/auth/AuthForm";

export default async function SignUpPage() {
  if (await verifiedUser()) redirect("/aguardando-liberacao");
  return (
    <AuthShell title="Solicitar acesso" description="Crie sua conta corporativa. A liberação dos acessos depende da análise do Administrativo.">
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
