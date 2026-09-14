import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

export const loginDiagnosticCodes = [
  "LOGIN_SETUP_FAILED",
  "LOGIN_SESSION_FAILED",
  "LOGIN_CONNECTION_FAILED",
  "LOGIN_RATE_LIMITED",
  "LOGIN_PROVIDER_FAILED",
  "LOGIN_UNEXPECTED_FAILED",
  "LOGIN_REJECTED",
] as const;

export type LoginDiagnosticCode = typeof loginDiagnosticCodes[number];

export const loginRejectedMessage = "Não foi possível entrar. Confira o e-mail, a senha e a confirmação do e-mail.";

const messages: Record<LoginDiagnosticCode, string> = {
  LOGIN_SETUP_FAILED: "Não foi possível preparar o acesso agora. Tente novamente mais tarde.",
  LOGIN_SESSION_FAILED: "Não foi possível manter sua sessão. Tente entrar novamente.",
  LOGIN_CONNECTION_FAILED: "Não foi possível conectar ao serviço de autenticação agora. Tente novamente em instantes.",
  LOGIN_RATE_LIMITED: "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.",
  LOGIN_PROVIDER_FAILED: "O serviço de autenticação está temporariamente indisponível. Tente novamente em instantes.",
  LOGIN_UNEXPECTED_FAILED: "Não foi possível concluir o acesso agora. Tente novamente em instantes.",
  LOGIN_REJECTED: loginRejectedMessage,
};

const accountRejections = new Set([
  "invalid_credentials", "email_not_confirmed", "user_not_found", "user_banned",
  "phone_not_confirmed", "email_address_not_authorized", "email_address_invalid",
]);
const rateLimits = new Set([
  "over_request_rate_limit", "over_email_send_rate_limit", "over_sms_send_rate_limit",
]);

function diagnostic(code: LoginDiagnosticCode) {
  // Return only authored values, never provider data or a reference to the error.
  return { code, message: messages[code] };
}

/** Classify server failures without disclosing account existence or error details. */
export function classifyLoginFailure(
  error: unknown,
  stage: "client_setup" | "password_sign_in",
): { code: LoginDiagnosticCode; message: string } {
  const fallback = stage === "client_setup" ? "LOGIN_SETUP_FAILED" : "LOGIN_UNEXPECTED_FAILED";
  try {
    if (isAuthError(error)) {
      // Account-specific responses deliberately remain indistinguishable.
      if (typeof error.code === "string" && accountRejections.has(error.code)) {
        return diagnostic("LOGIN_REJECTED");
      }
      const status = typeof error.status === "number" && Number.isInteger(error.status)
        ? error.status : undefined;
      if (status === 429 || (typeof error.code === "string" && rateLimits.has(error.code))) {
        return diagnostic("LOGIN_RATE_LIMITED");
      }
      if (status !== undefined && status >= 500 && status <= 599) {
        return diagnostic("LOGIN_PROVIDER_FAILED");
      }
      if (isAuthRetryableFetchError(error) && status === 0) {
        return diagnostic("LOGIN_CONNECTION_FAILED");
      }
      if (status !== undefined && status >= 400 && status <= 499) {
        return diagnostic("LOGIN_REJECTED");
      }
      return diagnostic(fallback);
    }
    // This exact internal sentinel is emitted by our writable cookie adapter.
    // Provider messages and plain objects are never accepted as this sentinel.
    if (error instanceof Error && error.message === "Não foi possível manter a sessão.") {
      return diagnostic("LOGIN_SESSION_FAILED");
    }
  } catch {
    // Malformed errors/getters must not break the public failure response.
  }
  return diagnostic(fallback);
}
