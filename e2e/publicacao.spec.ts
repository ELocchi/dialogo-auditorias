import { expect, test, type Page } from "@playwright/test";
import { confirmAndStartTestAudit, deleteTodayTestVisits, scheduleTestAudit } from "./agenda";
import { fillAllCompliant } from "./audit";
import { chooseProfile, openSection, signIn } from "./session";

// Publicação completa de uma F.175 na Obra Teste, com PDF. Uma auditoria publicada não pode ser apagada,
// então este teste só roda quando pedido: E2E_PERMANENT=1 npm run test:e2e -- publicacao
// Todas as respostas são "Conforme", para não gerar apontamentos no painel do Administrativo.

test.skip(!process.env.E2E_PERMANENT, "Cria um registro permanente; rode com E2E_PERMANENT=1.");
test.describe.configure({ mode: "serial" });

let page: Page;
test.beforeAll(async ({ browser }) => { page = await browser.newPage(); await signIn(page); });
test.afterAll(async () => { await page.close(); });

test("Agenda e inicia uma F.175 na Obra Teste", async () => {
  await scheduleTestAudit(page, "quality-f175", `Teste automatizado de publicação ${new Date().toISOString()}`);
  await confirmAndStartTestAudit(page, "Auditor de Qualidade");
});

test("Preenche todos os itens e abre a revisão", async () => {
  await fillAllCompliant(page);
  await page.getByRole("button", { name: "Revisar auditoria" }).click();
  await expect(page.getByRole("heading", { name: "Conferir antes de publicar" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".audit-final-score-value strong")).toHaveText("10,00");
});

test("Publica a auditoria", async () => {
  test.setTimeout(300_000);
  const publish = page.getByRole("button", { name: "Publicar auditoria" });
  await expect(publish).toBeEnabled({ timeout: 120_000 });
  await publish.click();
  await expect(page.getByRole("button", { name: "Auditoria publicada" })).toBeVisible({ timeout: 240_000 });
});

test("A publicação aparece com o PDF disponível", async () => {
  test.setTimeout(240_000);
  await page.reload();
  await chooseProfile(page, "Auditor de Qualidade");
  await openSection(page, "Auditorias");
  const published = page.getByRole("region", { name: "Auditorias publicadas" });
  const card = published.locator("article").filter({ hasText: "Obra Teste" }).first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.getByRole("button").first().click();
  const pdf = card.getByRole("button", { name: /^Abrir PDF da auditoria: Obra Teste,/ });
  await expect(pdf).toBeVisible({ timeout: 120_000 });
  // The PDF may open in a new tab or in the same page; either way the server must answer with a real PDF.
  const pdfResponse = page.context().waitForEvent("response", {
    predicate: (response) => (response.headers()["content-type"] ?? "").includes("application/pdf"), timeout: 60_000,
  });
  await pdf.click();
  const response = await pdfResponse;
  expect(response.status()).toBe(200);
  // The browser hands the PDF to its viewer, so download the same address again with the session cookies.
  const download = await page.context().request.get(response.url());
  expect(download.status()).toBe(200);
  const body = await download.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  expect(body.length).toBeGreaterThan(10_000);
});

test("Nenhum agendamento de teste fica pendente", async () => {
  await deleteTodayTestVisits(page);
});
