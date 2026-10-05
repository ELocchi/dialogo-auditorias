"use client";
import { SlowOperation } from "@/app/components/slow-operation";
import { useHydrated } from "../use-hydrated";
import { recoverAction } from "../recover-action";

import Link from "next/link";
import { startTransition, useActionState } from "react";
import { signInAction, signUpAction } from "@/app/auth/actions";
import type { AuthActionState } from "@/lib/auth/contracts";
import styles from "./auth.module.css";

const initialState: AuthActionState = { status: "idle", message: "" };

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const hydrated = useHydrated();
  const isSignup = mode === "signup";
  const [state, formAction, pending] = useActionState(
    recoverAction(isSignup ? signUpAction : signInAction),
    initialState,
  );

  return (
    <>
      <form method="post" onSubmit={event => { event.preventDefault(); if (pending) return; const form = new FormData(event.currentTarget); startTransition(() => formAction(form)); }} className={styles.form} aria-busy={pending}>
        {isSignup && (
          <label htmlFor="auth-name">
            Nome completo
            <input disabled={pending || !hydrated} id="auth-name" name="nome" autoComplete="name" required />
          </label>
        )}
        <label htmlFor="auth-email">
          E-mail corporativo
          <input disabled={pending || !hydrated}
            id="auth-email"
            name="email"
            type="email"
            autoComplete={isSignup ? "email" : "username"}
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>
        <label htmlFor="auth-password">
          {isSignup ? "Crie sua senha" : "Senha"}
          <input disabled={pending || !hydrated}
            id="auth-password"
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
          />
        </label>
        {isSignup && (
          <>
            <label htmlFor="auth-password-confirmation">
              Confirme sua senha
              <input disabled={pending || !hydrated}
                id="auth-password-confirmation"
                name="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
            <fieldset className={styles.optionalFields}>
              <legend>Informações complementares <span>(opcionais)</span></legend>
              <label htmlFor="auth-role-reference">
                Cargo ou área
                <input disabled={pending || !hydrated} id="auth-role-reference" name="cargoArea" autoComplete="organization-title" />
              </label>
              <label htmlFor="auth-work-reference">
                Obra de referência
                <input disabled={pending || !hydrated} id="auth-work-reference" name="obraReferencia" aria-describedby="reference-guidance" />
              </label>
              <p id="reference-guidance" className={styles.optionalHelp}>
                Essas informações ajudam na análise da solicitação. Os acessos serão definidos pelo Administrativo.
              </p>
            </fieldset>
            <p className={styles.notice}>
              Após solicitar acesso, confirme seu e-mail e aguarde a liberação do Administrativo.
            </p>
          </>
        )}
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
        <button className={styles.submit} type="submit" disabled={pending || !hydrated}>
          {pending
            ? isSignup ? "Enviando solicitação…" : "Entrando…"
            : isSignup ? "Solicitar acesso" : "Entrar"}
        </button>
      <SlowOperation pending={pending} /></form>
      <div className={styles.alternative}>
        {isSignup && <span>Já possui uma conta?</span>}
        <Link href={isSignup ? "/entrar" : "/solicitar-acesso"}>
          {isSignup ? "Entrar" : "Solicitar acesso"}
        </Link>
      </div>
    </>
  );
}
