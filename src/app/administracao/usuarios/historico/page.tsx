import Link from "next/link";
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
        <Link className={workStyles.backButton} href="/app?secao=administracao" aria-label="Voltar à Administração" title="Voltar à Administração">
          <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12H4m7-7-7 7 7 7" /></svg>
        </Link>
        <h2>Aprovações e Histórico</h2>
      </div>
      <Suspense key={parsePage(query.historico)} fallback={<AccessAdministrationLoading />}>
        <AccessAdministration historyOnly historyPage={parsePage(query.historico)} />
      </Suspense>
    </main>
  </div>;
}
