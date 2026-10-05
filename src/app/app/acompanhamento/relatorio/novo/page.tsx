import Link from "next/link";
import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { canCreateStandaloneReport, standaloneDiscipline } from "@/lib/follow-up/standalone-service";
import { getSaoPauloToday } from "@/domain/visit-calendar";
import { StandaloneReportForm } from "@/app/components/standalone-report-form";
import { StandaloneReportShell } from "@/app/components/standalone-report-shell";
import { AuthShell } from "@/app/components/auth/AuthShell";
import { selectProfileAction } from "@/app/escolher-perfil/actions";
import { profileLabels } from "@/lib/access/contracts";

export const dynamic = "force-dynamic";
export default async function NewReportPage({ searchParams }: {
  searchParams: Promise<{ obra?: string | string[] }>;
}) {
  const active = await requireActiveProfile();
  if (!standaloneDiscipline(active.profile)) {
    const auditorProfiles = active.account.perfis.filter(profile => standaloneDiscipline(profile));
    return <AuthShell title="Relatório Orientativo" backHref="/app" backLabel="Voltar ao painel" description={auditorProfiles.length
      ? "Escolha o perfil de auditor para criar o relatório."
      : "A criação de relatórios orientativos está disponível para auditores de Qualidade e Segurança. Seu perfil atual permite consultar os documentos autorizados."}>
      {auditorProfiles.map(profile => <form action={selectProfileAction} key={profile}>
        <input type="hidden" name="destino" value="relatorio-orientativo" />
        <p><button className="primary" type="submit" name="perfil" value={profile} style={{ width: "100%" }}>Entrar como {profileLabels[profile]}</button></p>
      </form>)}

    </AuthShell>;
  }
  const context = await readWorkspaceContext(active);
  if (!context) return <AuthShell title="Não foi possível carregar o relatório" backHref="/app" backLabel="Voltar ao painel"
    description="Não conseguimos consultar as obras deste perfil agora. Tente novamente para abrir o formulário.">
    <form action="/app/acompanhamento/relatorio/novo" method="get">
      <p><button className="primary" type="submit">Tentar novamente</button></p>
    </form>
    <p><Link href="/escolher-perfil">Trocar perfil</Link></p>

  </AuthShell>;
  const actor = { userId: context.user.id, profile: context.profile,
    engineeringScope: context.engineeringScope, administrativeScope: context.administrativeScope };
  const works = context.works.filter(work => canCreateStandaloneReport(context, work.id));
  const { obra } = await searchParams;
  const requestedWorkId = typeof obra === "string" ? obra.toLowerCase() : "";
  const initialWorkId = works.find(work => work.id === requestedWorkId)?.id ?? works[0]?.id ?? "";
  return <StandaloneReportShell context={context}>
    <StandaloneReportForm key={JSON.stringify([actor, initialWorkId])} actor={actor} today={getSaoPauloToday()}
      works={works} initialWorkId={initialWorkId} />
  </StandaloneReportShell>;
}
