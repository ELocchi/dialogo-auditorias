"use server";

import { revalidatePath } from "next/cache";
import { requireAdministrator } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { approveRequest, updateAccountAccess } from "@/lib/access/service";
import { createWorkWithDetails } from "@/lib/works/service";
import type { AccessActionState } from "@/lib/access/contracts";
import type { WorkEditState } from "@/lib/works/contracts";

export async function approveAccessAction(_previous: AccessActionState, form: FormData): Promise<AccessActionState> {
  const user = await requireAdministrator();
  const state = await approveRequest(form, { actorId: user.id, createClient: () => createClient({ writableCookies: true }) });
  if (state.status === "success") { revalidatePath("/administracao/usuarios"); revalidatePath("/app"); }
  return state;
}

export async function createWorkAction(_previous: WorkEditState, form: FormData): Promise<WorkEditState> {
  await requireAdministrator();
  const state = await createWorkWithDetails(form, { createClient: () => createClient({ writableCookies: true }) });
  if (state.status === "success") { revalidatePath("/administracao/usuarios"); revalidatePath("/app", "layout"); }
  return state;
}

export async function updateAccessAction(_previous: AccessActionState, form: FormData): Promise<AccessActionState> {
  const user = await requireAdministrator();
  const state = await updateAccountAccess(form, { actorId: user.id, createClient: () => createClient({ writableCookies: true }) });
  if (state.status === "success") {
    revalidatePath("/administracao/usuarios/historico");
    revalidatePath("/administracao/usuarios");
    revalidatePath("/app", "layout");
  }
  return state;
}
