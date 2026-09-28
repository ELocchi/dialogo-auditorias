import { Suspense } from "react";
import { ownAccessRequest } from "@/lib/auth/session";
import { displayNameFromEmail } from "@/lib/auth/display-name";
import { AdministrativeHeader } from "@/app/components/administrative-header";
import { DialogoLogo } from "@/app/components/dialogo-logo";

type Identity = { id: string; email?: string };

async function NamedHeader({ user }: { user: Identity }) {
  const request = await ownAccessRequest(user.id);
  const name = typeof request?.nome === "string" && request.nome.trim()
    ? request.nome : user.email ?? "Usuário";
  return <AdministrativeHeader name={name} email={user.email} userId={user.id} />;
}

/** Render only after the page authorizes the current administrator. */
export function AccessAdministrationHeader({ user }: { user: Identity }) {
  // AdministrativeHeader already gives the email-derived name priority. Avoid
  // fetching a stored name that would never be displayed in that case.
  const name = displayNameFromEmail(user.email);
  if (name) return <AdministrativeHeader name={name} email={user.email} userId={user.id} />;
  // Numeric mailboxes still use the stored name. Its read is independent of the
  // list, and the fallback has no interactive controls to lose state on reveal.
  return <Suspense fallback={<header className="site-header" aria-busy="true">
    <div className="header-inner"><div className="header-main">
      <div className="brand"><DialogoLogo /></div>
      <div className="header-title"><h1>Auditorias de obra</h1><p>Gestão de segurança e qualidade</p><span className="context-pill">ADMINISTRAÇÃO</span></div>
    </div></div>
  </header>}>
    <NamedHeader user={user} />
  </Suspense>;
}
