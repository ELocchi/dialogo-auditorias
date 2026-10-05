"use client";
import { SlowOperation } from "@/app/components/slow-operation";
import { recoverAction } from "../recover-action";

import { useActionState } from "react";
import { signOutAction } from "@/app/auth/actions";
import type { AuthActionState } from "@/lib/auth/contracts";
import styles from "./auth.module.css";

const initialState: AuthActionState = { status: "idle", message: "" };

export function LogoutButton() {
  const [state, formAction, pending] = useActionState(recoverAction(signOutAction), initialState);

  return (
    <form action={formAction} className={styles.logout} aria-busy={pending}>
      {state.message && <p className={styles.error} role="alert">{state.message}</p>}
      <button className="secondary" type="submit" disabled={pending}>
        {pending ? "Saindo…" : "Sair"}
      </button>
    <SlowOperation pending={pending} /></form>
  );
}
