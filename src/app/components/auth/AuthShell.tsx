import type { ReactNode } from "react";
import styles from "./auth.module.css";

type AuthShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#auth-content">Ir para o conteúdo</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand} aria-label="Diálogo Engenharia">
            <span className="brand-name">Diálogo</span>
            <span className="brand-caption">ENGENHARIA</span>
          </div>
          <div className={styles.product}>
            <strong>Diálogo Auditorias</strong>
            <span>Gestão de segurança e qualidade</span>
          </div>
        </div>
      </header>
      <main className={styles.main} id="auth-content" tabIndex={-1}>
        <section className={styles.card} aria-labelledby="auth-title">
          <div className={styles.heading}>
            <p className={styles.eyebrow}>ACESSO À PLATAFORMA</p>
            <h1 id="auth-title">{title}</h1>
            {description && <p className={styles.description}>{description}</p>}
          </div>
          {children}
        </section>
      </main>
      <footer className={styles.footer}>Diálogo Engenharia · Auditorias de obra</footer>
    </div>
  );
}
