import { BackLink } from "@/app/components/back-control";
import { Suspense } from "react";
import { requireAdministrator } from "@/lib/auth/session";
import { AccessAdministrationHeader } from "@/app/components/access/AccessAdministrationHeader";
import { AccessAdministrationLoading } from "@/app/components/access/AccessAdministrationLoading";
import { AccessAdministration } from "@/app/components/access/AccessAdministration";
import styles from "./access.module.css";

export const dynamic = "force-dynamic";
type Query = { pendentes?: string; historico?: string };
const parsePage = (value: string | undefined) => value && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;

export default async function AccessAdministrationPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireAdministrator();
  const query = await searchParams;
  return <div className={styles.shell}>
    <a className="skip-link" href="#access-content">Ir para usuários e acessos</a>
    <AccessAdministrationHeader user={{ id: user.id, email: user.email }} />
    <main id="access-content" className={styles.main} tabIndex={-1}>
      <BackLink href="/app?secao=administracao" label="Voltar à Administração" />
      <Suspense key={`${parsePage(query.pendentes)}:${parsePage(query.historico)}`} fallback={<AccessAdministrationLoading />}>
        <AccessAdministration pendingPage={parsePage(query.pendentes)} historyPage={parsePage(query.historico)} />
      </Suspense>
    </main>
  </div>;
}
