import { expect, test, type Page } from "@playwright/test";
import { confirmAndStartTestAudit, deleteTodayTestVisits, scheduleTestAudit, today, todayTestVisits } from "./agenda";
import { openSection, signIn } from "./session";

// Agenda → confirmação → início da auditoria → rascunho salvo, só na Obra Teste.
// Ao final os agendamentos de hoje da Obra Teste são excluídos, para não acumular visitas de teste.

const [year, month, day] = today.split("-");

test.describe.configure({ mode: "serial" });

let page: Page;
test.beforeAll(async ({ browser }) => { page = await browser.newPage(); await signIn(page); });
test.afterAll(async () => { await page.close(); });

test("Administrativo agenda uma auditoria F.175 para hoje na Obra Teste", async () => {
  await scheduleTestAudit(page, "quality-f175", `Teste automatizado ${new Date().toISOString()}`);
});

test("Auditor de Qualidade confirma a data e inicia a auditoria", async () => {
  await confirmAndStartTestAudit(page, "Auditor de Qualidade");
  await expect(page.getByText(`${day}/${month}/${year}`, { exact: true }).filter({ visible: true }).first()).toBeVisible();
});

test("Resposta de um item fica salva no rascunho e sobrevive à recarga", async () => {
  // The item list starts collapsed: open group 1 and select its first item.
  await page.getByRole("button", { name: /^1\. Armazenamento de Materiais/ }).click();
  await page.getByRole("button", { name: /^01\.01 Ficha de Verificação/ }).click();
  // Qualitative items show "✓ Conforme"; quantity items show "Conforme: 01.01, verificação 1".
  const answer = page.getByRole("button", { name: /^(✓\s*)?Conforme(:|$)/ }).filter({ visible: true }).first();
  await answer.click();
  await expect(answer).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Rascunho salvo").first()).toBeVisible({ timeout: 30_000 });
  const progress = await page.getByRole("status").filter({ hasText: "itens preenchidos" }).innerText();
  // A reload returns to the home screen (the section is not kept in the URL): resume it like a user would.
  await page.reload();
  await openSection(page, "Auditorias");
  const scheduled = todayTestVisits(page).first();
  const resume = scheduled.getByRole("button", { name: "Retomar auditoria" });
  if (!(await resume.isVisible())) await scheduled.locator("summary").click();
  await resume.click();
  await expect(page.getByRole("status").filter({ hasText: "itens preenchidos" })).toHaveText(progress, { timeout: 30_000 });
});

test("Administrativo exclui os agendamentos de teste de hoje", async () => {
  await deleteTodayTestVisits(page);
});
