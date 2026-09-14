import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { corporateEmail } from "@/lib/auth/validation";
import { confirmationCallbackUrl } from "@/lib/auth/site-url";

export async function GET(request: NextRequest) {
  let destination = "/entrar?confirmacao=indisponivel";
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    try {
      const client = await createClient({ writableCookies: true });
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) {
        const { data, error: identityError } = await client.auth.getUser();
        if (!identityError && data.user && corporateEmail(data.user.email)) destination = "/aguardando-liberacao";
      }
    } catch {
      // Never log confirmation codes, complete links or provider errors.
    }
  }
  // Only a configured origin and fixed internal destinations; no open redirect.
  let origin: string;
  try { origin = confirmationCallbackUrl(); } catch {
    return new Response("Confirmação indisponível. Volte à página de entrada.", {
      status: 503, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    });
  }
  const response = NextResponse.redirect(new URL(destination, origin));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
