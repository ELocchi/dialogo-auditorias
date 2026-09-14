import "server-only";
import { loginDiagnosticCodes, type LoginDiagnosticCode } from "./login-diagnostics.ts";

/** Fixed diagnostic categories only: never log FormData, errors, credentials or identity. */
export function reportLoginFailure(code: LoginDiagnosticCode) {
  const safeCode = loginDiagnosticCodes.find((candidate) => candidate === code) ?? "LOGIN_PROVIDER_FAILED";
  console.warn(JSON.stringify({ event: "auth_login_failure", code: safeCode, at: new Date().toISOString() }));
}
