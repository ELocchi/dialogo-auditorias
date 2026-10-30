import { expect, type Page } from "@playwright/test";
import { chooseProfile, openSection } from "./session";

export const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Cards of today's Obra Teste visits in the list on screen. */
export const todayTestVisits = (page: Page) => page.locator("article").filter({ hasText: "Obra Teste" })
  .filter({ has: page.locator(`time[datetime="${today}"]`) });

/** Administrativo Geral schedules an audit for today in Obra Teste, assigned to the test user. */
export async function scheduleTestAudit(page: Page, modelId: "quality-f175" | "quality-f176" | "security-it07-r02", note: string) {
  await chooseProfile(page, "Administrativo Geral");
  await openSection(page, "Agenda");
  const before = await todayTestVisits(page).count();
  await page.getByRole("button", { name: "Agendar visita" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Obra", { exact: true }).selectOption({ label: "Obra Teste" });
  await dialog.getByLabel("Disciplina").selectOption({ label: modelId === "security-it07-r02" ? "Segurança" : "Qualidade" });
  await dialog.getByLabel("Finalidade").selectOption("audit");
  if (modelId !== "security-it07-r02") await dialog.getByLabel("Tipo de auditoria").selectOption(modelId);
  await dialog.getByLabel("Profissional responsável").selectOption({ label: "Teste Auditorias" });
  await dialog.getByLabel("Data da visita").fill(today);
  await dialog.getByLabel("Observação").fill(note);
  await dialog.getByRole("button", { name: "Adicionar agendamento" }).click();
  await dialog.getByRole("button", { name: /Enviar para confirmação \(1\)/ }).click();
  await expect(todayTestVisits(page)).toHaveCount(before + 1, { timeout: 30_000 });
}

/** The auditor profile confirms today's visit (in Agenda) and starts it (in Auditorias). */
export async function confirmAndStartTestAudit(page: Page, profile: "Auditor de Qualidade" | "Auditor de Segurança") {
  await chooseProfile(page, profile);
  await openSection(page, "Agenda");
  const card = todayTestVisits(page).first();
  await expect(card).toBeVisible();
  const confirm = card.getByRole("button", { name: "Confirmar data" });
  if (!(await confirm.isVisible()) && !(await card.getByText(/visita confirmada/).count())) await card.locator("summary").click();
  if (await confirm.isVisible()) { await confirm.click(); await expect(card.getByText(/Data confirmada/)).toBeVisible(); }
  // The start button lives in "Auditorias", not in the agenda.
  await openSection(page, "Auditorias");
  const scheduled = todayTestVisits(page).first();
  const start = scheduled.getByRole("button", { name: /Iniciar auditoria|Retomar auditoria/ });
  if (!(await start.isVisible())) await scheduled.locator("summary").click();
  await start.click();
  await expect(page.getByRole("heading", { name: "Preencher auditoria" })).toBeVisible();
}

/** Administrativo Geral deletes every Obra Teste visit scheduled for today. */
export async function deleteTodayTestVisits(page: Page) {
  await chooseProfile(page, "Administrativo Geral");
  await openSection(page, "Agenda");
  const cards = todayTestVisits(page);
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
}
