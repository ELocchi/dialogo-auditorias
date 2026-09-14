"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction, signUpAction } from "@/app/auth/actions";
import type { AuthActionState } from "@/lib/auth/contracts";
import styles from "./auth.module.css";

const initialState: AuthActionState = { status: "idle", message: "" };

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const [state, formAction, pending] = useActionState(
    isSignup ? signUpAction : signInAction,
    initialState,
  );

  return (
    <>
      <form action={formAction} className={styles.form} aria-busy={pending}>
        {isSignup && (
          <label htmlFor="auth-name">
            Nome completo
            <input id="auth-name" name="nome" autoComplete="name" required />
          </label>
        )}
        <label htmlFor="auth-email">
          E-mail corporativo
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete={isSignup ? "email" : "username"}
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby="email-guidance"
            required
          />
        </label>
        <p id="email-guidance" className={styles.fieldHelp}>
          Utilize seu endereço @dialogo.com.br.
        </p>
        <label htmlFor="auth-password">
          {isSignup ? "Crie sua senha" : "Senha"}
          <input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            aria-describedby="password-guidance"
            required
          />
        </label>
        <p id="password-guidance" className={styles.fieldHelp}>
          Senha própria do Diálogo Auditorias, independente da senha Microsoft.
        </p>
        {isSignup && (
          <>
            <label htmlFor="auth-password-confirmation">
              Confirme sua senha
              <input
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
                <input id="auth-role-reference" name="cargoArea" autoComplete="organization-title" />
              </label>
              <label htmlFor="auth-work-reference">
                Obra de referência
                <input id="auth-work-reference" name="obraReferencia" aria-describedby="reference-guidance" />
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
        <button className={styles.submit} type="submit" disabled={pending}>
          {pending
            ? isSignup ? "Enviando solicitação…" : "Entrando…"
            : isSignup ? "Solicitar acesso" : "Entrar"}
        </button>
      </form>
      {!isSignup && (
        <p className={styles.recovery}>Esqueci minha senha <span>Em preparação</span></p>
      )}
      <div className={styles.alternative}>
        <span>{isSignup ? "Já possui uma conta?" : "Primeiro acesso?"}</span>
        <Link href={isSignup ? "/entrar" : "/solicitar-acesso"}>
          {isSignup ? "Entrar" : "Solicitar acesso"}
        </Link>
      </div>
    </>
  );
}
