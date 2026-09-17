import assert from "node:assert/strict";
import test from "node:test";
import { assignAuditorColors, auditorColorPalette } from "../src/domain/auditor-calendar-colors.ts";

test("Each auditor receives a stable, distinct color across calendar renders", () => {
  const ids = ["auditor-b", "auditor-a", "auditor-c"];
  const first = assignAuditorColors(ids);
  const reversed = assignAuditorColors([...ids].reverse());
  assert.deepEqual(first, reversed);
  assert.equal(new Set(Object.values(first)).size, ids.length);
});

test("Chosen colors take precedence without giving two auditors the same marker", () => {
  const colors = assignAuditorColors(["auditor-a", "auditor-b", "auditor-c"], {
    "auditor-a": "#2563eb", "auditor-b": "#2563eb", "auditor-c": "not-a-color",
  });
  assert.equal(colors["auditor-a"], "#2563eb");
  assert.equal(new Set(Object.values(colors)).size, 3);
});

test("The calendar offers exactly 20 fixed colors and ignores old spectrum values", () => {
  assert.equal(auditorColorPalette.length, 20);
  assert.equal(new Set(auditorColorPalette).size, 20);
  const colors = assignAuditorColors(["auditor-a"], { "auditor-a": "#123456" });
  assert.ok(auditorColorPalette.includes(colors["auditor-a"]));
});
