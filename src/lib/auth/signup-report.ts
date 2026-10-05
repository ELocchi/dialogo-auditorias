import "server-only";
import { signupDiagnosticCodes, type SignupDiagnosticCode } from "./signup-diagnostics.ts";

/** Fixed categories only; no email, password, confirmation link or raw provider error. */
export function reportSignupFailure(code: SignupDiagnosticCode) {
  const safeCode = signupDiagnosticCodes.find((candidate) => candidate === code) ?? "SIGNUP_UNEXPECTED_FAILED";
  console.warn(JSON.stringify({ event: "auth_signup_failure", code: safeCode, at: new Date().toISOString() }));
}
