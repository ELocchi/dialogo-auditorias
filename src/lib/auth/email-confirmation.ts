import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthActionResult } from "./contracts.ts";
import { corporateEmail } from "./validation.ts";

export const emailConfirmationError = "Não foi possível confirmar este e-mail. O link pode ter expirado ou já ter sido utilizado. Se já confirmou seu e-mail, tente entrar.";

/** TokenHash is opaque. Reject ambiguous fields and malformed/oversized links. */
export function emailConfirmationToken(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,512}$/.test(value) ? value : null;
}

type Dependencies = { createClient: () => Promise<Pick<SupabaseClient, "auth">> };
const failed = (): AuthActionResult => ({ state: { status: "error", message: emailConfirmationError } });

/** Only the explicit confirmation POST may consume the email token. */
export async function confirmEmail(form: FormData, deps: Dependencies): Promise<AuthActionResult> {
  if (!(form instanceof FormData)) return failed();
  const values = form.getAll("token_hash");
  const token = values.length === 1 ? emailConfirmationToken(values[0]) : null;
  if (!token) return failed();

  try {
    const client = await deps.createClient();
    // Never accept an OTP type, identity, destination or access grant from the form.
    const { data, error } = await client.auth.verifyOtp({ token_hash: token, type: "email" });
    const user = data?.user;
    if (error || !user?.id || !corporateEmail(user.email)
      || !user.email_confirmed_at || !Number.isFinite(Date.parse(user.email_confirmed_at))
      || !data.session || data.session.user?.id !== user.id) return failed();

    // Auth confirmation only makes the request eligible for administrative review.
    // This flow never writes accounts, profiles, grants or approval decisions.
    return {
      state: { status: "success", message: "E-mail confirmado. Aguarde a liberação do Administrativo." },
      redirectTo: "/aguardando-liberacao",
    };
  } catch {
    // Tokens, complete links and provider details must never be logged or returned.
    return failed();
  }
}
