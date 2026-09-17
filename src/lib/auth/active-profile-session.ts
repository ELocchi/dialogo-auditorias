import "server-only";

import { cookies } from "next/headers";
import type { AccessProfile, AdministrativeScope, EngineeringScope } from "../access/contracts.ts";
import type { EffectiveAccount } from "./effective-access.ts";
import { activeProfileCookieName, encodeActiveProfileChoice, resolveActiveProfileContext } from "./active-profile.ts";
import { confirmationCallbackUrl } from "./site-url.ts";

function preferenceOptions() {
  // The validated APP_URL permits HTTP only on loopback for the local preview.
  // A missing/invalid setting always retains the secure default.
  let secure = true;
  try { secure = new URL(confirmationCallbackUrl()).protocol === "https:"; } catch { /* Fail secure. */ }
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure };
}

export async function readActiveProfile(userId: string, account: EffectiveAccount | null) {
  return (await readActiveProfileContext(userId, account))?.profile ?? null;
}

export async function readActiveProfileContext(userId: string, account: EffectiveAccount | null) {
  const values = (await cookies()).getAll(activeProfileCookieName);
  // Ambiguous cookies from different paths cannot select a privileged view.
  return resolveActiveProfileContext(account, userId, values.length === 1 ? values[0].value : undefined);
}

// Call only after the Server Action checks current account membership.
export async function writeActiveProfileChoice(userId: string, profile: AccessProfile, engineeringScope: EngineeringScope | null = null, administrativeScope: AdministrativeScope | null = null) {
  (await cookies()).set(activeProfileCookieName, encodeActiveProfileChoice(userId, profile, engineeringScope, administrativeScope), preferenceOptions());
}

export async function clearActiveProfileChoice() {
  (await cookies()).set(activeProfileCookieName, "", { ...preferenceOptions(), maxAge: 0 });
}
