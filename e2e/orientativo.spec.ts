import { expect, test, type Page } from "@playwright/test";
import { chooseProfile, openSection, signIn } from "./session";

// Apontamento com foto (item grave) → Relatório Orientativo → PDF, só na Obra Teste.
// Apontamentos e relatórios ficam no histórico, então este teste só roda com E2E_PERMANENT=1.

test.skip(!process.env.E2E_PERMANENT, "Cria registros permanentes; rode com E2E_PERMANENT=1.");
test.describe.configure({ mode: "serial" });

const runId = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const description = `Teste automatizado ${runId}: guarda-corpo provisório incompleto`;
const reportTitle = `Relatório de teste ${runId}`;

let page: Page;
test.beforeAll(async ({ browser }) => { page = await browser.newPage(); await signIn(page); });
test.afterAll(async () => { await page.close(); });

/** A small JPEG drawn in the browser, so the app's photo preparation gets a real image. */
async function testPhoto(current: Page) {
  const dataUrl = await current.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#1c3d70"; context.fillRect(0, 0, 640, 480);
    context.fillStyle = "#ffffff"; context.font = "48px sans-serif"; context.fillText("Obra Teste", 180, 250);
    return canvas.toDataURL("image/jpeg", 0.85);
  });
  return { name: "foto-teste.jpg", mimeType: "image/jpeg", buffer: Buffer.from(dataUrl.split(",")[1], "base64") };
}

test("Auditor registra um apontamento grave com foto na Obra Teste", async () => {
  await chooseProfile(page, "Auditor de Qualidade");
  await openSection(page, "Acompanhamento");
  await page.getByRole("button", { name: "Adicionar apontamento" }).click();
  await page.getByLabel("Escolher foto").setInputFiles(await testPhoto(page));
  await page.getByRole("button", { name: "Marcar como item grave" }).click();
  await page.getByLabel("Local (opcional)").fill("Pavimento térreo — área de testes");
  await page.getByLabel("O que precisa de correção").fill(description);
  await page.getByLabel("Orientação para correção").fill("Completar o guarda-corpo antes de liberar a frente de serviço.");
  await page.getByRole("combobox", { name: "Obra", exact: true }).selectOption({ label: "Obra Teste" });
  await page.getByRole("button", { name: "Salvar apontamento" }).click();
  await expect(page.getByText(description).first()).toBeVisible({ timeout: 60_000 });
});

test("Cria um Relatório Orientativo com o apontamento", async () => {
  await page.getByRole("link", { name: "Criar relatório orientativo" }).click();
  const form = page.getByRole("region", { name: "Novo relatório orientativo" });
  await form.getByRole("combobox", { name: "Obra", exact: true }).selectOption({ label: "Obra Teste" });
  await form.getByLabel("Título").fill(reportTitle);
  await form.getByLabel("Participantes").fill("Equipe de testes");
  await form.getByLabel("Assuntos abordados e orientações").fill("Relatório gerado pelo teste automatizado da plataforma.");
  const findings = page.getByRole("region", { name: "Apontamentos opcionais" });
  await findings.locator("label").filter({ hasText: description }).getByRole("checkbox").check();
  await expect(findings.getByRole("status")).toContainText("1 de 30 selecionados");
  await form.getByRole("button", { name: "Salvar relatório" }).click();
  await expect(page.getByText(reportTitle).first()).toBeVisible({ timeout: 120_000 });
});

test("O PDF do relatório é gerado", async () => {
  test.setTimeout(300_000);
  await chooseProfile(page, "Auditor de Qualidade");
  await openSection(page, "Acompanhamento");
  // This run's report, or the latest test report when this step runs alone.
  const button = page.getByRole("button", { name: `Baixar PDF: ${reportTitle}` })
    .or(page.getByRole("button", { name: /^Baixar PDF: Relatório de teste / })).first();
  await expect(button).toBeVisible({ timeout: 120_000 });
  // The button only downloads after checking the file is a real PDF. The PDF comes from a background job,
  // so retry while it is still being generated.
  let size = 0;
  for (let attempt = 0; attempt < 20 && !size; attempt++) {
    const downloaded = page.waitForEvent("download", { timeout: 100_000 }).catch(() => null);
    await button.click();
    const file = await downloaded;
    if (file) {
      const path = await file.path();
      const { readFileSync } = await import("node:fs");
      const bytes = readFileSync(path);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      size = bytes.length;
    } else {
      await page.waitForTimeout(10_000);
    }
  }
  expect(size).toBeGreaterThan(10_000);
});
