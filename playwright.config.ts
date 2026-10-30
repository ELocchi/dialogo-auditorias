import { defineConfig, devices } from "@playwright/test";
import { testEnv } from "./e2e/env";

// Browser tests against the published platform, signed in as the test user (Obra Teste only).
// Credentials come from %USERPROFILE%\.dialogo-testes\teste.env and never enter the repository.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: testEnv().APP_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
