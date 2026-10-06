import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { isListPage, unavailableList, type ListQuery } from "./contracts.ts";

export async function readListPage(client: Pick<SupabaseClient, "rpc">, context: ProfileWorkspaceContext, query: ListQuery, ids?: string[]) {
  if (!["AUDITOR_QUALIDADE", "AUDITOR_SEGURANCA", "ENGENHARIA"].includes(context.profile)) return unavailableList();
  try {
    const { data, error } = await client.rpc("read_follow_up_list_page", { p_profile: context.profile,
      p_engineering_scope: context.engineeringScope, p_administrative_scope: context.administrativeScope,
      p_visit_id: query.visitId ?? null, p_ids: ids ?? null, p_kind: query.kind, p_size: query.size, p_work_id: query.workId || null,
      p_module: query.module || null, p_search: query.search, p_cursor: query.cursor });
    if (error || !isListPage(data) || data.items.length > query.size || data.items.some(item =>
      !context.works.some(work => work.id === item.workId)
      || !context.user.workModuleScopes?.some(scope => scope.workId === item.workId && scope.module === item.module)
      || (query.workId && item.workId !== query.workId) || (query.module && item.module !== query.module))) return unavailableList();
    return data;
  } catch { return unavailableList(); }
}
