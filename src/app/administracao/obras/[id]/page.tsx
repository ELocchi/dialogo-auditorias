import { BackLink } from "@/app/components/back-control";
import { ownAccessRequest, requireAdministrator } from "@/lib/auth/session";
import { readWorkDetails, readWorkHistory, readActiveTeamProfiles, readWorkTeamLinks } from "@/lib/works/queries";
import { WorkHistory } from "@/app/components/works/WorkHistory";
import { AdministrativeHeader } from "@/app/components/administrative-header";
import { WorkEditForm } from "@/app/components/works/WorkEditForm";
import styles from "@/app/components/works/work-edit.module.css";

export const dynamic = "force-dynamic";
export default async function EditWorkPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string }> }) {
  const user = await requireAdministrator();
  const { id } = await params;
  const query = await searchParams;
  const page = /^[1-9]\d{0,5}$/.test(query.pagina ?? "") ? Number(query.pagina) : 1;
  const [work, history, ownRequest, linkedProfiles] = await Promise.all([readWorkDetails(id), readWorkHistory(id, page), ownAccessRequest(user.id), readWorkTeamLinks(id)]);
  const activeProfiles = await readActiveTeamProfiles(linkedProfiles?.map(link => link.id) ?? []);
  const name = typeof ownRequest?.nome === "string" && ownRequest.nome.trim()
    ? ownRequest.nome : user.email ?? "Usuário";
  return <div className={styles.shell}>
    <a className="skip-link" href="#work-content">Ir para o cadastro da obra</a>
    <AdministrativeHeader name={name} email={user.email} userId={user.id} />
    <main id="work-content" tabIndex={-1} className={styles.main}>
      <div className={styles.pageHeading}>
        <BackLink href="/app?secao=obras" label="Voltar às obras" />
        <h2>Editar Obra</h2>
      </div>
      {!work ? <div className={styles.error} role="alert"><p>Não foi possível carregar este cadastro. Volte às obras e selecione a obra novamente.</p><BackLink href="/app?secao=obras" label="Voltar às obras" /></div> : <>
        <WorkEditForm work={work} activeProfiles={activeProfiles} linkedProfiles={linkedProfiles} />
        <WorkHistory workId={id} actorId={user.id} initial={{ ...history, page }} />
      </>}
    </main>
  </div>;
}
