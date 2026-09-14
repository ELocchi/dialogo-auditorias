import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { createServerClient } from "@supabase/ssr";
import { createClient as createBrowserClient } from "../src/lib/supabase/client.ts";
import { getSupabaseConfig } from "../src/lib/supabase/config.ts";

/** Read-only diagnostic. Returns fixed statuses, never settings or credentials. */
export async function checkSupabase({ fetcher = fetch } = {}) {
  const result = {
    urlConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    publishableKeyConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
    clientsInitialized: false,
    authReachable: false,
    session: "not_checked",
    status: "configuration_error",
  };

  try {
    const { url, publishableKey } = getSupabaseConfig();
    // No browser/user cookies are read. This isolated context cannot sign in,
    // refresh an existing user session or persist data on the user's device.
    const browserClient = createBrowserClient();
    const serverClient = createServerClient(url, publishableKey, {
      cookies: { getAll: () => [], setAll: () => {} },
    });
    result.clientsInitialized = !!browserClient.auth && !!serverClient.auth;
    result.status = "session_error";
    const { data, error } = await serverClient.auth.getSession();
    if (error || data.session !== null) return result;
    result.session = "none";

    // getSession() with no cookies can be entirely local. Confirm actual
    // network access separately via the official, read-only Auth settings API.
    result.status = "connection_error";
    const response = await fetcher(new URL("/auth/v1/settings", url), {
      method: "GET",
      headers: { apikey: publishableKey, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 200) return result;
    const settings = await response.json();
    if (!settings || typeof settings.disable_signup !== "boolean") return result;

    result.authReachable = true;
    result.status = "connected";
    return result;
  } catch {
    // Do not forward SDK/network errors, URLs, headers or remote response bodies.
    return result;
  }
}

async function main() {
  try {
    nextEnv.loadEnvConfig(process.cwd(), true, {
      info() {},
      error() { throw new Error("ENV_LOAD_FAILED"); },
    });
    const result = await checkSupabase();
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "connected") {
      console.log("Supabase DEV: conectado. Nenhuma sessão autenticada no contexto isolado de teste.");
    } else {
      process.exitCode = 1;
    }
  } catch {
    console.error("Não foi possível verificar a configuração local do Supabase.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
