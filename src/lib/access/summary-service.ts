import type { SupabaseClient } from "@supabase/supabase-js";
import { isAvailableAccessSummary, unavailableAccessSummary, type AccessSummary } from "./summary-contracts.ts";

/** Only aggregate counts are read; no account list, grants or history is downloaded. */
export async function readAccessSummary(client: Pick<SupabaseClient, "from" | "rpc">): Promise<AccessSummary> {
  try {
    const authority = await client.rpc("is_current_access_administrator");
    if (authority.error || authority.data !== true) return unavailableAccessSummary();
    const [pending, active] = await Promise.all([
      client.from("access_requests").select("auth_user_id", { count: "exact", head: true })
        .eq("status_acesso", "PENDENTE_APROVACAO").not("email_confirmado_em", "is", null),
      client.from("access_accounts").select("auth_user_id", { count: "exact", head: true }).eq("ativo", true),
    ]);
    if (pending.error || active.error) return unavailableAccessSummary();
    const result = { available: true, pendingCount: pending.count, activeCount: active.count };
    return isAvailableAccessSummary(result) ? result : unavailableAccessSummary();
  } catch { return unavailableAccessSummary(); }
}
