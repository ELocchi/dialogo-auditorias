import { BackLink } from "@/app/components/back-control";
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
    <AdministrativeHeader name={name} email={user.email} userId={user.id} />
    <main id="work-content" tabIndex={-1} className={styles.main}>
      <div className={styles.pageHeading}>
        <BackLink href="/app?secao=obras" label="Voltar às obras" />
        <h2>Cadastrar obra</h2>
      </div>
      <WorkForm activeProfiles={activeProfiles} />
    </main>
  </div>;
}
