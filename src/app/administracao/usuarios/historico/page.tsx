import { BackLink } from "@/app/components/back-control";
import { Suspense } from "react";
import { requireAdministrator } from "@/lib/auth/session";
import { AccessAdministrationHeader } from "@/app/components/access/AccessAdministrationHeader";
import { AccessAdministrationLoading } from "@/app/components/access/AccessAdministrationLoading";
import { AccessAdministration } from "@/app/components/access/AccessAdministration";
import styles from "../access.module.css";
import workStyles from "@/app/components/works/work-edit.module.css";

export const dynamic = "force-dynamic";
type Query = { historico?: string };
const parsePage = (value: string | undefined) => value && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;

export default async function ApprovalHistoryPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireAdministrator();
  const query = await searchParams;

  return <div className={styles.shell}>
    <a className="skip-link" href="#history-content">Ir para aprovações e histórico</a>
    <AccessAdministrationHeader user={{ id: user.id, email: user.email }} />
    <main id="history-content" className={styles.main} tabIndex={-1}>
      <div className={workStyles.pageHeading}>
        <BackLink href="/app?secao=administracao" label="Voltar à Administração" />
        <h2>Aprovações e Histórico</h2>
      </div>
      <Suspense key={parsePage(query.historico)} fallback={<AccessAdministrationLoading />}>
        <AccessAdministration historyOnly historyPage={parsePage(query.historico)} />
      </Suspense>
    </main>
  </div>;
}
