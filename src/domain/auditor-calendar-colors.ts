export const auditorColorPalette = [
  "#2563eb", "#dc2626", "#059669", "#7c3aed", "#ea580c", "#0891b2",
  "#be185d", "#4d7c0f", "#4338ca", "#b45309", "#0f766e", "#9333ea",
  "#0284c7", "#e11d48", "#16a34a", "#c026d3", "#475569", "#65a30d",
  "#9a3412", "#db2777",
] as const;

export const validAuditorColor = (value: unknown): value is string =>
  typeof value === "string" && auditorColorPalette.some((color) => color === value.toLowerCase());

function hashId(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Stable per-ID defaults, while keeping every visible auditor's color distinct. */
export function assignAuditorColors(ids: readonly string[], preferences: Record<string, string> = {}): Record<string, string> {
  const uniqueIds = [...new Set(ids)].sort();
  const colors: Record<string, string> = {};
  const used = new Set<string>();
  for (const id of uniqueIds) {
    const preferred = preferences[id]?.toLowerCase();
    if (validAuditorColor(preferred) && !used.has(preferred)) {
      colors[id] = preferred;
      used.add(preferred);
    }
  }
  for (const id of uniqueIds) {
    if (colors[id]) continue;
    const start = hashId(id) % auditorColorPalette.length;
    const available = Array.from({ length: auditorColorPalette.length }, (_, offset) => auditorColorPalette[(start + offset) % auditorColorPalette.length])
      .find((color) => !used.has(color));
    // More than 20 simultaneous auditors necessarily reuse one of the fixed colors.
    const color = available ?? auditorColorPalette[start];
    colors[id] = color;
    used.add(color);
  }
  return colors;
}
