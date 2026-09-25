import { Icon } from "./ui-icon";
import styles from "./admin-findings.module.css";

export type AdminFindingSummary = {
  id: string;
  title: string;
  checklistItem?: string;
  discipline?: string;
  workCount?: number;
  occurrences?: number;
  descriptions?: Array<{ label?: string; description: string }>;
  references?: Array<{
    id: string;
    date: string;
    workName: string;
    responsible: string;
  }>;
};

const monthAbbreviations = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

function FindingsList({ items, emptyMessage, onOpenFindings }: {
  items: readonly AdminFindingSummary[];
  emptyMessage: string;
  onOpenFindings?: () => void;
}) {
  if (!items.length) return <p className={styles.empty}>{emptyMessage}</p>;

  const referenced = new Map<string, { reference: NonNullable<AdminFindingSummary["references"]>[number]; items: Map<string, AdminFindingSummary> }>();
  items.forEach((item) => item.references?.forEach((reference) => {
    const group = referenced.get(reference.id);
    if (group) group.items.set(item.id, item);
    else referenced.set(reference.id, { reference, items: new Map([[item.id, item]]) });
  }));
  const referencedItemIds = new Set([...referenced.values()].flatMap((group) => [...group.items.keys()]));
  const unreferenced = items.filter((item) => !referencedItemIds.has(item.id));

  return <>
    {[...referenced.values()].map(({ reference, items: referenceItems }) => {
      const [year, month] = reference.date.split("-");
      return <details className={styles.reference} key={reference.id}>
          <summary>
            <span className={styles.referenceDate}><strong>{monthAbbreviations[Number(month) - 1] ?? month}</strong><small>{year}</small></span>
            <span className={styles.referenceInfo}><strong>{reference.workName}</strong><small>Responsável</small><span>{reference.responsible}</span></span>
            <i className={styles.referenceChevron} aria-hidden="true" />
          </summary>
          <div className={styles.referenceDetails}>
            <ul className={styles.referenceItems}>{[...referenceItems.values()].map((item) => <li key={item.id}>
              {onOpenFindings ? <button type="button" onClick={onOpenFindings}>{item.checklistItem ?? item.title}</button>
                : <strong>{item.checklistItem ?? item.title}</strong>}
            </li>)}</ul>
          </div>
        </details>;
    })}
    {unreferenced.length > 0 && <ul className={`${styles.list} ${styles.summaryRows}`}>{unreferenced.map((item) => <li key={item.id} className={`${styles.finding}${item.descriptions?.length ? ` ${styles.recurringFinding}` : ""}`}>
      {item.descriptions?.length ? <details className={styles.recurringDetails}>
        <summary className={styles.summaryRow}>
          <strong className={styles.summaryItem}>{item.title}</strong>
          <span>{item.discipline ?? "—"}</span>
          <span>{item.workCount ?? 0} {item.workCount === 1 ? "obra" : "obras"}</span>
          <span>{item.occurrences ?? 0} {item.occurrences === 1 ? "ocorrência" : "ocorrências"}</span>
        </summary>
        <ul className={styles.recurringDescriptions}>{item.descriptions.map((description, index) => <li key={`${description.label ?? "item"}:${description.description}:${index}`}>
          {description.label && <strong>{description.label}</strong>}<span>{description.description}</span>
        </li>)}</ul>
      </details> : <div className={styles.summaryRow}>
        {onOpenFindings ? <button type="button" className={styles.summaryItem} onClick={onOpenFindings}>{item.title}</button>
          : <strong className={styles.summaryItem}>{item.title}</strong>}
        <span>{item.discipline ?? "—"}</span>
        <span>{item.workCount ?? 0} {item.workCount === 1 ? "obra" : "obras"}</span>
        <span>{item.occurrences ?? 0} {item.occurrences === 1 ? "ocorrência" : "ocorrências"}</span>
      </div>}
    </li>)}</ul>}
  </>;
}

export function AdminFindings({ mostSevere = [], mostRecurring = [], onOpenFindings }: {
  mostSevere?: readonly AdminFindingSummary[];
  mostRecurring?: readonly AdminFindingSummary[];
  onOpenFindings?: () => void;
}) {
  return <section className={`panel ${styles.panel}`} aria-label="Principais apontamentos">
    <div className={styles.heading}>
      <span className={styles.headingIcon}><Icon name="occurrences" /></span>
      <h3>Principais apontamentos</h3>
    </div>
    <div className={styles.columns}>
      <div className={styles.group}>
        <h4>Itens graves</h4>
        <FindingsList items={mostSevere} emptyMessage="Nenhum item marcado como grave." onOpenFindings={onOpenFindings} />
      </div>
      <div className={styles.group}>
        <h4>Mais recorrentes</h4>
        <FindingsList items={mostRecurring} emptyMessage="Nenhum item recorrente nas auditorias publicadas." onOpenFindings={onOpenFindings} />
      </div>
    </div>
  </section>;
}
