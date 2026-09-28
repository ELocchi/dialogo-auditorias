"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AgendaActorContext } from "@/lib/agenda/contracts";
import type { AccessSummary } from "@/lib/access/summary-contracts";
import { loadAccessSummary } from "@/lib/access/summary-client";
import styles from "@/app/administracao/usuarios/access.module.css";

type SummaryState = { key: string; status: "loading" } | { key: string; status: "error"; message: string }
  | { key: string; status: "loaded"; summary: Extract<AccessSummary, { available: true }> };

/** Mount only inside Administração so opening the overview performs no count reads. */
export function DeferredAccessSummary({ actor }: { actor: AgendaActorContext }) {
  const { userId, profile, engineeringScope, administrativeScope } = actor;
  const key = JSON.stringify([userId, profile, engineeringScope, administrativeScope]);
  const [state, setState] = useState<SummaryState>({ key, status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void loadAccessSummary({ userId, profile, engineeringScope, administrativeScope }, controller.signal)
      .then((summary) => { if (!controller.signal.aborted) setState({ key, status: "loaded", summary }); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setState({ key, status: "error", message: reason instanceof Error
          ? reason.message : "Não foi possível carregar o resumo de acessos." });
      });
    return () => controller.abort();
  }, [key, userId, profile, engineeringScope, administrativeScope, attempt]);
  const current = state.key === key ? state : { key, status: "loading" as const };
  return <div className={styles.embedded}>
    <div className={styles.intro}><h2>Usuários e acessos</h2></div>
    {current.status === "error" ? <div className={styles.error} role="alert">
      <p>{current.message}</p>
      <button type="button" className="secondary" onClick={() => {
        setState({ key, status: "loading" }); setAttempt((value) => value + 1);
      }}>Tentar novamente</button>
    </div> : current.status === "loading" ? <p className="muted" role="status">Carregando resumo de acessos...</p> : <div className={styles.stats}>
      <Link prefetch={false} className={`${styles.stat} ${styles.statLink}`} href="/administracao/usuarios/pendentes" target="_blank" rel="noopener noreferrer"
        aria-label={`${current.summary.pendingCount} aprovações pendentes. Abrir em uma nova janela.`}><strong>{current.summary.pendingCount}</strong><span>Aprovações</span></Link>
      <Link className={`${styles.stat} ${styles.statLink}`} href="/administracao/usuarios/historico"
        aria-label={`${current.summary.activeCount} contas ativas. Abrir Aprovações e Histórico.`}><strong>{current.summary.activeCount}</strong><span>Contas Ativas</span></Link>
    </div>}
  </div>;
}
