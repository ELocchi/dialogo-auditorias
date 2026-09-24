import Link from "next/link";
import { ownAccessRequest, requireAdministrator } from "@/lib/auth/session";
import { readActiveTeamProfiles } from "@/lib/works/queries";
import { AdministrativeHeader } from "@/app/components/administrative-header";
import { WorkForm } from "@/app/components/access/WorkForm";
import styles from "@/app/components/works/work-edit.module.css";

export const dynamic = "force-dynamic";

export default async function NewWorkPage() {
  const user = await requireAdministrator();
  const [ownRequest, activeProfiles] = await Promise.all([
    ownAccessRequest(user.id),
    readActiveTeamProfiles(),
  ]);
  const name = typeof ownRequest?.nome === "string" && ownRequest.nome.trim()
    ? ownRequest.nome : user.email ?? "Usuário";

  return <div className={styles.shell}>
    <a className="skip-link" href="#work-content">Ir para o cadastro da obra</a>
    <AdministrativeHeader name={name} userId={user.id} />
    <main id="work-content" tabIndex={-1} className={styles.main}>
      <div className={styles.pageHeading}>
        <Link className={styles.backButton} href="/app?secao=obras" aria-label="Voltar às obras" title="Voltar às obras">
          <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12H4m7-7-7 7 7 7" /></svg>
        </Link>
        <h2>Cadastrar obra</h2>
      </div>
      <WorkForm activeProfiles={activeProfiles} />
    </main>
  </div>;
}
