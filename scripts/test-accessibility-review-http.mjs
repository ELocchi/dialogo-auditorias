import assert from "node:assert/strict";
import fs from "node:fs/promises";

const base = process.env.A11Y_BASE_URL || "http://127.0.0.1:3004";
const cases = [
  ["GET", "/", 307],
  ["GET", "/revisao-acessibilidade", 200],
  ["GET", "/revisao-acessibilidade/qualidade", 200],
  ["GET", "/revisao-seguranca", 200],
  ["GET", "/entrar", 200],
  ["GET", "/logo-dialogo.png", 200],
  ["GET", "/app", 404],
  ["GET", "/administracao/usuarios", 404],
  ["GET", "/api/agenda", 404],
  ["GET", "/auth/callback", 404],
  ["GET", "/.env.local", 404],
  ["POST", "/revisao-acessibilidade", 405],
  ["POST", "/entrar", 405],
  ["POST", "/api/agenda", 405],
  ["PUT", "/revisao-acessibilidade", 405],
  ["DELETE", "/revisao-acessibilidade", 405],
  ["POST", "/_next/static/test", 405],
];
const results = [];
for (const [method, path, expected] of cases) {
  const response = await fetch(`${base}${path}`, { method, redirect: "manual", signal: AbortSignal.timeout(90000), headers: method === "POST" ? { "Next-Action": "fixture-test" } : {} });
  await response.arrayBuffer();
  results.push({ method, path, expected, actual: response.status });
  assert.equal(response.status, expected, `${method} ${path}`);
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
  assert.match(response.headers.get("content-security-policy") || "", /connect-src 'self'/);
}
const report = { testedAt: new Date().toISOString(), base, results, nvdaExecuted: false };
if (process.env.A11Y_HTTP_OUTPUT) await fs.writeFile(process.env.A11Y_HTTP_OUTPUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
