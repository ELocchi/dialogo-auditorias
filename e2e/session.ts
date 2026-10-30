import { expect, type Page } from "@playwright/test";
import { testEnv } from "./env";

/** Signs in through the real login form. */
export async function signIn(page: Page) {
  const { TEST_EMAIL, TEST_PASSWORD } = testEnv();
  await page.goto("/entrar");
  await page.getByLabel(/e-mail/i).fill(TEST_EMAIL);
  await page.getByLabel(/^senha/i).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /^entrar$/i }).click();
  await page.waitForURL(/\/(escolher-perfil|app)/);
}

/** Picks a profile on "Perfis de Acesso", e.g. "Auditor de Qualidade" or "Administrativo Geral". */
export async function chooseProfile(page: Page, label: string) {
  if (!page.url().includes("/escolher-perfil")) await page.goto("/escolher-perfil");
  await page.getByRole("button", { name: new RegExp(`^Entrar como ${label}`) }).click();
  await page.waitForURL(/\/app/);
  await expect(page.getByRole("main")).toBeVisible();
}

export async function openSection(page: Page, name: string | RegExp) {
  await page.getByRole("navigation").getByRole("button", { name }).first().click();
}
