import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { readAgendaSnapshot } from "@/lib/agenda/service";
import { readFollowUpReports } from "@/lib/follow-up/service";
import { readFindingDrafts } from "@/lib/follow-up/findings";
import { readVisitPhotos } from "@/lib/follow-up/photos";
import { formatAuditDate } from "@/domain/operational-records";
import { getSaoPauloToday } from "@/domain/visit-calendar";
import { canAccessModule, canConsultAgenda, canReadOperationalDocuments, canReadVisit, roleLabels } from "@/domain/prototype-access";
import { uuidPattern } from "@/lib/access/validation";
import { AdministrativeHeader } from "@/app/components/administrative-header";
import { FollowUpReportPage } from "@/app/components/follow-up-report-page";
import { Icon, type IconName } from "@/app/components/ui-icon";
import styles from "@/app/components/follow-up-report-page.module.css";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params, searchParams }: {
  params: Promise<{ visitId: string }>; searchParams: Promise<{ relatorio?: string; novo?: string }>;
}) {
  const { visitId } = await params;
  const { relatorio: reportId, novo } = await searchParams;
  if (!uuidPattern.test(visitId)) notFound();
  if (reportId && !uuidPattern.test(reportId)) notFound();
  const active = await requireActiveProfile();
  const context = await readWorkspaceContext(active);
  if (!context || (context.profile !== "AUDITOR_SEGURANCA" && context.profile !== "AUDITOR_QUALIDADE")) notFound();
  const client = await createClient();
  const [agenda, reports, drafts, photos] = await Promise.all([
    readAgendaSnapshot(client, context), readFollowUpReports(client, context), readFindingDrafts(client, context),
    readVisitPhotos(client, context.user.id, visitId),
  ]);
  const visit = agenda.visits.find((entry) => entry.id === visitId && entry.kind === "follow_up"
    && entry.auditorId === context.user.id && canReadVisit(context.user, entry));
  const work = visit && context.works.find((entry) => entry.id === visit.workId);
  if (!visit || !work) notFound();
  const visitReports = reports.reports.filter((entry) => entry.visitId === visitId);
  const selectedReport = reportId ? visitReports.find((entry) => entry.id === reportId) : undefined;
  if (reportId && !selectedReport) notFound();
  const { data: workFindingRows } = await client.from("follow_up_work_findings")
    .select("id,work_id,modulo,location,description,correction,photo_file_name,created_at")
    .eq("work_id", work.id).eq("auditor_auth_user_id", context.user.id)
    .eq("modulo", visit.module === "safety" ? "SEGURANCA" : "QUALIDADE").is("completed_at", null).limit(1000);
  const workFindings = (workFindingRows ?? []).map((row) => ({ id: row.id, workId: row.work_id,
    module: row.modulo === "SEGURANCA" ? "safety" as const : "quality" as const,
    location: row.location, description: row.description, correction: row.correction,
    photoFileName: row.photo_file_name, createdAt: row.created_at }));
  const sortedReports = visitReports.slice().sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const showingIndex = !reportId && novo !== "1" && sortedReports.length > 0;
  const returnToIndex = Boolean(reportId || (novo === "1" && sortedReports.length > 0));
  const canCreate = agenda.available && reports.available && drafts.available
    && visit.confirmationStatus === "confirmed" && visit.date <= getSaoPauloToday()
    && sortedReports.every((report) => report.id !== report.visitId)
    && (sortedReports.length > 0 || (drafts.drafts.find((entry) => entry.visitId === visitId)?.findings.length ?? 0) > 0
      || workFindings.length > 0);
  const actor = { userId: context.user.id, profile: context.profile,
    engineeringScope: context.engineeringScope ?? null, administrativeScope: context.administrativeScope };
  const auditModule = context.user.modules.find((module) => canAccessModule(context.user, module));
  const selectedWork = context.works.find((entry) => auditModule && canReadOperationalDocuments(context.user, entry.id, auditModule));
  const canAgenda = context.works.some((entry) => context.user.modules.some((module) => canConsultAgenda(context.user, entry.id, module)));
  const navigation: { label: string; icon: IconName; href: string; active?: boolean }[] = [
    { label: "Visão geral", icon: "overview", href: "/app" },
    ...(canAgenda ? [{ label: "Agenda", icon: "calendar" as const, href: "/app?secao=agenda" }] : []),
    { label: "Auditorias", icon: "audits", href: "/app?secao=auditorias" },
    { label: "Acompanhamento", icon: "check", href: "/app?secao=acompanhamento", active: true },
    { label: "Obras", icon: "works", href: "/app?secao=obras" },
    ...(selectedWork ? [{ label: "Relatórios", icon: "report" as const, href: "/app?secao=relatorios" }] : []),
  ];
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    <AdministrativeHeader name={context.user.name} userId={context.user.id} profileLabel={roleLabels[context.user.role]} />
    <div className="navigation-bar"><nav className="main-navigation" aria-label="Navegação principal">{navigation.map(({ label, icon, href, active }) =>
      <Link key={href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined} href={href}><Icon name={icon} /><span>{label}</span></Link>)}</nav></div>
    <main id="main-content" className="content-wrap">
      <Link className={styles.backLink} href={returnToIndex
        ? `/app/acompanhamento/relatorio/${visitId}` : "/app?secao=acompanhamento"}>
        ← {returnToIndex ? "Voltar aos relatórios" : "Voltar ao acompanhamento"}</Link>
      {showingIndex ? <div className={styles.reportIndex}>
        <div className="page-intro"><div><h2>Relatórios orientativos</h2>
          <p className="muted">{work.name} · {formatAuditDate(visit.date)}</p></div></div>
        <section className="panel" aria-label="Relatórios da visita">
          <div className={styles.indexHeading}><h3>Relatórios da visita</h3>
            {canCreate ? <Link className="primary" href={`/app/acompanhamento/relatorio/${visitId}?novo=1`}>+ Criar novo relatório</Link>
              : <button className="primary" type="button" disabled title="A criação exige visita confirmada, apontamento disponível e banco atualizado">+ Criar novo relatório</button>}</div>
          <ul className={styles.reportList}>{sortedReports.map((report, index) => <li key={report.id}>
            <span><strong>{report.title === "Relatório orientativo" ? `Relatório ${index + 1}` : report.title}</strong>
              <small>Salvo em {new Date(report.updatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</small></span>
            <Link className="secondary" href={`/app/acompanhamento/relatorio/${visitId}?relatorio=${report.id}`}>Abrir relatório</Link>
          </li>)}</ul>
        </section>
      </div> : <FollowUpReportPage visit={visit} work={work} actor={actor} agendaAvailable={agenda.available}
          initialReport={selectedReport}
          initialReportedFindings={visitReports.flatMap((entry) => entry.findings)}
          initialDraft={drafts.drafts.find((entry) => entry.visitId === visitId)}
          initialPhotos={photos ?? []}
          initialWorkFindings={workFindings}
          reportsAvailable={reports.available} draftsAvailable={drafts.available} />}
    </main>
  </div>;
}
