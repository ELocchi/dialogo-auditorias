import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "../src/lib/supabase/config.ts";
import { supabaseFetch } from "../src/lib/supabase/fetch.ts";

// Read-only, without a user session. Never print settings, credentials or bodies.
const result = {
  authReachable: false,
  emailEnabled: null,
  signupEnabled: null,
  emailConfirmationRequired: null,
  requestSchema: "not_checked",
  status: "configuration_error",
};
try {
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() { throw new Error("ENV_LOAD_FAILED"); } });
  const { url, publishableKey } = getSupabaseConfig();
  result.status = "connection_error";
  const response = await supabaseFetch(new URL("/auth/v1/settings", url), {
    headers: { apikey: publishableKey, Accept: "application/json" }, redirect: "error",
  });
  if (!response.ok) throw new Error("AUTH_UNAVAILABLE");
  const settings = await response.json();
  if (typeof settings.disable_signup !== "boolean" || typeof settings.mailer_autoconfirm !== "boolean") {
    throw new Error("UNEXPECTED_SETTINGS");
  }
  result.authReachable = true;
  result.emailEnabled = settings.external?.email === true;
  result.signupEnabled = !settings.disable_signup;
  result.emailConfirmationRequired = !settings.mailer_autoconfirm;

  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: supabaseFetch },
  });
  const { data, error } = await client.rpc("access_requests_schema_version");
  result.requestSchema = error?.code === "PGRST202" ? "migration_pending"
    : error ? "unavailable" : data === 1 ? "version_1" : "unexpected_version";
  result.status = result.requestSchema !== "version_1" ? "schema_pending"
    : result.emailEnabled && result.signupEnabled && result.emailConfirmationRequired
      ? "ready_for_authorized_test" : "auth_settings_pending";
} catch {
  // Preserve only fixed diagnostic states; no error object reaches output.
}
console.log(JSON.stringify(result, null, 2));
if (result.status !== "ready_for_authorized_test") process.exitCode = 1;
