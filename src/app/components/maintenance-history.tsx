import { formatAuditDate } from "@/domain/operational-records";
import { platformUpdates } from "@/domain/platform-updates";
import styles from "./prototype-workspace.module.css";

export function MaintenanceHistory() {
  return <section className="panel" aria-labelledby="maintenance-history-heading">
    <h3 id="maintenance-history-heading">Histórico de manutenção</h3>
    <div className={styles.historySections}>
      <section aria-labelledby="platform-updates-heading">
        <h4 id="platform-updates-heading">Manutenções</h4>
        <ol className={styles.historyList}>{platformUpdates.map((update) => <li key={update.date}>
          <time dateTime={update.date}>{formatAuditDate(update.date)}</time>
          <strong>{update.title}</strong>
          <p>{update.description}</p>
        </li>)}</ol>
      </section>
    </div>
  </section>;
}
