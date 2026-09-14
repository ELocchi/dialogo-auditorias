import "server-only";

export function confirmationCallbackUrl() {
  // Never derive a link sent by e-mail from untrusted Host/Origin/form fields.
  const configured = process.env.APP_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "");
  let url: URL;
  try { url = new URL(configured); } catch { throw new Error("Endereço da aplicação não configurado."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Endereço da aplicação inválido.");
  }
  return new URL("/auth/callback", url).href;
}
