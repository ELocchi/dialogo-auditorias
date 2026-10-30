import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type TestEnv = { APP_URL: string; TEST_EMAIL: string; TEST_PASSWORD: string; TEST_WORK_ID: string };

let cached: TestEnv | null = null;

/** Reads the test user's settings from outside the repository; process variables take precedence. */
export function testEnv(): TestEnv {
  if (cached) return cached;
  const file = process.env.DIALOGO_TEST_ENV ?? path.join(homedir(), ".dialogo-testes", "teste.env");
  let values: Record<string, string> = {};
  try {
    values = Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line.includes("="))
      .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]));
  } catch {
    throw new Error(`Configuração dos testes não encontrada em ${file}.`);
  }
  const read = (key: keyof TestEnv) => {
    const value = process.env[key] ?? values[key];
    if (!value) throw new Error(`${key} ausente na configuração dos testes.`);
    return value;
  };
  cached = { APP_URL: read("APP_URL"), TEST_EMAIL: read("TEST_EMAIL"), TEST_PASSWORD: read("TEST_PASSWORD"), TEST_WORK_ID: read("TEST_WORK_ID") };
  return cached;
}
