import { Icon } from "./ui-icon";
import styles from "./admin-findings.module.css";

export type AdminFindingSummary = {
  id: string;
  title: string;
  checklistItem?: string;
  discipline?: string;
  workCount?: number;
  occurrences?: number;
};

function FindingsList({ items, emptyMessage }: {
  items: readonly AdminFindingSummary[];
  emptyMessage: string;
}) {
  if (!items.length) return <p className={styles.empty}>{emptyMessage}</p>;

  return <ul className={styles.list}>
    {items.map((item) => <li key={item.id} className={styles.finding}>
      <strong className={styles.findingTitle}>{item.title}</strong>
      {item.checklistItem && <p className={styles.checklistItem}>Item do roteiro: {item.checklistItem}</p>}
      {(item.discipline || item.workCount !== undefined || item.occurrences !== undefined) &&
        <ul className={styles.metadata} aria-label="Informações do apontamento">
          {item.discipline && <li>{item.discipline}</li>}
          {item.workCount !== undefined && <li>{item.workCount} {item.workCount === 1 ? "obra" : "obras"}</li>}
          {item.occurrences !== undefined && <li>{item.occurrences} {item.occurrences === 1 ? "ocorrência" : "ocorrências"}</li>}
        </ul>}
    </li>)}
  </ul>;
}

export function AdminFindings({ mostSevere = [], mostRecurring = [] }: {
  mostSevere?: readonly AdminFindingSummary[];
  mostRecurring?: readonly AdminFindingSummary[];
}) {
  return <section className={`panel ${styles.panel}`} aria-label="Principais apontamentos">
    <div className={styles.heading}>
      <span className={styles.headingIcon}><Icon name="occurrences" /></span>
      <h3>Principais apontamentos</h3>
    </div>
    <div className={styles.columns}>
      <div className={styles.group}>
        <h4>Mais graves</h4>
        <FindingsList items={mostSevere} emptyMessage="Sem dados de gravidade disponíveis." />
      </div>
      <div className={styles.group}>
        <h4>Mais recorrentes</h4>
        <FindingsList items={mostRecurring} emptyMessage="Sem dados de recorrência disponíveis." />
      </div>
    </div>
  </section>;
}
