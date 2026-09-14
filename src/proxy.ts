import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./lib/supabase/config";
import { supabaseFetch } from "./lib/supabase/fetch";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  try {
    const { url, publishableKey } = getSupabaseConfig();
    const client = createServerClient(url, publishableKey, {
      global: { fetch: supabaseFetch },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    // Refresh with the official SDK. Pages independently verify identity and
    // enforce current authorization; a cookie or metadata field is never approval.
    await client.auth.getUser();
  } catch {
    // No raw SDK errors/URLs/tokens in logs. Protected pages fail closed.
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = {
  matcher: ["/", "/entrar", "/solicitar-acesso", "/aguardando-liberacao", "/escolher-perfil", "/minha-conta", "/administracao/:path*", "/auth/:path*", "/app/:path*", "/api/agenda"],
};
