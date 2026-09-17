import Link from "next/link";
import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { PrototypeApp } from "@/app/components/prototype-app";
import { AuthShell } from "@/app/components/auth/AuthShell";
import { LogoutButton } from "@/app/components/auth/LogoutButton";
import { createClient } from "@/lib/supabase/server";
import { readCatalogSnapshot } from "@/lib/catalogs/service";
import { readAgendaSnapshot } from "@/lib/agenda/service";
import { AccessAdministration } from "@/app/components/access/AccessAdministration";
import { countActiveAccounts } from "@/lib/access/account-count";

export const dynamic = "force-dynamic";

type Query = { secao?: string; visita?: string; pendentes?: string; historico?: string };
const parsePage = (value: string | undefined) => value && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;

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
  const [initialAgenda, initialCatalogs, activeAccountCount] = await Promise.all([
    readAgendaSnapshot(client, context), readCatalogSnapshot(client, context),
    context.administrativeScope === "GERAL" ? countActiveAccounts(client) : Promise.resolve(null),
  ]);
  return <PrototypeApp key={`${active.user.id}:${active.profile}:${active.engineeringScope ?? ""}:${active.administrativeScope ?? ""}`} context={context}
    initialCatalogs={initialCatalogs} initialAgenda={initialAgenda} initialVisitId={typeof query.visita === "string" ? query.visita : undefined}
    initialScreen={query.secao === "obras" ? "works" : query.secao === "agenda" ? "agenda" : query.secao === "administracao" && context.administrativeScope === "GERAL" ? "settings" : "overview"}
    activeAccountCount={activeAccountCount}
    administrationContent={context.administrativeScope === "GERAL" ? <AccessAdministration embedded pendingPage={parsePage(query.pendentes)} historyPage={parsePage(query.historico)} /> : undefined}
    administrationWorksContent={context.administrativeScope === "GERAL" ? <AccessAdministration embedded view="works" pendingPage={parsePage(query.pendentes)} historyPage={parsePage(query.historico)} /> : undefined} />;
}
