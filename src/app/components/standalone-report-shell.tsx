import Link from "next/link";
import type { ReactNode } from "react";
import type { ProfileWorkspaceContext } from "@/lib/access/workspace-context";
import { canConsultAgenda, roleLabels } from "@/domain/prototype-access";
import { AdministrativeHeader } from "./administrative-header";
import { Icon, type IconName } from "./ui-icon";

export function StandaloneReportShell({ context, children }: { context: ProfileWorkspaceContext; children: ReactNode }) {
  const canAgenda = context.works.some(work => context.user.modules.some(module => canConsultAgenda(context.user, work.id, module)));
  const navigation: { label: string; icon: IconName; href: string; active?: boolean }[] = [
    { label: "Visão geral", icon: "overview", href: "/app" },
    ...(canAgenda ? [{ label: "Agenda", icon: "calendar" as const, href: "/app?secao=agenda" }] : []),
    { label: "Auditorias", icon: "audits", href: "/app?secao=auditorias" },
    { label: "Acompanhamento", icon: "check", href: "/app?secao=acompanhamento", active: true },
    { label: "Obras", icon: "works", href: "/app?secao=obras" },
  ];
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    <AdministrativeHeader name={context.user.name} email={context.email} userId={context.user.id} profileLabel={roleLabels[context.user.role]} />
    <div className="navigation-bar"><nav className="main-navigation" aria-label="Navegação principal">
      {navigation.map(({ label, icon, href, active }) => <Link key={href} href={href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
        <Icon name={icon} /><span>{label}</span></Link>)}
    </nav></div>
    <main id="main-content" className="content-wrap">{children}</main>
  </div>;
}
