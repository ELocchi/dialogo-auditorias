import Link from "next/link";
import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { PrototypeApp } from "@/app/components/prototype-app";
import { AuthShell } from "@/app/components/auth/AuthShell";
import { LogoutButton } from "@/app/components/auth/LogoutButton";
import { createClient } from "@/lib/supabase/server";
import { readAgendaSnapshot } from "@/lib/agenda/service";
import { countActiveAccounts } from "@/lib/access/account-count";
import { readPublishedAuditOverview } from "@/lib/audits/service";
import { readAuditDashboard } from "@/lib/audits/dashboard-service";
import { readPublishedAuditHistory } from "@/lib/audits/history-service";
import type { PublishedAuditSnapshot } from "@/lib/audits/contracts";

export const dynamic = "force-dynamic";

type Query = { secao?: string; visita?: string; plano?: string };
const parseAuditId = (value: string | undefined) => value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ? value.toLowerCase() : undefined;

export default async function OperationalPage({ searchParams }: { searchParams: Promise<Query> }) {
  const active = await requireActiveProfile();
  const context = await readWorkspaceContext(active);
  const query = await searchParams;
  if (!context) return <AuthShell title="Não foi possível abrir o painel" description="Não conseguimos confirmar as obras e os módulos deste perfil. Tente carregar novamente.">
    <p><Link href="/app">Tentar novamente</Link></p>
    <p><Link href="/escolher-perfil">Trocar perfil</Link></p>
    <LogoutButton />
  </AuthShell>;
  const client = await createClient();
  const initialActionPlanAuditId = parseAuditId(query.plano);
  const preview = process.env.NODE_ENV === "development";
  const [initialAgenda, initialDashboard, initialAudits, activeAccountCount] = await Promise.all([
    readAgendaSnapshot(client, context),
    preview ? Promise.resolve(undefined) : readAuditDashboard(client, context),
    preview ? readPublishedAuditOverview(client, context) : initialActionPlanAuditId
      ? readPublishedAuditHistory(client, context, { auditId: initialActionPlanAuditId, pageSize: 1, includeFindings: false })
        .then((result): PublishedAuditSnapshot => ({ available: result.available, audits: result.audits, responses: {}, criteriaSnapshots: {} }))
      : Promise.resolve<PublishedAuditSnapshot>({ available: true, audits: [], responses: {}, criteriaSnapshots: {} }),
    context.administrativeScope === "GERAL" ? countActiveAccounts(client) : Promise.resolve(null),
  ]);
  return <PrototypeApp key={`${active.user.id}:${active.profile}:${active.engineeringScope ?? ""}:${active.administrativeScope ?? ""}`} context={context}
    initialAgenda={initialAgenda} initialAudits={initialAudits} initialDashboard={initialDashboard} initialVisitId={typeof query.visita === "string" ? query.visita : undefined}
    initialActionPlanAuditId={initialActionPlanAuditId}
    initialScreen={initialActionPlanAuditId ? "action_plan" : query.secao === "obras" ? "works" : query.secao === "agenda" ? "agenda" : query.secao === "auditorias" ? "audits" : query.secao === "relatorios" ? "report" : query.secao === "acompanhamento" && (context.profile === "AUDITOR_SEGURANCA" || context.profile === "AUDITOR_QUALIDADE") ? "follow_up" : query.secao === "administracao" && context.administrativeScope === "GERAL" ? "settings" : "overview"}
    activeAccountCount={activeAccountCount} />;
}
