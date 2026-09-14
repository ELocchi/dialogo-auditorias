"use client";

import { useActionState } from "react";
import { createWorkAction } from "@/app/administracao/usuarios/actions";
import { initialAccessState } from "@/lib/access/contracts";
import styles from "@/app/administracao/usuarios/access.module.css";

export function WorkForm() {
  const [state, action, pending] = useActionState(createWorkAction, initialAccessState);
  return <form action={action} aria-busy={pending} className={styles.workForm}>
    <label htmlFor="new-access-work">Nome real da obra
      <input id="new-access-work" name="nome" required minLength={2} maxLength={160} autoComplete="off" disabled={pending} />
    </label>
    <button type="submit" className="secondary" disabled={pending}>{pending ? "Cadastrando…" : "Cadastrar obra"}</button>
    {state.message && <p className={state.status === "error" ? styles.error : styles.success} role={state.status === "error" ? "alert" : "status"} aria-live="polite">{state.message}</p>}
  </form>;
}
