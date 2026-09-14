import Link from "next/link";
import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { PrototypeApp } from "@/app/components/prototype-app";
import { AuthShell } from "@/app/components/auth/AuthShell";
import { LogoutButton } from "@/app/components/auth/LogoutButton";
import { createClient } from "@/lib/supabase/server";
import { readAgendaSnapshot } from "@/lib/agenda/service";

export const dynamic = "force-dynamic";

export default async function OperationalPage({ searchParams }: { searchParams: Promise<{ secao?: string; visita?: string }> }) {
  const active = await requireActiveProfile();
  const context = await readWorkspaceContext(active);
  const query = await searchParams;
  if (!context) return <AuthShell title="Não foi possível abrir o painel" description="Não conseguimos confirmar as obras e os módulos deste perfil. Tente carregar novamente.">
    <p><Link href="/app">Tentar novamente</Link></p>
    <p><Link href="/escolher-perfil">Trocar perfil</Link></p>
    <LogoutButton />
  </AuthShell>;
  const initialAgenda = await readAgendaSnapshot(await createClient(), context);
  return <PrototypeApp key={`${active.user.id}:${active.profile}:${active.engineeringScope ?? ""}`} context={context}
    initialAgenda={initialAgenda} initialVisitId={typeof query.visita === "string" ? query.visita : undefined}
    initialScreen={query.secao === "obras" ? "works" : query.secao === "agenda" ? "agenda" : "overview"} />;
}


