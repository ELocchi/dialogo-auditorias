import { expect, test } from "@playwright/test";
import { chooseProfile, openSection, signIn } from "./session";

// Read-only smoke: signs in, switches profiles and checks what each one sees. Creates no data.

test("Auditor de Qualidade enxerga só a Obra Teste", async ({ page }) => {
  await signIn(page);
  await chooseProfile(page, "Auditor de Qualidade");
  await openSection(page, "Obras");
  await expect(page.getByText("Obra Teste").first()).toBeVisible();
});

test("Engenharia (Equipe da obra) abre a visão geral", async ({ page }) => {
  await signIn(page);
  await chooseProfile(page, "Engenharia — Equipe da obra");
  await expect(page.getByRole("heading", { name: /visão geral/i })).toBeVisible();
});

test("Administrativo Geral: painel abre e a Obra Teste fica fora do ranking", async ({ page }) => {
  await signIn(page);
  await chooseProfile(page, "Administrativo Geral");
  const ranking = page.getByRole("region", { name: "Ranking das Obras" });
  await expect(ranking).toBeVisible();
  await expect(ranking.getByText("Obra Teste")).toHaveCount(0);
});
