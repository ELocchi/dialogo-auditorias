import styles from "./async-feedback.module.css";

export function AsyncSkeleton({ label = "Carregando…", rows = 3 }: { label?: string; rows?: number }) {
  return <div className={styles.skeleton} role="status" aria-label={label}>
    <span>{label}</span>
    <div aria-hidden="true">{Array.from({ length: rows }, (_, index) => <div className={styles.line} key={index} />)}</div>
  </div>;
}

export function PageSkeleton() {
  return <main className={styles.page}><section className="panel"><AsyncSkeleton label="Carregando página…" rows={5} /></section></main>;
}
