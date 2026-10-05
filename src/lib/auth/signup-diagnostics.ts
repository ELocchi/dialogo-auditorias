import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

export const signupDiagnosticCodes = [
  "SIGNUP_SETUP_FAILED", "SIGNUP_CONNECTION_FAILED", "SIGNUP_EMAIL_UNAVAILABLE",
  "SIGNUP_RATE_LIMITED", "SIGNUP_PROVIDER_FAILED", "SIGNUP_WEAK_PASSWORD",
  "SIGNUP_REJECTED", "SIGNUP_UNEXPECTED_FAILED",
] as const;

export type SignupDiagnosticCode = typeof signupDiagnosticCodes[number];

const messages: Record<SignupDiagnosticCode, string | null> = {
  SIGNUP_SETUP_FAILED: "Não foi possível preparar o cadastro agora. Tente novamente mais tarde.",
  SIGNUP_CONNECTION_FAILED: "Não foi possível conectar ao serviço de cadastro. Tente novamente em instantes.",
  SIGNUP_EMAIL_UNAVAILABLE: "Não foi possível enviar o e-mail de confirmação. Peça ao administrador para verificar o serviço de envio de e-mails da plataforma.",
  SIGNUP_RATE_LIMITED: "O limite temporário de tentativas ou de envio de e-mails foi atingido. Aguarde alguns minutos antes de tentar novamente.",
  SIGNUP_PROVIDER_FAILED: "O serviço de cadastro não conseguiu concluir a solicitação ou enviar a confirmação. Tente novamente mais tarde. Se o problema continuar, avise o administrador.",
  SIGNUP_WEAK_PASSWORD: "Escolha uma senha mais forte e tente novamente.",
  // Existing accounts retain exactly the same notice as an accepted signup.
  SIGNUP_REJECTED: null,
  SIGNUP_UNEXPECTED_FAILED: "Não foi possível processar a solicitação agora. Tente novamente mais tarde.",
};

/** Distinguish delivery failures without returning provider details or account existence. */
export function classifySignupFailure(error: unknown, stage: "client_setup" | "signup") {
  const diagnostic = (code: SignupDiagnosticCode) => ({ code, message: messages[code] });
  const fallback = stage === "client_setup" ? "SIGNUP_SETUP_FAILED" : "SIGNUP_UNEXPECTED_FAILED";
  try {
    if (isAuthError(error)) {
      if (error.code === "user_already_exists" || error.code === "email_exists") return diagnostic("SIGNUP_REJECTED");
      if (error.code === "email_address_not_authorized") return diagnostic("SIGNUP_EMAIL_UNAVAILABLE");
      if (error.code === "weak_password") return diagnostic("SIGNUP_WEAK_PASSWORD");
      const status = Number.isInteger(error.status) ? error.status : undefined;
      if (status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
        return diagnostic("SIGNUP_RATE_LIMITED");
      }
      if (status !== undefined && status >= 500 && status <= 599) return diagnostic("SIGNUP_PROVIDER_FAILED");
      if (isAuthRetryableFetchError(error) && status === 0) return diagnostic("SIGNUP_CONNECTION_FAILED");
    }
  } catch {
    // Error getters and unexpected shapes must not leak data or break the form.
  }
  return diagnostic(fallback);
}
