import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { readFollowUpVisit, readFollowUpReportDetail } from "@/lib/follow-up/visit-service";
import { readVisitPhotos } from "@/lib/follow-up/photos";
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
  const snapshot = reportId ? await readFollowUpReportDetail(client, context, visitId, reportId)
    : await readFollowUpVisit(client, context, visitId);
  if (!snapshot.available) throw new Error("Não foi possível consultar o acompanhamento. Tente novamente.");
  const visit = snapshot.visit;
  const work = visit && context.works.find((entry) => entry.id === visit.workId);
  if (!visit || !work || !canReadVisit(context.user, visit)) notFound();
  const visitReports = "reports" in snapshot ? snapshot.reports : [];
  const selectedReport = "report" in snapshot ? snapshot.report ?? undefined : undefined;
  if (reportId && !selectedReport) notFound();
  const draft = "draft" in snapshot ? snapshot.draft ?? undefined : undefined;
  const workFindings = "workFindings" in snapshot ? snapshot.workFindings : [];
  const sortedReports = visitReports.slice().sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const showingIndex = !reportId && novo !== "1" && sortedReports.length > 0;
  const canCreate = visit.confirmationStatus === "confirmed" && visit.date <= getSaoPauloToday()
    && sortedReports.every((report) => report.id !== report.visitId)
    && (sortedReports.length > 0 || (draft?.findings.length ?? 0) > 0 || workFindings.length > 0);
  // Only the editor uses thumbnails. Index and closed report pages leave Storage to the PDF request.
  const hasVisitFindings = (draft?.findings.length ?? 0) > 0 || visitReports.some((entry) => entry.findings.length > 0);
  const photos = !showingIndex && !selectedReport && hasVisitFindings
    ? await readVisitPhotos(client, context.user.id, visitId) : [];
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
    <AdministrativeHeader name={context.user.name} email={context.email} userId={context.user.id} profileLabel={roleLabels[context.user.role]} />
    <div className="navigation-bar"><nav className="main-navigation" aria-label="Navegação principal">{navigation.map(({ label, icon, href, active }) =>
      <Link key={href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined} href={href}><Icon name={icon} /><span>{label}</span></Link>)}</nav></div>
    <main id="main-content" className="content-wrap">
      {showingIndex ? <div className={styles.reportIndex}>
        <div className={styles.pageHeading}>
          <Link className={styles.backButton} href="/app?secao=acompanhamento" aria-label="Voltar ao acompanhamento" data-tooltip="Voltar ao acompanhamento">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12H4m7-7-7 7 7 7" /></svg>
          </Link>
          <div className={styles.headingText}><h2>Relatórios orientativos</h2></div>
          {canCreate ? <Link className={`primary ${styles.addReportButton}`} href={`/app/acompanhamento/relatorio/${visitId}?novo=1`}
              aria-label="Criar novo relatório" data-tooltip="Criar novo relatório">+</Link>
            : <button className={`primary ${styles.addReportButton}`} type="button" disabled aria-label="Criar novo relatório"
              data-tooltip="A criação exige visita confirmada, apontamento disponível e banco atualizado">+</button>}
        </div>
        <section className="panel" aria-label="Relatórios da visita">
          <ul className={styles.reportList}>{sortedReports.map((report, index) => {
            const savedAt = new Date(report.updatedAt);
            const day = savedAt.toLocaleDateString("pt-BR", { day: "2-digit", timeZone: "America/Sao_Paulo" });
            const month = savedAt.toLocaleDateString("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).replace(".", "").toUpperCase();
            const year = savedAt.toLocaleDateString("pt-BR", { year: "numeric", timeZone: "America/Sao_Paulo" });
            const date = savedAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
            return <li key={report.id}>
              <span className={styles.reportDate}><strong>{day}</strong><small>{month} {year}</small></span>
              <span className={styles.reportInfo}><strong>{report.title === "Relatório orientativo" ? `Relatório ${index + 1}` : report.title}</strong>
                <small>{date}</small></span>
              <a className={styles.downloadButton} href={`/app/acompanhamento/relatorio/${visitId}/pdf?relatorio=${report.id}`} download
                aria-label={`Baixar PDF: ${report.title}`} data-tooltip="Baixar PDF">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
              </a>
            </li>;
          })}</ul>
        </section>
      </div> : <FollowUpReportPage visit={visit} actor={actor} agendaAvailable={snapshot.available}
          backHref="/app?secao=acompanhamento"
          backLabel="Voltar ao acompanhamento"
          initialReport={selectedReport}
          initialReportedFindings={visitReports.flatMap((entry) => entry.findings)}
          initialDraft={draft}
          initialPhotos={photos ?? []}
          initialWorkFindings={workFindings}
          reportsAvailable={snapshot.available} draftsAvailable={snapshot.available} />}
    </main>
  </div>;
}
