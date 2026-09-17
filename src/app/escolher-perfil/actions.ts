"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, effectiveAccount } from "@/lib/auth/session";
import { validateProfileSelectionContext } from "@/lib/auth/active-profile";
import { writeActiveProfileChoice } from "@/lib/auth/active-profile-session";

export async function selectProfileAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const account = await effectiveAccount(user);
  if (!account) redirect("/aguardando-liberacao");
  const context = validateProfileSelectionContext(form, account, user.id);
  if (!context) redirect("/escolher-perfil?erro=perfil");
  await writeActiveProfileChoice(user.id, context.profile, context.engineeringScope, context.administrativeScope);
  revalidatePath("/", "layout");
  redirect("/app");
}
