import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthActionResult } from "./contracts.ts";
import { corporateEmail } from "./validation.ts";

export const emailConfirmationError = "Não foi possível concluir a confirmação. Entre novamente e tente confirmar seu e-mail.";

type Dependencies = { createClient: () => Promise<Pick<SupabaseClient, "auth" | "rpc">> };
const failed = (): AuthActionResult => ({ state: { status: "error", message: emailConfirmationError } });

/** Only an explicit authenticated POST makes a signup eligible for review. */
export async function confirmEmail(form: FormData, deps: Dependencies): Promise<AuthActionResult> {
  if (!(form instanceof FormData)) return failed();

  try {
    const client = await deps.createClient();
    // The email link establishes the session; never trust identity or status
    // submitted in a form. Opening an email link does not submit this step.
    const { data, error } = await client.auth.getUser();
    const user = data?.user;
    if (error || !user?.id || !corporateEmail(user.email)
      || !user.email_confirmed_at || !Number.isFinite(Date.parse(user.email_confirmed_at))) return failed();

    // The database rechecks live Auth state and binds the write to auth.uid().
    // It records only the confirmation; it never approves or grants access.
    const { data: confirmed, error: confirmationError } = await client.rpc("confirm_own_access_request_email");
    if (confirmationError || confirmed !== true) return failed();

    return {
      state: { status: "success", message: "E-mail confirmado. Aguarde a liberação do Administrativo." },
      redirectTo: "/aguardando-liberacao",
    };
  } catch {
    // Sessions, identity data and provider details must never be logged or returned.
    return failed();
  }
}
