import Link from "next/link";
import { ownAccessRequest, requireAdministrator } from "@/lib/auth/session";
import { AdministrativeHeader } from "@/app/components/administrative-header";
import { AccessAdministration } from "@/app/components/access/AccessAdministration";
import styles from "../access.module.css";
import workStyles from "@/app/components/works/work-edit.module.css";

export const dynamic = "force-dynamic";
type Query = { pendentes?: string };
const parsePage = (value: string | undefined) => value && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;

export default async function PendingApprovalsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireAdministrator();
  const query = await searchParams;
  const ownRequest = await ownAccessRequest(user.id);
  const name = typeof ownRequest?.nome === "string" && ownRequest.nome.trim()
    ? ownRequest.nome : user.email ?? "Usuário";

  return <div className={styles.shell}>
    <a className="skip-link" href="#pending-content">Ir para as aprovações pendentes</a>
    <AdministrativeHeader name={name} userId={user.id} />
    <main id="pending-content" className={styles.main} tabIndex={-1}>
      <div className={workStyles.pageHeading}>
        <Link className={workStyles.backButton} href="/app?secao=administracao" aria-label="Voltar à Administração" title="Voltar à Administração">
          <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12H4m7-7-7 7 7 7" /></svg>
        </Link>
        <h2>Aprovações pendentes</h2>
      </div>
      <AccessAdministration pendingOnly pendingPage={parsePage(query.pendentes)} />
    </main>
  </div>;
}
