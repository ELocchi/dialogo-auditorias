import type { SupabaseClient } from "@supabase/supabase-js";

/** Uma linha por identidade aprovada, mesmo que ela tenha vários perfis. */
export async function countActiveAccounts(client: Pick<SupabaseClient, "from" | "rpc">): Promise<number | null> {
  try {
    const authority = await client.rpc("is_current_access_administrator");
    if (authority.error || authority.data !== true) return null;

    const result = await client.from("access_accounts")
      .select("auth_user_id", { count: "exact", head: true }).eq("ativo", true);
    if (result.error || !Number.isSafeInteger(result.count) || result.count! < 0) return null;
    return result.count;
  } catch {
    return null;
  }
}
