import Link from "next/link";
import { ownAccessRequest, requireAdministrator } from "@/lib/auth/session";
import { AdministrativeHeader } from "@/app/components/administrative-header";
import { AccessAdministration } from "@/app/components/access/AccessAdministration";
import styles from "./access.module.css";

export const dynamic = "force-dynamic";
type Query = { pendentes?: string; historico?: string };
const parsePage = (value: string | undefined) => value && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;

export default async function AccessAdministrationPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireAdministrator();
  const query = await searchParams;
  const ownRequest = await ownAccessRequest(user.id);
  const name = typeof ownRequest?.nome === "string" && ownRequest.nome.trim()
    ? ownRequest.nome : user.email ?? "Usuário";
  return <div className={styles.shell}>
    <a className="skip-link" href="#access-content">Ir para usuários e acessos</a>
    <AdministrativeHeader name={name} userId={user.id} />
    <main id="access-content" className={styles.main} tabIndex={-1}>
      <Link className={styles.backLink} href="/app?secao=administracao">Voltar à Administração</Link>
      <AccessAdministration pendingPage={parsePage(query.pendentes)} historyPage={parsePage(query.historico)} />
    </main>
  </div>;
}
