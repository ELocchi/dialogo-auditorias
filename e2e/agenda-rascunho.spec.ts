import { expect, test, type Page } from "@playwright/test";
import { chooseProfile, openSection, signIn } from "./session";

// Agenda → confirmação → início da auditoria → rascunho salvo, só na Obra Teste.
// Ao final o agendamento é excluído, para não acumular visitas de teste.

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const [year, month, day] = today.split("-");
const testNote = `Teste automatizado ${new Date().toISOString()}`;

test.describe.configure({ mode: "serial" });

let page: Page;
test.beforeAll(async ({ browser }) => { page = await browser.newPage(); await signIn(page); });
test.afterAll(async () => { await page.close(); });

/** The card of today's Obra Teste visit in the current agenda list. */
const testVisitCard = (current: Page) => current.locator("article").filter({ hasText: "Obra Teste" })
  .filter({ has: current.locator(`time[datetime="${today}"]`) }).first();

test("Administrativo agenda uma auditoria F.175 para hoje na Obra Teste", async () => {
  await chooseProfile(page, "Administrativo Geral");
  await openSection(page, "Agenda");
  await page.getByRole("button", { name: "Agendar visita" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Obra", { exact: true }).selectOption({ label: "Obra Teste" });
  await dialog.getByLabel("Disciplina").selectOption({ label: "Qualidade" });
  await dialog.getByLabel("Finalidade").selectOption("audit");
  await dialog.getByLabel("Tipo de auditoria").selectOption("quality-f175");
  await dialog.getByLabel("Profissional responsável").selectOption({ label: "Teste Auditorias" });
  await dialog.getByLabel("Data da visita").fill(today);
  await dialog.getByLabel("Observação").fill(testNote);
  await dialog.getByRole("button", { name: "Adicionar agendamento" }).click();
  await dialog.getByRole("button", { name: /Enviar para confirmação \(1\)/ }).click();
  await expect(testVisitCard(page)).toBeVisible();
});

test("Auditor de Qualidade confirma a data e inicia a auditoria", async () => {
  await chooseProfile(page, "Auditor de Qualidade");
  await openSection(page, "Agenda");
  const card = testVisitCard(page);
  await expect(card).toBeVisible();
  const confirm = card.getByRole("button", { name: "Confirmar data" });
  if (!(await confirm.isVisible()) && !(await card.getByText(/visita confirmada/).count())) await card.locator("summary").click();
  if (await confirm.isVisible()) { await confirm.click(); await expect(card.getByText(/Data confirmada/)).toBeVisible(); }
  // The start button lives in "Auditorias", not in the agenda.
  await openSection(page, "Auditorias");
  const scheduled = testVisitCard(page);
  const start = scheduled.getByRole("button", { name: /Iniciar auditoria|Retomar auditoria/ });
  if (!(await start.isVisible())) await scheduled.locator("summary").click();
  await start.click();
  await expect(page.getByRole("heading", { name: "Preencher auditoria" })).toBeVisible();
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
  const scheduled = testVisitCard(page);
  const resume = scheduled.getByRole("button", { name: "Retomar auditoria" });
  if (!(await resume.isVisible())) await scheduled.locator("summary").click();
  await resume.click();
  await expect(page.getByRole("status").filter({ hasText: "itens preenchidos" })).toHaveText(progress, { timeout: 30_000 });
});

test("Administrativo exclui os agendamentos de teste de hoje", async () => {
  await chooseProfile(page, "Administrativo Geral");
  await openSection(page, "Agenda");
  const cards = page.locator("article").filter({ hasText: "Obra Teste" }).filter({ has: page.locator(`time[datetime="${today}"]`) });
  await expect(cards.first()).toBeVisible();
  for (let before = await cards.count(); before > 0; before = await cards.count()) {
    const card = cards.first();
    await card.locator("summary").click();
    await card.getByRole("button", { name: /^Excluir agendamento/ }).click();
    await card.getByRole("button", { name: "Confirmar exclusão" }).click();
    // A deleted card leaves the list (with its success message); a refusal keeps it open with an alert.
    await expect.poll(async () => {
      const alert = card.getByRole("alert").filter({ hasText: /\S/ });
      if (await alert.count()) throw new Error(`Exclusão recusada: ${await alert.first().innerText()}`);
      return cards.count();
    }, { timeout: 30_000 }).toBe(before - 1);
  }
});
