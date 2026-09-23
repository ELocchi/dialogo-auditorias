import { formatAuditDate } from "@/domain/operational-records";
import { platformUpdates } from "@/domain/platform-updates";
import styles from "./prototype-workspace.module.css";

export function MaintenanceHistory() {
  return <section className="panel" aria-labelledby="maintenance-history-heading">
    <h3 id="maintenance-history-heading">Histórico de manutenção</h3>
    <div className={styles.historySections}>
      <section aria-labelledby="platform-updates-heading">
        <h4 id="platform-updates-heading">Atualizações da plataforma</h4>
        <ol className={styles.historyList}>{platformUpdates.map((update) => <li key={update.date}>
          <time dateTime={update.date}>{formatAuditDate(update.date)}</time>
          <strong>{update.title}</strong>
          <p>{update.description}</p>
        </li>)}</ol>
        <p className={styles.historyNote}>Registro das alterações do aplicativo; a publicação de cada versão é realizada separadamente.</p>
      </section>
      <section aria-labelledby="created-audits-heading">
        <h4 id="created-audits-heading">Auditorias criadas</h4>
        <p className={styles.historyNote}>A auditoria publicada de Qualidade Completa da obra BoulevarDiálogo, realizada em 23/09/2026, está persistida com nota 6,74 e evidências privadas.</p>
      </section>
    </div>
  </section>;
}
