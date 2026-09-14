"use server";

import { revalidatePath } from "next/cache";
import { requireAdministrator } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { updateWork } from "@/lib/works/service";
import type { WorkEditState } from "@/lib/works/contracts";

export async function updateWorkAction(_previous: WorkEditState, form: FormData): Promise<WorkEditState> {
  await requireAdministrator();
  const result = await updateWork(form, { createClient: () => createClient({ writableCookies: true }) });
  if (result.status === "success") {
    revalidatePath("/app", "layout");
    revalidatePath("/administracao/usuarios");
    const workId = form.get("work_id");
    if (typeof workId === "string" && /^[0-9a-f-]{36}$/.test(workId)) revalidatePath(`/administracao/obras/${workId}`);
  }
  return result;
}
