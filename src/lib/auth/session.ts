import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "../supabase/server.ts";
import { corporateEmail } from "./validation.ts";
import { effectiveDestination, readEffectiveAccount } from "./effective-access.ts";
import { readActiveProfileContext } from "./active-profile-session.ts";

export async function verifiedUser() {
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user || !corporateEmail(data.user.email)) return null;
    return data.user;
  } catch { return null; }
}

export async function requireUser() {
  const user = await verifiedUser();
  if (!user) redirect("/entrar");
  return user;
}

export async function ownAccessRequest(userId: string) {
  try {
    const client = await createClient();
    const { data, error } = await client.from("access_requests")
      .select("auth_user_id,nome,email,status_acesso,cargo_area_informado,obra_referencia_informada,email_confirmado_em,created_at,updated_at")
      .eq("auth_user_id", userId).maybeSingle();
    if (error || !data || data.auth_user_id !== userId) return null;
    return data;
  } catch { return null; }
}

export async function effectiveAccount(user: NonNullable<Awaited<ReturnType<typeof verifiedUser>>>) {
  try { return await readEffectiveAccount(await createClient(), user); }
  catch { return null; }
}

export async function requireActiveProfile() {
  const user = await requireUser();
  const account = await effectiveAccount(user);
  if (!account) redirect(effectiveDestination(account));
  const context = await readActiveProfileContext(user.id, account);
  if (!context) redirect("/escolher-perfil");
  return { user, account, ...context };
}

export async function requireAdministrator() {
  const { user, profile } = await requireActiveProfile();
  if (profile !== "ADMINISTRATIVO") redirect("/app");
  // Also ask the database helper; it checks the current Auth/account state.
  let authorized = false;
  try {
    const client = await createClient();
    const { data, error } = await client.rpc("is_current_access_administrator");
    authorized = !error && data === true;
  } catch { /* Fail closed without disclosing provider errors. */ }
  if (!authorized) redirect("/minha-conta?acesso=restrito");
  return user;
}
