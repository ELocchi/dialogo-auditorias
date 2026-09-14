"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { confirmationCallbackUrl } from "@/lib/auth/site-url";
import { requestAccess, signIn, signOut } from "@/lib/auth/service";
import { reportLoginFailure } from "@/lib/auth/login-report";
import type { AuthActionState } from "@/lib/auth/contracts";
import { clearActiveProfileChoice } from "@/lib/auth/active-profile-session";

const writableClient = () => createClient({ writableCookies: true });

export async function signUpAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const result = await requestAccess(formData, { createClient: writableClient, callbackUrl: confirmationCallbackUrl });
  if (result.redirectTo) { revalidatePath("/", "layout"); redirect(result.redirectTo); }
  return result.state;
}

export async function signInAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const result = await signIn(formData, { createClient: writableClient, reportFailure: reportLoginFailure });
  if (result.redirectTo) { await clearActiveProfileChoice(); revalidatePath("/", "layout"); redirect(result.redirectTo); }
  return result.state;
}

export async function signOutAction(): Promise<AuthActionState> {
  const result = await signOut({ createClient: writableClient });
  if (result.redirectTo) { await clearActiveProfileChoice(); revalidatePath("/", "layout"); redirect(result.redirectTo); }
  return result.state;
}
