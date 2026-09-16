"use server";

import { requireActiveProfile } from "@/lib/auth/session";
import { readWorkspaceContext } from "@/lib/access/workspace";
import { createClient } from "@/lib/supabase/server";
import { readCatalogSnapshot, saveCatalogRevision } from "@/lib/catalogs/service";
import { unavailableCatalogs, type CatalogSaveResult, type CatalogSnapshot } from "@/lib/catalogs/contracts";
import type { AgendaActorContext } from "@/lib/agenda/contracts";

export async function saveCatalogRevisionAction(formData: FormData): Promise<CatalogSaveResult> {
  const active = await requireActiveProfile();
  if (active.profile !== "ADMINISTRATIVO" || formData.get("actorId") !== active.user.id) {
    return { status: "error", message: "O usuário ou perfil mudou. Atualize a página antes de continuar." };
  }
  const context = await readWorkspaceContext(active);
  if (!context) return { status: "error", message: "Não foi possível confirmar seus acessos." };
  return saveCatalogRevision(formData, context, await createClient({ writableCookies: true }));
}

export async function refreshCatalogsAction(expected: AgendaActorContext): Promise<CatalogSnapshot> {
  const active = await requireActiveProfile();
  if (!expected || expected.userId !== active.user.id || expected.profile !== active.profile || expected.engineeringScope !== active.engineeringScope) return unavailableCatalogs();
  const context = await readWorkspaceContext(active);
  return context ? readCatalogSnapshot(await createClient({ writableCookies: true }), context) : unavailableCatalogs();
}
