import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server.ts";
import { corporateEmail } from "./validation.ts";
import { effectiveDestination, readEffectiveAccount } from "./effective-access.ts";
import { readActiveProfileContext } from "./active-profile-session.ts";

// React cache only shares reads inside one Server Component render. New requests
// and calls outside a render (including Server Actions) still verify live access.
export const verifiedUser = cache(async function verifiedUser() {
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user || !corporateEmail(data.user.email)) return null;
    return data.user;
  } catch { return null; }
});

export async function requireUser() {
  const user = await verifiedUser();
  if (!user) redirect("/entrar");
  return user;
}

export const ownAccessRequest = cache(async function ownAccessRequest(userId: string) {
  try {
    const client = await createClient();
    const { data, error } = await client.from("access_requests")
      .select("auth_user_id,nome,email,status_acesso,cargo_area_informado,obra_referencia_informada,email_confirmado_em,created_at,updated_at")
      .eq("auth_user_id", userId).maybeSingle();
    if (error || !data || data.auth_user_id !== userId) return null;
    return data;
  } catch { return null; }
});

// Use all identity fields checked by readEffectiveAccount as scalar cache keys;
// separate user objects with the same verified identity can share this read.
const effectiveAccountForIdentity = cache(async (id: string, email: string | undefined, emailConfirmedAt: string | undefined) => {
  try { return await readEffectiveAccount(await createClient(), { id, email, email_confirmed_at: emailConfirmedAt }); }
  catch { return null; }
});

export async function effectiveAccount(user: NonNullable<Awaited<ReturnType<typeof verifiedUser>>>) {
  return effectiveAccountForIdentity(user.id, user.email, user.email_confirmed_at);
}

export async function requireActiveProfile() {
  const user = await requireUser();
  const account = await effectiveAccount(user);
  if (!account) redirect(effectiveDestination(account));
  const context = await readActiveProfileContext(user.id, account);
  if (!context) redirect("/escolher-perfil");
  return { user, account, ...context };
}

export const requireAdministrator = cache(async function requireAdministrator() {
  const { user, profile, administrativeScope } = await requireActiveProfile();
  if (profile !== "ADMINISTRATIVO" || administrativeScope !== "GERAL") redirect("/app");
  // Also ask the database helper; it checks the current Auth/account state.
  let authorized = false;
  try {
    const client = await createClient();
    const { data, error } = await client.rpc("is_current_access_administrator");
    authorized = !error && data === true;
  } catch { /* Fail closed without disclosing provider errors. */ }
  if (!authorized) redirect("/minha-conta?acesso=restrito");
  return user;
});
