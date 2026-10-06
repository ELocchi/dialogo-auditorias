import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

/** Never attach user cookies to this client. Every operation authorizes the
 * verified actor again inside publication_command before accessing any data. */
export function createPublicationClient() {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key || !/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error("A publicação precisa da configuração do servidor. Contate o administrador.");
  }
  return createClient(getSupabaseConfig().url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store",
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) }) },
  });
}
