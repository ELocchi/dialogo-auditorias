import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "./config.ts";
import { supabaseFetch } from "./fetch.ts";

/** Create per request; never share a server client's session across users. */
export async function createClient({ writableCookies = false } = {}) {
  const { url, publishableKey } = getSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    global: { fetch: supabaseFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Proxy handles refresh for read-only Server Components. A failed
          // cookie write in an action/handler must not masquerade as success.
          if (writableCookies) throw new Error("Não foi possível manter a sessão.");
        }
      },
    },
  });
}
