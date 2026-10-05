// Dedicated entry point for the public fixture service. Never use for the app.
import { createServer } from "node:http";
import next from "next";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
if (process.env.ACCESSIBILITY_REVIEW_ONLY !== "1") {
  throw new Error("A homologação exige ACCESSIBILITY_REVIEW_ONLY=1.");
}
if (Object.entries(process.env).some(([key, value]) => value && /SUPABASE|DATABASE_URL|PGPASSWORD/.test(key))) {
  throw new Error("Remova as configurações de banco deste serviço de homologação.");
}

const port = Number(process.env.PORT || 3004);
const hostname = process.env.REVIEW_HOST || "0.0.0.0";
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();
const pages = new Set(["/revisao-acessibilidade", "/revisao-acessibilidade/qualidade", "/revisao-seguranca", "/entrar"]);
const assets = new Set(["/favicon.ico", "/logo-dialogo.png", "/logo-relatorio-orientativo.png"]);
await app.prepare();

const server = createServer(async (request, response) => {
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; worker-src 'self' blob:; base-uri 'self'; form-action 'none'; frame-ancestors 'none'");
  // All mutations, including Next Server Actions, stop before reaching Next.
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ message: "Homologação de interface: gravações indisponíveis." }));
    request.resume();
    return;
  }
  let pathname;
  try { pathname = new URL(request.url, "http://review.local").pathname.replace(/\/$/, "") || "/"; }
  catch { response.writeHead(400); response.end(); return; }
  if (pathname === "/") {
    response.writeHead(307, { Location: "/revisao-acessibilidade" }); response.end(); return;
  }
  if (!pages.has(pathname) && !assets.has(pathname) && !pathname.startsWith("/_next/static/")) {
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    response.end('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Homologação NVDA</title><main><h1>Ação fora desta homologação</h1><p>Este endereço contém somente telas de teste com dados fictícios.</p><a href="/revisao-acessibilidade">Voltar aos testes de acessibilidade</a></main></html>');
    return;
  }
  try { await handle(request, response); }
  catch {
    if (!response.headersSent) response.writeHead(500);
    response.end("Não foi possível abrir a tela de homologação.");
  }
});
server.listen(port, hostname, () => console.log(`Homologação NVDA disponível na porta ${port}.`));
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => { void app.close().then(() => process.exit(0)); }));
}
