import assert from "node:assert/strict";
import test from "node:test";
import { assignAuditorColors, assignWorkColors, auditorColorOptions, auditorColorPalette } from "../src/domain/auditor-calendar-colors.ts";

test("Auditors use the same color sequence as works in displayed order", () => {
  const ids = ["auditor-b", "auditor-a", "auditor-c"];
  assert.deepEqual(assignAuditorColors(ids), {
    "auditor-b": "#1e3a5f", "auditor-a": "#dc2626", "auditor-c": "#ca8a04",
  });
  assert.deepEqual(assignAuditorColors([...ids].reverse()), {
    "auditor-c": "#1e3a5f", "auditor-a": "#dc2626", "auditor-b": "#ca8a04",
  });
});

test("Chosen colors take precedence without giving two auditors the same marker", () => {
  const colors = assignAuditorColors(["auditor-a", "auditor-b", "auditor-c"], {
    "auditor-a": "#1e3a5f", "auditor-b": "#1e3a5f", "auditor-c": "not-a-color",
  });
  assert.equal(colors["auditor-a"], "#1e3a5f");
  assert.equal(new Set(Object.values(colors)).size, 3);
});

test("Works use the requested color order, then lighter tones", () => {
  const ids = Array.from({ length: 16 }, (_, index) => `work-${index}`);
  const colors = assignWorkColors(ids);
  assert.deepEqual(ids.map((id) => colors[id]), auditorColorPalette.slice(0, 16));
  assert.deepEqual(auditorColorOptions.slice(0, 8).map(({ name }) => name), [
    "Azul-marinho", "Vermelho escuro", "Amarelo escuro", "Verde escuro",
    "Roxo escuro", "Rosa escuro", "Laranja escuro", "Marrom escuro",
  ]);
  assert.deepEqual(assignWorkColors(ids), colors);
});

test("Work colors depend only on displayed order", () => {
  assert.deepEqual(assignWorkColors(["first", "second", "third"]), {
    first: "#1e3a5f", second: "#dc2626", third: "#ca8a04",
  });
  assert.deepEqual(assignWorkColors(["second", "first", "second"]), {
    second: "#1e3a5f", first: "#dc2626",
  });
  assert.deepEqual(assignWorkColors(["other-profile-work-a", "other-profile-work-b"]), {
    "other-profile-work-a": "#1e3a5f", "other-profile-work-b": "#dc2626",
  });
});

test("The calendar offers exactly 20 fixed colors and ignores old spectrum values", () => {
  assert.equal(auditorColorPalette.length, 20);
  assert.equal(new Set(auditorColorPalette).size, 20);
  assert.ok(auditorColorOptions.some((option) => option.name === "Azul-marinho"));
  for (const family of ["Amarelo", "Vermelho", "Verde", "Rosa", "Laranja", "Marrom", "Preto", "Roxo"]) {
    assert.ok(auditorColorOptions.some((option) => option.name === `${family} claro`));
    assert.ok(auditorColorOptions.some((option) => option.name === `${family} escuro`));
  }
  assert.ok(auditorColorOptions.some((option) => option.name === "Azul claro"));
  const colors = assignAuditorColors(["auditor-a"], { "auditor-a": "#123456" });
  assert.ok(auditorColorPalette.includes(colors["auditor-a"]));
});
