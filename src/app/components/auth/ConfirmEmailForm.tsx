"use client";
import { SlowOperation } from "@/app/components/slow-operation";
import { recoverAction } from "../recover-action";

import { useActionState } from "react";
import { confirmEmailAction } from "@/app/confirmar-email/actions";
import { initialAuthState } from "@/lib/auth/contracts";
import styles from "./auth.module.css";

export function ConfirmEmailForm() {
  const [state, formAction, pending] = useActionState(recoverAction(confirmEmailAction), initialAuthState);

  return (
    <form action={formAction} className={styles.form} aria-busy={pending}>
      {state.message && (
        <p
          className={state.status === "error" ? styles.error : styles.feedback}
          role={state.status === "error" ? "alert" : "status"}
          aria-live="polite"
          aria-atomic="true"
        >
          {state.message}
        </p>
      )}
      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? "Confirmando e-mail…" : "Confirmar meu e-mail"}
      </button>
    <SlowOperation pending={pending} /></form>
  );
}
