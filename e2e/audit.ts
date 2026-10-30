import { expect, type Page } from "@playwright/test";

/** Answers every item of the open audit as compliant (quantity items: one compliant verification). */
export async function fillAllCompliant(page: Page) {
  const groups = page.getByRole("button", { name: /^\d+\. .+/, expanded: false });
  while (await groups.count()) await groups.first().click();
  const items = page.getByRole("button", { name: /^\d{2}\.\d{2} / });
  const total = await items.count();
  expect(total).toBeGreaterThan(0);
  for (let index = 0; index < total; index++) {
    const item = items.nth(index);
    const code = (await item.innerText()).trim().slice(0, 5);
    await item.click();
    const service = page.getByLabel("Serviço verificado 1");
    if (await service.isVisible() && !(await service.inputValue())) await service.selectOption({ index: 1 });
    const answer = page.getByRole("button", { name: new RegExp(`^(✓\\s*Conforme|Conforme: ${code.replace(".", "\\.")}, verificação 1)$`) });
    await answer.click();
    await expect(answer).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByRole("status").filter({ hasText: "itens preenchidos" })).toHaveText(`${total} de ${total} itens preenchidos`);
  await expect(page.getByText("Rascunho salvo").first()).toBeVisible({ timeout: 30_000 });
}
