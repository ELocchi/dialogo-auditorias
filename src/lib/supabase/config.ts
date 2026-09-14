/** Shared public configuration. Never include privileged credentials here. */
export function getSupabaseConfig() {
  // Keep static env references so Next.js can inline the browser configuration.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error("Configuração pública do Supabase incompleta.");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Configuração pública do Supabase inválida.");
  }

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (
    (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) ||
    parsed.username || parsed.password || parsed.search || parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)
  ) {
    // Reject secret keys and legacy JWT credentials, without echoing input.
    throw new Error("Configuração pública do Supabase inválida.");
  }

  return { url: parsed.origin, publishableKey };
}
