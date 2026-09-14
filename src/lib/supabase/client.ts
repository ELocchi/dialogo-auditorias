"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config.ts";

export function createClient() {
  const { url, publishableKey } = getSupabaseConfig();
  return createBrowserClient(url, publishableKey);
}
