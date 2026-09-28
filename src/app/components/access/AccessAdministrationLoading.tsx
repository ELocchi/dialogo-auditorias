import styles from "@/app/administracao/usuarios/access.module.css";

export function AccessAdministrationLoading() {
  return <div className={styles.loadingPanel} role="status" aria-live="polite">
    <p>Carregando usuários e acessos…</p>
    <div className={styles.loadingRows} aria-hidden="true"><span /><span /><span /></div>
  </div>;
}

export function AccessAdministrationPageLoading({ title = "Usuários e acessos" }: { title?: string }) {
  return <div className={styles.shell}>
    <main className={styles.main} aria-busy="true">
      <div className={styles.intro}><p className={styles.eyebrow}>Administração</p><h2>{title}</h2></div>
      <AccessAdministrationLoading />
    </main>
  </div>;
}
