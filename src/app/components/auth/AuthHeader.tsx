import type { ReactNode } from "react";
import { DialogoLogo } from "../dialogo-logo";
import styles from "./auth.module.css";

export function AuthHeader({ children, className, context }: { children?: ReactNode; className?: string; context?: ReactNode }) {
  return (
    <header className={`${styles.header}${className ? ` ${className}` : ""}`}>
      <div className={styles.headerInner}>
        <div className={styles.brand}>
          <DialogoLogo />
        </div>
        <div className={styles.product}>
          <strong className={styles.productName}>
            <span className={styles.productDialogo}>Diálogo</span>{" "}
            <span className={styles.productAuditorias}>AUDITORIAS</span>
          </strong>
          <span className={styles.productSubtitle}>Qualidade e Segurança do Trabalho</span>
          {context && <div className={styles.productContext}>{context}</div>}
        </div>
        {children && <div className={styles.headerActions}>{children}</div>}
      </div>
    </header>
  );
}
