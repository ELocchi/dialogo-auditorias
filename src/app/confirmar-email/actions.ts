"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clearActiveProfileChoice } from "@/lib/auth/active-profile-session";
import { confirmEmail } from "@/lib/auth/email-confirmation";
import type { AuthActionState } from "@/lib/auth/contracts";

export async function confirmEmailAction(_previous: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const result = await confirmEmail(formData, {
    createClient: () => createClient({ writableCookies: true }),
  });
  if (result.redirectTo) {
    await clearActiveProfileChoice();
    revalidatePath("/", "layout");
    redirect("/aguardando-liberacao");
  }
  return result.state;
}
