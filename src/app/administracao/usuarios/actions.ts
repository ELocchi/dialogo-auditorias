"use server";

import { revalidatePath } from "next/cache";
import { requireAdministrator } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { approveRequest, registerWork } from "@/lib/access/service";
import type { AccessActionState } from "@/lib/access/contracts";

export async function approveAccessAction(_previous: AccessActionState, form: FormData): Promise<AccessActionState> {
  const user = await requireAdministrator();
  const state = await approveRequest(form, { actorId: user.id, createClient: () => createClient({ writableCookies: true }) });
  if (state.status === "success") revalidatePath("/administracao/usuarios");
  return state;
}

export async function createWorkAction(_previous: AccessActionState, form: FormData): Promise<AccessActionState> {
  const user = await requireAdministrator();
  const state = await registerWork(form, { actorId: user.id, createClient: () => createClient({ writableCookies: true }) });
  if (state.status === "success") revalidatePath("/administracao/usuarios");
  return state;
}

