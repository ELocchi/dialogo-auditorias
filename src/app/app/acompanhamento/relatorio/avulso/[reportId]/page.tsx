import { notFound } from "next/navigation";
import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { readStandaloneReport, standaloneDiscipline } from "@/lib/follow-up/standalone-service";
import { standalonePdfHref } from "@/lib/follow-up/standalone-contracts";
import { uuidPattern } from "@/lib/access/validation";
import { ClosedReportPdf, ReportHeading } from "@/app/components/follow-up-report-page";
import { StandaloneReportShell } from "@/app/components/standalone-report-shell";
import styles from "@/app/components/follow-up-report-page.module.css";

export const dynamic = "force-dynamic";
export default async function SavedReportPage({ params, searchParams }: {
  params: Promise<{ reportId: string }>; searchParams: Promise<{ salvo?: string }>;
}) {
  const { reportId } = await params;
  if (!uuidPattern.test(reportId)) notFound();
  const context = await readWorkspaceContext(await requireActiveProfile());
  if (!context || !standaloneDiscipline(context.profile)) notFound();
  const { available, report } = await readStandaloneReport(await createClient(), context, reportId);
  if (!available) throw new Error("Não foi possível consultar o relatório salvo. Atualize a página para tentar novamente.");
  if (!report) notFound();
  const saved = (await searchParams).salvo === "1";
  return <StandaloneReportShell context={context}>
    <ReportHeading title={report.title} subtitle={report.workName} backHref="/app?secao=acompanhamento" backLabel="Voltar aos relatórios" />
    <div className={styles.closedLayout}><section className={`panel ${styles.closedPanel}`}>
      <ClosedReportPdf report={report} href={standalonePdfHref(report.id)} autoDownload={saved} message={saved ? "Relatório salvo." : ""} />
    </section></div>
  </StandaloneReportShell>;
}
