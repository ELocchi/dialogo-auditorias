import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthActionResult } from "./contracts.ts";
import { classifyLoginFailure, loginRejectedMessage, type LoginDiagnosticCode } from "./login-diagnostics.ts";
import { corporateEmail, validateSignIn, validateSignUp } from "./validation.ts";

// Called only from Server Actions; injection keeps tests offline and credential-free.
type AuthClient = Pick<SupabaseClient, "auth">;
type Dependencies = { createClient: () => Promise<AuthClient>; callbackUrl: () => string };
const failed = (message: string): AuthActionResult => ({ state: { status: "error", message } });
const pending = (): AuthActionResult => ({
  state: { status: "success", message: "E-mail/cadastro realizado. Aguardando liberação do Administrativo." },
  redirectTo: "/aguardando-liberacao",
});
const signupNotice = (): AuthActionResult => ({ state: {
  status: "success",
  message: "Se o cadastro puder ser processado, você receberá as orientações no e-mail informado. Confirme o e-mail antes de entrar. Se já solicitou acesso, use Entrar.",
} });

export async function requestAccess(form: FormData, deps: Dependencies): Promise<AuthActionResult> {
  const validated = validateSignUp(form);
  if (!validated.ok) return failed(validated.message);
  try {
    const client = await deps.createClient();
    // The deployed Auth trigger creates the pending request atomically with
    // the identity. Schema diagnostics must not gate signup or replace RLS.
    const { email, password, nome, cargo_area_informado, obra_referencia_informada } = validated.data;
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: deps.callbackUrl(),
        data: { nome, cargo_area_informado, obra_referencia_informada },
      },
    });
    // Duplicate-account and account-related provider responses have the same
    // public notice. Never disclose user existence or claim confirmed delivery.
    if (error) return signupNotice();
    if (data.session) return pending();
    return signupNotice();
  } catch {
    return failed("Não foi possível processar a solicitação agora. Tente novamente mais tarde.");
  }
}

type SignInDependencies = Pick<Dependencies, "createClient"> & { reportFailure?: (code: LoginDiagnosticCode) => void };

export async function signIn(form: FormData, deps: SignInDependencies): Promise<AuthActionResult> {
  const validated = validateSignIn(form);
  if (!validated.ok) return failed(validated.message);
  let stage: "client_setup" | "password_sign_in" = "client_setup";
  const report = (code: LoginDiagnosticCode) => {
    try { deps.reportFailure?.(code); } catch { /* Diagnostics must never alter authentication. */ }
  };
  try {
    const client = await deps.createClient();
    stage = "password_sign_in";
    const { data, error } = await client.auth.signInWithPassword(validated.data);
    if (error) {
      const failure = classifyLoginFailure(error, stage);
      report(failure.code);
      return failed(failure.message);
    }
    if (!data.user || !corporateEmail(data.user.email)) {
      report("LOGIN_REJECTED");
      return failed(loginRejectedMessage);
    }
    // Identity is real, but neither metadata nor login grants operational access.
    return pending();
  } catch (error) {
    const failure = classifyLoginFailure(error, stage);
    report(failure.code);
    return failed(failure.message);
  }
}

export async function signOut(deps: Pick<Dependencies, "createClient">): Promise<AuthActionResult> {
  try {
    const client = await deps.createClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return failed("Não foi possível encerrar a sessão. Tente novamente.");
    return { state: { status: "success", message: "Sessão encerrada." }, redirectTo: "/entrar" };
  } catch {
    return failed("Não foi possível encerrar a sessão. Tente novamente.");
  }
}
