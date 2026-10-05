import { BackHeading, BackLink } from "@/app/components/back-control";
import type { ReactNode } from "react";
import { AuthHeader } from "./AuthHeader";
import styles from "./auth.module.css";

type AuthShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
};

export function AuthShell({ title, description, children, backHref, backLabel = "Voltar" }: AuthShellProps) {
  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#auth-content">Ir para o conteúdo</a>
      <AuthHeader />
      <main className={styles.main} id="auth-content" tabIndex={-1}>
        <section className={styles.card} aria-labelledby="auth-title">
          <div className={styles.heading}>
            {backHref ? <BackHeading><BackLink href={backHref} label={backLabel} /><h1 id="auth-title">{title}</h1></BackHeading> : <h1 id="auth-title">{title}</h1>}
            {description && <p className={styles.description}>{description}</p>}
          </div>
          {children}
        </section>
      </main>
      <footer className={styles.footer}>Diálogo Engenharia · Auditorias de obra</footer>
    </div>
  );
}
